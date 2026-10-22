"""Cálculo Decimal e cliente de uma única requisição de fechamento."""

import os
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import requests

CENTAVO = Decimal("0.01")
LIMITE_MONETARIO = Decimal("99999999.99")  # NUMERIC(10, 2) do banco atual.
PRAZO_LANCAMENTO_DIAS = 7
LIMITE_TAXA = Decimal("1")  # 100%, armazenado como fração.


def validar_data(valor):
    if not isinstance(valor, str):
        raise ValueError("Informe uma data válida no formato AAAA-MM-DD.")
    try:
        data = date.fromisoformat(valor)
        if data.isoformat() != valor:
            raise ValueError
        return data
    except ValueError:
        raise ValueError("Informe uma data válida no formato AAAA-MM-DD.") from None


def hoje_negocio():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def validar_data_fechamento(valor):
    data = validar_data(valor)
    if data > hoje_negocio():
        raise ValueError(
            "Não é permitido registrar datas futuras: escolha hoje ou uma data anterior (horário de São Paulo)."
        )
    return data


def validar_data_diaria(valor):
    data = validar_data_fechamento(valor)
    if data < hoje_negocio() - timedelta(days=PRAZO_LANCAMENTO_DIAS):
        raise ValueError(
            "O prazo de lançamento é de hoje até 7 dias atrás. Para datas anteriores, use Editar e excluir dados."
        )
    return data


def validar_valor(valor, campo):
    if isinstance(valor, bool) or valor is None:
        raise ValueError(f"{campo} precisa ser um número não negativo em reais.")
    try:
        numero = Decimal(str(valor))
        if not numero.is_finite() or numero < 0 or numero > LIMITE_MONETARIO:
            raise ValueError
        if numero != numero.quantize(CENTAVO):
            raise ValueError
        return numero.quantize(CENTAVO)
    except (InvalidOperation, ValueError):
        raise ValueError(
            f"{campo} precisa ter até duas casas decimais e estar entre 0 e 99.999.999,99."
        ) from None


def validar_taxa(valor):
    try:
        taxa = Decimal(str(valor))
        if not taxa.is_finite() or taxa < 0 or taxa > LIMITE_TAXA:
            raise ValueError
        if taxa != taxa.quantize(Decimal("0.000001")):
            raise ValueError
        return taxa
    except (InvalidOperation, ValueError):
        raise ValueError(
            "Informe uma taxa entre 0% e 100%, com até seis casas decimais na fração."
        ) from None


def calcular_valores(bruto, despesas, taxa):
    """Arredonda o imposto uma vez; preserva bruto - imposto - despesas em centavos."""
    bruto = validar_valor(bruto, "Faturamento bruto")
    despesas = validar_valor(despesas, "Despesas")
    try:
        taxa = Decimal(str(taxa))
        if not taxa.is_finite() or taxa < 0:
            raise ValueError
        with localcontext() as ctx:
            ctx.prec = 40
            imposto = (bruto * taxa).quantize(CENTAVO, rounding=ROUND_HALF_UP)
            lucro = bruto - imposto - despesas
        if abs(lucro) > LIMITE_MONETARIO:
            raise ValueError("O lucro calculado excede o limite monetário do banco.")
    except InvalidOperation:
        raise ValueError(
            "A taxa de imposto não permite calcular este fechamento."
        ) from None
    return {
        "faturamento_bruto_diario": bruto,
        "despesas_diarias": despesas,
        "taxa_imposto_atual": taxa,
        "imposto_diario": imposto,
        "faturamento_liquido_diario": lucro,
    }


def calcular_dia(
    dia_mes_ano,
    faturamento_bruto_diario,
    despesas_diarias,
    api_url=None,
    authorization=None,
):
    """Cliente CLI: envia os dois totais juntos; o servidor calcula e salva."""
    data = validar_data_diaria(dia_mes_ano)
    bruto = validar_valor(faturamento_bruto_diario, "Faturamento bruto")
    despesas = validar_valor(despesas_diarias, "Despesas")
    base_url = (api_url or os.getenv("API_URL") or "http://127.0.0.1:5000").rstrip("/")
    parsed_url = urlsplit(base_url)
    if parsed_url.scheme != "https" and parsed_url.hostname not in {
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        raise ValueError("API_URL precisa usar HTTPS fora da máquina local.")
    headers = {"Authorization": authorization} if authorization else {}
    resposta = requests.request(
        "POST",
        f"{base_url}/Faturamento/calcular_dia",
        headers=headers,
        timeout=30,
        json={
            "dia_mes_ano": data.isoformat(),
            "faturamento_bruto_diario": str(bruto),
            "despesas_diarias": str(despesas),
        },
    )
    resposta.raise_for_status()
    return resposta.json()


if __name__ == "__main__":
    data_consulta = input("Data para calcular (AAAA-MM-DD): ").strip()
    faturamento_bruto = input("Faturamento bruto do dia: ").strip()
    despesas = input("Despesas do dia: ").strip()
    token = os.getenv("FIREBASE_ID_TOKEN")
    resultado = calcular_dia(
        data_consulta,
        faturamento_bruto,
        despesas,
        authorization=f"Bearer {token}" if token else None,
    )
    for campo, valor in resultado.items():
        print(f"{campo}: {valor}")
