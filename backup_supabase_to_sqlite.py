import os
import sys
import json
import shutil
from datetime import datetime
from flask import Flask
from sqlalchemy import inspect
from models import db, Usuario, ContaBancaria, Categoria, CartaoCredito, Transacao, Orcamento, MetaFinanceira, TaxaSGS, Investimento, Configuracao

sp_uri = 'postgresql://postgres.gryocyufrzprjejekiox:Fmjs8544%40%23%21@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'

print("--- INICIANDO BACKUP DO SUPABASE PARA O AMBIENTE LOCAL ---")

app_pg = Flask('app_pg')
app_pg.config['SQLALCHEMY_DATABASE_URI'] = sp_uri
app_pg.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app_pg)

local_sqlite_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'financas.db')
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
json_backup_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), f'backup_supabase_{timestamp}.json')

def model_to_column_dict(model_instance):
    return {col.key: getattr(model_instance, col.key) for col in inspect(model_instance).mapper.column_attrs}

with app_pg.app_context():
    try:
        print("Lendo registros do Supabase PostgreSQL...")
        usuarios = Usuario.query.all()
        contas = ContaBancaria.query.all()
        categorias = Categoria.query.all()
        cartoes = CartaoCredito.query.all()
        transacoes = Transacao.query.all()
        orcamentos = Orcamento.query.all()
        metas = MetaFinanceira.query.all()
        taxas = TaxaSGS.query.all()
        investimentos = Investimento.query.all()
        configs = Configuracao.query.all()
        
        print(f"Sucesso! Encontrados:")
        print(f" - {len(usuarios)} usuários")
        print(f" - {len(contas)} contas bancárias")
        print(f" - {len(categorias)} categorias")
        print(f" - {len(cartoes)} cartões de crédito")
        print(f" - {len(transacoes)} transações")
        print(f" - {len(orcamentos)} orçamentos")
        print(f" - {len(metas)} metas")
        print(f" - {len(taxas)} taxas SGS")
        print(f" - {len(investimentos)} investimentos")
        print(f" - {len(configs)} configurações")
        
        # 1. Salva Backup JSON
        backup_dict = {
            'timestamp': timestamp,
            'usuarios': [u.to_dict() for u in usuarios],
            'usuarios_senhas': {u.cpf: u.senha_hash for u in usuarios},
            'contas_bancarias': [c.to_dict() for c in contas],
            'categorias': [cat.to_dict() for cat in categorias],
            'cartoes_credito': [cc.to_dict() for cc in cartoes],
            'transacoes': [t.to_dict() for t in transacoes],
            'orcamentos': [o.to_dict() for o in orcamentos],
            'metas_financeiras': [m.to_dict() for m in metas],
            'taxas_sgs': [tx.to_dict() for tx in taxas],
            'investimentos': [i.to_dict() for i in investimentos],
            'configuracoes': [cfg.to_dict() for cfg in configs]
        }
        with open(json_backup_path, 'w', encoding='utf-8') as f:
            json.dump(backup_dict, f, ensure_ascii=False, indent=4)
        print(f"\n-> Backup JSON salvo em: {json_backup_path}")

        # Extrai dicionários de colunas puras
        dict_usuarios = [model_to_column_dict(u) for u in usuarios]
        dict_contas = [model_to_column_dict(c) for c in contas]
        dict_categorias = [model_to_column_dict(c) for c in categorias]
        dict_cartoes = [model_to_column_dict(c) for c in cartoes]
        dict_transacoes = [model_to_column_dict(t) for t in transacoes]
        dict_orcamentos = [model_to_column_dict(o) for o in orcamentos]
        dict_metas = [model_to_column_dict(m) for m in metas]
        dict_taxas = [model_to_column_dict(tx) for tx in taxas]
        dict_investimentos = [model_to_column_dict(i) for i in investimentos]
        dict_configs = [model_to_column_dict(cfg) for cfg in configs]

    except Exception as e:
        print(f"Erro ao ler Supabase: {e}")
        sys.exit(1)

# 2. Sincroniza com o arquivo SQLite local financas.db
app_local = Flask('app_local')
app_local.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{local_sqlite_path}'
app_local.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

if os.path.exists(local_sqlite_path):
    backup_db_old = os.path.join(os.path.abspath(os.path.dirname(__file__)), f'financas_local_old_{timestamp}.db')
    shutil.copy2(local_sqlite_path, backup_db_old)
    print(f"-> Cópia de segurança do SQLite anterior salva em: {backup_db_old}")

db.init_app(app_local)
with app_local.app_context():
    db.drop_all()
    db.create_all()

    for d in dict_usuarios: db.session.add(Usuario(**d))
    db.session.commit()
    for d in dict_contas: db.session.add(ContaBancaria(**d))
    db.session.commit()
    for d in dict_categorias: db.session.add(Categoria(**d))
    db.session.commit()
    for d in dict_cartoes: db.session.add(CartaoCredito(**d))
    db.session.commit()
    for d in dict_transacoes: db.session.add(Transacao(**d))
    db.session.commit()
    for d in dict_orcamentos: db.session.add(Orcamento(**d))
    db.session.commit()
    for d in dict_metas: db.session.add(MetaFinanceira(**d))
    db.session.commit()
    for d in dict_taxas: db.session.add(TaxaSGS(**d))
    db.session.commit()
    for d in dict_investimentos: db.session.add(Investimento(**d))
    db.session.commit()
    for d in dict_configs: db.session.add(Configuracao(**d))
    db.session.commit()

    print(f"-> Arquivo SQLite local 'financas.db' atualizado com 100% dos dados do Supabase!")

print("\n=== BACKUP E SINCRONIZAÇÃO CONCLUÍDOS COM SUCESSO! ===")
