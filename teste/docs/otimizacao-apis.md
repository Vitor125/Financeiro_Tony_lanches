# Otimização local das APIs — 03/10/2026

Estas alterações estão somente no PC. Nenhum deploy de backend ou frontend foi feito.

## Fechamento conjunto

`POST /Faturamento/calcular_dia` continua aceitando o contrato existente. O alias
`POST /Faturamento/fechamento_diario` executa a mesma operação:

```json
{
  "dia_mes_ano": "2030-03-02",
  "faturamento_bruto_diario": "1000.00",
  "despesas_diarias": "250.00"
}
```

O backend valida os valores, lê a taxa, calcula com Decimal e grava os três totais
diários com `INSERT ... ON CONFLICT (dia_mes_ano) DO UPDATE`. A criação da data já
faz parte dessa operação. O frontend recebe o fechamento e a taxa utilizada no
mesmo retorno. Não precisa consultar a taxa antes ou depois de salvar.

Uma conexão e uma transação abrangem o fechamento e os totais mensais/anuais.
Falha de cálculo, gravação ou agregação desfaz a transação inteira. A conexão é
fechada explicitamente. O código anterior fazia seis chamadas HTTP internas para
atualizar um dia e sete para criar um dia; agora faz zero chamadas HTTP internas.
O cliente CLI de `calculo.py` faz somente um POST autenticado.

Os totais mensais/anuais são recalculados em uma única query com agregação e
UPDATE. As comparações usam intervalos de data para aproveitar o índice existente.
Mantivemos as colunas agregadas do schema atual; isso ainda exige atualizar as
linhas do ano afetado. Não se trata de uma operação de custo constante para um
histórico ilimitado.

Um advisory lock transacional por ano serializa os fechamentos conjuntos que
compartilham agregados anuais, inclusive entre conexões/instâncias. A taxa é lida
com `FOR SHARE` para não ser alterada durante a transação. Isso privilegia a
consistência para o volume de um fechamento diário. As rotas avulsas antigas
continuam disponíveis por compatibilidade e não foram transformadas no novo
fluxo de cálculo conjunto; clientes devem usar o fechamento conjunto. Na revisão
seguinte, os POSTs avulsos também passaram a gravar o campo e os agregados em uma
transação, sem recalcular automaticamente outros valores diários.

