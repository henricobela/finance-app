import os
import calendar
import uuid
import urllib.request
import json
import shutil
from datetime import datetime, date
from flask import Flask, jsonify, request, render_template, send_from_directory, session
from models import db, Usuario, ContaBancaria, Categoria, CartaoCredito, Transacao, Orcamento, MetaFinanceira, TaxaSGS, Investimento, Configuracao

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'antigravity_lucena_secret_key_9988')

# Configuração do Banco de Dados (PostgreSQL/Supabase ou SQLite como Fallback)
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Corrige o prefixo postgres:// que o Render pode injetar, pois o SQLAlchemy exige postgresql://
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    db_path = None
else:
    # Se não houver DATABASE_URL, verifica DATABASE_PATH (SQLite) ou usa o local padrão
    db_path_env = os.environ.get('DATABASE_PATH')
    if db_path_env:
        db_path = db_path_env
    else:
        db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'financas.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# Helper para adicionar meses a uma data de forma segura
def add_months(sourcedate, months):
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)

# Inicialização e semente de dados de teste (Seed)
def seed_categories_for_user(cpf):
    categorias_receita = [
        ("Salário", "wallet"),
        ("Freelance", "briefcase"),
        ("Investimentos", "trending-up"),
        ("Outras Receitas", "plus-circle")
    ]
    categorias_despesa = [
        ("Alimentação", "coffee"),
        ("Transporte", "car"),
        ("Moradia", "home"),
        ("Lazer", "smile"),
        ("Saúde", "heart"),
        ("Educação", "book-open"),
        ("Assinaturas & Serviços", "tv"),
        ("Compras", "shopping-bag"),
        ("Gás", "flame"),
        ("Outros", "help-circle")
    ]
    
    for nome, icone in categorias_receita:
        db.session.add(Categoria(nome=nome, tipo="RECEITA", icone=icone, usuario_cpf=cpf))
        
    for nome, icone in categorias_despesa:
        db.session.add(Categoria(nome=nome, tipo="DESPESA", icone=icone, usuario_cpf=cpf))
        
    db.session.commit()

def seed_database(cpf='43642821898'):
    # Criar categorias padrão se nenhuma existir para o usuário
    if Categoria.query.filter_by(usuario_cpf=cpf).count() == 0:
        seed_categories_for_user(cpf)
            
    # Criar contas padrão se nenhuma existir para o usuário
    if ContaBancaria.query.filter_by(usuario_cpf=cpf).count() == 0:
        contas = [
            ContaBancaria(nome="Itaú Corrente", tipo="CORRENTE", saldo_inicial=2500.0, saldo_atual=2500.0, usuario_cpf=cpf),
            ContaBancaria(nome="Nubank Poupança", tipo="POUPANCA", saldo_inicial=5000.0, saldo_atual=5000.0, usuario_cpf=cpf),
            ContaBancaria(nome="Dinheiro em Mão", tipo="DINHEIRO", saldo_inicial=150.0, saldo_atual=150.0, usuario_cpf=cpf)
        ]
        db.session.add_all(contas)
        
    # Criar cartões padrão se nenhum existir para o usuário
    if CartaoCredito.query.filter_by(usuario_cpf=cpf).count() == 0:
        cartoes = [
            CartaoCredito(nome="Nubank Ultravioleta", limite=6000.0, limite_disponivel=6000.0, dia_fechamento=5, dia_vencimento=12, usuario_cpf=cpf),
            CartaoCredito(nome="Black Infinite", limite=15000.0, limite_disponivel=15000.0, dia_fechamento=25, dia_vencimento=2, usuario_cpf=cpf)
        ]
        db.session.add_all(cartoes)
        
    # Criar configurações padrão se nenhuma existir para o usuário
    if Configuracao.query.filter_by(chave='dia_corte', usuario_cpf=cpf).first() is None:
        db.session.add(Configuracao(chave='dia_corte', valor='14', usuario_cpf=cpf))

    db.session.commit()

# Cria o banco de dados, executa migrações automáticas se necessário e roda o seed
with app.app_context():
    # Suporta caminho flexível para o banco no Render
    engine = db.engine
    inspector = db.inspect(engine)
    
    # 1. Executa create_all para criar as tabelas básicas se não existirem (inclusive a tabela usuarios)
    db.create_all()
    
    # 2. Adiciona a coluna usuario_cpf se não existir
    tables_to_migrate = [
        'contas_bancarias',
        'categorias',
        'cartoes_credito',
        'transacoes',
        'orcamentos',
        'metas_financeiras',
        'investimentos',
        'configuracoes'
    ]
    with engine.connect() as conn:
        # Colunas extras de migrações anteriores de contas_bancarias
        if inspector.has_table('contas_bancarias'):
            columns_contas = [col['name'] for col in inspector.get_columns('contas_bancarias')]
            if 'banco' not in columns_contas:
                conn.execute(db.text("ALTER TABLE contas_bancarias ADD COLUMN banco VARCHAR(100)"))
            if 'agencia' not in columns_contas:
                conn.execute(db.text("ALTER TABLE contas_bancarias ADD COLUMN agencia VARCHAR(50)"))
            if 'numero_conta' not in columns_contas:
                conn.execute(db.text("ALTER TABLE contas_bancarias ADD COLUMN numero_conta VARCHAR(50)"))
        
        # Colunas extras de migrações anteriores de transacoes
        if inspector.has_table('transacoes'):
            columns_trans = [col['name'] for col in inspector.get_columns('transacoes')]
            if 'fatura_cartao_id' not in columns_trans:
                conn.execute(db.text("ALTER TABLE transacoes ADD COLUMN fatura_cartao_id INTEGER REFERENCES cartoes_credito(id)"))
            if 'fatura_mes' not in columns_trans:
                conn.execute(db.text("ALTER TABLE transacoes ADD COLUMN fatura_mes VARCHAR(7)"))

        # Colunas usuario_cpf em todas as tabelas
        for table in tables_to_migrate:
            if inspector.has_table(table):
                cols = [col['name'] for col in inspector.get_columns(table)]
                if 'usuario_cpf' not in cols:
                    try:
                        conn.execute(db.text(f"ALTER TABLE {table} ADD COLUMN usuario_cpf VARCHAR(11) REFERENCES usuarios(cpf)"))
                    except Exception as e:
                        print(f"Erro ao adicionar usuario_cpf na tabela {table}: {e}")
        conn.commit()

    # 3. Cria o usuário do Henrico se não existir (senha padrão '123456')
    from werkzeug.security import generate_password_hash
    cpf_padrao = '43642821898'
    user = Usuario.query.get(cpf_padrao)
    if not user:
        user = Usuario(
            cpf=cpf_padrao,
            nome='Henrico Lucena',
            senha_hash=generate_password_hash('123456')
        )
        db.session.add(user)
        db.session.commit()
        print("Usuário padrão Henrico cadastrado com senha padrão '123456'.")

    # 4. Atribui o CPF padrão a todos os registros existentes órfãos (para preservar os dados históricos do Henrico)
    tables_to_update = [
        ContaBancaria,
        Categoria,
        CartaoCredito,
        Transacao,
        Orcamento,
        MetaFinanceira,
        Investimento,
        Configuracao
    ]
    updated = False
    for model in tables_to_update:
        records = model.query.filter(model.usuario_cpf.is_(None)).all()
        if records:
            for r in records:
                r.usuario_cpf = cpf_padrao
            updated = True
            
    if updated:
        db.session.commit()
        print("Registros existentes associados com sucesso ao CPF 43642821898.")

    # 5. Garante que os dados padrão básicos estão semeados
    seed_database(cpf_padrao)

# Rota SPA Principal
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/src/<path:filename>')
def serve_src(filename):
    return send_from_directory('src', filename)

# ==================== API: CONTAS BANCÁRIAS ====================

@app.route('/api/contas', methods=['GET'])
def get_contas():
    contas = ContaBancaria.query.filter_by(usuario_cpf=session['user_cpf']).all()
    return jsonify([c.to_dict() for c in contas])

