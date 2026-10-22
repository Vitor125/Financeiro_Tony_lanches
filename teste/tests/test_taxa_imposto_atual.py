"""Testes de integração: usam apenas uma tabela temporária no PostgreSQL."""
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import psycopg2

import faturamento


class ConexaoDeTeste:
    def __init__(self, conexao):
        self.conexao = conexao

    def __enter__(self):
        return self.conexao.__enter__()

    def __exit__(self, *args):
        return self.conexao.__exit__(*args)

    def close(self):
        # Mantém a tabela temporária entre requisições do mesmo teste.
        pass

    def cursor(self, *args, **kwargs):
        return self.conexao.cursor(*args, **kwargs)


class TaxaImpostoAtualTest(unittest.TestCase):
    def setUp(self):
        self.auth_config = patch.dict(os.environ, {
            "FIREBASE_PROJECT_ID": "financeiro-tony-lanches",
            "ALLOWED_EMAILS": "owner@example.com"
        })
        self.auth_config.start()
        self.addCleanup(self.auth_config.stop)
        self.auth_verification = patch(
            "faturamento.verify_firebase_token",
            return_value={"email": "owner@example.com"}
        )
        self.auth_verification.start()
        self.addCleanup(self.auth_verification.stop)
        self.conn = psycopg2.connect(**faturamento.DB_CONFIG, connect_timeout=3)
        self.addCleanup(self.conn.close)
        sql = Path(__file__).with_name("taxa_imposto_atual.sql").read_text(encoding="utf-8")
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute(sql.replace("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE"))
        self.mock_connect = self.enterContext(patch.object(
            faturamento.psycopg2, "connect", return_value=ConexaoDeTeste(self.conn)
        ))
        self.client = faturamento.app.test_client()
        self.client.environ_base["HTTP_AUTHORIZATION"] = "Bearer test-token"
        self.url = "/Faturamento/taxa_imposto_atual"

    def registro(self):
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("SELECT taxa_imposto_atual, xmin::text, ctid::text FROM pg_temp.configuracao_imposto")
                return cur.fetchone()

    def test_get_sem_taxa_nao_cria_registro(self):
        resposta = self.client.get(self.url)
        self.assertEqual(resposta.status_code, 200)
        self.assertIsNone(resposta.json["taxa_imposto_atual"])
        self.assertIsNone(self.registro())

    def test_campo_opcional_nao_abre_conexao(self):
        for dados in ({}, {"taxa_imposto_atual": None}, {"taxa_imposto_atual": "  "}):
            resposta = self.client.post(self.url, json=dados)
            self.assertEqual(resposta.status_code, 200)
            self.assertFalse(resposta.json["alterado"])
        self.mock_connect.assert_not_called()
        self.assertIsNone(self.registro())

    def test_grava_consulta_e_altera(self):
        for valor in ("0.15", "0.20", "0"):
            resposta = self.client.post(self.url, json={"taxa_imposto_atual": valor})
            self.assertEqual(resposta.status_code, 200)
            self.assertTrue(resposta.json["alterado"])
            self.assertEqual(self.client.get(self.url).json["taxa_imposto_atual"], valor)

    def test_valor_equivalente_e_campo_vazio_preservam_registro(self):
        self.client.post(self.url, json={"taxa_imposto_atual": "0.15"})
        original = self.registro()
        for dados in ({"taxa_imposto_atual": "0.1500"}, {}, {"taxa_imposto_atual": ""}):
            resposta = self.client.post(self.url, json=dados)
            self.assertEqual(resposta.status_code, 200)
            self.assertFalse(resposta.json["alterado"])
            self.assertEqual(self.registro(), original)

    def test_formulario(self):
        resposta = self.client.post(self.url, data={"taxa_imposto_atual": "0.05"})
        self.assertEqual(resposta.status_code, 200)
        self.assertTrue(resposta.json["alterado"])

    def test_entradas_invalidas_nao_gravam(self):
        for valor in ("abc", "NaN", "Infinity", "-1", True, [], {}, "1.000001", "0.1234567", "1e100000"):
            resposta = self.client.post(self.url, json={"taxa_imposto_atual": valor})
            self.assertEqual(resposta.status_code, 400)
        for corpo in ("[1]", "null", "{"):
            resposta = self.client.post(self.url, data=corpo, content_type="application/json")
            self.assertEqual(resposta.status_code, 400)
        self.mock_connect.assert_not_called()
        self.assertIsNone(self.registro())


if __name__ == "__main__":
    unittest.main()
