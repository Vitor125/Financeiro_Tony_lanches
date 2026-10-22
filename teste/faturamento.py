import os
from contextlib import closing
from datetime import date
from decimal import Decimal, InvalidOperation

import psycopg2
from autenticacao import AuthProviderUnavailable, verify_firebase_token
from calculo import (
    calcular_valores,
    hoje_negocio,
    validar_data,
    validar_data_diaria,
    validar_data_fechamento,
    validar_taxa,
    validar_valor,
)
from database_config import DB_CONFIG
from firebase_admin import auth as firebase_auth
from firebase_admin.exceptions import FirebaseError
from flask import Flask, g, jsonify, request
from google.auth.exceptions import GoogleAuthError
from lembretes import DEFAULT_CONFIG
from lembretes import bp as lembretes_bp
from psycopg2 import sql
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
app.register_blueprint(lembretes_bp)
LOCK_FATURAMENTO = 20261003


def _dados_recebidos():
    dados = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    if not isinstance(dados, dict):
        raise ValueError("Envie um objeto JSON ou formulário válido.")
    return dados


def _data_bloqueada_por_folga(cur, data):
    """Verifica a folga semanal e sua exceção temporária dentro da transação."""
    cur.execute(
        "SELECT dia_semana, dia_excecao, tipo_excecao "
        "FROM configuracao_dia_folga WHERE id = 1 FOR SHARE"
    )
    configuracao = cur.fetchone()
    if configuracao is None:
        raise RuntimeError("A configuração de dia de folga não foi inicializada.")
    dia_semana, dia_excecao, tipo_excecao = configuracao
    if dia_excecao == data:
        return True
    if (
        tipo_excecao == "substituir"
        and dia_excecao is not None
        and dia_semana == data.isoweekday()
        and dia_excecao.isocalendar()[:2] == data.isocalendar()[:2]
    ):
        return False
    return dia_semana == data.isoweekday()


def _limites_mes(ano, mes):
    try:
        inicio = date(ano, mes, 1)
        fim = date(ano + (mes == 12), 1 if mes == 12 else mes + 1, 1)
        return inicio, fim
    except ValueError:
        raise ValueError("Informe um ano e mês válidos.") from None


def _resposta_mensal(ano, mes, campo, nome_resposta):
    # Campo escolhido exclusivamente pelo código; nunca por dados da requisição.
    try:
        inicio, fim = _limites_mes(ano, mes)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        sql.SQL(
                            "SELECT COALESCE(SUM({}), 0) FROM faturamento "
                            "WHERE dia_mes_ano >= %s AND dia_mes_ano < %s"
                        ).format(sql.Identifier(campo)),
                        (inicio, fim),
                    )
                    total = cur.fetchone()[0]
        return jsonify({"ano": ano, "mes": mes, nome_resposta: total})
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao consultar total mensal.")
        return jsonify({"erro": "Não foi possível consultar o mês."}), 500


def _salvar_campo_diario(campo, mensagem):
    # Compatibilidade com os POSTs avulsos: não recalcula outros campos diários.
    try:
        dados = _dados_recebidos()
        data = validar_data_diaria(dados.get("dia_mes_ano"))
        valor = dados.get(campo)
        if campo == "faturamento_liquido_diario":
            if isinstance(valor, bool) or valor is None:
                raise ValueError("Informe um lucro válido em reais.")
            try:
                numero = Decimal(str(valor))
                sinal = -1 if numero.is_signed() else 1
                valor = validar_valor(abs(numero), "Lucro") * sinal
            except InvalidOperation:
                raise ValueError("Informe um lucro válido em reais.") from None
        else:
            valor = validar_valor(valor, campo)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT pg_advisory_xact_lock(%s, %s)",
                        (LOCK_FATURAMENTO, data.year),
                    )
                    if _data_bloqueada_por_folga(cur, data):
                        return jsonify({"erro": "Esta data está definida como dia de folga. Não são permitidos lançamentos."}), 409
                    cur.execute(
                        "SELECT 1 FROM faturamento WHERE dia_mes_ano = %s", (data,)
                    )
                    if cur.fetchone() is None:
                        return jsonify({"erro": "Data não encontrada."}), 404
                    return jsonify(
                        {
                            "erro": "Esta data já foi registrada. Use Editar e excluir dados para alterar valores."
                        }
                    ), 409
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao salvar campo diário e agregados.")
        return jsonify(
            {"erro": "Não foi possível salvar. A transação foi revertida."}
        ), 500


