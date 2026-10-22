"""Lembretes em tabelas TEMP; nenhum envio real ou registro financeiro real."""

import base64
import os
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch

import faturamento
import lembretes
import test_fechamento_diario as fixture


class LembretesTest(unittest.TestCase):
    salvar = fixture.FechamentoDiarioTest.salvar

    def test_criptografia_webpush_real_sem_rede(self):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec

        encode = lambda data: base64.urlsafe_b64encode(data).decode().rstrip("=")
        browser_key = ec.generate_private_key(ec.SECP256R1())
        server_key = ec.generate_private_key(ec.SECP256R1())
        subscription = self.subscription()
        subscription["keys"]["p256dh"] = encode(browser_key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
        transport = Mock()
        transport.post.return_value = Mock(status_code=201)
        response = lembretes.entregar_push(subscription_info=subscription, data='aviso de teste',
            vapid_private_key=encode(server_key.private_numbers().private_value.to_bytes(32, 'big')),
            vapid_claims={'sub':'https://financeiro-tony-lanches.web.app'}, requests_session=transport,
            timeout=5, ttl=3600)
        self.assertEqual(response.status_code,201)
        self.assertNotIn(b'aviso de teste',transport.post.call_args.kwargs['data'])
        self.assertTrue(transport.post.call_args.kwargs['headers']['authorization'].startswith('vapid '))

    def setUp(self):
        fixture.FechamentoDiarioTest.setUp(self)
        migration = (
            Path(__file__).parents[1] / "migrations/20261014_lembretes.sql"
        ).read_text(encoding="utf-8")
        migration = (
            migration.replace("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE")
            .replace("BEGIN;", "")
            .replace("COMMIT;", "")
        )
        with self.conn, self.conn.cursor() as cur:
            cur.execute(migration)
        self.enterContext(
            patch("faturamento.hoje_negocio", return_value=date(2030, 3, 5))
        )
        self.enterContext(
            patch("lembretes.hoje_negocio", return_value=date(2030, 3, 5))
        )

    def reminder_config(self, **changes):
        return {"ativo": True, "dias": 7, "semana": [1, 2, 3, 4, 5, 6, 7], **changes}

    def subscription(self):
        encode = lambda data: base64.urlsafe_b64encode(data).decode().rstrip("=")
        return {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test-device",
            "keys": {"auth": encode(b"a" * 16), "p256dh": encode(b"\x04" + b"b" * 64)},
        }

    def test_pendencias_em_uma_consulta_incluem_parcial_mas_nao_zero_ou_hoje(self):
        self.salvar("2030-03-04", "0", "0")
        with self.conn, self.conn.cursor() as cur:
            cur.execute("INSERT INTO faturamento (dia_mes_ano) VALUES ('2030-03-03')")
        response = self.client.get("/Faturamento/resumo_diario/2030-03-05?lembretes=1")
        self.assertEqual(response.status_code, 200)
        data = response.json["lembretes"]
        self.assertEqual(data["hoje"], "2030-03-05")
        self.assertNotIn("2030-03-04", data["pendentes"])
        self.assertIn("2030-03-03", data["pendentes"])
        self.assertEqual(len(data["pendentes"]), 6)
        self.assertNotIn("2030-03-05", data["pendentes"])

    def test_config_por_conta_e_sem_alteracao_de_financeiro(self):
        response = self.client.put(
            "/Lembretes/config", json=self.reminder_config(dias=2, semana=[1, 3])
        )
        self.assertEqual(response.status_code, 200)
        result = self.client.get("/Faturamento/resumo_diario/2030-03-05?lembretes=1")
        self.assertEqual(result.json["lembretes"]["config"]["dias"], 2)
        with self.conn, self.conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM faturamento")
            self.assertEqual(cur.fetchone()[0], 0)
        with (
            patch(
                "faturamento.verify_firebase_token",
                return_value={"email": "other@example.com"},
            ),
            patch.dict(os.environ, {"ALLOWED_EMAILS": "other@example.com"}),
        ):
            response = self.client.get(
                "/Faturamento/resumo_diario/2030-03-05?lembretes=1"
            )
            self.assertEqual(response.json["lembretes"]["config"]["dias"], 1)

    def test_valida_limites_e_bloqueia_sem_token(self):
        for data in (
            self.reminder_config(dias=0),
            self.reminder_config(dias=8),
            self.reminder_config(semana=[]),
            self.reminder_config(semana=[8]),
            self.reminder_config(dias=True),
        ):
            self.assertEqual(
                self.client.put("/Lembretes/config", json=data).status_code, 400
            )
        self.assertEqual(
            self.client.get(
                "/Faturamento/resumo_diario/2030-03-05?lembretes=100"
            ).status_code,
            400,
        )
        self.assertEqual(
            faturamento.app.test_client()
            .put("/Lembretes/config", json=self.reminder_config())
            .status_code,
            401,
        )

    def test_scheduler_nao_aceita_firebase_nem_email_errado(self):
        self.assertEqual(
            self.client.post("/internal/lembretes/enviar").status_code, 401
        )
        with (
            patch.dict(
                os.environ,
                {
                    "REMINDER_SCHEDULER_EMAIL": "scheduler@example.com",
                    "REMINDER_SCHEDULER_AUDIENCE": "https://api.example.com",
                },
            ),
            patch(
                "lembretes.id_token.verify_oauth2_token",
                return_value={"email": "other@example.com", "email_verified": True},
            ),
        ):
            self.assertEqual(
                self.client.post("/internal/lembretes/enviar").status_code, 401
            )

    def test_subscription_rejeita_ssrf_e_chaves_invalidas(self):
        for endpoint in (
            "http://fcm.googleapis.com/x",
            "https://127.0.0.1/x",
            "https://fcm.googleapis.com.evil.test/x",
            "https://user@fcm.googleapis.com/x",
            "https://fcm.googleapis.com:444/x",
        ):
            with self.assertRaises(ValueError):
                lembretes.validar_subscription(
                    {**self.subscription(), "endpoint": endpoint}
                )
        with self.assertRaises(ValueError):
            lembretes.validar_subscription(
                {"endpoint": self.subscription()["endpoint"], "keys": {}}
            )

    def test_push_so_uma_vez_no_dia_e_nao_envia_dados_financeiros(self):
        with patch.dict(
            os.environ, {"VAPID_PUBLIC_KEY": "public", "VAPID_PRIVATE_KEY": "private"}
        ):
            self.client.put("/Lembretes/config", json=self.reminder_config())
            self.assertEqual(
                self.client.post(
                    "/Lembretes/dispositivo", json=self.subscription()
                ).status_code,
                200,
            )
            with (
                faturamento.app.app_context(),
                patch(
                    "lembretes.entregar_push", return_value=Mock(status_code=201)
                ) as push,
            ):
                self.assertEqual(lembretes.enviar_pendentes()["enviados"], 1)
                self.assertEqual(lembretes.enviar_pendentes()["enviados"], 0)
                self.assertEqual(push.call_count, 1)
                self.assertNotIn("faturamento", push.call_args.kwargs["data"])
                self.assertEqual(push.call_args.kwargs["timeout"], 5)

    def test_desativado_nao_envia_e_exclusao_so_do_dono(self):
        with patch.dict(
            os.environ, {"VAPID_PUBLIC_KEY": "public", "VAPID_PRIVATE_KEY": "private"}
        ):
            self.client.put("/Lembretes/config", json=self.reminder_config(ativo=False))
            self.client.post("/Lembretes/dispositivo", json=self.subscription())
            with (
                faturamento.app.app_context(),
                patch("lembretes.entregar_push") as push,
            ):
                self.assertEqual(lembretes.enviar_pendentes()["enviados"], 0)
                push.assert_not_called()
            self.assertEqual(
                self.client.delete(
                    "/Lembretes/dispositivo",
                    json={"endpoint": self.subscription()["endpoint"]},
                ).status_code,
                200,
            )
