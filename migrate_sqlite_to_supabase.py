import os
import sys
from datetime import datetime
from flask import Flask
from models import (
    db, Usuario, ContaBancaria, Categoria, CartaoCredito, Transacao, 
    Orcamento, MetaFinanceira, TaxaSGS, Investimento, Configuracao
)

# 1. Configurar o app Flask para leitura do SQLite
app_sqlite = Flask(__name__)
sqlite_db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'financas.db')
sqlite_uri = f'sqlite:///{sqlite_db_path}'

app_sqlite.config['SQLALCHEMY_DATABASE_URI'] = sqlite_uri
app_sqlite.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app_sqlite)

print("--- INICIANDO LEITURA DO SQLITE LOCAL ---")
print(f"Banco Origem: {sqlite_db_path}")

if not os.path.exists(sqlite_db_path):
    print(f"Erro: O arquivo de banco de dados SQLite '{sqlite_db_path}' não foi encontrado.")
    sys.exit(1)

sqlite_data = {}

with app_sqlite.app_context():
    try:
        print("Lendo registros do SQLite...")
        sqlite_data['usuarios'] = Usuario.query.all()
        sqlite_data['contas_bancarias'] = ContaBancaria.query.all()
        sqlite_data['categorias'] = Categoria.query.all()
        sqlite_data['cartoes_credito'] = CartaoCredito.query.all()
        sqlite_data['transacoes'] = Transacao.query.all()
        sqlite_data['orcamentos'] = Orcamento.query.all()
        sqlite_data['metas_financeiras'] = MetaFinanceira.query.all()
        sqlite_data['taxas_sgs'] = TaxaSGS.query.all()
        sqlite_data['investimentos'] = Investimento.query.all()
        sqlite_data['configuracoes'] = Configuracao.query.all()
        
        print(f"Leitura concluída com sucesso! Total de registros:")
        for k, v in sqlite_data.items():
            print(f" - {k}: {len(v)} registros")
            
        # Desassociar objetos da sessão do SQLite para podermos salvá-los no PostgreSQL
        for key in sqlite_data:
            for item in sqlite_data[key]:
                db.session.expunge(item)
                
    except Exception as e:
        print(f"Erro ao ler banco SQLite: {e}")
        sys.exit(1)

print("\n--- CONECTANDO AO SUPABASE (POSTGRESQL) ---")
postgres_uri = 'postgresql://postgres.qkjnklyndghuejmgxzeb:6uourxQEzCQXyjdM@aws-1-us-west-2.pooler.supabase.com:6543/postgres'

app_pg = Flask(__name__)
app_pg.config['SQLALCHEMY_DATABASE_URI'] = postgres_uri
app_pg.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Inicializa o db no app do Postgres
# Como o objeto db é global, removemos a vinculação anterior recriando a associação
db.init_app(app_pg)