@app.before_request
def require_authorized_firebase_user():
    if request.endpoint in {"healthz", "static"}:
        return None
    # Esta rota valida exclusivamente o ID token Google do service account do Scheduler.
    if request.endpoint == "lembretes.enviar_agendado":
        return None

    allowed_origins = {
        origin.strip().rstrip("/")
        for origin in os.getenv("FRONTEND_ORIGINS", "").split()
        if origin.strip()
    }
    if request.method == "OPTIONS":
        if request.headers.get("Origin", "").rstrip("/") not in allowed_origins:
            return jsonify({"erro": "Origem não autorizada."}), 403
        return "", 204

    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    allowed_emails = {
        email.strip().lower()
        for email in os.getenv("ALLOWED_EMAILS", "").split(",")
        if email.strip()
    }
    if not project_id or not allowed_emails:
        app.logger.error(
            "FIREBASE_PROJECT_ID e ALLOWED_EMAILS precisam estar configurados."
        )
        return jsonify({"erro": "Autenticação do servidor não está configurada."}), 503

    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return jsonify({"erro": "Faça login para acessar os dados."}), 401

    try:
        user = verify_firebase_token(token.strip())
    except (
        AuthProviderUnavailable,
        GoogleAuthError,
        firebase_auth.CertificateFetchError,
    ):
        app.logger.exception("Não foi possível validar o token Firebase.")
        return jsonify({"erro": "Não foi possível validar o acesso."}), 503
    except (
        firebase_auth.InvalidIdTokenError,
        firebase_auth.UserDisabledError,
        firebase_auth.UserNotFoundError,
        ValueError,
    ):
        return jsonify({"erro": "Token de acesso inválido ou expirado."}), 401
    except FirebaseError:
        app.logger.exception("O Firebase Authentication não respondeu corretamente.")
        return jsonify({"erro": "Não foi possível validar o acesso."}), 503

    email = user.get("email")
    if not isinstance(email, str) or email.strip().lower() not in allowed_emails:
        return jsonify({"erro": "Esta conta não está autorizada."}), 403

    g.authenticated_email = email.strip().lower()
    return None


@app.after_request
def prevent_financial_response_caching(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    origin = request.headers.get("Origin", "").rstrip("/")
    allowed_origins = {
        configured_origin.strip().rstrip("/")
        for configured_origin in os.getenv("FRONTEND_ORIGINS", "").split()
        if configured_origin.strip()
    }
    if origin and origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, DELETE, OPTIONS"
        )
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        response.headers["Access-Control-Max-Age"] = "600"
        response.vary.add("Origin")
    return response


@app.errorhandler(413)
def corpo_muito_grande(_error):
    return jsonify({"erro": "A solicitação excede o limite de 16 KB."}), 413


@app.get("/health")
@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"}), 200


@app.get("/auth/me")
def get_authenticated_user():
    return jsonify({"email": g.authenticated_email}), 200


# =========================================================
# TAXA IMPOSTO ATUAL
# =========================================================


@app.get("/Faturamento/taxa_imposto_atual")
def get_taxa_imposto_atual():

    try:
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT taxa_imposto_atual
                        FROM configuracao_imposto
                        WHERE id = 1
                        """
                    )
                    resultado = cur.fetchone()

        return jsonify({"taxa_imposto_atual": resultado[0] if resultado else None}), 200

    except psycopg2.Error:
        app.logger.exception("Falha ao consultar taxa de imposto.")
        return jsonify({"erro": "N?o foi poss?vel consultar a taxa de imposto."}), 500


@app.post("/Faturamento/taxa_imposto_atual")
def post_taxa_imposto_atual():

    if request.is_json:
        dados = request.get_json(silent=True)
        if not isinstance(dados, dict):
            return jsonify({"erro": "Envie um objeto JSON válido."}), 400
    else:
        dados = request.form.to_dict()

    valor = dados.get("taxa_imposto_atual")

    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return jsonify(
            {
                "mensagem": "Nenhuma nova taxa informada. Nada foi alterado.",
                "alterado": False,
            }
        ), 200

    try:
        nova_taxa = validar_taxa(valor)
    except (InvalidOperation, ValueError):
        return jsonify(
            {"erro": "A taxa de imposto precisa ser um número finito não negativo."}
        ), 400

    try:
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO configuracao_imposto (id, taxa_imposto_atual)
                        VALUES (1, %s)
                        ON CONFLICT (id) DO UPDATE
                        SET taxa_imposto_atual = EXCLUDED.taxa_imposto_atual
                        WHERE configuracao_imposto.taxa_imposto_atual
                            IS DISTINCT FROM EXCLUDED.taxa_imposto_atual
                        RETURNING taxa_imposto_atual
                        """,
                        (nova_taxa,),
                    )
                    resultado = cur.fetchone()

        alterado = resultado is not None
        return jsonify(
            {
                "mensagem": (
                    "Taxa de imposto salva com sucesso."
                    if alterado
                    else "A taxa informada já é a atual. Nada foi alterado."
                ),
                "taxa_imposto_atual": resultado[0] if alterado else nova_taxa,
                "alterado": alterado,
            }
        ), 200

    except psycopg2.Error:
        app.logger.exception("Falha ao salvar taxa de imposto.")
        return jsonify({"erro": "N?o foi poss?vel salvar a taxa de imposto."}), 500


