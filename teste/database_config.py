"""Configuração da conexão; a senha fica no .env local ou no ambiente."""

import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg2 import ProgrammingError
from psycopg2.extensions import parse_dsn

# O caminho é relativo a este arquivo, independente da pasta do terminal.
# Em hospedagem, DATABASE_URL do ambiente tem precedência sobre o .env.
load_dotenv(Path(__file__).with_name(".env"), override=False)
_database_url = os.getenv("DATABASE_URL")
if not _database_url:
    raise RuntimeError(
        "Configure DATABASE_URL no ambiente ou no arquivo .env do projeto."
    )

# As rotas existentes continuam usando psycopg2.connect(**DB_CONFIG).
# Preserva os parâmetros SSL e channel_binding presentes na URL fornecida.
try:
    DB_CONFIG = parse_dsn(_database_url)
    # Não injeta GUCs em options: o pooler do Neon rejeita parâmetros como
    # statement_timeout no pacote de conexão. Preserva apenas a URL fornecida.
except (ProgrammingError, TypeError):
    raise RuntimeError("DATABASE_URL inválida; confira a configuração local.") from None
# O default via libpq permite que ferramentas/testes informem seu próprio timeout.
os.environ.setdefault("PGCONNECT_TIMEOUT", "15")
