from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Usuario(db.Model):
    __tablename__ = 'usuarios'
    
    cpf = db.Column(db.String(11), primary_key=True)  # CPF limpo de 11 dígitos
    nome = db.Column(db.String(100), nullable=False)
    senha_hash = db.Column(db.String(255), nullable=False)
    
    def to_dict(self):
        return {
            'cpf': self.cpf,
            'nome': self.nome
        }

class ContaBancaria(db.Model):
    __tablename__ = 'contas_bancarias'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    tipo = db.Column(db.String(50), nullable=False)  # CORRENTE, POUPANCA, INVESTIMENTO, DINHEIRO
    saldo_inicial = db.Column(db.Float, default=0.0)
    saldo_atual = db.Column(db.Float, default=0.0)
    pessoa = db.Column(db.String(50), nullable=True)
    banco = db.Column(db.String(100), nullable=True)
    agencia = db.Column(db.String(50), nullable=True)
    numero_conta = db.Column(db.String(50), nullable=True)
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)
    
    # Relacionamentos
    transacoes_origem = db.relationship('Transacao', foreign_keys='Transacao.conta_origem_id', backref='conta_origem', lazy=True)
    transacoes_destino = db.relationship('Transacao', foreign_keys='Transacao.conta_destino_id', backref='conta_destino', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'tipo': self.tipo,
            'saldo_inicial': self.saldo_inicial,
            'saldo_atual': self.saldo_atual,
            'pessoa': self.pessoa,
            'banco': self.banco,
            'agencia': self.agencia,
            'numero_conta': self.numero_conta,
            'usuario_cpf': self.usuario_cpf
        }

class Categoria(db.Model):
    __tablename__ = 'categorias'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    tipo = db.Column(db.String(50), nullable=False)  # RECEITA, DESPESA
    icone = db.Column(db.String(50), nullable=False, default='tag')  # Nome do ícone SVG/Lucide
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)
    
    transacoes = db.relationship('Transacao', backref='categoria', lazy=True)
    orcamentos = db.relationship('Orcamento', backref='categoria', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'tipo': self.tipo,
            'icone': self.icone,
            'usuario_cpf': self.usuario_cpf
        }

class CartaoCredito(db.Model):
    __tablename__ = 'cartoes_credito'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    limite = db.Column(db.Float, nullable=False)
    limite_disponivel = db.Column(db.Float, nullable=False)
    dia_fechamento = db.Column(db.Integer, nullable=False)
    dia_vencimento = db.Column(db.Integer, nullable=False)
    
    # Vinculo opcional com Conta Bancária para débito da fatura
    conta_bancaria_id = db.Column(db.Integer, db.ForeignKey('contas_bancarias.id'), nullable=True)
    conta_bancaria = db.relationship('ContaBancaria', backref='cartoes', lazy=True)
    
    transacoes = db.relationship('Transacao', foreign_keys='Transacao.cartao_credito_id', backref='cartao_credito', lazy=True)
    pagamentos_fatura = db.relationship('Transacao', foreign_keys='Transacao.fatura_cartao_id', backref='fatura_cartao', lazy=True)
    pessoa = db.Column(db.String(50), nullable=True)
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'limite': self.limite,
            'limite_disponivel': self.limite_disponivel,
            'dia_fechamento': self.dia_fechamento,
            'dia_vencimento': self.dia_vencimento,
            'conta_bancaria_id': self.conta_bancaria_id,
            'conta_bancaria_nome': self.conta_bancaria.nome if self.conta_bancaria else None,
            'pessoa': self.pessoa,
            'usuario_cpf': self.usuario_cpf
        }

