"""Testes isolados das regras de acesso; não conectam ao PostgreSQL."""
import os
import unittest
from unittest.mock import patch

import faturamento


class AuthenticationTest(unittest.TestCase):
    def setUp(self):
        self.client = faturamento.app.test_client()
        self.server_config = patch.dict(os.environ, {
            "FIREBASE_PROJECT_ID": "financeiro-tony-lanches",
            "ALLOWED_EMAILS": "owner@example.com",
            "FRONTEND_ORIGINS": (
                "https://financeiro-tony-lanches.web.app "
                "https://financeiro-tony-lanches.firebaseapp.com"
            )
        })
        self.server_config.start()
        self.addCleanup(self.server_config.stop)

    def test_api_rejeita_requisicao_sem_token(self):
        resposta = self.client.get("/Faturamento_geral")
        self.assertEqual(resposta.status_code, 401)
        self.assertEqual(resposta.json["erro"], "Faça login para acessar os dados.")
        self.assertEqual(resposta.headers["Cache-Control"], "no-store")

    def test_conta_fora_da_lista_nao_acessa_dados(self):
        with patch(
            "faturamento.verify_firebase_token",
            return_value={"email": "outra@example.com"}
        ):
            resposta = self.client.get(
                "/Faturamento_geral",
                headers={"Authorization": "Bearer token-valido"}
            )

        self.assertEqual(resposta.status_code, 403)

    def test_conta_autorizada_obtem_identidade_validada(self):
        with patch(
            "faturamento.verify_firebase_token",
            return_value={"email": "OWNER@example.com"}
        ) as verify:
            resposta = self.client.get(
                "/auth/me",
                headers={"Authorization": "Bearer token-valido"}
            )

        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json, {"email": "owner@example.com"})
        verify.assert_called_once_with("token-valido")

    def test_token_invalido_retorna_nao_autorizado(self):
        with patch(
            "faturamento.verify_firebase_token",
            side_effect=ValueError("token inválido")
        ):
            resposta = self.client.get(
                "/auth/me",
                headers={"Authorization": "Bearer token-invalido"}
            )

        self.assertEqual(resposta.status_code, 401)

    def test_sem_lista_de_emails_a_api_falha_fechada(self):
        with patch.dict(os.environ, {"ALLOWED_EMAILS": ""}):
            resposta = self.client.get(
                "/auth/me",
                headers={"Authorization": "Bearer token-valido"}
            )

        self.assertEqual(resposta.status_code, 503)

    def test_healthcheck_nao_expoe_dados_e_nao_exige_login(self):
        resposta = self.client.get("/healthz")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json, {"status": "ok"})

    def test_preflight_cors_autoriza_somente_hosting_configurado(self):
        autorizado = self.client.options(
            "/auth/me",
            headers={
                "Origin": "https://financeiro-tony-lanches.web.app",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization"
            }
        )
        negado = self.client.options(
            "/auth/me",
            headers={"Origin": "https://site-nao-autorizado.example"}
        )

        self.assertEqual(autorizado.status_code, 204)
        self.assertEqual(
            autorizado.headers["Access-Control-Allow-Origin"],
            "https://financeiro-tony-lanches.web.app"
        )
        self.assertIn("Origin", autorizado.headers["Vary"])
        self.assertIn("PUT", autorizado.headers["Access-Control-Allow-Methods"])
        self.assertIn("DELETE", autorizado.headers["Access-Control-Allow-Methods"])
        self.assertEqual(negado.status_code, 403)

    def test_preflight_nao_autoriza_origem_nao_configurada(self):
        with patch.dict(os.environ, {"FRONTEND_ORIGINS": ""}):
            resposta = self.client.options(
                "/auth/me",
                headers={"Origin": "https://financeiro-tony-lanches.web.app"}
            )

        self.assertEqual(resposta.status_code, 403)

    def test_resposta_de_api_envia_cors_apenas_para_hosting(self):
        cabecalhos = {"Authorization": "Bearer token-valido"}
        with patch(
            "faturamento.verify_firebase_token",
            return_value={"email": "owner@example.com"}
        ):
            autorizado = self.client.get(
                "/auth/me",
                headers={**cabecalhos, "Origin": "https://financeiro-tony-lanches.web.app"}
            )
            negado = self.client.get(
                "/auth/me",
                headers={**cabecalhos, "Origin": "https://site-nao-autorizado.example"}
            )

        self.assertEqual(autorizado.status_code, 200)
        self.assertEqual(
            autorizado.headers["Access-Control-Allow-Origin"],
            "https://financeiro-tony-lanches.web.app"
        )
        self.assertNotIn("Access-Control-Allow-Origin", negado.headers)

    def test_frontend_local_permanece_publico_para_mostrar_login(self):
        resposta = self.client.get("/static/tony-lanches/index.html")
        try:
            self.assertEqual(resposta.status_code, 200)
            self.assertIn(b'id="login-form"', resposta.data)
        finally:
            resposta.close()

    def test_erro_do_banco_nao_expoe_detalhes_internos(self):
        import psycopg2
        with patch("faturamento.verify_firebase_token", return_value={"email": "owner@example.com"}), patch(
            "faturamento.psycopg2.connect", side_effect=psycopg2.OperationalError("private-database-secret")):
            for path in ["/Faturamento/taxa_imposto_atual", "/Faturamento/bruto_diario/2026-10-03"]:
                response = self.client.get(path, headers={"Authorization": "Bearer token"})
                self.assertEqual(response.status_code, 500)
                self.assertNotIn("private-database-secret", response.get_data(as_text=True))
                self.assertNotIn("detalhe", response.json)

    def test_corpo_excessivo_recusado_antes_do_banco(self):
        with patch("faturamento.verify_firebase_token", return_value={"email": "owner@example.com"}), patch("faturamento.psycopg2.connect") as connect:
            response = self.client.post("/Faturamento/calcular_dia", data='{"valor":"' + ('a' * 17000) + '"}', content_type="application/json", headers={"Authorization": "Bearer token"})
            self.assertEqual(response.status_code, 413)
            connect.assert_not_called()

    def test_cabecalhos_protegem_resposta_da_api(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")


if __name__ == "__main__":
    unittest.main()
