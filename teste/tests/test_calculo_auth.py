"""O cliente envia os dois totais e a identidade em apenas um POST."""
import unittest
from datetime import date
from unittest.mock import patch

from calculo import calcular_dia


class Resposta:
    def __init__(self, status_code, dados):
        self.status_code = status_code
        self.dados = dados
        self.text = ""

    def raise_for_status(self):
        if self.status_code >= 400:
            raise AssertionError(f"Resposta inesperada: {self.status_code}")

    def json(self):
        return self.dados


class CalculoAuthTest(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch("calculo.hoje_negocio", return_value=date(2030, 3, 2)))

    def test_envia_fechamento_em_um_post_autenticado(self):
        respostas = [Resposta(200, {"faturamento_liquido_diario": "600.00"})]

        with patch("calculo.requests.request", side_effect=respostas) as request:
            resultado = calcular_dia(
                "2030-03-02",
                "1000.00",
                "250.00",
                api_url="https://financeiro-tony-lanches.web.app",
                authorization="Bearer id-token"
            )

        self.assertEqual(resultado["faturamento_liquido_diario"], "600.00")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.args[0], "POST")
        self.assertEqual(request.call_args.args[1],
                         "https://financeiro-tony-lanches.web.app/Faturamento/calcular_dia")
        self.assertEqual(request.call_args.kwargs["json"], {
            "dia_mes_ano": "2030-03-02", "faturamento_bruto_diario": "1000.00",
            "despesas_diarias": "250.00"})
        for chamada in request.call_args_list:
            self.assertEqual(chamada.kwargs["headers"]["Authorization"], "Bearer id-token")
            self.assertTrue(chamada.args[1].startswith(
                "https://financeiro-tony-lanches.web.app/"
            ))

    def test_nao_envia_token_para_api_remota_sem_https(self):
        with patch("calculo.requests.request") as request:
            with self.assertRaisesRegex(ValueError, "precisa usar HTTPS"):
                calcular_dia(
                    "2030-03-02",
                    "1000",
                    "250",
                    api_url="http://api.example.com",
                    authorization="Bearer id-token"
                )

        request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