@app.route('/api/contas', methods=['POST'])
def create_conta():
    data = request.json
    nome = data.get('nome')
    tipo = data.get('tipo')
    saldo_inicial = float(data.get('saldo_inicial', 0.0))
    pessoa = data.get('pessoa')
    banco = data.get('banco')
    agencia = data.get('agencia')
    numero_conta = data.get('numero_conta')
    
    if not nome or not tipo:
        return jsonify({'error': 'Nome e tipo são obrigatórios'}), 400
        
    conta = ContaBancaria(
        nome=nome, 
        tipo=tipo, 
        saldo_inicial=saldo_inicial, 
        saldo_atual=saldo_inicial, 
        pessoa=pessoa,
        banco=banco,
        agencia=agencia,
        numero_conta=numero_conta,
        usuario_cpf=session['user_cpf']
    )
    db.session.add(conta)
    db.session.commit()
    return jsonify(conta.to_dict()), 201

@app.route('/api/contas/<int:id>', methods=['PUT'])
def update_conta(id):
    conta = ContaBancaria.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    data = request.json
    
    conta.nome = data.get('nome', conta.nome)
    conta.tipo = data.get('tipo', conta.tipo)
    
    # Ajusta saldo_atual proporcionalmente se saldo_inicial mudar
    novo_saldo_ini = float(data.get('saldo_inicial', conta.saldo_inicial))
    diferenca = novo_saldo_ini - conta.saldo_inicial
    conta.saldo_inicial = novo_saldo_ini
    conta.saldo_atual += diferenca
    
    conta.pessoa = data.get('pessoa', conta.pessoa)
    conta.banco = data.get('banco', conta.banco)
    conta.agencia = data.get('agencia', conta.agencia)
    conta.numero_conta = data.get('numero_conta', conta.numero_conta)
    
    db.session.commit()
    return jsonify(conta.to_dict())

@app.route('/api/contas/<int:id>', methods=['DELETE'])
def delete_conta(id):
    conta = ContaBancaria.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    db.session.delete(conta)
    db.session.commit()
    return jsonify({'success': True})

# ==================== API: CARTÕES DE CRÉDITO ====================

@app.route('/api/cartoes', methods=['GET'])
def get_cartoes():
    cartoes = CartaoCredito.query.filter_by(usuario_cpf=session['user_cpf']).all()
    return jsonify([c.to_dict() for c in cartoes])

@app.route('/api/cartoes', methods=['POST'])
def create_cartao():
    data = request.json
    nome = data.get('nome')
    limite = float(data.get('limite', 0.0))
    dia_fechamento = int(data.get('dia_fechamento'))
    dia_vencimento = int(data.get('dia_vencimento'))
    conta_bancaria_id = data.get('conta_bancaria_id')
    pessoa = data.get('pessoa')
    
    if not nome or not limite:
        return jsonify({'error': 'Nome e limite são obrigatórios'}), 400
        
    cartao = CartaoCredito(
        nome=nome, 
        limite=limite, 
        limite_disponivel=limite, 
        dia_fechamento=dia_fechamento, 
        dia_vencimento=dia_vencimento,
        conta_bancaria_id=conta_bancaria_id,
        pessoa=pessoa,
        usuario_cpf=session['user_cpf']
    )
    db.session.add(cartao)
    db.session.commit()
    return jsonify(cartao.to_dict()), 201

@app.route('/api/cartoes/<int:id>', methods=['PUT'])
def update_cartao(id):
    cartao = CartaoCredito.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    data = request.json
    
    cartao.nome = data.get('nome', cartao.nome)
    
    # Se alterar o limite total, ajustamos o limite disponível proporcionalmente pela diferença
    novo_limite = float(data.get('limite', cartao.limite))
    diferenca = novo_limite - cartao.limite
    cartao.limite = novo_limite
    cartao.limite_disponivel += diferenca
    
    cartao.dia_fechamento = int(data.get('dia_fechamento', cartao.dia_fechamento))
    cartao.dia_vencimento = int(data.get('dia_vencimento', cartao.dia_vencimento))
    cartao.conta_bancaria_id = data.get('conta_bancaria_id', cartao.conta_bancaria_id)
    cartao.pessoa = data.get('pessoa', cartao.pessoa)
    
    db.session.commit()
    return jsonify(cartao.to_dict())

@app.route('/api/cartoes/<int:id>', methods=['DELETE'])
def delete_cartao(id):
    cartao = CartaoCredito.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    db.session.delete(cartao)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/cartoes/<int:id>/pagar-fatura', methods=['POST'])
def pagar_fatura(id):
    data = request.json
    valor_pagamento = float(data.get('valor_pagamento', 0.0))
    conta_pagamento_id = data.get('conta_pagamento_id')
    mes_fatura = data.get('mes_fatura')  # Formato: YYYY-MM
    
    cartao = CartaoCredito.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    conta = ContaBancaria.query.filter_by(id=conta_pagamento_id, usuario_cpf=session['user_cpf']).first_or_404()
    
    if valor_pagamento <= 0:
        return jsonify({'error': 'Valor de pagamento deve ser maior que zero'}), 400
        
    # Deduz saldo da conta bancária
    conta.saldo_atual -= valor_pagamento
    
    # Restaura limite disponível do cartão (sem passar do limite original)
    cartao.limite_disponivel = min(cartao.limite, cartao.limite_disponivel + valor_pagamento)
    
    # Formata a descrição do pagamento se o mês foi fornecido
    descricao_pagamento = f"Pagamento Fatura {cartao.nome}"
    if mes_fatura:
        try:
            ano_str, mes_str = mes_fatura.split('-')
            descricao_pagamento = f"Pagamento Fatura {cartao.nome} ({mes_str}/{ano_str})"
            
            # Marca as transações do cartão desse mês como pagas/confirmadas
            ano = int(ano_str)
            mes_int = int(mes_str)
            ultimo_dia = calendar.monthrange(ano, mes_int)[1]
            data_ini = date(ano, mes_int, 1)
            data_fim = date(ano, mes_int, ultimo_dia)
            
            transacoes_fatura = Transacao.query.filter(
                Transacao.usuario_cpf == session['user_cpf'],
                Transacao.cartao_credito_id == cartao.id,
                Transacao.data >= data_ini,
                Transacao.data <= data_fim
            ).all()
            for t in transacoes_fatura:
                t.pago_ou_confirmado = True
        except Exception as e:
            print(f"Erro ao processar mês da fatura no pagamento: {e}")
            descricao_pagamento = f"Pagamento Fatura {cartao.nome} - {mes_fatura}"
    
    # Registra despesa do pagamento para histórico da conta
    pagamento = Transacao(
        tipo="DESPESA",
        descricao=descricao_pagamento,
        valor=valor_pagamento,
        data=date.today(),
        conta_origem_id=conta.id,
        pago_ou_confirmado=True,
        fatura_cartao_id=cartao.id,
        fatura_mes=mes_fatura,
        usuario_cpf=session['user_cpf']
    )
    db.session.add(pagamento)
    db.session.commit()
    
    return jsonify({
        'mensagem': 'Fatura paga com sucesso!',
        'cartao': cartao.to_dict(),
        'conta': conta.to_dict()
    })

# ==================== API: AUTENTICAÇÃO E CONTROLE DE ACESSO ====================

@app.before_request
def require_login():
    # Ignora rotas públicas
    allowed_paths = [
        '/api/auth/login', 
        '/api/auth/register', 
        '/api/auth/session', 
        '/', 
        '/static/',
        '/src/'
    ]
    if request.path.startswith('/api/') and not any(request.path.startswith(p) for p in allowed_paths):
        if 'user_cpf' not in session:
            return jsonify({'error': 'Login necessário'}), 401

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    from werkzeug.security import check_password_hash
    data = request.json
    cpf = ''.join(filter(str.isdigit, data.get('cpf', '')))
    senha = data.get('senha')
    
    user = Usuario.query.get(cpf)
    if user and check_password_hash(user.senha_hash, senha):
        session['user_cpf'] = user.cpf
        return jsonify({'success': True, 'user': user.to_dict()})
    return jsonify({'error': 'CPF ou senha incorretos'}), 401

@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    from werkzeug.security import generate_password_hash
    data = request.json
    cpf = ''.join(filter(str.isdigit, data.get('cpf', '')))
    nome = data.get('nome')
    senha = data.get('senha')
    
    if not cpf or not nome or not senha:
        return jsonify({'error': 'Todos os campos são obrigatórios'}), 400
        
    if len(cpf) != 11:
        return jsonify({'error': 'CPF deve conter exatamente 11 dígitos'}), 400
        
    cpfs_permitidos = ['43642821898', '16251321822', '18719476850']
    if cpf not in cpfs_permitidos:
        return jsonify({'error': 'CPF não autorizado para cadastro no sistema'}), 403
        
    if Usuario.query.get(cpf):
        return jsonify({'error': 'Este CPF já está cadastrado'}), 400
        
    user = Usuario(
        cpf=cpf,
        nome=nome,
        senha_hash=generate_password_hash(senha)
    )
    db.session.add(user)
    db.session.commit()
    
    # Semeia as categorias, contas e cartões de exemplo iniciais para o novo usuário
    seed_database(cpf)
    
    session['user_cpf'] = user.cpf
    return jsonify({'success': True, 'user': user.to_dict()})

