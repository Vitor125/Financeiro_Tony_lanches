"""Integração em tabelas TEMP: nunca grava nos registros ou sequências reais."""
from decimal import Decimal
from datetime import date
import os
import unittest
from unittest.mock import patch

import psycopg2
import faturamento
from test_taxa_imposto_atual import ConexaoDeTeste


class FechamentoDiarioTest(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch("calculo.hoje_negocio", return_value=date(2030, 5, 1)))
        self.enterContext(patch.dict(os.environ, {
            "FIREBASE_PROJECT_ID": "test-project", "ALLOWED_EMAILS": "owner@example.com"
        }))
        self.enterContext(patch("faturamento.verify_firebase_token",
                                return_value={"email": "owner@example.com"}))
        config = dict(faturamento.DB_CONFIG)
        config["host"] = config.get("host", "").replace("-pooler.", ".", 1)
        self.real_connect = psycopg2.connect
        self.config = config
        self.conn = self.real_connect(**config)
        self.addCleanup(self.conn.close)
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("""
                    CREATE TEMP SEQUENCE fechamento_test_id;
                    CREATE TEMP TABLE faturamento
                        (LIKE public.faturamento INCLUDING CONSTRAINTS INCLUDING INDEXES);
                    ALTER TABLE pg_temp.faturamento ALTER COLUMN id
                        SET DEFAULT nextval('pg_temp.fechamento_test_id');
                    CREATE TEMP TABLE configuracao_imposto (
                        id INTEGER PRIMARY KEY, taxa_imposto_atual NUMERIC NOT NULL);
                    INSERT INTO pg_temp.configuracao_imposto VALUES (1, 0.15);
                    CREATE TEMP TABLE configuracao_dia_folga (
                        id INTEGER PRIMARY KEY, dia_folga DATE, dia_semana SMALLINT,
                        dia_excecao DATE, tipo_excecao TEXT);
                    INSERT INTO pg_temp.configuracao_dia_folga VALUES (1, NULL, NULL, NULL, NULL);
                """)
        self.connect = self.enterContext(patch.object(
            faturamento.psycopg2, "connect", return_value=ConexaoDeTeste(self.conn)))
        self.client = faturamento.app.test_client()
        self.client.environ_base["HTTP_AUTHORIZATION"] = "Bearer test-token"

    def salvar(self, data="2030-03-02", bruto="1000.00", despesas="250.00", rota=None):
        # Simula o cadastro na data em que ele foi realizado, sem liberar POST histórico.
        try:
            dia = date.fromisoformat(data)
        except (ValueError, TypeError):
            dia = date(2030, 5, 1)
        with patch("calculo.hoje_negocio", return_value=dia):
            return self.client.post(rota or "/Faturamento/calcular_dia", json={
                "dia_mes_ano": data, "faturamento_bruto_diario": bruto,
                "despesas_diarias": despesas})

    def registros(self):
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("SELECT dia_mes_ano, faturamento_bruto_diario, despesas_diarias, "
                            "faturamento_liquido_diario, faturamento_bruto_mensal, "
                            "faturamento_liquido_mensal, despesas_mensais, "
                            "faturamento_bruto_anual, faturamento_liquido_anual "
                            "FROM pg_temp.faturamento ORDER BY dia_mes_ano")
                return cur.fetchall()

    def original(self, data="2030-03-02"):
        record = self.client.get("/Faturamento/resumo_diario/" + data).json
        return {field: record[field] for field in ["faturamento_bruto_diario", "despesas_diarias", "faturamento_liquido_diario"]}

    def test_dia_fixo_semanal_bloqueia_lancamentos(self):
        data = "2030-05-06"  # segunda-feira
        response = self.client.post("/Faturamento/dia_folga", json={"dia_semana": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["dia_semana"], 1)
        self.assertEqual(self.client.get("/Faturamento/dia_folga").json["dia_semana"], 1)

        self.assertEqual(self.salvar(data).status_code, 409)
        self.assertEqual(self.salvar(data, rota="/Faturamento/salvar_data").status_code, 409)
        self.assertEqual(self.registros(), [])

        response = self.client.post("/Faturamento/dia_folga", json={"dia_semana": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["dia_semana"], 2)
        self.assertEqual(self.salvar(data).status_code, 200)

    def test_excecao_adicional_bloqueia_data_sem_mudar_folga_semanal(self):
        self.client.post("/Faturamento/dia_folga", json={"dia_semana": 1})
        data = "2030-05-07"  # terça-feira
        response = self.client.post("/Faturamento/dia_folga/excecao", json={
            "dia_excecao": data, "tipo_excecao": "adicional"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"dia_excecao": data, "tipo_excecao": "adicional"})
        self.assertEqual(self.salvar("2030-05-06").status_code, 409)
        self.assertEqual(self.salvar(data).status_code, 409)
        self.assertEqual(self.client.delete("/Faturamento/dia_folga/excecao").status_code, 200)
        self.assertEqual(self.salvar(data).status_code, 200)

    def test_excecao_substitui_dia_fixo_somente_naquela_semana(self):
        self.client.post("/Faturamento/dia_folga", json={"dia_semana": 1})
        data = "2030-05-07"  # terça-feira da mesma semana
        response = self.client.post("/Faturamento/dia_folga/excecao", json={
            "dia_excecao": data, "tipo_excecao": "substituir"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.salvar("2030-05-06").status_code, 200)
        self.assertEqual(self.salvar(data).status_code, 409)
        self.assertEqual(self.salvar("2030-05-13").status_code, 409)
        self.assertEqual(self.client.delete("/Faturamento/dia_folga/excecao").status_code, 200)
        self.assertEqual(self.salvar("2030-05-06").status_code, 409)

    def editar(self, data="2030-03-02", bruto="1000", despesas="250"):
        return self.client.put("/Faturamento/registro/" + data, json={"original": self.original(data), "faturamento_bruto_diario": bruto, "despesas_diarias": despesas})

    def test_editar_existente_e_excluir_atualizam_totais(self):
        self.salvar(); self.salvar("2030-03-03", "200", "70")
        self.salvar("2030-04-01", "300", "50")
        response = self.client.put("/Faturamento/registro/2030-03-02", json={
            "original": self.original(), "faturamento_bruto_diario": "1200", "despesas_diarias": "300"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["faturamento_liquido_diario"], "720.00")
        rows = self.registros()
        self.assertEqual(rows[0][4:7], (Decimal("1400"), Decimal("820"), Decimal("370")))
        response = self.client.delete("/Faturamento/registro/2030-03-02", json={"original": self.original()})
        self.assertEqual(response.status_code, 200)
        rows = self.registros()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0][4:7], (Decimal("200"), Decimal("100"), Decimal("70")))
        self.assertEqual(rows[1][4:7], (Decimal("300"), Decimal("205"), Decimal("50")))
        self.assertTrue(all(row[7:] == (Decimal("500"), Decimal("305")) for row in rows))
        self.assertEqual(self.client.delete("/Faturamento/registro/2030-03-03", json={"original": self.original("2030-03-03")}).status_code, 200)
        self.assertEqual(self.registros()[0][7:], (Decimal("300"), Decimal("205")))
        self.assertEqual(self.client.delete("/Faturamento/registro/2030-04-01", json={"original": self.original("2030-04-01")}).status_code, 200)
        self.assertEqual(self.registros(), [])

    def test_edicao_exclusao_recusam_registro_alterado_ou_ausente(self):
        self.salvar()
        original = self.original()
        self.editar(bruto="1500")
        before = self.registros()
        payload = {"original": original, "faturamento_bruto_diario": "1200", "despesas_diarias": "300"}
        for method in [self.client.put, self.client.delete]:
            self.assertEqual(method("/Faturamento/registro/2030-03-02", json=payload).status_code, 409)
            self.assertEqual(method("/Faturamento/registro/2030-03-04", json=payload).status_code, 404)
            self.assertEqual(method("/Faturamento/registro/2030-03-02", json={**payload, "original": {}}).status_code, 400)
        self.assertEqual(self.registros(), before)

    def test_edicao_exclusao_falha_reverte_registro_e_totais(self):
        self.salvar(); before = self.registros()
        payload = {"original": self.original(), "faturamento_bruto_diario": "1200", "despesas_diarias": "300"}
        with patch("faturamento._atualizar_totais_periodo", side_effect=psycopg2.OperationalError("falha simulada")):
            for method in [self.client.put, self.client.delete]:
                self.assertEqual(method("/Faturamento/registro/2030-03-02", json=payload).status_code, 500)
                self.assertEqual(self.registros(), before)

    def test_edicao_hoje_e_limpeza_de_registro_futuro(self):
        self.salvar("2030-05-01")
        payload = {"original": self.original("2030-05-01"), "faturamento_bruto_diario": "100", "despesas_diarias": "20"}
        self.assertEqual(self.client.put("/Faturamento/registro/2030-05-01", json=payload).status_code, 200)
        self.assertEqual(self.client.put("/Faturamento/registro/2030-05-02", json=payload).status_code, 400)
        with self.conn, self.conn.cursor() as cur:
            cur.execute("INSERT INTO pg_temp.faturamento (dia_mes_ano) VALUES ('2030-12-01')")
        original = self.original("2030-12-01")
        self.assertEqual(self.client.delete("/Faturamento/registro/2030-12-01", json={"original": original}).status_code, 200)

    def test_edicao_exclusao_exigem_login(self):
        for method in [self.client.put, self.client.delete]:
            response = method("/Faturamento/registro/2030-03-02", json={}, headers={"Authorization": ""})
            self.assertEqual(response.status_code, 401)

    def test_mover_data_entre_anos_e_meses_preserva_id_e_totais(self):
        self.salvar(); self.salvar("2030-03-03", "200", "70"); self.salvar("2029-12-01", "300", "50")
        with self.conn, self.conn.cursor() as cur:
            cur.execute("SELECT id FROM faturamento WHERE dia_mes_ano = '2030-03-02'")
            registro_id = cur.fetchone()[0]
        payload = {"original": self.original(), "nova_data": "2029-12-02", "faturamento_bruto_diario": "1000", "despesas_diarias": "250"}
        self.assertEqual(self.client.put("/Faturamento/registro/2030-03-02", json=payload).status_code, 200)
        rows = self.registros()
        self.assertEqual(rows[0][4:7], (Decimal("1300"), Decimal("805"), Decimal("300")))
        self.assertEqual(rows[0][7:], (Decimal("1300"), Decimal("805")))
        self.assertEqual(rows[2][4:7], (Decimal("200"), Decimal("100"), Decimal("70")))
        self.assertEqual(rows[2][7:], (Decimal("200"), Decimal("100")))
        with self.conn, self.conn.cursor() as cur:
            cur.execute("SELECT id FROM faturamento WHERE dia_mes_ano = '2029-12-02'")
            self.assertEqual(cur.fetchone()[0], registro_id)
        payload["original"] = self.original("2029-12-02")
        payload["nova_data"] = "2029-11-01"
        self.assertEqual(self.client.put("/Faturamento/registro/2029-12-02", json=payload).status_code, 200)
        rows = self.registros()
        self.assertEqual(rows[0][4], Decimal("1000")); self.assertEqual(rows[1][4], Decimal("300"))
        self.assertEqual(rows[0][7], Decimal("1300"))

    def test_mover_para_data_ocupada_ou_futura_nao_altera(self):
        self.salvar(); self.salvar("2030-03-03")
        before = self.registros()
        payload = {"original": self.original(), "nova_data": "2030-03-03", "faturamento_bruto_diario": "100", "despesas_diarias": "20"}
        self.assertEqual(self.client.put("/Faturamento/registro/2030-03-02", json=payload).status_code, 409)
        payload["nova_data"] = "2030-06-01"
        self.assertEqual(self.client.put("/Faturamento/registro/2030-03-02", json=payload).status_code, 400)
        self.assertEqual(self.registros(), before)

    def test_adicionar_passado_na_gestao_sem_sobrescrever_e_recalcular(self):
        payload = {"original": None, "nova_data": "2030-03-02", "faturamento_bruto_diario": "1000", "despesas_diarias": "250"}
        self.assertEqual(self.client.post("/Faturamento/registro/2030-03-02", json=payload).status_code, 200)
        self.assertEqual(self.client.post("/Faturamento/registro/2030-03-02", json=payload).status_code, 409)
        payload["original"] = self.original()
        with self.conn, self.conn.cursor() as cur:
            cur.execute("UPDATE configuracao_imposto SET taxa_imposto_atual = 0.10")
        response = self.client.put("/Faturamento/registro/2030-03-02", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["faturamento_liquido_diario"], "650.00")

    def test_janela_sete_dias_inclusiva_e_cadastro_unico(self):
        # Hoje fixado em 01/05/2030: limite é 24/04, inclusive.
        for data in ["2030-04-24", "2030-04-30", "2030-05-01"]:
            payload = {"dia_mes_ano": data, "faturamento_bruto_diario": "1000", "despesas_diarias": "250"}
            self.assertEqual(self.client.post("/Faturamento/calcular_dia", json=payload).status_code, 200)
            before = self.registros()
            for route in ["calcular_dia", "fechamento_diario"]:
                self.assertEqual(self.client.post("/Faturamento/" + route, json={**payload, "faturamento_bruto_diario": "1500"}).status_code, 409)
            self.assertEqual(self.registros(), before)
        for data in ["2030-04-23", "2030-05-02"]:
            with patch("faturamento.psycopg2.connect") as connect:
                response = self.client.post("/Faturamento/calcular_dia", json={"dia_mes_ano": data, "faturamento_bruto_diario": "1000", "despesas_diarias": "250"})
                self.assertEqual(response.status_code, 400)
                connect.assert_not_called()

    def test_falha_ao_mover_reverte_ambos_periodos(self):
        self.salvar(); self.salvar("2029-12-01")
        before = self.registros()
        payload = {"original": self.original(), "nova_data": "2029-12-02", "faturamento_bruto_diario": "1200", "despesas_diarias": "300"}
        helper = faturamento._atualizar_totais_periodo
        def falhar_origem(data, conn):
            if data == "2030-03-02":
                raise psycopg2.OperationalError("falha no segundo período")
            helper(data, conn)
        with patch("faturamento._atualizar_totais_periodo", side_effect=falhar_origem):
            self.assertEqual(self.client.put("/Faturamento/registro/2030-03-02", json=payload).status_code, 500)
        self.assertEqual(self.registros(), before)

    def test_hoje_permitido_em_todas_as_rotas_de_gravacao(self):
        # O relógio do teste está fixado em 01/05/2030; só tabelas TEMP recebem dados.
        payload = {"dia_mes_ano": "2030-05-01", "faturamento_bruto_diario": "1000",
                   "despesas_diarias": "250", "faturamento_liquido_diario": "600"}
        for route in ["salvar_data", "bruto_diario", "despesas_diarias", "liquido_diario",
                      "calcular_dia", "fechamento_diario"]:
            with self.subTest(route=route):
                response = self.client.post("/Faturamento/" + route, json=payload)
                self.assertEqual(response.status_code, 201 if route == "salvar_data" else 409)
        self.assertEqual(self.editar("2030-05-01").status_code, 200)
        rows = self.registros()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1:4], (Decimal("1000"), Decimal("250"), Decimal("600")))

    def test_cria_atualiza_sem_duplicar_e_sem_http_interno(self):
        with patch("calculo.requests.request") as http:
            resposta = self.salvar()
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta.json["imposto_diario"], "150.00")
            self.assertEqual(resposta.json["faturamento_liquido_diario"], "600.00")
            self.assertEqual(self.connect.call_count, 1)
            self.assertEqual(self.salvar(rota="/Faturamento/fechamento_diario").status_code, 409)
            resposta = self.editar(bruto="1200", despesas="300")
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta.json["faturamento_liquido_diario"], "720.00")
            http.assert_not_called()
        rows = self.registros()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1:4], (Decimal("1200"), Decimal("300"), Decimal("720")))

    def test_totais_mensais_anuais_e_historico_preservados(self):
        self.assertEqual(self.salvar().status_code, 200)
        self.assertEqual(self.salvar("2030-03-03", "200", "70").status_code, 200)
        self.assertEqual(self.salvar("2030-04-01", "300", "50").status_code, 200)
        rows = self.registros()
        self.assertEqual(rows[0][4:7], (Decimal("1200"), Decimal("700"), Decimal("320")))
        self.assertEqual(rows[0][7:], (Decimal("1500"), Decimal("905")))
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("UPDATE pg_temp.configuracao_imposto SET taxa_imposto_atual=0")
        self.assertEqual(self.registros()[0][3], Decimal("600"))
        self.assertEqual(self.salvar("2030-04-02", "100", "20").json["faturamento_liquido_diario"], "80.00")

    def test_falha_nos_totais_reverte_criacao_e_atualizacao(self):
        self.salvar()
        antes = self.registros()
        with patch("faturamento._atualizar_totais_periodo",
                   side_effect=psycopg2.OperationalError("falha simulada")):
            self.assertEqual(self.editar(bruto="1200").status_code, 500)
            self.assertEqual(self.salvar("2030-03-03").status_code, 500)
        self.assertEqual(self.registros(), antes)

    def test_ausencia_de_taxa_nao_grava_nada(self):
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("DELETE FROM pg_temp.configuracao_imposto")
        self.assertEqual(self.salvar().status_code, 400)
        self.assertEqual(self.registros(), [])

    def test_entradas_invalidas_nao_abrem_conexao(self):
        for bruto in (None, True, [], {}, "NaN", "Infinity", "-1", "1.001", "100000000"):
            self.assertEqual(self.salvar(bruto=bruto).status_code, 400, bruto)
        for data in ("2030-02-30", "20300302", "02/03/2030", None):
            self.assertEqual(self.salvar(data=data).status_code, 400, data)
        for despesas in (None, "-1", "NaN"):
            self.assertEqual(self.salvar(despesas=despesas).status_code, 400)
        self.assertEqual(self.client.post("/Faturamento/calcular_dia", json=[]).status_code, 400)
        self.connect.assert_not_called()

    def test_resumo_ausente_incompleto_e_completo_em_uma_consulta(self):
        url = "/Faturamento/resumo_diario/2030-03-02"
        resposta = self.client.get(url)
        self.assertEqual(resposta.status_code, 200)
        self.assertFalse(resposta.json["existe"])
        self.assertIsNone(resposta.json["faturamento_bruto_diario"])
        self.assertEqual(resposta.json["taxa_imposto_atual"], "0.15")
        self.assertEqual(self.connect.call_count, 1)
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("INSERT INTO pg_temp.faturamento (dia_mes_ano, faturamento_bruto_diario) "
                            "VALUES ('2030-03-02', 1000)")
        self.assertIsNone(self.client.get(url).json["faturamento_liquido_diario"])
        self.editar()
        self.assertEqual(self.client.get(url).json["faturamento_liquido_diario"], "600.00")
        self.assertEqual(self.client.get("/Faturamento/resumo_diario/invalida").status_code, 400)

    def test_periodo_filtrado_inclusivo_e_listagem_antiga(self):
        for data in ("2030-03-01", "2030-03-02", "2030-03-03", "2030-04-01"):
            self.salvar(data)
        resposta = self.client.get("/Faturamento_geral?inicio=2030-03-02&fim=2030-03-03")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(len(resposta.json), 2)
        self.assertEqual(len(self.client.get("/Faturamento_geral").json), 4)
        self.assertEqual(self.client.get("/Faturamento_geral?inicio=2030-03-04&fim=2030-03-03").status_code, 400)
        self.assertEqual(self.client.get("/Faturamento_geral?inicio=2030-03-01").status_code, 400)

    def test_arredondamento_e_prejuizo(self):
        resposta = self.salvar(bruto="0.10", despesas="0.10")
        self.assertEqual(resposta.json["imposto_diario"], "0.02")
        self.assertEqual(resposta.json["faturamento_liquido_diario"], "-0.02")

    def test_estouro_dos_totais_reverte_segundo_dia(self):
        self.assertEqual(self.salvar(bruto="60000000", despesas="0").status_code, 200)
        antes = self.registros()
        self.assertEqual(self.salvar("2030-03-03", "60000000", "0").status_code, 500)
        self.assertEqual(self.registros(), antes)

    def test_lock_protege_ano_ate_commit_e_depois_libera(self):
        # Outra sessão verifica o lock real; não lê nem escreve dados financeiros.
        outra = self.real_connect(**self.config)
        self.addCleanup(outra.close)
        original = faturamento._atualizar_totais_periodo
        def conferir_lock(data, conn):
            with outra:
                with outra.cursor() as cur:
                    cur.execute("SELECT pg_try_advisory_xact_lock(%s, %s)", (20261003, 2030))
                    self.assertFalse(cur.fetchone()[0])
            original(data, conn)
        with patch("faturamento._atualizar_totais_periodo", side_effect=conferir_lock):
            self.assertEqual(self.salvar().status_code, 200)
        with outra:
            with outra.cursor() as cur:
                cur.execute("SELECT pg_try_advisory_xact_lock(%s, %s)", (20261003, 2030))
                self.assertTrue(cur.fetchone()[0])

    def test_consultas_mensais_nao_escrevem_e_preservam_contrato(self):
        self.salvar()
        self.salvar("2030-04-01", "200", "70")
        # xmin e ctid detectam UPDATE, mesmo quando os valores ficam iguais.
        def versoes():
            with self.conn:
                with self.conn.cursor() as cur:
                    cur.execute("SELECT xmin::text, ctid::text FROM pg_temp.faturamento ORDER BY dia_mes_ano")
                    return cur.fetchall()
        antes = versoes()
        self.connect.reset_mock()
        for rota, campo, valor in (
            ("/Faturamento/bruto/2030/3", "faturamento_bruto_mensal", "1000.00"),
            ("/Faturamento/liquido_mensal/2030/3", "faturamento_liquido_mensal", "600.00"),
            ("/Faturamento/despesas_diarias/2030/3", "despesas_mensais", "250.00"),
            ("/Faturamento/2030/3", "faturamento_bruto", "1000.00")):
            resposta = self.client.get(rota)
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta.json[campo], valor)
        self.assertEqual(self.connect.call_count, 4)
        self.assertEqual(versoes(), antes)
        self.assertEqual(self.client.get("/Faturamento/bruto/2030/5").json["faturamento_bruto_mensal"], "0")
        self.assertIsNone(self.client.get("/Faturamento/2030/5").json["faturamento_bruto"])
        self.assertEqual(self.client.get("/Faturamento/2030/13").status_code, 400)

    def test_posts_avulsos_uma_conexao_e_rollback(self):
        clock = self.enterContext(patch("calculo.hoje_negocio", return_value=date(2030, 3, 2)))
        self.salvar()
        for campo, valor in (("faturamento_bruto_diario", "1200"),
                             ("despesas_diarias", "300"), ("faturamento_liquido_diario", "-10")):
            rota = {"faturamento_bruto_diario": "bruto_diario", "despesas_diarias": "despesas_diarias",
                    "faturamento_liquido_diario": "liquido_diario"}[campo]
            self.connect.reset_mock()
            resposta = self.client.post("/Faturamento/" + rota,
                json={"dia_mes_ano": "2030-03-02", campo: valor})
            self.assertEqual(resposta.status_code, 409)
            self.assertEqual(self.connect.call_count, 1)
        antes = self.registros()
        self.assertEqual(antes[0][3], Decimal("600"))
        with patch("faturamento._atualizar_totais_periodo", side_effect=psycopg2.OperationalError("falha")):
            resposta = self.client.post("/Faturamento/despesas_diarias",
                json={"dia_mes_ano": "2030-03-02", "despesas_diarias": "400"})
            self.assertEqual(resposta.status_code, 409)
        self.assertEqual(self.registros(), antes)
        clock.return_value = date(2030, 3, 3)
        self.assertEqual(self.client.post("/Faturamento/bruto_diario",
            json={"dia_mes_ano": "2030-03-03", "faturamento_bruto_diario": "100"}).status_code, 404)

    def test_reenvio_igual_nao_atualiza_linhas_nem_agregados(self):
        self.enterContext(patch("calculo.hoje_negocio", return_value=date(2030, 3, 2)))
        self.salvar()
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("SELECT xmin::text, ctid::text FROM pg_temp.faturamento")
                antes = cur.fetchone()
        with patch("faturamento._atualizar_totais_periodo") as agregados:
            self.assertEqual(self.editar().status_code, 200)
            resposta = self.client.post("/Faturamento/despesas_diarias",
                json={"dia_mes_ano": "2030-03-02", "despesas_diarias": "250"})
            self.assertEqual(resposta.status_code, 409)
            agregados.assert_not_called()
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("SELECT xmin::text, ctid::text FROM pg_temp.faturamento")
                self.assertEqual(cur.fetchone(), antes)

    def test_datas_e_consulta_de_despesas_legadas(self):
        self.enterContext(patch("calculo.hoje_negocio", return_value=date(2030, 3, 2)))
        dados = {"dia_mes_ano": "2030-03-02"}
        self.assertEqual(self.client.post("/Faturamento/salvar_data", json=dados).status_code, 201)
        self.assertEqual(self.client.post("/Faturamento/salvar_data", json=dados).status_code, 200)
        self.assertEqual(len(self.registros()), 1)
        self.assertEqual(self.salvar().status_code, 409)
        self.assertEqual(self.editar().status_code, 200)
        resposta = self.client.get("/Faturamento/despesasdiarias/2/2030/3")
        self.assertEqual(resposta.json["despesas_mensais"], "250.00")
        self.assertEqual(resposta.json["despesas_diarias"], "250.00")
        self.assertEqual(self.client.get("/Faturamento/despesasdiarias/3/2030/3").status_code, 404)
        self.assertEqual(self.client.get("/Faturamento/despesasdiarias/30/2030/2").status_code, 400)
        for rota in ("bruto_diario", "despesas_diarias", "liquido_diario", "salvar_data"):
            self.assertEqual(self.client.post("/Faturamento/" + rota, json=[]).status_code, 400)
