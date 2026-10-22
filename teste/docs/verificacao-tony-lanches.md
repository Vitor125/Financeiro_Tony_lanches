# Verificação das APIs e PostgreSQL — 02/10/2026

Última consulta direta à API e ao banco: 18:38, horário de Brasília (21:38 UTC).

## Resposta objetiva

O fluxo principal das APIs funciona no teste de integração e a API viva acessa o PostgreSQL. O banco `Studies`, schema `public`, está acessível na porta 5432, com PostgreSQL 17.9.

**Neste momento, a tabela real `faturamento` tem zero registros.** `GET /Faturamento_geral` retorna `[]`, de acordo com o SELECT direto no banco. Há um registro real em `configuracao_imposto`: id 1, taxa 0.15 (15%). Isso comprova a configuração persistida e a conexão/leitura, mas não comprova um lançamento financeiro real já gravado.

O mecanismo de gravação foi validado com tabelas temporárias PostgreSQL. Não foram enviados POSTs à API real, inseridos lançamentos fictícios nas tabelas reais ou alteradas suas sequências.

## API viva e frontend servido

| Verificação em `http://127.0.0.1:5000` | Resultado |
| --- | --- |
| `GET /teste01` | HTTP 200; esta rota fake isoladamente não comprova o banco |
| `GET /Faturamento/taxa_imposto_atual` | HTTP 200; 0.15, conferido em SQL |
| `GET /Faturamento_geral` | HTTP 200; lista vazia, conferida em SQL |
| `GET /static/tony-lanches/index.html` | HTTP 200; conteúdo igual ao arquivo do projeto |
| `api.js`, `config.js`, `finance.js`, `sw.js`, manifesto pelo static | HTTP 200; hashes iguais aos arquivos do projeto |

A sintaxe dos seis arquivos JavaScript (`app.js`, `api.js`, `finance.js`, `sw.js`, `pwa.js`, `config.js`) passou na verificação. Não foi repetida uma instalação de PWA em celular real nem um teste de publicação HTTPS nesta etapa.

## Todas as rotas autorais exercitadas no ambiente isolado

O código de `faturamento.py` e `calculo.py` foi copiado sem mudança de bytes para o ensaio. Apenas a conexão e a URL das chamadas internas foram substituídas em memória, direcionando o cálculo para o servidor isolado na porta 5182.

As tabelas temporárias copiaram tipos, constraints e índices das tabelas reais usando `LIKE`. O default serial do id foi substituído por uma sequência **temporária**, evitando consumir ids da sequência real. As transações usaram o comportamento de commit do código original. Após cada fluxo foram feitas consultas SQL para conferir os valores. Ao encerrar a conexão, tabelas e sequência temporárias desapareceram.

| Método | Rota | Caso funcional |
| --- | --- | --- |
| GET | `/teste01` | 200 |
| GET | `/Faturamento/taxa_imposto_atual` | 200, taxa gravada ou ausente |
| POST | `/Faturamento/taxa_imposto_atual` | 200, gravação/alteração/campo opcional |
| POST | `/Faturamento/salvar_data` | 201, cria a data |
| GET | `/Faturamento/bruto_diario/<data>` | 200, lê bruto |
| POST | `/Faturamento/bruto_diario` | 200, grava bruto |
| GET | `/Faturamento/bruto/<ano>/<mes>` | 200, total mensal |
| POST | `/Faturamento/liquido_diario` | 200, grava líquido |
| GET | `/Faturamento/liquido_mensal/<ano>/<mes>` | 200, líquido mensal |
| POST | `/Faturamento/despesas_diarias` | 200, grava despesas |
| GET | `/Faturamento/despesas_diarias/<ano>/<mes>` | 200, despesas mensais |
| GET | `/Faturamento/despesasdiarias/<dia>/<ano>/<mes>` | 200 para dia existente; chave de resposta inconsistente |
| GET | `/Faturamento/dia_mes_ano/<data>` | 200, dia completo; 404 se ausente |
| POST | `/Faturamento/calcular_dia` | 200, criação/atualização e cálculo integrado |
| GET | `/Faturamento/<ano>/<mes>` | 200, resumo mensal |
| GET | `/Faturamento_geral` | 200, lista de registros |

As 16 operações foram cobertas por 38 verificações aprovadas do fluxo funcional e de validações específicas. Os seis testes existentes do imposto também passaram. Esses números não significam que todos os possíveis dados de entrada foram testados; os problemas abaixo foram observados em diagnósticos adicionais.

Exemplos conferidos diretamente em SQL temporário:

- Bruto 1.000, despesas 250, taxa 15%: líquido salvo 600.
- Criação de outro dia: bruto 200, despesas 70, líquido 100.
- Atualização do primeiro dia: bruto 1.200, despesas 300, imposto 180, líquido 720; continuou existindo apenas um registro para a data.
- Janeiro do ensaio: bruto mensal 1.400, despesas mensais 370, líquido mensal 820.
- Incluindo fevereiro: bruto anual 1.700 e líquido anual 1.025, conferidos nas colunas de agregação.
- Taxa zero: bruto 100, despesas 20, líquido 80.

## Problemas reproduzidos sem alterar o backend

1. **Salvamento parcial:** ao remover apenas a taxa temporária e executar o fechamento, a rota retornou 502, mas o banco temporário já continha bruto 100 e despesas 20, com líquido `NULL`. O fechamento não é uma única transação. A taxa real permaneceu 0.15.
2. **Faturamento negativo aceito:** o fechamento com bruto -100 e despesas 0 retornou 200. A API não aplica a mesma restrição de valor não negativo do front.
3. **Data duplicada:** repetir `POST /Faturamento/salvar_data` retornou 500. O fluxo integrado verifica a existência antes, mas a rota avulsa trata o conflito como erro interno.
4. **Consulta antiga de despesas sem registro:** retorna 500 (`NoneType` sem índice), em vez de indicar ausência. Para dia existente, retorna a despesa diária sob a chave `despesas_mensais`.
5. **Número inválido no fechamento:** `NaN` retornou 502. A entrada é recusada, mas a resposta é tratada como falha de consulta/salvamento.
6. **GETs de agregação fazem UPDATE:** as rotas específicas de bruto, líquido e despesas mensais alteram colunas de agregação ao serem consultadas. Foram exercitadas somente sobre tabelas temporárias nesta verificação. O front conectado utiliza `/Faturamento_geral` para os períodos.

Também continuam presentes as limitações já documentadas: dependência interna da porta 5000, `requests` ausente do arquivo de dependências e configuração de depuração apontando para `app.py` inexistente. Elas não impediram esta execução com o ambiente atual.

## Preservação e conclusão

Os hashes SHA-256 de `faturamento.py` e `calculo.py` permaneceram iguais antes e depois. Nenhuma correção da lógica foi aplicada.

A infraestrutura e o fluxo funcional de gravação estão validados nos limites acima. Para comprovar um lançamento financeiro persistente de uso real, será necessário salvar valores reais pelo dashboard e conferir o mesmo registro pela API e por SQL; esse lançamento não foi inventado nesta verificação. Use o dashboard servido pelo próprio Flask em `http://127.0.0.1:5000/static/tony-lanches/index.html`.

Evidências desta execução: `verificacao-api-postgres.json` e `verificacao-rotas-temporarias.json`, na pasta de outputs do Codex. Este relatório registra o estado observado nessa data; registros futuros podem mudar a contagem.