@app.route('/api/auth/session', methods=['GET'])
def auth_session():
    user_cpf = session.get('user_cpf')
    if user_cpf:
        user = Usuario.query.get(user_cpf)
        if user:
            return jsonify({'logged_in': True, 'user': user.to_dict()})
    return jsonify({'logged_in': False})

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.pop('user_cpf', None)
    return jsonify({'success': True})

# ==================== API: CONFIGURAÇÕES E SISTEMA ====================

@app.route('/api/configuracoes', methods=['GET'])
def get_configuracoes():
    configs = Configuracao.query.filter_by(usuario_cpf=session['user_cpf']).all()
    res = {c.chave: c.valor for c in configs}
    if 'dia_corte' not in res:
        res['dia_corte'] = '14'
    return jsonify(res)

@app.route('/api/configuracoes', methods=['POST'])
def save_configuracoes():
    data = request.json
    for key, val in data.items():
        config = Configuracao.query.filter_by(chave=key, usuario_cpf=session['user_cpf']).first()
        if not config:
            config = Configuracao(chave=key, valor=str(val), usuario_cpf=session['user_cpf'])
            db.session.add(config)
        else:
            config.valor = str(val)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/sistema/backup', methods=['POST'])
def criar_backup():
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Se for SQLite, faz a cópia física do arquivo .db
        if app.config['SQLALCHEMY_DATABASE_URI'].startswith('sqlite:'):
            backup_filename = f"financas_backup_manual_{timestamp}.db"
            backup_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), backup_filename)
            shutil.copy2(db_path, backup_path)
            return jsonify({'success': True, 'filename': backup_filename})
        else:
            # Para PostgreSQL/Supabase, gera um dump estruturado em arquivo JSON
            backup_filename = f"financas_backup_manual_{timestamp}.json"
            backup_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), backup_filename)
            
            backup_data = {
                'usuarios': [u.to_dict() for u in Usuario.query.all()],
                'usuarios_senhas': {u.cpf: u.senha_hash for u in Usuario.query.all()},
                'contas_bancarias': [c.to_dict() for c in ContaBancaria.query.all()],
                'categorias': [cat.to_dict() for cat in Categoria.query.all()],
                'cartoes_credito': [cc.to_dict() for cc in CartaoCredito.query.all()],
                'transacoes': [t.to_dict() for t in Transacao.query.all()],
                'orcamentos': [o.to_dict() for o in Orcamento.query.all()],
                'metas_financeiras': [m.to_dict() for m in MetaFinanceira.query.all()],
                'taxas_sgs': [tx.to_dict() for tx in TaxaSGS.query.all()],
                'investimentos': [i.to_dict() for i in Investimento.query.all()],
                'configuracoes': [cfg.to_dict() for cfg in Configuracao.query.all()]
            }
            
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, ensure_ascii=False, indent=4)
                
            return jsonify({'success': True, 'filename': backup_filename})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sistema/excluir-tudo', methods=['POST'])
def excluir_tudo():
    try:
        db.drop_all()
        db.create_all()
        seed_database()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== API: CATEGORIAS ====================

@app.route('/api/categorias', methods=['GET'])
def get_categorias():
    categorias = Categoria.query.filter_by(usuario_cpf=session['user_cpf']).all()
    return jsonify([c.to_dict() for c in categorias])

@app.route('/api/categorias', methods=['POST'])
def create_categoria():
    data = request.json
    nome = data.get('nome')
    tipo = data.get('tipo')
    icone = data.get('icone', 'tag')
    
    if not nome or not tipo:
        return jsonify({'error': 'Nome e tipo são obrigatórios'}), 400
        
    categoria = Categoria(nome=nome, tipo=tipo, icone=icone, usuario_cpf=session['user_cpf'])
    db.session.add(categoria)
    db.session.commit()
    return jsonify(categoria.to_dict()), 201

@app.route('/api/categorias/<int:id>', methods=['DELETE'])
def delete_categoria(id):
    categoria = Categoria.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    
    # Impedir exclusão de categorias que possuem transações vinculadas
    has_transacoes = Transacao.query.filter_by(categoria_id=id, usuario_cpf=session['user_cpf']).first()
    if has_transacoes:
        return jsonify({'error': 'Não é possível excluir uma categoria que possui transações vinculadas.'}), 400
        
    db.session.delete(categoria)
    db.session.commit()
    return jsonify({'mensagem': 'Categoria excluída com sucesso'})

# ==================== API: ORÇAMENTOS ====================

@app.route('/api/orcamentos', methods=['GET'])
def get_orcamentos():
    mes = request.args.get('mes')  # AAAA-MM
    query = Orcamento.query.filter_by(usuario_cpf=session['user_cpf'])
    if mes:
        query = query.filter_by(mes=mes)
    orcamentos = query.all()
    return jsonify([o.to_dict() for o in orcamentos])

@app.route('/api/orcamentos', methods=['POST'])
def upsert_orcamento():
    data = request.json
    categoria_id = data.get('categoria_id')
    limite_mensal = float(data.get('limite_mensal', 0.0))
    mes = data.get('mes')  # AAAA-MM
    
    if not categoria_id or not mes:
        return jsonify({'error': 'Categoria e mês são obrigatórios'}), 400
        
    # Verifica se já existe orçamento para a categoria e mês
    orcamento = Orcamento.query.filter_by(categoria_id=categoria_id, mes=mes, usuario_cpf=session['user_cpf']).first()
    
    if orcamento:
        orcamento.limite_mensal = limite_mensal
    else:
        orcamento = Orcamento(categoria_id=categoria_id, limite_mensal=limite_mensal, mes=mes, usuario_cpf=session['user_cpf'])
        db.session.add(orcamento)
        
    db.session.commit()
    return jsonify(orcamento.to_dict())

# ==================== API: METAS FINANCEIRAS ====================

@app.route('/api/metas', methods=['GET'])
def get_metas():
    metas = MetaFinanceira.query.filter_by(usuario_cpf=session['user_cpf']).all()
    return jsonify([m.to_dict() for m in metas])

@app.route('/api/metas', methods=['POST'])
def create_meta():
    data = request.json
    nome = data.get('nome')
    valor_alvo = float(data.get('valor_alvo', 0.0))
    data_limite_str = data.get('data_limite')
    pessoa = data.get('pessoa')
    
    if not nome or valor_alvo <= 0:
        return jsonify({'error': 'Dados inválidos'}), 400
        
    data_limite = None
    if data_limite_str:
        data_limite = datetime.strptime(data_limite_str, "%Y-%m-%d").date()
        
    meta = MetaFinanceira(nome=nome, valor_alvo=valor_alvo, data_limite=data_limite, pessoa=pessoa, usuario_cpf=session['user_cpf'])
    db.session.add(meta)
    db.session.commit()
    return jsonify(meta.to_dict()), 201

@app.route('/api/metas/<int:id>/poupar', methods=['POST'])
def poupar_meta(id):
    data = request.json
    valor = float(data.get('valor', 0.0))
    conta_id = data.get('conta_id')
    tipo_operacao = data.get('tipo_operacao')  # ADICIONAR ou RETIRAR
    
    meta = MetaFinanceira.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    conta = ContaBancaria.query.filter_by(id=conta_id, usuario_cpf=session['user_cpf']).first_or_404()
    
    if valor <= 0:
        return jsonify({'error': 'O valor deve ser maior que zero'}), 400
        
    if tipo_operacao == 'ADICIONAR':
        if conta.saldo_atual < valor:
            return jsonify({'error': 'Saldo insuficiente na conta'}), 400
            
        conta.saldo_atual -= valor
        meta.valor_poupado += valor
        
        # Cria transação de despesa especial para o extrato da conta
        t = Transacao(
            tipo="DESPESA",
            descricao=f"Poupado para Meta: {meta.nome}",
            valor=valor,
            data=date.today(),
            conta_origem_id=conta.id,
            pago_ou_confirmado=True,
            usuario_cpf=session['user_cpf']
        )
        db.session.add(t)
        
    elif tipo_operacao == 'RETIRAR':
        if meta.valor_poupado < valor:
            return jsonify({'error': 'Valor solicitado maior que o saldo poupado na meta'}), 400
            
        meta.valor_poupado -= valor
        conta.saldo_atual += valor
        
        # Cria transação de receita especial para o extrato da conta
        t = Transacao(
            tipo="RECEITA",
            descricao=f"Resgate da Meta: {meta.nome}",
            valor=valor,
            data=date.today(),
            conta_destino_id=conta.id,
            pago_ou_confirmado=True,
            usuario_cpf=session['user_cpf']
        )
        db.session.add(t)
    else:
        return jsonify({'error': 'Tipo de operação inválido'}), 400
        
    db.se# ==================== API: TRANSAÇÕES (RECEITA / DESPESA / TRANSFERÊNCIA) ====================