@app.get("/Faturamento/dia_folga")
def get_dia_folga():
    try:
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT dia_semana, dia_excecao, tipo_excecao "
                    "FROM configuracao_dia_folga WHERE id = 1"
                )
                resultado = cur.fetchone()
        if resultado is None:
            return jsonify({"erro": "A configuração de dia de folga não foi inicializada."}), 500
        return jsonify({
            "dia_semana": resultado[0],
            "dia_excecao": resultado[1].isoformat() if resultado[1] else None,
            "tipo_excecao": resultado[2],
        }), 200
    except psycopg2.Error:
        app.logger.exception("Falha ao consultar dia de folga.")
        return jsonify({"erro": "Não foi possível consultar o dia de folga."}), 500


@app.post("/Faturamento/dia_folga")
def post_dia_folga():
    try:
        dados = _dados_recebidos()
        dia_semana = dados.get("dia_semana")
        if isinstance(dia_semana, bool) or not isinstance(dia_semana, int) or not 1 <= dia_semana <= 7:
            raise ValueError("Escolha um dia da semana válido.")
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE configuracao_dia_folga SET dia_semana = %s "
                        "WHERE id = 1 RETURNING dia_semana",
                        (dia_semana,),
                    )
                    salvo = cur.fetchone()
        if salvo is None:
            return jsonify({"erro": "A configuração de dia de folga não foi inicializada."}), 500
        return jsonify({"dia_semana": salvo[0]}), 200
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao salvar o dia fixo de folga.")
        return jsonify({"erro": "Não foi possível salvar o dia fixo de folga."}), 500


@app.post("/Faturamento/dia_folga/excecao")
def post_excecao_dia_folga():
    try:
        dados = _dados_recebidos()
        data = validar_data(dados.get("dia_excecao"))
        tipo = dados.get("tipo_excecao")
        if tipo not in ("adicional", "substituir"):
            raise ValueError("Escolha como a exceção deve alterar a folga fixa.")
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE configuracao_dia_folga "
                        "SET dia_excecao = %s, tipo_excecao = %s "
                        "WHERE id = 1 RETURNING dia_excecao, tipo_excecao",
                        (data, tipo),
                    )
                    salvo = cur.fetchone()
        if salvo is None:
            return jsonify({"erro": "A configuração de dia de folga não foi inicializada."}), 500
        return jsonify({"dia_excecao": salvo[0].isoformat(), "tipo_excecao": salvo[1]}), 200
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao salvar a exceção temporária de folga.")
        return jsonify({"erro": "Não foi possível salvar a exceção temporária."}), 500


@app.delete("/Faturamento/dia_folga/excecao")
def delete_excecao_dia_folga():
    try:
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE configuracao_dia_folga "
                        "SET dia_excecao = NULL, tipo_excecao = NULL "
                        "WHERE id = 1"
                    )
        return jsonify({"dia_excecao": None, "tipo_excecao": None}), 200
    except psycopg2.Error:
        app.logger.exception("Falha ao remover a exceção temporária de folga.")
        return jsonify({"erro": "Não foi possível remover a exceção temporária."}), 500


# =========================================================
# SALVAR DATA
# =========================================================


