# Dados fictícios persistentes — Tony Lanches

Inserção solicitada pelo usuário em 02/10/2026. Estes lançamentos são exemplos de teste, não faturamento real da hamburgueria.

- Banco: PostgreSQL `Studies`, tabela `public.faturamento`.
- 18 registros criados pelas APIs reais: 01 a 12/03/2030 e 01 a 06/04/2030.
- Taxa preservada: 15%. Nenhum arquivo do backend foi modificado.
- A tabela tinha zero registros antes. Cada data foi consultada antes da criação; datas existentes seriam ignoradas.
- Os valores de cada lançamento foram conferidos por SELECT em uma conexão nova após o fechamento. A listagem da API retornou os mesmos 18 registros.
- Totais mensais das colunas do banco também foram conferidos.

| Mês fictício | Dias registrados | Faturamento bruto | Despesas | Lucro líquido |
| --- | ---: | ---: | ---: | ---: |
| Março/2030 | 12 | R$ 28.476,40 | R$ 12.735,65 | R$ 11.469,29 |
| Abril/2030 | 6 | R$ 16.150,40 | R$ 7.480,30 | R$ 6.247,54 |

Há exemplos de movimento normal, prejuízo e ausência de movimento. Em 06/03/2030, o líquido é -R$ 170,00; em 07/03/2030 os valores são zero; em 06/04/2030, o líquido é -R$ 100,00.

O adaptador instalado no front foi executado com GETs na API real. Foram conferidos os dois meses, os dias negativo/zerado e o intervalo personalizado de 05 a 08/03/2030. Isso valida os dados consumidos pelo front; não foi repetido um teste visual completo no navegador nesta etapa.

Para visualizar, abra `http://127.0.0.1:5000/static/tony-lanches/index.html` e selecione março ou abril de 2030 no painel mensal, ou escolha um período que inclua essas datas.

O recibo `dados-ficticios-tony-lanches.json` contém os IDs retornados pelo banco, datas, valores e estado de verificação de cada registro. O schema existente não possui uma marca de “fictício”; a identificação fica documentada neste recibo e no contexto. Nenhum lançamento foi apagado. Antes de uma operação futura de limpeza, use os IDs e confira se o registro ainda corresponde a estes valores de teste.