@app.route('/api/transacoes', methods=['GET'])
def get_transacoes():
    mes = request.args.get('mes')  # AAAA-MM
    tipo = request.args.get('tipo')  # RECEITA, DESPESA, TRANSFERENCIA
    categoria_id = request.args.get('categoria_id')
    conta_id = request.args.get('conta_id')
    cartao_credito_id = request.args.get('cartao_credito_id')
    busca = request.args.get('busca')
    is_pagamento_fatura = request.args.get('is_pagamento_fatura')
    
    query = Transacao.query.filter_by(usuario_cpf=session['user_cpf'])
    
    if is_pagamento_fatura == 'true':
        query = query.filter(Transacao.fatura_cartao_id.isnot(None))
        
    if mes:
        ano_str, mes_str = mes.split('-')
        ano = int(ano_str)
        mes_int = int(mes_str)
        ultimo_dia = calendar.monthrange(ano, mes_int)[1]
        data_ini = date(ano, mes_int, 1)
        data_fim = date(ano, mes_int, ultimo_dia)
        query = query.filter(Transacao.data >= data_ini, Transacao.data <= data_fim)
        
    if tipo:
        query = query.filter_by(tipo=tipo)
    if categoria_id:
        query = query.filter_by(categoria_id=int(categoria_id))
    if conta_id:
        query = query.filter(
            (Transacao.conta_origem_id == int(conta_id)) | 
            (Transacao.conta_destino_id == int(conta_id))
        )
    if cartao_credito_id:
        query = query.filter_by(cartao_credito_id=int(cartao_credito_id))
    if busca:
        query = query.filter(Transacao.descricao.ilike(f'%{busca}%') | Transacao.pagador_recebedor.ilike(f'%{busca}%'))
        
    # Ordena por data decrescente e id decrescente para as mais recentes virem primeiro
    transacoes = query.order_by(Transacao.data.desc(), Transacao.id.desc()).all()
    return jsonify([t.to_dict() for t in transacoes])

@app.route('/api/transacoes', methods=['POST'])
def create_transacao():
    data = request.json
    tipo = data.get('tipo')  # RECEITA, DESPESA, TRANSFERENCIA
    descricao = data.get('descricao')
    valor = float(data.get('valor', 0.0))
    data_str = data.get('data')
    pessoa = data.get('pessoa')
    
    categoria_id = data.get('categoria_id')
    conta_origem_id = data.get('conta_origem_id')
    conta_destino_id = data.get('conta_destino_id')
    cartao_credito_id = data.get('cartao_credito_id')
    
    pago_ou_confirmado = bool(data.get('pago_ou_confirmado', False))
    pagador_recebedor = data.get('pagador_recebedor')
    recorrente = bool(data.get('recorrente', False))
    
    # Parcelamento
    total_parcelas = data.get('total_parcelas')
    
    if not tipo or not descricao or valor <= 0 or not data_str:
        return jsonify({'error': 'Preencha todos os campos obrigatórios'}), 400
        
    t_date = datetime.strptime(data_str, "%Y-%m-%d").date()
    
    # Se for parcelamento, geramos multiplas parcelas futuras
    if tipo == 'DESPESA' and total_parcelas and int(total_parcelas) > 1:
        total_p = int(total_parcelas)
        grupo_id = str(uuid.uuid4())
        valor_parcela = valor / total_p
        
        cartao = None
        if cartao_credito_id:
            cartao = CartaoCredito.query.filter_by(id=cartao_credito_id, usuario_cpf=session['user_cpf']).first()
            if cartao:
                # Diminui o limite total da compra no cartão
                cartao.limite_disponivel -= valor
                
        transacoes_criadas = []
        for i in range(1, total_p + 1):
            parcela_date = add_months(t_date, i - 1)
            
            # Nas parcelas de cartão, o pagamento efetivo é na fatura do mês correspondente
            status_confirmado = False
            if i == 1 and pago_ou_confirmado and not cartao_credito_id:
                status_confirmado = True
                
            transacao = Transacao(
                tipo=tipo,
                descricao=descricao,
                valor=valor_parcela,
                data=parcela_date,
                categoria_id=categoria_id,
                conta_origem_id=conta_origem_id if not cartao_credito_id else None,
                cartao_credito_id=cartao_credito_id,
                pago_ou_confirmado=status_confirmado,
                pagador_recebedor=pagador_recebedor,
                recorrente=recorrente,
                grupo_parcelamento_id=grupo_id,
                numero_parcela=i,
                total_parcelas=total_p,
                pessoa=pessoa,
                usuario_cpf=session['user_cpf']
            )
            db.session.add(transacao)
            
            # Deduz do saldo da conta corrente se a primeira parcela já estiver paga e não for no cartão
            if status_confirmado and conta_origem_id:
                conta = ContaBancaria.query.filter_by(id=conta_origem_id, usuario_cpf=session['user_cpf']).first()
                if conta:
                    conta.saldo_atual -= valor_parcela
                    
            transacoes_criadas.append(transacao)
            
        db.session.commit()
        return jsonify([t.to_dict() for t in transacoes_criadas]), 201
        
    # Transação simples
    transacao = Transacao(
        tipo=tipo,
        descricao=descricao,
        valor=valor,
        data=t_date,
        categoria_id=categoria_id,
        conta_origem_id=conta_origem_id,
        conta_destino_id=conta_destino_id,
        cartao_credito_id=cartao_credito_id,
        pago_ou_confirmado=pago_ou_confirmado,
        pagador_recebedor=pagador_recebedor,
        recorrente=recorrente,
        pessoa=pessoa,
        usuario_cpf=session['user_cpf']
    )
    
    db.session.add(transacao)
    
    # Processa impacto nos saldos se confirmada/paga
    if pago_ou_confirmado:
        if tipo == 'RECEITA' and conta_destino_id:
            conta = ContaBancaria.query.filter_by(id=conta_destino_id, usuario_cpf=session['user_cpf']).first()
            if conta:
                conta.saldo_atual += valor
        elif tipo == 'DESPESA':
            if cartao_credito_id:
                cartao = CartaoCredito.query.filter_by(id=cartao_credito_id, usuario_cpf=session['user_cpf']).first()
                if cartao:
                    cartao.limite_disponivel -= valor
            elif conta_origem_id:
                conta = ContaBancaria.query.filter_by(id=conta_origem_id, usuario_cpf=session['user_cpf']).first()
                if conta:
                    conta.saldo_atual -= valor
        elif tipo == 'TRANSFERENCIA' and conta_origem_id and conta_destino_id:
            conta_ori = ContaBancaria.query.filter_by(id=conta_origem_id, usuario_cpf=session['user_cpf']).first()
            conta_des = ContaBancaria.query.filter_by(id=conta_destino_id, usuario_cpf=session['user_cpf']).first()
            if conta_ori and conta_des:
                conta_ori.saldo_atual -= valor
                conta_des.saldo_atual += valor
    else:
        # Se for despesa no cartão de crédito, mesmo pendente ela bloqueia o limite imediatamente
        if tipo == 'DESPESA' and cartao_credito_id:
            cartao = CartaoCredito.query.filter_by(id=cartao_credito_id, usuario_cpf=session['user_cpf']).first()
            if cartao:
                cartao.limite_disponivel -= valor

    db.session.commit()
    return jsonify(transacao.to_dict()), 201