@app.post("/Faturamento/salvar_data")
def post_salvar_data():
    try:
        dados = _dados_recebidos()
        data = validar_data_diaria(dados.get("dia_mes_ano"))
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT pg_advisory_xact_lock(%s, %s)",
                        (LOCK_FATURAMENTO, data.year),
                    )
                    if _data_bloqueada_por_folga(cur, data):
                        return jsonify({"erro": "Esta data está definida como dia de folga. Não são permitidos lançamentos."}), 409
                    cur.execute(
                        "INSERT INTO faturamento (dia_mes_ano) VALUES (%s) "
                        "ON CONFLICT (dia_mes_ano) DO NOTHING RETURNING dia_mes_ano",
                        (data,),
                    )
                    criado = cur.fetchone() is not None
        return jsonify(
            {"mensagem": "Data salva com sucesso." if criado else "Data já cadastrada."}
        ), 201 if criado else 200
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao cadastrar data.")
        return jsonify({"erro": "Não foi possível cadastrar a data."}), 500


# =========================================================
# FATURAMENTO BRUTO DIÁRIO
# =========================================================


@app.get("/Faturamento/bruto_diario/<data>")
def get_faturamento_bruto_diario(data):

    try:
        data_consulta = date.fromisoformat(data)
        if data_consulta.isoformat() != data:
            raise ValueError
    except ValueError:
        return jsonify({"erro": "Informe uma data válida no formato AAAA-MM-DD."}), 400

    try:
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT faturamento_bruto_diario
                        FROM faturamento
                        WHERE dia_mes_ano = %s
                        """,
                        (data_consulta,),
                    )
                    resultado = cur.fetchone()

        if resultado is None:
            return jsonify({"erro": "Data não encontrada."}), 404

        return jsonify(
            {
                "dia_mes_ano": data_consulta.isoformat(),
                "faturamento_bruto_diario": resultado[0],
            }
        ), 200

    except psycopg2.Error:
        app.logger.exception("Falha ao consultar bruto diário.")
        return jsonify({"erro": "Não foi possível consultar o faturamento bruto."}), 500


@app.post("/Faturamento/bruto_diario")
def post_faturamento_bruto_diario():
    return _salvar_campo_diario(
        "faturamento_bruto_diario", "Faturamento bruto diário salvo com sucesso."
    )


def _atualizar_totais_periodo(data_str, conn):
    try:
        data = date.fromisoformat(data_str)
    except ValueError:
        return

    with conn.cursor() as cur:
        # Uma agregação e um UPDATE; os intervalos aproveitam o índice de data.
        cur.execute(
            """
            WITH limites AS (
                SELECT date_trunc('year', %s::date)::date AS ano_inicio,
                    (date_trunc('year', %s::date) + interval '1 year')::date AS ano_fim,
                    date_trunc('month', %s::date)::date AS mes_inicio,
                    (date_trunc('month', %s::date) + interval '1 month')::date AS mes_fim
            ), totais AS (
                SELECT COALESCE(SUM(f.faturamento_bruto_diario), 0) AS bruto_anual,
                    COALESCE(SUM(f.faturamento_liquido_diario), 0) AS liquido_anual,
                    COALESCE(SUM(f.faturamento_bruto_diario) FILTER (
                        WHERE f.dia_mes_ano >= l.mes_inicio AND f.dia_mes_ano < l.mes_fim), 0) AS bruto_mensal,
                    COALESCE(SUM(f.faturamento_liquido_diario) FILTER (
                        WHERE f.dia_mes_ano >= l.mes_inicio AND f.dia_mes_ano < l.mes_fim), 0) AS liquido_mensal,
                    COALESCE(SUM(f.despesas_diarias) FILTER (
                        WHERE f.dia_mes_ano >= l.mes_inicio AND f.dia_mes_ano < l.mes_fim), 0) AS despesas_mensais
                FROM faturamento f CROSS JOIN limites l
                WHERE f.dia_mes_ano >= l.ano_inicio AND f.dia_mes_ano < l.ano_fim
            )
            UPDATE faturamento f SET
                faturamento_bruto_anual = t.bruto_anual,
                faturamento_liquido_anual = t.liquido_anual,
                faturamento_bruto_mensal = CASE
                    WHEN f.dia_mes_ano >= l.mes_inicio AND f.dia_mes_ano < l.mes_fim
                    THEN t.bruto_mensal ELSE f.faturamento_bruto_mensal END,
                faturamento_liquido_mensal = CASE
                    WHEN f.dia_mes_ano >= l.mes_inicio AND f.dia_mes_ano < l.mes_fim
                    THEN t.liquido_mensal ELSE f.faturamento_liquido_mensal END,
                despesas_mensais = CASE
                    WHEN f.dia_mes_ano >= l.mes_inicio AND f.dia_mes_ano < l.mes_fim
                    THEN t.despesas_mensais ELSE f.despesas_mensais END
            FROM totais t CROSS JOIN limites l
            WHERE f.dia_mes_ano >= l.ano_inicio AND f.dia_mes_ano < l.ano_fim
        """,
            (data, data, data, data),
        )


# =========================================================
# FATURAMENTO BRUTO MENSAL
# =========================================================


@app.get("/Faturamento/bruto/<int:ano>/<int:mes>")
def get_faturamento_bruto_mensal(ano, mes):
    return _resposta_mensal(
        ano, mes, "faturamento_bruto_diario", "faturamento_bruto_mensal"
    )


# =========================================================
# FATURAMENTO LÍQUIDO DIÁRIO
# =========================================================


@app.post("/Faturamento/liquido_diario")
def post_faturamento_liquido_diario():
    return _salvar_campo_diario(
        "faturamento_liquido_diario", "Faturamento líquido diário salvo com sucesso."
    )


# =========================================================
# FATURAMENTO LÍQUIDO MENSAL
# =========================================================


@app.get("/Faturamento/liquido_mensal/<int:ano>/<int:mes>")
def get_faturamento_liquido_mensal(ano, mes):
    return _resposta_mensal(
        ano, mes, "faturamento_liquido_diario", "faturamento_liquido_mensal"
    )


# =========================================================
# DESPESAS DIÁRIAS
# =========================================================


@app.post("/Faturamento/despesas_diarias")
def post_despesas_diarias():
    return _salvar_campo_diario(
        "despesas_diarias", "Despesas diárias salvas com sucesso."
    )


# =========================================================
# DESPESAS MENSAIS
# =========================================================


@app.get("/Faturamento/despesas_diarias/<int:ano>/<int:mes>")
def get_despesas_mensais(ano, mes):
    return _resposta_mensal(ano, mes, "despesas_diarias", "despesas_mensais")


@app.get("/Faturamento/despesasdiarias/<int:dia>/<int:ano>/<int:mes>")
def get_despesas_diarias(dia, mes, ano):
    try:
        data = date(ano, mes, dia)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT despesas_diarias FROM faturamento WHERE dia_mes_ano = %s",
                        (data,),
                    )
                    registro = cur.fetchone()
        if registro is None:
            return jsonify({"erro": "Data não encontrada."}), 404
        # Preserva a chave antiga e acrescenta o nome correto.
        return jsonify(
            {
                "dia": dia,
                "mes": mes,
                "ano": ano,
                "despesas_mensais": registro[0],
                "despesas_diarias": registro[0],
            }
        )
    except ValueError:
        return jsonify({"erro": "Informe uma data válida."}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao consultar despesas diárias.")
        return jsonify({"erro": "Não foi possível consultar as despesas."}), 500


# =========================================================
# CONSULTA COMPLETA DE UM DIA
# =========================================================


@app.get("/Faturamento/dia_mes_ano/<data>")
def get_faturamento_dia(data):
    try:
        data_consulta = validar_data(data)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT dia_mes_ano, faturamento_bruto_diario, "
                        "faturamento_liquido_diario, despesas_diarias "
                        "FROM faturamento WHERE dia_mes_ano = %s",
                        (data_consulta,),
                    )
                    resultado = cur.fetchone()
        if resultado is None:
            return jsonify(
                {"erro": "Nenhum faturamento encontrado para essa data."}
            ), 404
        return jsonify(resultado)
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao consultar dia.")
        return jsonify({"erro": "Não foi possível consultar o fechamento."}), 500


@app.post("/Faturamento/calcular_dia")
@app.post("/Faturamento/fechamento_diario")
def post_calcular_dia():
    return _gravar_fechamento()


def _conferir_registro(cur, data, dados):
    """Compara os valores consultados para não sobrescrever mudanças de outra sessão."""
    original = dados.get("original")
    campos = (
        "faturamento_bruto_diario",
        "despesas_diarias",
        "faturamento_liquido_diario",
    )
    if not isinstance(original, dict) or any(campo not in original for campo in campos):
        raise ValueError("Consulte o registro antes de alterá-lo ou excluí-lo.")
    valores = []
    for campo in campos:
        valor = original[campo]
        if valor is None:
            valores.append(None)
        elif campo == "faturamento_liquido_diario":
            try:
                numero = Decimal(str(valor))
                valores.append(
                    validar_valor(abs(numero), "Lucro")
                    * (-1 if numero.is_signed() else 1)
                )
            except InvalidOperation:
                raise ValueError("Informe um lucro original válido.") from None
        else:
            valores.append(validar_valor(valor, campo))
    cur.execute(
        "SELECT faturamento_bruto_diario, despesas_diarias, "
        "faturamento_liquido_diario FROM faturamento WHERE dia_mes_ano = %s FOR UPDATE",
        (data,),
    )
    atual = cur.fetchone()
    if atual is None:
        return jsonify(
            {"erro": "Este registro não existe mais. Consulte novamente."}
        ), 404
    if tuple(valores) != tuple(atual):
        return jsonify(
            {
                "erro": "Este registro foi alterado. Consulte novamente antes de continuar."
            }
        ), 409
    return None


@app.put("/Faturamento/registro/<data>")
def editar_registro(data):
    return _gravar_fechamento(data)


@app.post("/Faturamento/registro/<data>")
def adicionar_registro(data):
    return _gravar_fechamento(data, criar=True)


@app.delete("/Faturamento/registro/<data>")
def excluir_registro(data):
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return jsonify({"erro": "Envie os valores originais do registro."}), 400
    try:
        # Permite limpar também registros futuros criados antes do bloqueio.
        data = validar_data(data)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT pg_advisory_xact_lock(%s, %s)",
                        (LOCK_FATURAMENTO, data.year),
                    )
                    erro = _conferir_registro(cur, data, dados)
                    if erro is not None:
                        return erro
                    cur.execute(
                        "DELETE FROM faturamento WHERE dia_mes_ano = %s", (data,)
                    )
                _atualizar_totais_periodo(data.isoformat(), conn)
        return jsonify({"dia_mes_ano": data.isoformat(), "excluido": True}), 200
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao excluir fechamento.")
        return jsonify({"erro": "Não foi possível excluir o registro."}), 500


def _persistir_fechamento(cur, data, bruto, despesas, lucro, editar):
    """Cria??o nunca sobrescreve; edi??o muda apenas valores efetivamente distintos."""
    if editar:
        cur.execute(
            """
            UPDATE faturamento SET faturamento_bruto_diario = %s,
                despesas_diarias = %s, faturamento_liquido_diario = %s
            WHERE dia_mes_ano = %s AND
                (faturamento_bruto_diario, despesas_diarias, faturamento_liquido_diario)
                    IS DISTINCT FROM (%s, %s, %s)
            RETURNING dia_mes_ano, faturamento_bruto_diario, despesas_diarias,
                faturamento_liquido_diario
        """,
            (bruto, despesas, lucro, data, bruto, despesas, lucro),
        )
    else:
        cur.execute(
            """
            INSERT INTO faturamento (dia_mes_ano, faturamento_bruto_diario,
                despesas_diarias, faturamento_liquido_diario)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (dia_mes_ano) DO NOTHING
            RETURNING dia_mes_ano, faturamento_bruto_diario, despesas_diarias,
                faturamento_liquido_diario
        """,
            (data, bruto, despesas, lucro),
        )
    return cur.fetchone()


def _gravar_fechamento(data_edicao=None, criar=False):
    """POST/PUT compartilham cálculo, conexão e transação do fechamento."""
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return jsonify(
            {"erro": "Envie um objeto JSON com data, faturamento bruto e despesas."}
        ), 400
    try:
        origem = validar_data(data_edicao) if data_edicao else None
        data = (
            validar_data_fechamento(dados.get("nova_data", data_edicao))
            if data_edicao
            else validar_data_diaria(dados.get("dia_mes_ano"))
        )
        if criar and data != origem:
            raise ValueError(
                "Para adicionar um registro, consulte primeiro a data desejada."
            )
        bruto = validar_valor(
            dados.get("faturamento_bruto_diario"), "Faturamento bruto"
        )
        despesas = validar_valor(dados.get("despesas_diarias"), "Despesas")
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    # Os totais anuais são compartilhados: serializa os fechamentos do mesmo ano.
                    # Lock transacional, inclusive entre instâncias diferentes do servidor.
                    # Ordem fixa também quando o registro muda de ano: evita deadlocks.
                    for ano in sorted(
                        {data.year, origem.year if origem else data.year}
                    ):
                        cur.execute(
                            "SELECT pg_advisory_xact_lock(%s, %s)",
                            (LOCK_FATURAMENTO, ano),
                        )
                    if _data_bloqueada_por_folga(cur, data):
                        return jsonify({"erro": "Esta data está definida como dia de folga. Não são permitidos lançamentos."}), 409
                    if data_edicao is None:
                        cur.execute(
                            "SELECT 1 FROM faturamento WHERE dia_mes_ano = %s", (data,)
                        )
                        if cur.fetchone() is not None:
                            return jsonify(
                                {
                                    "erro": "Esta data já foi registrada. Para alterar ou recalcular, use Editar e excluir dados."
                                }
                            ), 409
                    if data_edicao is not None:
                        if criar:
                            if "original" not in dados or dados["original"] is not None:
                                raise ValueError(
                                    "Consulte a data sem registro antes de adicionar."
                                )
                            cur.execute(
                                "SELECT 1 FROM faturamento WHERE dia_mes_ano = %s",
                                (data,),
                            )
                            if cur.fetchone() is not None:
                                return jsonify(
                                    {
                                        "erro": "Esta data já possui registro. Consulte novamente."
                                    }
                                ), 409
                        else:
                            erro = _conferir_registro(cur, origem, dados)
                            if erro is not None:
                                return erro
                            if origem != data:
                                cur.execute(
                                    "SELECT 1 FROM faturamento WHERE dia_mes_ano = %s",
                                    (data,),
                                )
                                if cur.fetchone() is not None:
                                    return jsonify(
                                        {
                                            "erro": "A nova data já possui registro. Escolha uma data livre."
                                        }
                                    ), 409
                                cur.execute(
                                    "UPDATE faturamento SET dia_mes_ano = %s WHERE dia_mes_ano = %s",
                                    (data, origem),
                                )
                    cur.execute(
                        "SELECT taxa_imposto_atual FROM configuracao_imposto WHERE id = 1 FOR SHARE"
                    )
                    registro = cur.fetchone()
                    if registro is None:
                        raise ValueError(
                            "Cadastre a taxa de imposto antes de salvar o dia."
                        )
                    resultado = calcular_valores(bruto, despesas, registro[0])
                    salvo = _persistir_fechamento(
                        cur,
                        data,
                        bruto,
                        despesas,
                        resultado["faturamento_liquido_diario"],
                        editar=data_edicao is not None and not criar,
                    )
                    if salvo is None and (data_edicao is None or criar):
                        return jsonify(
                            {"erro": "Esta data j? foi registrada. Consulte novamente."}
                        ), 409
                    if salvo is not None:
                        resultado.update(
                            zip(
                                (
                                    "dia_mes_ano",
                                    "faturamento_bruto_diario",
                                    "despesas_diarias",
                                    "faturamento_liquido_diario",
                                ),
                                salvo,
                            )
                        )
                    resultado["dia_mes_ano"] = data.isoformat()
                if salvo is not None or (origem is not None and origem != data):
                    _atualizar_totais_periodo(data.isoformat(), conn)
                    if origem is not None and origem.strftime("%Y-%m") != data.strftime(
                        "%Y-%m"
                    ):
                        _atualizar_totais_periodo(origem.isoformat(), conn)
        resultado["mensagem"] = "Fechamento salvo com sucesso."
        return jsonify(resultado), 200
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha na transação do fechamento diário.")
        return jsonify(
            {
                "erro": "Não foi possível salvar o fechamento. Nenhuma alteração desta transação foi confirmada."
            }
        ), 500


@app.get("/Faturamento/resumo_diario/<data>")
def get_resumo_diario(data):
    """Retorna os totais do dia e a taxa global atual na mesma consulta."""
    try:
        data_consulta = validar_data(data)
        incluir_lembretes = request.args.get("lembretes")
        if incluir_lembretes not in (None, "1"):
            raise ValueError("Parâmetro de lembretes inválido.")
        hoje = hoje_negocio()
        coluna_lembretes = ""
        parametros = [data_consulta]
        if incluir_lembretes:
            # No máximo sete datas, aproveitando a conexão e a consulta do dia.
            # Valores zero são válidos; registros parciais continuam pendentes.
            coluna_lembretes = """,
                (SELECT COALESCE(jsonb_agg(to_char(d.dia, 'YYYY-MM-DD') ORDER BY d.dia), '[]'::jsonb)
                 FROM generate_series(%s::date - 7, %s::date - 1, interval '1 day') AS d(dia)
                 WHERE NOT EXISTS (
                     SELECT 1 FROM faturamento r WHERE r.dia_mes_ano = d.dia::date
                     AND r.faturamento_bruto_diario IS NOT NULL
                     AND r.despesas_diarias IS NOT NULL
                     AND r.faturamento_liquido_diario IS NOT NULL
                 )) AS dias_pendentes
                , (SELECT jsonb_build_object('ativo', c.ativo, 'dias', c.dias, 'semana', c.semana)
                   FROM lembretes_config c WHERE c.email = %s) AS config_lembretes
            """
            parametros.extend([hoje, hoje, g.authenticated_email])
        parametros.append(data_consulta)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT %s::date AS dia_mes_ano,
                            f.dia_mes_ano IS NOT NULL AS existe,
                            f.faturamento_bruto_diario, f.despesas_diarias,
                            f.faturamento_liquido_diario,
                            (SELECT taxa_imposto_atual FROM configuracao_imposto WHERE id = 1)
                                AS taxa_imposto_atual
                        """
                        + coluna_lembretes
                        + """
                        FROM (SELECT 1) AS base
                        LEFT JOIN faturamento f ON f.dia_mes_ano = %s
                    """,
                        parametros,
                    )
                    resultado = dict(cur.fetchone())
        resultado["dia_mes_ano"] = data_consulta.isoformat()
        if incluir_lembretes:
            resultado["lembretes"] = {
                "hoje": hoje.isoformat(),
                "pendentes": resultado.pop("dias_pendentes"),
                "config": resultado.pop("config_lembretes") or DEFAULT_CONFIG,
                "chave_publica": os.getenv("VAPID_PUBLIC_KEY", ""),
            }
        return jsonify(resultado), 200
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao consultar resumo diário.")
        return jsonify({"erro": "Não foi possível consultar o fechamento."}), 500


