"""Datas de gravação são validadas antes do banco e no fuso do negócio."""
from datetime import date, datetime, timezone
import os
import unittest
from unittest.mock import patch

import calculo
import faturamento


class DatasPermitidasTest(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch("calculo.hoje_negocio", return_value=date(2026, 10, 3)))
        self.enterContext(patch.dict(os.environ, {
            "FIREBASE_PROJECT_ID": "test-project", "ALLOWED_EMAILS": "owner@example.com"}))
        self.enterContext(patch("faturamento.verify_firebase_token",
                                return_value={"email": "owner@example.com"}))
        self.client = faturamento.app.test_client()
        self.client.environ_base["HTTP_AUTHORIZATION"] = "Bearer test-token"

    def test_ontem_e_hoje_aceitos_futuro_recusado(self):
        self.assertEqual(calculo.validar_data_fechamento("2026-10-02"), date(2026, 10, 2))
        self.assertEqual(calculo.validar_data_fechamento("2026-10-03"), date(2026, 10, 3))
        for value in ["2026-10-04", "2026-12-01", "2027-01-01"]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "datas futuras"):
                calculo.validar_data_fechamento(value)

    def test_todas_as_rotas_de_gravacao_bloqueiam_sem_conectar(self):
        routes = ["salvar_data", "bruto_diario", "despesas_diarias", "liquido_diario",
                  "calcular_dia", "fechamento_diario"]
        with patch("faturamento.psycopg2.connect") as connect:
            for route in routes:
                for value in ["2026-10-04", "2026-12-01"]:
                    with self.subTest(route=route, value=value):
                        response = self.client.post("/Faturamento/" + route, json={
                            "dia_mes_ano": value, "faturamento_bruto_diario": "100",
                            "despesas_diarias": "20", "faturamento_liquido_diario": "65"})
                        self.assertEqual(response.status_code, 400)
                        self.assertIn("datas futuras", response.json["erro"])
            connect.assert_not_called()

    def test_cli_nao_envia_datas_bloqueadas(self):
        with patch("calculo.requests.request") as request:
            for value in ["2026-09-25", "2026-10-04", "2026-12-01"]:
                with self.assertRaises(ValueError):
                    calculo.calcular_dia(value, "100", "20")
            request.assert_not_called()

    def test_diario_nao_grava_passado_sem_conectar(self):
        with patch("faturamento.psycopg2.connect") as connect:
            for route in ["salvar_data", "bruto_diario", "despesas_diarias", "liquido_diario", "calcular_dia", "fechamento_diario"]:
                response = self.client.post("/Faturamento/" + route, json={"dia_mes_ano": "2026-09-25", "faturamento_bruto_diario": "100", "despesas_diarias": "20", "faturamento_liquido_diario": "65"})
                self.assertEqual(response.status_code, 400)
                self.assertIn("Editar e excluir dados", response.json["erro"])
            connect.assert_not_called()

    def test_consultas_continuam_aceitando_datas_validas(self):
        self.assertEqual(calculo.validar_data("2026-12-01"), date(2026, 12, 1))


class FusoNegocioTest(unittest.TestCase):
    def test_virada_do_dia_ocorre_em_sao_paulo(self):
        for hour, expected in [(2, date(2026, 10, 2)), (3, date(2026, 10, 3))]:
            with self.subTest(hour=hour), patch("calculo.datetime") as clock:
                instant = datetime(2026, 10, 3, hour, tzinfo=timezone.utc)
                clock.now.side_effect = lambda zone: instant.astimezone(zone)
                self.assertEqual(calculo.hoje_negocio(), expected)


if __name__ == "__main__":
    unittest.main()
