"""Executa testes TEMP com sessão estável, inclusive no Neon."""
from pathlib import Path
import sys
import unittest

# Importa a aplicação a partir da pasta teste/, independentemente do terminal.
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
import faturamento
from check_pooled_database import check_database_reads

# Valida o endpoint configurado (inclusive o pooler), que a suíte TEMP não usa.
check_database_reads()

# A conexão pooled é mantida na aplicação. Só esta execução de testes usa
# o endpoint direto do mesmo banco, pois TEMP precisa sobreviver aos commits.
host = faturamento.DB_CONFIG.get("host", "")
if "-pooler." in host:
    faturamento.DB_CONFIG["host"] = host.replace("-pooler.", ".", 1)
# O teste original informa connect_timeout explicitamente.
faturamento.DB_CONFIG.pop("connect_timeout", None)
suite = unittest.defaultTestLoader.discover(str(root / "tests"), pattern="test_*.py")
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