@app.route('/api/transacoes/<int:id>', methods=['PUT'])
def update_transacao(id):
    transacao = Transacao.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    data = request.json
    
    # 1. Reverter impactos antigos nos saldos/limites
    if transacao.pago_ou_confirmado:
        if transacao.tipo == 'RECEITA' and transacao.conta_destino_id:
            conta = ContaBancaria.query.filter_by(id=transacao.conta_destino_id, usuario_cpf=session['user_cpf']).first()
            if conta:
                conta.saldo_atual -= transacao.valor
        elif transacao.tipo == 'DESPESA' and transacao.conta_origem_id:
            conta = ContaBancaria.query.filter_by(id=transacao.conta_origem_id, usuario_cpf=session['user_cpf']).first()
            if conta:
                conta.saldo_atual += transacao.valor
        elif transacao.tipo == 'TRANSFERENCIA' and transacao.conta_origem_id and transacao.conta_destino_id:
            conta_ori = ContaBancaria.query.filter_by(id=transacao.conta_origem_id, usuario_cpf=session['user_cpf']).first()
            conta_des = ContaBancaria.query.filter_by(id=transacao.conta_destino_id, usuario_cpf=session['user_cpf']).first()
            if conta_ori and conta_des:
                conta_ori.saldo_atual += transacao.valor
                conta_des.saldo_atual -= transacao.valor
                
    # Despesa em cartão sempre afeta o limite disponível (paga ou pendente)
    if transacao.tipo == 'DESPESA' and transacao.cartao_credito_id:
        cartao = CartaoCredito.query.filter_by(id=transacao.cartao_credito_id, usuario_cpf=session['user_cpf']).first()
        if cartao:
            cartao.limite_disponivel = min(cartao.limite, cartao.limite_disponivel + transacao.valor)

    # 2. Ler novos dados
    tipo = data.get('tipo', transacao.tipo)
    descricao = data.get('descricao', transacao.descricao)
    valor = float(data.get('valor', transacao.valor))
    data_str = data.get('data', transacao.data.isoformat())
    
    categoria_id = data.get('categoria_id')
    conta_origem_id = data.get('conta_origem_id')
    conta_destino_id = data.get('conta_destino_id')
    cartao_credito_id = data.get('cartao_credito_id')
    
    pago_ou_confirmado = bool(data.get('pago_ou_confirmado', False))
    pagador_recebedor = data.get('pagador_recebedor')
    pessoa = data.get('pessoa')
    
    # 3. Atualizar a transação
    transacao.tipo = tipo
    transacao.descricao = descricao
    transacao.valor = valor
    transacao.data = datetime.strptime(data_str, "%Y-%m-%d").date()
    transacao.categoria_id = categoria_id
    transacao.conta_origem_id = conta_origem_id if tipo != 'RECEITA' and not cartao_credito_id else None
    transacao.conta_destino_id = conta_destino_id if tipo != 'DESPESA' else None
    transacao.cartao_credito_id = cartao_credito_id if tipo == 'DESPESA' else None
    transacao.pago_ou_confirmado = pago_ou_confirmado if not cartao_credito_id else False
    transacao.pagador_recebedor = pagador_recebedor
    transacao.pessoa = pessoa
    if 'recorrente' in data:
        transacao.recorrente = bool(data.get('recorrente'))
    
    # 4. Aplicar novos impactos nos saldos/limites
    if transacao.pago_ou_confirmado:
        if tipo == 'RECEITA' and transacao.conta_destino_id:
            conta = ContaBancaria.query.filter_by(id=transacao.conta_destino_id, usuario_cpf=session['user_cpf']).first()
            if conta:
                conta.saldo_atual += valor
        elif tipo == 'DESPESA' and transacao.conta_origem_id:
            conta = ContaBancaria.query.filter_by(id=transacao.conta_origem_id, usuario_cpf=session['user_cpf']).first()
            if conta:
                conta.saldo_atual -= valor
        elif tipo == 'TRANSFERENCIA' and transacao.conta_origem_id and transacao.conta_destino_id:
            conta_ori = ContaBancaria.query.filter_by(id=transacao.conta_origem_id, usuario_cpf=session['user_cpf']).first()
            conta_des = ContaBancaria.query.filter_by(id=transacao.conta_destino_id, usuario_cpf=session['user_cpf']).first()
            if conta_ori and conta_des:
                conta_ori.saldo_atual -= valor
                conta_des.saldo_atual += valor
                
    # Despesa em cartão sempre reduz o limite disponível (paga ou pendente)
    if tipo == 'DESPESA' and transacao.cartao_credito_id:
        cartao = CartaoCredito.query.filter_by(id=transacao.cartao_credito_id, usuario_cpf=session['user_cpf']).first()
        if cartao:
            cartao.limite_disponivel -= valor
            
    db.session.commit()
    return jsonify(transacao.to_dict()), 200

@app.route('/api/transacoes/<int:id>', methods=['DELETE'])
def delete_transacao(id):
    transacao = Transacao.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    apagar_grupo = request.args.get('apagar_grupo') == 'true'
    
    # Lista de transações que serão apagadas
    alvos = [transacao]
    
    # Se fizer parte de um parcelamento e o usuário quiser deletar todo o grupo
    if apagar_grupo and transacao.grupo_parcelamento_id:
        alvos = Transacao.query.filter_by(grupo_parcelamento_id=transacao.grupo_parcelamento_id, usuario_cpf=session['user_cpf']).all()
        
    for t in alvos:
        # Reverte impactos de saldo/limites
        if t.pago_ou_confirmado:
            if t.tipo == 'RECEITA' and t.conta_destino_id:
                conta = ContaBancaria.query.filter_by(id=t.conta_destino_id, usuario_cpf=session['user_cpf']).first()
                if conta:
                    conta.saldo_atual -= t.valor
            elif t.tipo == 'DESPESA':
                if t.cartao_credito_id:
                    cartao = CartaoCredito.query.filter_by(id=t.cartao_credito_id, usuario_cpf=session['user_cpf']).first()
                    if cartao:
                        cartao.limite_disponivel = min(cartao.limite, cartao.limite_disponivel + t.valor)
                elif t.conta_origem_id:
                    conta = ContaBancaria.query.filter_by(id=t.conta_origem_id, usuario_cpf=session['user_cpf']).first()
                    if conta:
                        conta.saldo_atual += t.valor
            elif t.tipo == 'TRANSFERENCIA' and t.conta_origem_id and t.conta_destino_id:
                conta_ori = ContaBancaria.query.filter_by(id=t.conta_origem_id, usuario_cpf=session['user_cpf']).first()
                conta_des = ContaBancaria.query.filter_by(id=t.conta_destino_id, usuario_cpf=session['user_cpf']).first()
                if conta_ori and conta_des:
                    conta_ori.saldo_atual += t.valor
                    conta_des.saldo_atual -= t.valor
        else:
            # Reverte o limite de cartão para despesas pendentes
            if t.tipo == 'DESPESA' and t.cartao_credito_id:
                cartao = CartaoCredito.query.filter_by(id=t.cartao_credito_id, usuario_cpf=session['user_cpf']).first()
                if cartao:
                    cartao.limite_disponivel = min(cartao.limite, cartao.limite_disponivel + t.valor)
                    
        db.session.delete(t)
        
    db.session.commit()
    return jsonify({'mensagem': 'Transação(ões) excluída(s) com sucesso'})

@app.route('/api/transacoes/<int:id>/estornar-fatura', methods=['POST'])
def estornar_fatura(id):
    transacao = Transacao.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    
    if not transacao.fatura_cartao_id or not transacao.fatura_mes:
        return jsonify({'error': 'Esta transação não é um pagamento de fatura estornável'}), 400
        
    cartao = CartaoCredito.query.filter_by(id=transacao.fatura_cartao_id, usuario_cpf=session['user_cpf']).first_or_404()
    conta = ContaBancaria.query.filter_by(id=transacao.conta_origem_id, usuario_cpf=session['user_cpf']).first()
    
    # 1. Reverter saldo da conta bancária de origem (devolver o dinheiro)
    if conta:
        conta.saldo_atual += transacao.valor
        
    # 2. Re-reduzir limite disponível do cartão (voltar a dívida)
    cartao.limite_disponivel = max(0.0, cartao.limite_disponivel - transacao.valor)
    
    # 3. Buscar todas as transações de compra realizadas naquele cartão e mês de fatura
    try:
        ano_str, mes_str = transacao.fatura_mes.split('-')
        ano = int(ano_str)
        mes_int = int(mes_str)
        ultimo_dia = calendar.monthrange(ano, mes_int)[1]
        data_ini = date(ano, mes_int, 1)
        data_fim = date(ano, mes_int, ultimo_dia)
        
        transacoes_fatura = Transacao.query.filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.cartao_credito_id == cartao.id,
            Transacao.data >= data_ini,
            Transacao.data <= data_fim
        ).all()
        for t in transacoes_fatura:
            t.pago_ou_confirmado = False
    except Exception as e:
        print(f"Erro ao reverter status das compras no estorno: {e}")
        
    # 4. Excluir a transação de pagamento
    db.session.delete(transacao)
    db.session.commit()
    
    return jsonify({
        'mensagem': 'Pagamento de fatura estornado com sucesso!',
        'cartao': cartao.to_dict(),
        'conta': conta.to_dict() if conta else None
    })