with app_pg.app_context():
    try:
        print("Criando tabelas no Supabase (se não existirem)...")
        db.create_all()
        
        print("Limpando dados antigos no Supabase para evitar conflitos de IDs...")
        # A exclusão respeita a hierarquia de chaves estrangeiras
        db.session.query(Transacao).delete()
        db.session.query(Orcamento).delete()
        db.session.query(MetaFinanceira).delete()
        db.session.query(Investimento).delete()
        db.session.query(Configuracao).delete()
        db.session.query(CartaoCredito).delete()
        db.session.query(Categoria).delete()
        db.session.query(ContaBancaria).delete()
        db.session.query(Usuario).delete()
        db.session.query(TaxaSGS).delete()
        db.session.commit()
        print("Supabase limpo para inserção.")
        
        print("Copiando registros para o Supabase PostgreSQL...")
        
        # 1. Usuários
        for u in sqlite_data['usuarios']:
            db.session.add(Usuario(cpf=u.cpf, nome=u.nome, senha_hash=u.senha_hash))
        db.session.commit()
        print("-> Usuários migrados.")
        
        # 2. Contas Bancárias
        for c in sqlite_data['contas_bancarias']:
            db.session.add(ContaBancaria(
                id=c.id, nome=c.nome, tipo=c.tipo, saldo_inicial=c.saldo_inicial,
                saldo_atual=c.saldo_atual, pessoa=c.pessoa, banco=c.banco,
                agencia=c.agencia, numero_conta=c.numero_conta, usuario_cpf=c.usuario_cpf
            ))
        db.session.commit()
        print("-> Contas Bancárias migradas.")
        
        # 3. Categorias
        for cat in sqlite_data['categorias']:
            db.session.add(Categoria(
                id=cat.id, nome=cat.nome, tipo=cat.tipo, icone=cat.icone, usuario_cpf=cat.usuario_cpf
            ))
        db.session.commit()
        print("-> Categorias migradas.")
        
        # 4. Cartões de Crédito
        for cc in sqlite_data['cartoes_credito']:
            db.session.add(CartaoCredito(
                id=cc.id, nome=cc.nome, limite=cc.limite, limite_disponivel=cc.limite_disponivel,
                dia_fechamento=cc.dia_fechamento, dia_vencimento=cc.dia_vencimento,
                conta_bancaria_id=cc.conta_bancaria_id, pessoa=cc.pessoa, usuario_cpf=cc.usuario_cpf
            ))
        db.session.commit()
        print("-> Cartões de Crédito migrados.")
        
        # 5. Transações
        for t in sqlite_data['transacoes']:
            db.session.add(Transacao(
                id=t.id, tipo=t.tipo, descricao=t.descricao, valor=t.valor, data=t.data,
                categoria_id=t.categoria_id, conta_origem_id=t.conta_origem_id,
                conta_destino_id=t.conta_destino_id, cartao_credito_id=t.cartao_credito_id,
                usuario_cpf=t.usuario_cpf, pago_ou_confirmado=t.pago_ou_confirmado,
                pagador_recebedor=t.pagador_recebedor, recorrente=t.recorrente,
                fatura_cartao_id=t.fatura_cartao_id, fatura_mes=t.fatura_mes,
                grupo_parcelamento_id=t.grupo_parcelamento_id, numero_parcela=t.numero_parcela,
                total_parcelas=t.total_parcelas, pessoa=t.pessoa
            ))
        db.session.commit()
        print("-> Transações migradas.")
        
        # 6. Orçamentos
        for o in sqlite_data['orcamentos']:
            db.session.add(Orcamento(
                id=o.id, categoria_id=o.categoria_id, limite_mensal=o.limite_mensal,
                mes=o.mes, usuario_cpf=o.usuario_cpf
            ))
        db.session.commit()
        print("-> Orçamentos migrados.")
        
        # 7. Metas Financeiras
        for m in sqlite_data['metas_financeiras']:
            db.session.add(MetaFinanceira(
                id=m.id, nome=m.nome, valor_alvo=m.valor_alvo, valor_poupado=m.valor_poupado,
                data_limite=m.data_limite, pessoa=m.pessoa, usuario_cpf=m.usuario_cpf
            ))
        db.session.commit()
        print("-> Metas Financeiras migradas.")
        
        # 8. Taxas SGS
        for tx in sqlite_data['taxas_sgs']:
            db.session.add(TaxaSGS(id=tx.id, serie=tx.serie, data=tx.data, valor=tx.valor))
        db.session.commit()
        print("-> Taxas SGS migradas.")
        
        # 9. Investimentos
        for i in sqlite_data['investimentos']:
            db.session.add(Investimento(
                id=i.id, nome=i.nome, valor_aplicado=i.valor_aplicado, data_aplicacao=i.data_aplicacao,
                tipo=i.tipo, taxa=i.taxa, pessoa=i.pessoa, usuario_cpf=i.usuario_cpf
            ))
        db.session.commit()
        print("-> Investimentos migrados.")
        
        # 10. Configurações
        for cfg in sqlite_data['configuracoes']:
            db.session.add(Configuracao(chave=cfg.chave, valor=cfg.valor, usuario_cpf=cfg.usuario_cpf))
        db.session.commit()
        print("-> Configurações migradas.")
        
        # Ajustar as sequências do Postgres para evitar conflitos de IDs gerados automaticamente no futuro
        print("Atualizando sequências do banco Postgres Supabase...")
        sequenced_tables = [
            ('contas_bancarias', 'id'),
            ('categorias', 'id'),
            ('cartoes_credito', 'id'),
            ('transacoes', 'id'),
            ('orcamentos', 'id'),
            ('metas_financeiras', 'id'),
            ('taxas_sgs', 'id'),
            ('investimentos', 'id')
        ]
        with db.engine.connect() as conn:
            for table, col in sequenced_tables:
                query = f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), COALESCE(MAX({col}), 1)) FROM {table};"
                conn.execute(db.text(query))
            conn.commit()
        print("-> Sequências numéricas redefinidas no PostgreSQL.")
        
    except Exception as e:
        print(f"Erro crítico durante a migração para o Supabase: {e}")
        db.session.rollback()
        sys.exit(1)

print("\n=== MIGRAÇÃO CONCLUÍDA COM SUCESSO! ===")
print("Todos os dados do SQLite estão agora salvos de forma persistente no Supabase PostgreSQL.")