O comportamento de commit/rollback e os locks seguem as documentações oficiais
do [Psycopg 2](https://www.psycopg.org/docs/usage.html#with-statement) e do
[PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS).

## Consultas

- `GET /Faturamento/resumo_diario/AAAA-MM-DD`: uma query retorna bruto, despesas,
  lucro, existência do dia e taxa global atual. Sem cadastro retorna 200, `existe:
  false` e valores financeiros nulos; não cria registros.
- `GET /Faturamento_geral?inicio=AAAA-MM-DD&fim=AAAA-MM-DD`: filtra no PostgreSQL
  um intervalo inclusivo, sem transferir todo o histórico. Ambos os parâmetros
  são obrigatórios quando um deles é informado.
- `GET /Faturamento_geral` sem parâmetros preserva a consulta anterior.
- Rotas antigas de consulta continuam disponíveis. O frontend atual usa o resumo
  diário e a listagem filtrada, sem depender de relatórios que escrevem em GET.

O lucro histórico salvo continua sendo somado. Uma mudança de taxa não recalcula
datas anteriores automaticamente; salvar novamente uma data usa a taxa atual.

## Precisão e limites

O schema consultado usa `NUMERIC(10,2)` e `UNIQUE (dia_mes_ano)`. Os novos POSTs
validam números finitos, não negativos, até R$ 99.999.999,99 e com até duas casas
decimais, antes de abrir conexão. Lucro negativo é permitido. Valores são enviados
como strings decimais, sem conversão para float no cálculo ou persistência.

O imposto é arredondado para centavos com `ROUND_HALF_UP`, antes de calcular o
lucro. Exemplo: bruto 0,10, despesas 0,10 e taxa 15% resultam em imposto 0,02 e
lucro -0,02. Isso define explicitamente uma regra que antes dependia do
arredondamento do banco. Os totais mensais/anuais têm o mesmo limite do schema;
se uma soma exceder esse limite, toda a gravação é revertida.

Um erro de rede pode acontecer depois de o servidor confirmar o commit no banco.
O frontend orienta consultar a data antes de repetir. Repetir o mesmo fechamento
substitui a linha por data, sem somar novamente os valores.

## Validação

Na pasta `teste/`:

```powershell
.\.venv\Scripts\python.exe -B .\tests\run_tests.py
node .\tests\test_api_unificada.js
node .\tests\test_auth_persistence.js
```

Os testes de integração usam exclusivamente tabelas e sequência TEMP em uma
conexão direta. Não escrevem registros persistentes nem consomem a sequência real.
Há cobertura de criação/atualização, rollback, taxa ausente/zero, valores inválidos,
arredondamento, prejuízo, totais e histórico, resumo ausente/incompleto, intervalos,
overflow e lock mantido até commit e liberado depois. O teste JS verifica uma
requisição por consulta diária, fechamento e período, além de contrato e token.

Não foi feito um teste visual completo nem uma implantação. Para experimentar
as mudanças, reinicie o Flask local e abra a interface em localhost. A versão
publicada permanece anterior: o frontend novo precisa do backend novo quando
uma publicação futura for autorizada.

## Revisão das demais rotas e consulta manual por período

- As consultas de bruto mensal, lucro mensal e despesas mensais agora fazem uma
  única consulta, em uma conexão, sem UPDATE. Antes, abriam até três conexões e
  gravavam agregações durante o GET. Mantêm suas chaves JSON e a resposta zero
  para soma ausente. O resumo mensal completo preserva os `null` anteriores.
- Os filtros mensais e a consulta antiga de despesas diárias usam intervalos ou
  igualdade de data, em vez de EXTRACT aplicado a cada linha. Os dados e o índice
  existentes são suficientes; não foram criados índices, tabelas ou serviços.
- Todos os POSTs avulsos usam Decimal, validam antes de conectar e compartilham o
  lock anual do fechamento. A gravação do campo e dos agregados é atômica. Lucro
  negativo continua permitido. Eles preservam a semântica de alterar apenas o
  campo solicitado, sem calcular novamente o lucro; o dashboard usa o POST conjunto.
- Reenviar os mesmos valores não faz UPDATE nem recalcula agregados. Cadastro
  duplicado de data retorna 200 sem duplicar; cadastro novo retorna 201. A consulta
  antiga de despesas retorna 404 quando ausente e mantém a chave antiga
  `despesas_mensais`, acrescentando `despesas_diarias`.
- Autenticação, CORS, healthcheck e a consulta/gravação da taxa já eram separados
  corretamente e não receberam consultas adicionais ou cache de autorização.
- Visão por período começa sem resultados, com a mensagem literal
  “clique ver mês completo para ver os dados”. Só o botão do formulário consulta
  a API: “Ver mês completo” ou “Aplicar período”. Abrir o painel, alterar mês,
  datas, modo ou atalho não consulta. Os resultados anteriores são ocultados e
  respostas pendentes são invalidadas para não mostrar um filtro antigo.

Validação desta revisão: 32 testes Python e três testes JavaScript passaram,
incluindo GETs sem escrita (xmin/ctid preservados), rollback dos POSTs avulsos,
reenvio sem UPDATE, contratos antigos e interação de período com resposta tardia.
Foi conferida a sintaxe JavaScript e a sincronização das três cópias do frontend.

Essas mudanças removem conexões, escritas e consultas automáticas. Não há uma
medição de latência ou projeção de faturamento em produção; custo e desempenho
reais dependem do uso. Não foram adicionados serviços ou tarefas em segundo plano.
# Bloqueio de datas futuras — 03/10/2026

Todas as rotas de gravação diária, inclusive salvar_data e as rotas legadas,
aceitam hoje e datas anteriores e recusam datas posteriores ao dia atual em America/Sao_Paulo, com HTTP
400 antes de abrir conexão. O cliente CLI aplica a mesma regra. Consultas GET
mantêm seu contrato; registros existentes não foram removidos.

O calendário diário começa em hoje e limita a seleção ao dia atual.
A interface também verifica a data antes de consultar ou enviar o formulário,
sem requisições adicionais. O backend é a validação definitiva. A dependência
tzdata fornece o fuso também no Windows. Cache local v18-no-future-dates, três cópias
da interface sincronizadas. Sem deploy.

Validação: 38 testes Python aprovados, com aceitação de hoje e bloqueio de futuro em todas as seis
rotas, ausência de conexão nas recusas, bloqueio no CLI e virada do dia de São
Paulo. Quatro testes JavaScript aprovados, incluindo limite do calendário e
ausência de consulta/gravação para datas bloqueadas. Integração usa tabelas TEMP.
## Aba de gestão de registros — 03/10/2026

Nova aba “Editar e excluir dados”, com busca manual por data usando o resumo
diário existente. PUT e DELETE compartilham `/Faturamento/registro/<data>` e exigem
autenticação, allowlist e os três valores originais consultados no campo `original`.
O backend compara sob lock do ano e lock da linha: ausência retorna 404 e mudança
de valores retorna 409. A edição nunca cria um registro ausente; usa o cálculo
compartilhado com a taxa atual, informada ao usuário. Só hoje/passado são editáveis.
A exclusão permite limpar registros futuros antigos e remove o fechamento inteiro.
Ambas atualizam os agregados na mesma conexão/transação, com rollback em falhas.
CORS permite PUT/DELETE somente nas origens configuradas.

Confirmação antes de editar/excluir, controles bloqueados durante gravação e nova
consulta exigida após erros. Não há GET automático ao abrir a aba ou após gravar:
PUT devolve o registro atualizado e DELETE devolve confirmação. Resultados de
período são invalidados para evitar totais antigos. Sem migração de banco ou serviços
adicionais. Exclusão é definitiva e a tela avisa que não pode ser desfeita.

43 testes Python e cinco testes JavaScript aprovados: edição/exclusão, todos os
agregados, última linha do mês/ano, rollback, registros ausentes/alterados, login,
datas e respostas atrasadas. Integração exclusivamente em tabelas TEMP. Inspeção
visual em 320 px e desktop sem overflow, com dados fictícios e uma consulta manual.
Três cópias sincronizadas, cache v19-manage-records. Sem deploy.
## Histórico exclusivamente pela gestão — 04/10/2026

POSTs diários antigos e CLI agora gravam somente hoje, no fuso de São Paulo.
Na principal, valores e botão ficam indisponíveis para datas passadas, com indicação
para usar “Editar e excluir dados”. Consulta de datas passadas continua permitida.

Na gestão, PUT aceita `nova_data` até hoje. Preserva o id do registro e recusa uma
data já ocupada com 409. Locks dos anos de origem/destino são adquiridos em ordem
crescente. Agregados dos dois períodos são atualizados na mesma transação, inclusive
mudanças de ano; uma falha no segundo período reverte toda a mudança. Salvar os
mesmos valores permite recalcular com a taxa atual. Uma data sem registro pode ser
adicionada via POST `/Faturamento/registro/<data>`, enviando `original: null`; se outra
sessão cadastrar antes, retorna 409 sem substituir seus valores.

48 testes Python e cinco testes JavaScript aprovados, incluindo bloqueio histórico
na principal, mudança entre meses/anos, preservação de id, destino ocupado, rollback
dos dois períodos, cadastro sem sobrescrita e recálculo após mudança da taxa.
Testes de integração somente em tabelas TEMP, sem alterar dados reais.
Cache v20-history-management. Sem deploy.
## Prazo de lançamento e leitura no celular — 04/10/2026

A principal agora permite um primeiro lançamento por data de hoje até sete dias
anteriores, inclusive, no fuso de São Paulo. Exemplo em 04/10: de 27/09 a 04/10.
POST calcular_dia/fechamento_diario retorna 409 se o dia já existir, inclusive para
reenvio idêntico. A verificação usa o mesmo lock anual das edições. POSTs avulsos
legados não alteram registros existentes; a gestão continua sendo a única área
para corrigir, recalcular ou mudar dados já registrados.

A tela mostra o prazo e bloqueia campos/botão após cadastrar ou fora da janela.
O link “Ir para Editar e excluir dados nesta data” abre a gestão com a mesma data
e consulta apenas ao ser acionado. Erro de gravação exige nova consulta antes de
reenviar, pois a conexão pode ter falhado após o commit. Não há polling adicional.

Fontes no celular aumentadas, com textos auxiliares em 15 px e botões em 16 px.
49 testes Python e cinco JavaScript aprovados: fronteira de sete/oito dias,
cadastro único, reenvio recusado sem alterar totais, gestão e link com data correta.
Visual em 320 px: sem overflow, aviso/link visíveis e botão bloqueado fora do prazo.
Testes TEMP, sem mudanças em dados reais. Cache v21-seven-day-launch; sem deploy.