@app.route('/api/transacoes/<int:id>/confirmar', methods=['PUT'])
def toggle_confirmar(id):
    transacao = Transacao.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    novo_status = not transacao.pago_ou_confirmado
    
    # Não faz sentido conciliar compras de cartão direto, pois são quitadas no pagamento da fatura.
    if transacao.cartao_credito_id:
        return jsonify({'error': 'Transações de cartão de crédito são liquidadas no pagamento da fatura.'}), 400
        
    transacao.pago_ou_confirmado = novo_status
    
    # Se mudou para PAGO/CONFIRMADO: aplica o valor
    # Se mudou para PENDENTE: desfaz o valor
    fator = 1 if novo_status else -1
    
    if transacao.tipo == 'RECEITA' and transacao.conta_destino_id:
        conta = ContaBancaria.query.filter_by(id=transacao.conta_destino_id, usuario_cpf=session['user_cpf']).first()
        if conta:
            conta.saldo_atual += (transacao.valor * fator)
    elif transacao.tipo == 'DESPESA' and transacao.conta_origem_id:
        conta = ContaBancaria.query.filter_by(id=transacao.conta_origem_id, usuario_cpf=session['user_cpf']).first()
        if conta:
            conta.saldo_atual -= (transacao.valor * fator)
    elif transacao.tipo == 'TRANSFERENCIA' and transacao.conta_origem_id and transacao.conta_destino_id:
        conta_ori = ContaBancaria.query.filter_by(id=transacao.conta_origem_id, usuario_cpf=session['user_cpf']).first()
        conta_des = ContaBancaria.query.filter_by(id=transacao.conta_destino_id, usuario_cpf=session['user_cpf']).first()
        if conta_ori and conta_des:
            conta_ori.saldo_atual -= (transacao.valor * fator)
            conta_des.saldo_atual += (transacao.valor * fator)
            
    db.session.commit()
    return jsonify(transacao.to_dict())