class Transacao(db.Model):
    __tablename__ = 'transacoes'
    
    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String(50), nullable=False)  # RECEITA, DESPESA, TRANSFERENCIA
    descricao = db.Column(db.String(255), nullable=False)
    valor = db.Column(db.Float, nullable=False)
    data = db.Column(db.Date, nullable=False)
    
    # Vinculos
    categoria_id = db.Column(db.Integer, db.ForeignKey('categorias.id'), nullable=True)
    conta_origem_id = db.Column(db.Integer, db.ForeignKey('contas_bancarias.id'), nullable=True)
    conta_destino_id = db.Column(db.Integer, db.ForeignKey('contas_bancarias.id'), nullable=True)
    cartao_credito_id = db.Column(db.Integer, db.ForeignKey('cartoes_credito.id'), nullable=True)
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)
    
    # Controle
    pago_ou_confirmado = db.Column(db.Boolean, default=False)
    pagador_recebedor = db.Column(db.String(255), nullable=True)
    recorrente = db.Column(db.Boolean, default=False)
    
    # Fatura Vinculada (Pagamento de Fatura)
    fatura_cartao_id = db.Column(db.Integer, db.ForeignKey('cartoes_credito.id'), nullable=True)
    fatura_mes = db.Column(db.String(7), nullable=True)
    
    # Parcelamento
    grupo_parcelamento_id = db.Column(db.String(100), nullable=True)
    numero_parcela = db.Column(db.Integer, nullable=True)
    total_parcelas = db.Column(db.Integer, nullable=True)
    pessoa = db.Column(db.String(50), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'tipo': self.tipo,
            'descricao': self.descricao,
            'valor': self.valor,
            'data': self.data.isoformat(),
            'categoria_id': self.categoria_id,
            'categoria_nome': self.categoria.nome if self.categoria else None,
            'categoria_icone': self.categoria.icone if self.categoria else None,
            'conta_origem_id': self.conta_origem_id,
            'conta_origem_nome': self.conta_origem.nome if self.conta_origem else None,
            'conta_destino_id': self.conta_destino_id,
            'conta_destino_nome': self.conta_destino.nome if self.conta_destino else None,
            'cartao_credito_id': self.cartao_credito_id,
            'cartao_credito_nome': self.cartao_credito.nome if self.cartao_credito else (self.fatura_cartao.nome if self.fatura_cartao else None),
            'pago_ou_confirmado': self.pago_ou_confirmado,
            'pagador_recebedor': self.pagador_recebedor,
            'recorrente': self.recorrente,
            'grupo_parcelamento_id': self.grupo_parcelamento_id,
            'numero_parcela': self.numero_parcela,
            'total_parcelas': self.total_parcelas,
            'pessoa': self.pessoa,
            'fatura_cartao_id': self.fatura_cartao_id,
            'fatura_mes': self.fatura_mes,
            'usuario_cpf': self.usuario_cpf
        }

class Orcamento(db.Model):
    __tablename__ = 'orcamentos'
    
    id = db.Column(db.Integer, primary_key=True)
    categoria_id = db.Column(db.Integer, db.ForeignKey('categorias.id'), nullable=False)
    limite_mensal = db.Column(db.Float, nullable=False)
    mes = db.Column(db.String(7), nullable=False)  # Formato YYYY-MM
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'categoria_id': self.categoria_id,
            'categoria_nome': self.categoria.nome if self.categoria else None,
            'limite_mensal': self.limite_mensal,
            'mes': self.mes,
            'usuario_cpf': self.usuario_cpf
        }

class MetaFinanceira(db.Model):
    __tablename__ = 'metas_financeiras'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    valor_alvo = db.Column(db.Float, nullable=False)
    valor_poupado = db.Column(db.Float, default=0.0)
    data_limite = db.Column(db.Date, nullable=True)
    pessoa = db.Column(db.String(50), nullable=True)
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'valor_alvo': self.valor_alvo,
            'valor_poupado': self.valor_poupado,
            'data_limite': self.data_limite.isoformat() if self.data_limite else None,
            'pessoa': self.pessoa,
            'usuario_cpf': self.usuario_cpf
        }

class TaxaSGS(db.Model):
    __tablename__ = 'taxas_sgs'
    
    id = db.Column(db.Integer, primary_key=True)
    serie = db.Column(db.Integer, nullable=False)  # Ex: 4391 (CDI), 4390 (Selic), 433 (IPCA)
    data = db.Column(db.Date, nullable=False)  # Primeiro dia do mês correspondente
    valor = db.Column(db.Float, nullable=False)  # Taxa percentual (ex: 0.82 para 0.82%)

    def to_dict(self):
        return {
            'id': self.id,
            'serie': self.serie,
            'data': self.data.isoformat(),
            'valor': self.valor
        }

class Investimento(db.Model):
    __tablename__ = 'investimentos'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    valor_aplicado = db.Column(db.Float, nullable=False)
    data_aplicacao = db.Column(db.Date, nullable=False)
    tipo = db.Column(db.String(50), nullable=False)  # CDB, LCI_LCA, TESOURO, POUPANCA, PREFIXADO
    taxa = db.Column(db.Float, nullable=False, default=100.0)  # Ex: 100.0 (para 100% CDI) ou 12.5 (12.5% a.a.)
    pessoa = db.Column(db.String(50), nullable=True)
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'valor_aplicado': self.valor_aplicado,
            'data_aplicacao': self.data_aplicacao.isoformat(),
            'tipo': self.tipo,
            'taxa': self.taxa,
            'pessoa': self.pessoa,
            'usuario_cpf': self.usuario_cpf
        }

class Configuracao(db.Model):
    __tablename__ = 'configuracoes'
    
    chave = db.Column(db.String(100), primary_key=True)
    valor = db.Column(db.String(255), nullable=False)
    usuario_cpf = db.Column(db.String(11), db.ForeignKey('usuarios.cpf'), nullable=True)

    def to_dict(self):
        return {
            'chave': self.chave,
            'valor': self.valor,
            'usuario_cpf': self.usuario_cpf
        }
