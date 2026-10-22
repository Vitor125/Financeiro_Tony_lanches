"""Preferências por conta e Web Push diário, sem polling ou valores financeiros."""

import base64
import json
import os
from contextlib import closing
from datetime import timedelta
from urllib.parse import urlsplit
from uuid import uuid4

import psycopg2
from calculo import hoje_negocio
from database_config import DB_CONFIG
from flask import Blueprint, current_app, g, jsonify, request
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from psycopg2.extras import RealDictCursor
from requests import RequestException, Session

bp = Blueprint("lembretes", __name__)
DEFAULT_CONFIG = {"ativo": True, "dias": 1, "semana": list(range(1, 8))}
PUSH_HOSTS = {
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
}


def validar_config(data):
    if not isinstance(data, dict) or type(data.get("ativo")) is not bool:
        raise ValueError("Informe se os lembretes estão ativos.")
    dias, semana = data.get("dias"), data.get("semana")
    if type(dias) is not int or not 1 <= dias <= 7:
        raise ValueError("Escolha de ontem até os últimos sete dias.")
    if (
        not isinstance(semana, list)
        or not 1 <= len(semana) <= 7
        or any(type(d) is not int or not 1 <= d <= 7 for d in semana)
    ):
        raise ValueError("Escolha pelo menos um dia da semana.")
    return {"ativo": data["ativo"], "dias": dias, "semana": sorted(set(semana))}


def validar_subscription(data):
    if not isinstance(data, dict):
        raise ValueError("Inscrição de notificação inválida.")
    endpoint, keys = data.get("endpoint"), data.get("keys")
    if (
        not isinstance(endpoint, str)
        or len(endpoint) > 2048
        or not isinstance(keys, dict)
    ):
        raise ValueError("Inscrição de notificação inválida.")
    url = urlsplit(endpoint)
    if (
        url.scheme != "https"
        or url.hostname not in PUSH_HOSTS
        or url.port not in (None, 443)
        or url.username
        or url.password
        or url.fragment
        or not url.path.startswith("/")
        or url.path == "/"
    ):
        raise ValueError("Provedor de notificações não suportado.")
    for key, length in (("auth", 16), ("p256dh", 65)):
        value = keys.get(key)
        if not isinstance(value, str) or len(value) > 100:
            raise ValueError("Chave de notificação inválida.")
        try:
            decoded = base64.b64decode(
                value + "=" * (-len(value) % 4), altchars=b"-_", validate=True
            )
        except (ValueError, TypeError):
            raise ValueError("Chave de notificação inválida.") from None
        if len(decoded) != length or (key == "p256dh" and decoded[0] != 4):
            raise ValueError("Chave de notificação inválida.")
    return {"endpoint": endpoint, "keys": {k: keys[k] for k in ("auth", "p256dh")}}