@app.route('/api/transacoes/bulk-update-categoria', methods=['POST'])
def bulk_update_categoria():
    data = request.get_json() or {}
    ids = data.get('ids')
    categoria_id = data.get('categoria_id')
    
    if not ids or not isinstance(ids, list):
        return jsonify({'error': 'IDs inválidos ou não informados'}), 400
        
    # Validar a categoria se informada
    if categoria_id:
        categoria = Categoria.query.filter_by(id=int(categoria_id), usuario_cpf=session['user_cpf']).first_or_404()
        val_cat_id = int(categoria_id)
    else:
        val_cat_id = None
        
    try:
        # Atualizar todas as transações selecionadas pertencentes ao usuário logado
        Transacao.query.filter(Transacao.id.in_(ids), Transacao.usuario_cpf == session['user_cpf']).update(
            {Transacao.categoria_id: val_cat_id},
            synchronize_session=False
        )
        db.session.commit()
        return jsonify({'mensagem': f'{len(ids)} transações atualizadas com sucesso'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Erro ao atualizar transações: {str(e)}'}), 500

@app.route('/api/faturas', methods=['GET'])
def get_all_faturas():
    # Retorna uma lista de todas as faturas históricas de todos os cartões
    cartoes = CartaoCredito.query.filter_by(usuario_cpf=session['user_cpf']).all()
    transacoes_cartao = Transacao.query.filter(
        Transacao.usuario_cpf == session['user_cpf'],
        Transacao.cartao_credito_id.isnot(None)
    ).all()
    pagamentos_fatura = Transacao.query.filter(
        Transacao.usuario_cpf == session['user_cpf'],
        Transacao.fatura_cartao_id.isnot(None)
    ).all()
    
    # Mapear chaves (cartao_id, mes) -> valores
    faturas_dict = {}
    
    # 1. Agrupar despesas de cartão por cartão e mês (extraído da data da transação)
    for t in transacoes_cartao:
        mes_str = t.data.strftime('%Y-%m')
        key = (t.cartao_credito_id, mes_str)
        if key not in faturas_dict:
            faturas_dict[key] = {'compras': 0.0, 'pago': 0.0}
        faturas_dict[key]['compras'] += t.valor
        
    # 2. Agrupar pagamentos de fatura
    for p in pagamentos_fatura:
        if not p.fatura_mes:
            continue
        key = (p.fatura_cartao_id, p.fatura_mes)
        if key not in faturas_dict:
            faturas_dict[key] = {'compras': 0.0, 'pago': 0.0}
        faturas_dict[key]['pago'] += p.valor
        
    # 3. Construir lista de retorno
    resultado = []
    cartoes_dict = {c.id: c for c in cartoes}
    
    for key, val in faturas_dict.items():
        card_id, mes_str = key
        card = cartoes_dict.get(card_id)
        if not card:
            continue
            
        compras = round(val['compras'], 2)
        pago = round(val['pago'], 2)
        
        # Só incluir se houver alguma movimentação (compra ou pagamento)
        if compras == 0.0 and pago == 0.0:
            continue
            
        # Determinar status
        if pago >= compras and compras > 0:
            status = 'PAGO'
        elif pago > 0:
            status = 'PARCIAL'
        else:
            status = 'PENDENTE'
            
        resultado.append({
            'cartao_id': card_id,
            'cartao_nome': card.nome,
            'mes': mes_str,
            'valor_total': compras,
            'valor_pago': pago,
            'status': status,
            'dia_vencimento': card.dia_vencimento
        })
        
    # Ordenar por mês decrescente e nome do cartão
    resultado.sort(key=lambda x: (x['mes'], x['cartao_nome']), reverse=True)
    return jsonify(resultado)

# ==================== API: RESUMOS E MÉTRICAS ====================

@app.route('/api/resumo', methods=['GET'])
def get_resumo():
    mes = request.args.get('mes')  # AAAA-MM
    if not mes:
        mes = date.today().strftime('%Y-%m')
        
    ano_str, mes_str = mes.split('-')
    ano = int(ano_str)
    mes_int = int(mes_str)
    ultimo_dia = calendar.monthrange(ano, mes_int)[1]
    data_ini = date(ano, mes_int, 1)
    data_fim = date(ano, mes_int, ultimo_dia)
    
    # 1. Saldo Geral Atual (somatório de todas as contas reais)
    contas = ContaBancaria.query.filter_by(usuario_cpf=session['user_cpf']).all()
    saldo_geral = sum(c.saldo_atual for c in contas)
    
    # 2. Receitas do Mês selecionado
    receitas_mes = db.session.query(db.func.sum(Transacao.valor)).filter(
        Transacao.usuario_cpf == session['user_cpf'],
        Transacao.tipo == 'RECEITA',
        Transacao.data >= data_ini,
        Transacao.data <= data_fim
    ).scalar() or 0.0
    
    # 3. Despesas do Mês selecionado (contas normais + compras de cartão)
    # Exclui pagamentos de fatura (fatura_cartao_id.is_(None)) para evitar dupla contagem com as compras individuais
    despesas_mes = db.session.query(db.func.sum(Transacao.valor)).filter(
        Transacao.usuario_cpf == session['user_cpf'],
        Transacao.tipo == 'DESPESA',
        Transacao.fatura_cartao_id.is_(None),
        Transacao.data >= data_ini,
        Transacao.data <= data_fim
    ).scalar() or 0.0
    
    # 4. Faturas de Cartão no Mês
    # Para cada cartão, somamos as despesas atreladas a ele com data no mês selecionado
    cartoes_info = []
    cartoes = CartaoCredito.query.filter_by(usuario_cpf=session['user_cpf']).all()
    for c in cartoes:
        fatura_valor = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'DESPESA',
            Transacao.cartao_credito_id == c.id,
            Transacao.data >= data_ini,
            Transacao.data <= data_fim
        ).scalar() or 0.0
        
        fatura_pago = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'DESPESA',
            Transacao.fatura_cartao_id == c.id,
            Transacao.fatura_mes == mes
        ).scalar() or 0.0
        
        cartoes_info.append({
            'id': c.id,
            'nome': c.nome,
            'limite': c.limite,
            'limite_disponivel': c.limite_disponivel,
            'fatura_mes': fatura_valor,
            'fatura_pendente': max(0.0, fatura_valor - fatura_pago),
            'dia_vencimento': c.dia_vencimento,
            'conta_bancaria_nome': c.conta_bancaria.nome if c.conta_bancaria else None
        })
        
    # 5. Gastos por Categoria no Mês (para Gráfico de Rosca)
    categorias_gastos = db.session.query(
        Categoria.nome, db.func.sum(Transacao.valor)
    ).join(Transacao, Transacao.categoria_id == Categoria.id).filter(
        Categoria.usuario_cpf == session['user_cpf'],
        Transacao.usuario_cpf == session['user_cpf'],
        Transacao.tipo == 'DESPESA',
        Transacao.data >= data_ini,
        Transacao.data <= data_fim
    ).group_by(Categoria.nome).all()
    
    distribuicao_categorias = [{'categoria': nome, 'valor': valor} for nome, valor in categorias_gastos]
    
    # 6. Progresso do Orçamento no Mês
    orcamentos = Orcamento.query.filter_by(mes=mes, usuario_cpf=session['user_cpf']).all()
    orcamentos_progresso = []
    for o in orcamentos:
        gasto_real = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'DESPESA',
            Transacao.categoria_id == o.categoria_id,
            Transacao.data >= data_ini,
            Transacao.data <= data_fim
        ).scalar() or 0.0
        
        orcamentos_progresso.append({
            'id': o.id,
            'categoria_nome': o.categoria.nome if o.categoria else 'Sem Categoria',
            'categoria_icone': o.categoria.icone if o.categoria else 'tag',
            'limite': o.limite_mensal,
            'gasto': gasto_real,
            'porcentagem': (gasto_real / o.limite_mensal * 100) if o.limite_mensal > 0 else 0
        })
        
    # 7. Fluxo Financeiro por Integrante da Família
    pessoas = ['Henrico', 'Thamires', 'Maria Heloísa', 'Compartilhado']
    fluxo_pessoas = []
    for p in pessoas:
        ganhou = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'RECEITA',
            Transacao.pessoa == p,
            Transacao.data >= data_ini,
            Transacao.data <= data_fim
        ).scalar() or 0.0
        
        gastou = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'DESPESA',
            Transacao.fatura_cartao_id.is_(None),
            Transacao.pessoa == p,
            Transacao.data >= data_ini,
            Transacao.data <= data_fim
        ).scalar() or 0.0
        
        fluxo_pessoas.append({
            'pessoa': p,
            'ganhou': ganhou,
            'gastou': gastou
        })
        
    # 8. Calcular acumulado do que falta pagar no mês selecionado
    falta_pagar_faturas = 0.0
    for c in cartoes:
        compra_total = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'DESPESA',
            Transacao.cartao_credito_id == c.id,
            Transacao.data >= data_ini,
            Transacao.data <= data_fim
        ).scalar() or 0.0
        
        pagamento_total = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'DESPESA',
            Transacao.fatura_cartao_id == c.id,
            Transacao.fatura_mes == mes
        ).scalar() or 0.0
        
        falta_pagar_faturas += max(0.0, compra_total - pagamento_total)
        
    falta_pagar_contas = db.session.query(db.func.sum(Transacao.valor)).filter(
        Transacao.usuario_cpf == session['user_cpf'],
        Transacao.tipo == 'DESPESA',
        Transacao.cartao_credito_id.is_(None),
        Transacao.fatura_cartao_id.is_(None),
        Transacao.pago_ou_confirmado == False,
        Transacao.data >= data_ini,
        Transacao.data <= data_fim
    ).scalar() or 0.0
    
    total_falta_pagar = falta_pagar_faturas + falta_pagar_contas

    # 9. Projeção para os próximos 6 meses
    projecoes = []
    recorrentes = Transacao.query.filter(Transacao.recorrente == True, Transacao.usuario_cpf == session['user_cpf']).all()
    meses_nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    
    for i in range(0, 7):
        fut_ano = ano + (mes_int + i - 1) // 12
        fut_mes = (mes_int + i - 1) % 12 + 1
        fut_ultimo_dia = calendar.monthrange(fut_ano, fut_mes)[1]
        
        fut_data_ini = date(fut_ano, fut_mes, 1)
        fut_data_fim = date(fut_ano, fut_mes, fut_ultimo_dia)
        fut_mes_str = f"{fut_ano}-{str(fut_mes).zfill(2)}"
        
        # A. Transações explícitas agendadas para este mês futuro
        fut_receitas = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'RECEITA',
            Transacao.data >= fut_data_ini,
            Transacao.data <= fut_data_fim
        ).scalar() or 0.0
        
        fut_despesas = db.session.query(db.func.sum(Transacao.valor)).filter(
            Transacao.usuario_cpf == session['user_cpf'],
            Transacao.tipo == 'DESPESA',
            Transacao.fatura_cartao_id.is_(None),
            Transacao.data >= fut_data_ini,
            Transacao.data <= fut_data_fim
        ).scalar() or 0.0
        
        # B. Lançamentos recorrentes
        for rec in recorrentes:
            if rec.data <= fut_data_fim:
                ja_existe = db.session.query(Transacao.id).filter(
                    Transacao.usuario_cpf == session['user_cpf'],
                    Transacao.tipo == rec.tipo,
                    Transacao.descricao == rec.descricao,
                    Transacao.valor == rec.valor,
                    Transacao.data >= fut_data_ini,
                    Transacao.data <= fut_data_fim
                ).first() is not None
                
                if not ja_existe:
                    if rec.tipo == 'RECEITA':
                        fut_receitas += rec.valor
                    elif rec.tipo == 'DESPESA':
                        fut_despesas += rec.valor
                        
        projecoes.append({
            'mes': fut_mes_str,
            'mes_nome': f"{meses_nomes[fut_mes - 1]}/{str(fut_ano)[2:]}",
            'receitas': round(fut_receitas, 2),
            'despesas': round(fut_despesas, 2),
            'saldo_projetado': round(fut_receitas - fut_despesas, 2)
        })
        
    return jsonify({
        'mes': mes,
        'saldo_geral': saldo_geral,
        'total_receitas': receitas_mes,
        'total_despesas': despesas_mes,
        'balanco': receitas_mes - despesas_mes,
        'faturas_cartoes': cartoes_info,
        'distribuicao_categorias': distribuicao_categorias,
        'orcamentos_progresso': orcamentos_progresso,
        'falta_pagar': total_falta_pagar,
        'projecoes': projecoes,
        'fluxo_pessoas': fluxo_pessoas
    })

# ==================== API: INVESTIMENTOS & RENTABILIDADE ====================

def obter_taxa_sgs_mes(codigo_serie, ano, mes):
    # Procura no cache do banco de dados primeiro
    inicio_mes = date(ano, mes, 1)
    taxa_local = TaxaSGS.query.filter_by(serie=codigo_serie, data=inicio_mes).first()
    if taxa_local:
        return taxa_local.valor

    # Caso não esteja no cache, busca do Banco Central do Brasil
    data_ini_str = f"01/{mes:02d}/{ano}"
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    data_fim_str = f"{ultimo_dia:02d}/{mes:02d}/{ano}"
    
    url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo_serie}/dados?formato=json&dataInicial={data_ini_str}&dataFinal={data_fim_str}"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            if response.status == 200:
                dados = json.loads(response.read().decode('utf-8'))
                if dados and len(dados) > 0:
                    valor_taxa = float(dados[0]['valor'])
                    
                    # Salva no cache do banco
                    nova_taxa = TaxaSGS(serie=codigo_serie, data=inicio_mes, valor=valor_taxa)
                    db.session.add(nova_taxa)
                    db.session.commit()
                    return valor_taxa
    except Exception as e:
        print(f"Erro ao buscar taxa {codigo_serie} da API do Banco Central: {e}")
        
    # Fallbacks conservadores caso a API do BCB falhe e não haja cache local
    if codigo_serie == 4391 or codigo_serie == 4390:  # CDI ou Selic
        return 0.83
    elif codigo_serie == 433:  # IPCA
        return 0.35
    elif codigo_serie == 432:  # Selic Meta
        return 10.5
    return 0.0

