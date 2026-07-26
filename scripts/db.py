"""
Conexão com o Supabase + funções básicas de ver/criar/editar.

Usa a service_role key: ignora as regras de RLS (papel/motorista), então
este script enxerga e edita tudo, como um admin. Por isso o .env nunca
pode ser compartilhado nem subir pro GitHub (veja .gitignore).
"""
import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

URL = os.environ.get("SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# normaliza a URL: aceita colada com barra final ou com /rest/v1 (tela nova do Supabase)
URL = URL.strip().rstrip("/")
for sufixo in ("/rest/v1", "/auth/v1", "/storage/v1"):
    if URL.endswith(sufixo):
        URL = URL[: -len(sufixo)]

if not URL or not KEY or "SEU-PROJETO" in URL:
    sys.exit(
        "Faltou configurar o .env nesta pasta.\n"
        "1) Copie .env.example para .env\n"
        "2) Preencha SUPABASE_URL e SUPABASE_SERVICE_KEY (Supabase > Project Settings > API)"
    )

if KEY.startswith("sb_publishable_"):
    sys.exit(
        "SUPABASE_SERVICE_KEY está com a chave PÚBLICA (publishable), não a SECRETA.\n"
        "A pública respeita as regras de acesso por papel — o painel veria tudo vazio.\n"
        "Volte em Project Settings > API e copie a chave 'secret' (sb_secret_..., "
        "clique em 'Reveal'), não a 'publishable'."
    )

supabase: Client = create_client(URL, KEY)

# tabelas que o painel sabe listar/criar/editar (mesmas do schema.sql)
TABELAS = [
    "motoristas", "veiculos", "abastecimentos", "manutencoes", "metricas_config",
    "roteiro", "fretes", "checklists", "contas_fixas", "contas_pagar",
    "saldos_banco", "vales", "folha_semanal",
]

# nessas tabelas a chave primária não se chama "id"
CHAVE_PRIMARIA = {"veiculos": "placa"}


def chave_de(tabela: str) -> str:
    return CHAVE_PRIMARIA.get(tabela, "id")


def listar(tabela: str, limite: int = 20):
    r = supabase.table(tabela).select("*").order(chave_de(tabela), desc=True).limit(limite).execute()
    return r.data


def inserir(tabela: str, dados: dict):
    r = supabase.table(tabela).insert(dados).execute()
    return r.data


def atualizar(tabela: str, valor_chave: str, dados: dict):
    r = supabase.table(tabela).update(dados).eq(chave_de(tabela), valor_chave).execute()
    return r.data