@bp.put("/Lembretes/config")
def salvar_config():
    try:
        config = validar_config(request.get_json(silent=True))
        with closing(psycopg2.connect(**DB_CONFIG)) as conn, conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO lembretes_config (email, ativo, dias, semana)
                VALUES (%s,%s,%s,%s) ON CONFLICT (email) DO UPDATE SET
                ativo=EXCLUDED.ativo, dias=EXCLUDED.dias, semana=EXCLUDED.semana
                WHERE (lembretes_config.ativo,lembretes_config.dias,lembretes_config.semana)
                IS DISTINCT FROM (EXCLUDED.ativo,EXCLUDED.dias,EXCLUDED.semana)""",
                (
                    g.authenticated_email,
                    config["ativo"],
                    config["dias"],
                    config["semana"],
                ),
            )
        return jsonify(config)
    except ValueError as exc:
        return jsonify(erro=str(exc)), 400
    except psycopg2.Error:
        current_app.logger.exception("Falha ao salvar preferências de lembretes.")
        return jsonify(erro="Não foi possível salvar os lembretes."), 500


@bp.route("/Lembretes/dispositivo", methods=["POST", "DELETE"])
def dispositivo():
    try:
        data = request.get_json(silent=True)
        if request.method == "POST":
            if not os.getenv("VAPID_PUBLIC_KEY") or not os.getenv("VAPID_PRIVATE_KEY"):
                return jsonify(erro="Notificações ainda não estão configuradas."), 503
            subscription = validar_subscription(data)
            endpoint = subscription["endpoint"]
        else:
            endpoint = data.get("endpoint") if isinstance(data, dict) else None
            if not isinstance(endpoint, str) or len(endpoint) > 2048:
                raise ValueError("Dispositivo inválido.")
        with closing(psycopg2.connect(**DB_CONFIG)) as conn, conn, conn.cursor() as cur:
            # Serializa registros da conta e limita a cinco aparelhos.
            cur.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 20261014))",
                (g.authenticated_email,),
            )
            if request.method == "DELETE":
                cur.execute(
                    "DELETE FROM lembretes_dispositivos WHERE email=%s AND endpoint=%s",
                    (g.authenticated_email, endpoint),
                )
            else:
                cur.execute(
                    "SELECT email FROM lembretes_dispositivos WHERE endpoint=%s",
                    (endpoint,),
                )
                owner = cur.fetchone()
                if owner and owner[0] != g.authenticated_email:
                    return jsonify(
                        erro="Desative as notificações neste aparelho antes de trocar de conta."
                    ), 409
                cur.execute(
                    "SELECT COUNT(*) FROM lembretes_dispositivos WHERE email=%s",
                    (g.authenticated_email,),
                )
                if not owner and cur.fetchone()[0] >= 5:
                    return jsonify(
                        erro="Limite de cinco aparelhos por conta. Desative um aparelho para adicionar outro."
                    ), 409
                cur.execute(
                    """INSERT INTO lembretes_dispositivos (id,email,endpoint,subscription)
                    VALUES (%s,%s,%s,%s::jsonb) ON CONFLICT(endpoint) DO UPDATE
                    SET subscription=EXCLUDED.subscription WHERE lembretes_dispositivos.email=EXCLUDED.email""",
                    (
                        str(uuid4()),
                        g.authenticated_email,
                        endpoint,
                        json.dumps(subscription),
                    ),
                )
        return jsonify(ativo=request.method == "POST")
    except ValueError as exc:
        return jsonify(erro=str(exc)), 400
    except psycopg2.Error:
        current_app.logger.exception("Falha ao configurar dispositivo de lembretes.")
        return jsonify(erro="Não foi possível configurar este aparelho."), 500


def scheduler_autorizado():
    email, audience = (
        os.getenv("REMINDER_SCHEDULER_EMAIL"),
        os.getenv("REMINDER_SCHEDULER_AUDIENCE"),
    )
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if not email or not audience or scheme.lower() != "bearer" or not token:
        return False
    try:
        claims = id_token.verify_oauth2_token(token, Request(), audience=audience)
        return claims.get("email") == email and claims.get("email_verified") is True
    except (ValueError, GoogleAuthError):
        return False


class NoRedirectSession(Session):
    """Nunca segue redirecionamentos do provedor para endereços privados."""

    def post(self, url, **kwargs):
        kwargs["allow_redirects"] = False
        return super().post(url, **kwargs)


class PushDeliveryError(Exception):
    def __init__(self, status):
        self.status = status


def entregar_push(**kwargs):
    # A biblioteca de envio só carrega na tarefa diária, sem pesar no login.
    from pywebpush import WebPushException, webpush

    try:
        return webpush(**kwargs)
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        raise PushDeliveryError(status) from None


def enviar_pendentes():
    """Uma consulta por conta com aparelhos; entrega no máximo uma vez por dia/aparelho."""
    hoje = hoje_negocio()
    allowed = {
        e.strip().lower()
        for e in os.getenv("ALLOWED_EMAILS", "").split(",")
        if e.strip()
    }
    enviados = falhas = 0
    with (
        closing(psycopg2.connect(**DB_CONFIG)) as conn,
        conn,
        conn.cursor(cursor_factory=RealDictCursor) as cur,
    ):
        cur.execute("SELECT pg_try_advisory_xact_lock(20261014, 1) AS locked")
        if not cur.fetchone()["locked"]:
            return {"enviados": 0, "em_andamento": True}
        cur.execute(
            """SELECT DISTINCT d.email, c.dias, c.semana FROM lembretes_dispositivos d
            JOIN lembretes_config c USING(email) WHERE c.ativo AND d.email=ANY(%s)""",
            (list(allowed),),
        )
        contas = cur.fetchall()
        with NoRedirectSession() as session:
            for config in contas:
                cur.execute(
                    """SELECT d.dia::date FROM generate_series(%s::date,%s::date,interval '1 day') d(dia)
                    WHERE extract(isodow FROM d.dia)::int=ANY(%s) AND NOT EXISTS
                    (SELECT 1 FROM faturamento f WHERE f.dia_mes_ano=d.dia::date
                     AND f.faturamento_bruto_diario IS NOT NULL AND f.despesas_diarias IS NOT NULL
                     AND f.faturamento_liquido_diario IS NOT NULL)""",
                    (
                        hoje - timedelta(days=config["dias"]),
                        hoje - timedelta(days=1),
                        config["semana"],
                    ),
                )
                if not cur.fetchone():
                    continue
                cur.execute(
                    "SELECT id,subscription FROM lembretes_dispositivos WHERE email=%s AND ultimo_envio IS DISTINCT FROM %s FOR UPDATE",
                    (config["email"], hoje),
                )
                for device in cur.fetchall():
                    try:
                        subscription = validar_subscription(device["subscription"])
                        response = entregar_push(
                            subscription_info=subscription,
                            data=json.dumps(
                                {
                                    "title": "Lançamentos pendentes",
                                    "body": "Há dias sem fechamento. Abra o financeiro para conferir.",
                                    "tag": f"tony-lembrete-{hoje}",
                                }
                            ),
                            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
                            vapid_claims={
                                "sub": "https://financeiro-tony-lanches.web.app"
                            },
                            ttl=3600,
                            timeout=5,
                            requests_session=session,
                        )
                        if not 200 <= response.status_code < 300:
                            raise ValueError("Provedor não confirmou a entrega.")
                        cur.execute(
                            "UPDATE lembretes_dispositivos SET ultimo_envio=%s WHERE id=%s",
                            (hoje, device["id"]),
                        )
                        enviados += 1
                    except PushDeliveryError as exc:
                        if exc.status in (404, 410):
                            cur.execute(
                                "DELETE FROM lembretes_dispositivos WHERE id=%s",
                                (device["id"],),
                            )
                        else:
                            falhas += 1
                            current_app.logger.warning(
                                "Provedor não aceitou um lembrete; tentativa será repetida pelo agendador."
                            )
                    except (ValueError, RequestException):
                        falhas += 1
                        current_app.logger.warning(
                            "Não foi possível enviar um lembrete."
                        )
    return {"enviados": enviados, "falhas": falhas}


@bp.post("/internal/lembretes/enviar")
def enviar_agendado():
    if not scheduler_autorizado():
        return jsonify(erro="Agendador não autorizado."), 401
    if not os.getenv("VAPID_PRIVATE_KEY"):
        return jsonify(erro="Notificações indisponíveis."), 503
    try:
        resultado = enviar_pendentes()
        return jsonify(resultado), 503 if resultado.get("falhas") else 200
    except psycopg2.Error:
        current_app.logger.exception("Falha na verificação diária de lembretes.")
        return jsonify(erro="Não foi possível verificar os lembretes."), 503