def calcular_rendimento_investimento(inv, ano_limite, mes_limite):
    data_app = inv.data_aplicacao
    ano_app = data_app.year
    mes_app = data_app.month
    
    if date(ano_limite, mes_limite, 1) < date(ano_app, mes_app, 1):
        return {
            'valor_atual': 0.0,
            'rendimento_total': 0.0,
            'historico_valores': []
        }
        
    valor_atual = inv.valor_aplicado
    rendimento_total = 0.0
    historico_valores = []
    
    ano_atual = ano_app
    mes_atual = mes_app
    
    while date(ano_atual, mes_atual, 1) <= date(ano_limite, mes_limite, 1):
        taxa_mes_percent = 0.0
        
        if inv.tipo == 'CDB' or inv.tipo == 'LCI_LCA':
            taxa_cdi = obter_taxa_sgs_mes(4391, ano_atual, mes_atual)
            taxa_mes_percent = taxa_cdi * (inv.taxa / 100.0)
        elif inv.tipo == 'TESOURO':
            taxa_selic = obter_taxa_sgs_mes(4390, ano_atual, mes_atual)
            taxa_mes_percent = taxa_selic
        elif inv.tipo == 'POUPANCA':
            selic_meta = obter_taxa_sgs_mes(432, ano_atual, mes_atual)
            if selic_meta > 8.5:
                taxa_mes_percent = 0.5
            else:
                taxa_mes_percent = 0.7 * (selic_meta / 12.0)
        elif inv.tipo == 'PREFIXADO':
            taxa_mes_percent = ((1 + inv.taxa/100.0) ** (1/12.0) - 1) * 100.0
            
        r_mes = taxa_mes_percent / 100.0
        
        # Proporcionalidade do primeiro mês
        if ano_atual == ano_app and mes_atual == mes_app:
            ultimo_dia = calendar.monthrange(ano_atual, mes_atual)[1]
            dias_corridos = ultimo_dia - data_app.day + 1
            proporcao = dias_corridos / ultimo_dia
            rendimento_mes = valor_atual * (r_mes * proporcao)
        else:
            rendimento_mes = valor_atual * r_mes
            
        valor_atual += rendimento_mes
        rendimento_total += rendimento_mes
        
        historico_valores.append({
            'mes': f"{ano_atual}-{mes_atual:02d}",
            'saldo': valor_atual,
            'rendimento': rendimento_mes
        })
        
        mes_atual += 1
        if mes_atual > 12:
            mes_atual = 1
            ano_atual += 1
            
    return {
        'valor_atual': valor_atual,
        'rendimento_total': rendimento_total,
        'historico_valores': historico_valores
    }

@app.route('/api/investimentos', methods=['GET'])
def get_investimentos():
    mes = request.args.get('mes')
    if not mes:
        mes = date.today().strftime('%Y-%m')
        
    ano_limite, mes_limite = map(int, mes.split('-'))
    
    investimentos = Investimento.query.filter_by(usuario_cpf=session['user_cpf']).all()
    lista_completa = []
    
    total_aplicado = 0.0
    total_atual = 0.0
    total_rendimento = 0.0
    
    alocacao = {}
    evolucao_temp = {}
    
    cdi_mes = obter_taxa_sgs_mes(4391, ano_limite, mes_limite)
    selic_mes = obter_taxa_sgs_mes(4390, ano_limite, mes_limite)
    selic_meta_mes = obter_taxa_sgs_mes(432, ano_limite, mes_limite)
    ipca_mes = obter_taxa_sgs_mes(433, ano_limite, mes_limite)
    
    for inv in investimentos:
        calc = calcular_rendimento_investimento(inv, ano_limite, mes_limite)
        
        total_aplicado += inv.valor_aplicado
        total_atual += calc['valor_atual']
        total_rendimento += calc['rendimento_total']
        
        alocacao[inv.tipo] = alocacao.get(inv.tipo, 0.0) + calc['valor_atual']
        
        for h in calc['historico_valores']:
            evolucao_temp[h['mes']] = evolucao_temp.get(h['mes'], 0.0) + h['saldo']
            
        item = inv.to_dict()
        item['valor_atual'] = calc['valor_atual']
        item['rendimento_total'] = calc['rendimento_total']
        
        # Rendimento atual do mês de referência
        r_mensal_atual = 0.0
        r_anual_atual = 0.0
        
        if inv.tipo == 'CDB' or inv.tipo == 'LCI_LCA':
            r_mensal_atual = cdi_mes * (inv.taxa / 100.0)
            r_anual_atual = ((1 + r_mensal_atual/100.0)**12 - 1) * 100.0
        elif inv.tipo == 'TESOURO':
            r_mensal_atual = selic_mes
            r_anual_atual = ((1 + r_mensal_atual/100.0)**12 - 1) * 100.0
        elif inv.tipo == 'POUPANCA':
            if selic_meta_mes > 8.5:
                r_mensal_atual = 0.5
            else:
                r_mensal_atual = 0.7 * (selic_meta_mes / 12.0)
            r_anual_atual = ((1 + r_mensal_atual/100.0)**12 - 1) * 100.0
        elif inv.tipo == 'PREFIXADO':
            r_anual_atual = inv.taxa
            r_mensal_atual = ((1 + inv.taxa/100.0)**(1/12.0) - 1) * 100.0
            
        item['rendimento_mensal_atual'] = r_mensal_atual
        item['rendimento_anual_atual'] = r_anual_atual
        
        lista_completa.append(item)
        
    evolucao = sorted(
        [{'mes': k, 'saldo': v} for k, v in evolucao_temp.items()],
        key=lambda x: x['mes']
    )
    
    cdi_anual = ((1 + cdi_mes/100.0)**12 - 1) * 100.0
    selic_anual = ((1 + selic_mes/100.0)**12 - 1) * 100.0
    if selic_meta_mes > 8.5:
        poupanca_mes = 0.5
    else:
        poupanca_mes = 0.7 * (selic_meta_mes / 12.0)
    poupanca_anual = ((1 + poupanca_mes/100.0)**12 - 1) * 100.0
    ipca_anual = ((1 + ipca_mes/100.0)**12 - 1) * 100.0
    
    return jsonify({
        'investimentos': lista_completa,
        'total_aplicado': total_aplicado,
        'total_atual': total_atual,
        'total_rendimento': total_rendimento,
        'alocacao': [{'tipo': k, 'valor': v} for k, v in alocacao.items()],
        'evolucao': evolucao,
        'taxas_referencia': {
            'cdi_mensal': cdi_mes,
            'cdi_anual': cdi_anual,
            'selic_mensal': selic_mes,
            'selic_anual': selic_anual,
            'poupanca_mensal': poupanca_mes,
            'poupanca_anual': poupanca_anual,
            'ipca_mensal': ipca_mes,
            'ipca_anual': ipca_anual
        }
    })

@app.route('/api/investimentos', methods=['POST'])
def create_investimento():
    data = request.json
    nome = data.get('nome')
    valor_aplicado = float(data.get('valor_aplicado', 0.0))
    data_aplicacao_str = data.get('data_aplicacao')
    tipo = data.get('tipo')
    taxa = float(data.get('taxa', 100.0))
    pessoa = data.get('pessoa')
    
    if not nome or valor_aplicado <= 0 or not data_aplicacao_str or not tipo:
        return jsonify({'error': 'Preencha todos os campos obrigatórios'}), 400
        
    try:
        data_aplicacao = datetime.strptime(data_aplicacao_str, "%Y-%m-%d").date()
    except Exception:
        return jsonify({'error': 'Formato de data de aplicação inválido'}), 400
        
    inv = Investimento(
        nome=nome,
        valor_aplicado=valor_aplicado,
        data_aplicacao=data_aplicacao,
        tipo=tipo,
        taxa=taxa,
        pessoa=pessoa,
        usuario_cpf=session['user_cpf']
    )
    db.session.add(inv)
    db.session.commit()
    return jsonify(inv.to_dict()), 201

@app.route('/api/investimentos/<int:id>', methods=['DELETE'])
def delete_investimento(id):
    inv = Investimento.query.filter_by(id=id, usuario_cpf=session['user_cpf']).first_or_404()
    db.session.delete(inv)
    db.session.commit()
    return jsonify({'mensagem': 'Investimento excluído com sucesso'})

if __name__ == '__main__':
    # Roda a aplicação na porta 5000 localmente
    app.run(debug=True, port=5000)
