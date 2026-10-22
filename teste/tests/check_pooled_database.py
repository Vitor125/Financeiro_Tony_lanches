"""Smoke de leitura no endpoint real, antes de trocar para TEMP nos testes.

Executa somente GETs, sem imprimir valores financeiros. A autenticação é
simulada apenas neste processo de teste, nunca no servidor publicado.
"""

import os
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import faturamento


def check_database_reads():
    today = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    paths = (
        f"/Faturamento/resumo_diario/{today.isoformat()}?lembretes=1",
        f"/Faturamento/{today.year}/{today.month}",
        f"/Faturamento_geral?inicio={today.isoformat()}&fim={today.isoformat()}",
    )
    with (
        patch.dict(
            os.environ,
            {
                "FIREBASE_PROJECT_ID": "financeiro-tony-lanches",
                "ALLOWED_EMAILS": "smoke@example.com",
            },
        ),
        patch(
            "faturamento.verify_firebase_token",
            return_value={"email": "smoke@example.com"},
        ),
        faturamento.app.test_client() as client,
    ):
        for path in paths:
            response = client.get(
                path, headers={"Authorization": "Bearer smoke-test-only"}
            )
            if response.status_code != 200 or not response.is_json:
                raise RuntimeError(
                    f"Leitura no endpoint configurado falhou: {path} HTTP {response.status_code}"
                )
    print("Smoke: três consultas no endpoint configurado passaram, sem gravações.")