# =========================================================
# CONSULTA COMPLETA DE UM MÊS
# =========================================================


@app.get("/Faturamento/<int:ano>/<int:mes>")
def get_faturamento_mensal(ano, mes):
    try:
        inicio, fim = _limites_mes(ano, mes)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT SUM(faturamento_bruto_diario), "
                        "SUM(faturamento_liquido_diario), SUM(despesas_diarias) "
                        "FROM faturamento WHERE dia_mes_ano >= %s AND dia_mes_ano < %s",
                        (inicio, fim),
                    )
                    resultado = cur.fetchone()
        return jsonify(
            {
                "ano": ano,
                "mes": mes,
                "faturamento_bruto": resultado[0],
                "faturamento_liquido": resultado[1],
                "despesas": resultado[2],
            }
        )
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao consultar resumo mensal.")
        return jsonify({"erro": "Não foi possível consultar o mês."}), 500


# =========================================================
# LISTAR TODOS OS FATURAMENTOS
# =========================================================


@app.get("/Faturamento_geral")
def get_faturamento_geral():
    # Sem parâmetros, preserva a listagem antiga. Com intervalo, filtra no banco.
    inicio = request.args.get("inicio")
    fim = request.args.get("fim")
    try:
        parametros = ()
        filtro = ""
        if inicio is not None or fim is not None:
            inicio, fim = validar_data(inicio), validar_data(fim)
            if inicio > fim:
                raise ValueError("A data final deve ser igual ou posterior à inicial.")
            filtro = "WHERE dia_mes_ano BETWEEN %s AND %s"
            parametros = (inicio, fim)
        with closing(psycopg2.connect(**DB_CONFIG)) as conn:
            with conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT dia_mes_ano, faturamento_bruto_diario,
                            faturamento_liquido_diario, despesas_diarias
                        FROM faturamento
                    """
                        + filtro
                        + " ORDER BY dia_mes_ano",
                        parametros,
                    )
                    dados = cur.fetchall()
        return jsonify(dados)
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 400
    except psycopg2.Error:
        app.logger.exception("Falha ao consultar faturamentos.")
        return jsonify({"erro": "Falha ao consultar faturamentos."}), 500


# =========================================================
# INICIAR API
# =========================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
