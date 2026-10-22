# Contexto do projeto e da ideia

Este arquivo reúne o contexto atual do projeto, com base no código existente e no que foi identificado até agora. Ele serve como ponto de partida para continuar o desenvolvimento sem perder a visão geral da ideia.

## 1) Ideia principal

A ideia central é um sistema para controlar o faturamento diário de um negócio, com foco em:

- faturamento bruto diário;
- despesas diárias;
- cálculo de imposto sobre faturamento;
- cálculo de faturamento líquido;
- visualização por dia e por período;
- dashboard financeiro com indicadores de lucro, margem e resumos mensais.

O nome do produto identificado no front-end é "Tony Lanches" e o app foi pensado como um dashboard financeiro de gestão da operação.

## 2) Arquitetura identificada

### Front-end

O front-end está em `Frontend/` e é composto por:

- `index.html`: estrutura da interface;
- `styles.css`: visual responsável e layout do dashboard;
- `app.js`: lógica de cálculo, renderização e interações;
- `api.js`: adaptador de comunicação com a API;
- `config.js`: configuração de modo demo ou API;
- `pwa.js`, `sw.js`, `manifest.webmanifest`: suporte para PWA / instalação em tela inicial.

A interface foi desenhada como um dashboard financeiro com:

- painel diário;
- painel por período;
- filtros por mês e intervalo de datas;
- métricas de faturamento bruto, despesas e lucro;
- gráfico de distribuição de despesas;
- suporte para uso offline em modo demo.

### Backend

O backend principal está em `faturamento.py` e usa Flask + PostgreSQL.

Ele expõe rotas relacionadas a:

- imposto atual (`/Faturamento/taxa_imposto_atual`);
- salvamento de data (`/Faturamento/salvar_data`);
- faturamento bruto diário (`/Faturamento/bruto_diario`);
- despesas diárias (`/Faturamento/despesas_diarias`);
- faturamento líquido diário (`/Faturamento/liquido_diario`);
- leitura por data e por filtros de período.

O projeto usa banco PostgreSQL com conexão configurada em `DB_CONFIG`, com banco `Studies`, host `localhost`, porta `5432`, usuário `postgres` e senha `postgres`.

## 3) Lógica de negócio atual

O código atual mostra que a ideia envolve cálculos financeiros como:

- faturamento bruto diário;
- despesas diárias;
- taxa de imposto atual;
- imposto diário = taxa_imposto * faturamento_bruto;
- faturamento líquido diário = faturamento_bruto - imposto - despesas_diarias.

A rotina `calcular_dia()` do arquivo `teste/calculo.py` faz o seguinte:

1. valida faturamento e despesas;
2. verifica se a data já existe; se não existir, salva a data;
3. envia faturamento bruto e despesas para a API;
4. busca o faturamento e as despesas gravados pela API;
5. busca a taxa de imposto atual;
6. calcula imposto e faturamento líquido;
7. salva o valor líquido diario;
8. retorna um resumo em JSON com os resultados calculados.

## 4) Status do que já foi implementado

Até o momento, o projeto já apresenta:

- backend Flask com endpoints de faturamento e imposto;
- conexão com PostgreSQL para persistência de dados;
- cálculo de faturamento líquido;
- front-end web/dash com layout financeiro e indicadores;
- suporte a PWA / instalação em tela inicial;
- modo demo em localStorage;
- script Python de cálculo diário consumindo a API.

## 5) Observações importantes

- O front-end foi pensado para funcionar em modo demo e em modo API.
- O README do front-end indica contratos sugeridos para API REST, com datas em `YYYY-MM-DD` e valores em centavos.
- A aplicação foi desenhada para operar com dados financeiros reais, com foco em controle de caixa e margem de lucro.
- O backend e o front-end evoluíram em paralelo, seguindo uma proposta de dashboard financeiro com foco em operação comercial.

## 6) Resumo executivo

A ideia é um dashboard financeiro para controle do faturamento e das despesas diárias, com potencial para evolução em um painel completo de gestão operacional. O sistema já mostra uma estrutura madura o suficiente para uso em protótipo ou versão inicial, com backend em Flask, banco PostgreSQL, interface PWA e script de cálculo.

## 7) Próximo passo sugerido

Se a intenção for continuar o desenvolvimento, o próximo passo mais natural é consolidar o contrato entre frontend e backend, validar o fluxo completo de cadastro de datas, faturamento, despesas e cálculo de líquido, e depois expandir a interface para relatórios mensais e por período com maior rigor.

## 8) Atualização da análise e integração — 02/10/2026

Esta seção atualiza o estado descrito acima. As seções 1 a 7 foram preservadas como histórico; descrições antigas de demo, categorias, contrato sugerido e integração não representam a versão preparada abaixo.

### Pedidos e decisões do usuário

- Dashboard Tony Lanches com logo fornecida e paleta amarela, vermelha, preta e branca.
- Dois painéis: fechamento diário e consulta de um mês completo ou intervalo de datas.
- No fechamento, informar apenas faturamento bruto e total de despesas do dia, sem tipo de despesa.
- Usar o título “Lucro do dia” e mostrar o somatório de despesas diário.
- Interface responsiva para celular, código comentado e estrutura de webapp/PWA.
- O backend deve seguir a ideia do usuário. Não modificar sua lógica para acomodar o front.
- Distinguir trabalho preparado, testado, aplicado e publicado; não declarar resultados que não foram verificados.

### O que o backend existente realmente oferece

O fechamento é um registro por data, com total de faturamento e total de despesas. Atualizar a mesma data substitui os totais; não há um cadastro de despesas individuais nem de categorias.

`calculo.py` usa `Decimal` e a taxa global atual: imposto = bruto × taxa; líquido = bruto − imposto − despesas. A rotina consulta/cria a data, grava bruto e despesas, consulta os valores e a taxa, calcula e grava o líquido. O front preparado chama essa rotina por `POST /Faturamento/calcular_dia`, em vez de persistir um cálculo paralelo.

Contrato utilizado na integração:

| Operação | Rota | Uso no front preparado |
| --- | --- | --- |
| Consultar dia | `GET /Faturamento/dia_mes_ano/<YYYY-MM-DD>` | Carregar os totais; 404 significa data ausente |
| Fechar dia | `POST /Faturamento/calcular_dia` | Enviar `dia_mes_ano`, `faturamento_bruto_diario` e `despesas_diarias`, com valores em reais |
| Consultar registros | `GET /Faturamento_geral` | Filtrar mês ou período inclusivo na interface |
| Consultar imposto | `GET /Faturamento/taxa_imposto_atual` | Ler a fração atual, por exemplo 0.15 para 15% |
| Alterar imposto | `POST /Faturamento/taxa_imposto_atual` | Gravar a taxa quando o usuário solicitar |

A API não oferece uma rota específica para intervalo arbitrário. A integração filtra a consulta geral, preservando o líquido histórico salvo; não reaplica a taxa atual ao passado. Strings Decimal em reais e datas GMT retornadas pelo Flask são normalizadas. Valores `null` são apresentados como pendentes, sem convertê-los em zero.

### Frontend preparado

A versão conectada foi criada em `C:\Users\vitor_xtky86h\Documents\Codex\2026-10-02\cri\outputs\tony-lanches-conectado` e foi copiada para `integracao/frontend-flask/` durante a organização. Na leitura inicial desta etapa, a aplicação ainda não estava presente. Na conferência final, todos os arquivos de `Frontend/` e `static/tony-lanches/` corresponderam por hash ao pacote conectado. Também foi encontrado o backup `Frontend-backups/20261002-180010-6553`. O processo de organização não executou o instalador; não foi atribuído um autor para essa aplicação observada entre as verificações. A integração agora está aplicada nos arquivos da pasta original; isso não comprova um salvamento na base real nem publicação HTTPS.

Arquivos principais da versão preparada:

- `index.html` e `styles.css`: identidade visual, dois painéis, formulário com os dois totais, imposto e indicadores diário/mensal.
- `app.js`: interações, consultas, salvamento e estados de erro/pendência; comentários em português.
- `api.js`: GETs e POSTs das rotas reais, mensagens de erro e timeout; sem fallback para dados fictícios.
- `finance.js`: normalização monetária/de datas e somatórios com pendências explícitas.
- `config.js`: API na mesma origem, com URL base vazia; timeout de 45 segundos.
- `pwa.js`, `sw.js`, `manifest.webmanifest`: suporte existente de PWA ajustado para o caminho estático; o cache não guarda operações da API.
- `README.md`: contrato, execução, limites e instruções de aplicação.
- `aplicar-front.ps1`: instala apenas o front, faz backup e verifica hashes de `faturamento.py` e `calculo.py`.

Como a API atual não envia os cabeçalhos CORS necessários para outra origem, a versão preparada usa o static padrão do Flask. Depois da aplicação, a URL prevista é `http://127.0.0.1:5000/static/tony-lanches/index.html`. Abrir o front em Vite/outra porta não equivale a essa configuração.

### Validação realizada e limites da evidência

- Foram lidos o contexto e os arquivos autorais de código, configuração e documentação. `.venv`, caches e imagens não foram interpretados como código da ideia.
- A API real respondeu às consultas de imposto e registros. A taxa observada foi 0.15. A lista mudou entre consultas; não foi atribuída uma causa nem um autor para a mudança.
- Nenhum POST foi feito na base real durante a validação anterior.
- Os testes de escrita usaram cópias byte a byte do backend, servidor isolado e tabelas temporárias PostgreSQL. A conexão e a URL interna foram redirecionadas somente em memória para isolar o teste.
- Foram validados consulta diária, data ausente, valores incompletos, criação/atualização, taxa zero, taxa de 15%, filtros inclusivos e soma do líquido histórico.
- No navegador de teste, R$ 1.000,00 de bruto e R$ 250,00 de despesas retornaram R$ 150,00 de imposto e R$ 600,00 líquidos.
- A interface foi verificada em largura de 320 px. Instalação em aparelho real e publicação HTTPS não foram verificadas.
- Os hashes dos dois arquivos principais do backend foram conferidos e permaneceram iguais.

### Limitações identificadas, sem alteração do backend

- `calculo.py` chama internamente `127.0.0.1:5000`; mudar a porta externa exige considerar essa dependência.
- O fechamento usa várias transações; uma falha posterior pode deixar dados parcialmente salvos. O front informa o erro e orienta consultar o dia antes de tentar novamente.
- `requirements.txt` não declara `requests`, apesar dos imports; a biblioteca estava instalada no ambiente examinado.
- A depuração em `.vscode/launch.json` aponta para `app.py`, inexistente. Esse arquivo de configuração foi preservado; o servidor é `faturamento.py`.
- O SQL fornecido cria a configuração de imposto, mas não documenta o schema completo de faturamento. Não foi comprovado que uma instalação nova tenha todas as tabelas/colunas.
- Algumas rotas antigas de relatório fazem escritas em GET. A integração utiliza a consulta geral para evitar depender delas.
- Não foi criada autenticação, cadastro de despesas individuais ou nova funcionalidade de backend.

## 9) Organização dos arquivos — 02/10/2026

A pasta de aplicação continua sendo `teste/`; ela não foi renomeada, evitando quebrar o ambiente virtual e os caminhos existentes da IDE.

```text
ideia/
├── README.md
└── teste/
    ├── contexto_ideia.md             # Histórico e estado atual do projeto
    ├── README.md                     # Mapa, execução e validação
    ├── faturamento.py                # Backend preservado no mesmo caminho
    ├── calculo.py                    # Lógica preservada no mesmo caminho
    ├── requirements.txt              # Dependências originais preservadas
    ├── Frontend/                     # Front conectado conferido por hash
    ├── static/tony-lanches/           # Cópia conectada servida pelo Flask
    ├── Frontend-backups/              # Backups existentes da aplicação do front
    ├── tests/
    │   ├── test_taxa_imposto_atual.py  # Teste original, sem editar conteúdo
    │   └── taxa_imposto_atual.sql     # Mantido ao lado do teste que o lê
    ├── prototipos/
    │   ├── teste.html                # Protótipo anterior
    │   └── calculo_2.py               # Arquivo vazio anterior
    ├── docs/
    │   └── analise-projeto-tony-lanches.md
    ├── integracao/
    │   └── frontend-flask/            # Versão conectada preparada + instalador
    ├── backups/
    │   └── contexto/                 # Cópia do contexto anterior à atualização
    ├── .vscode/                      # Configurações existentes preservadas
    ├── .venv/                        # Ambiente existente preservado
    └── __pycache__/                  # Cache existente, não apagado
```

O teste e o SQL foram movidos juntos porque o teste usa `Path(__file__).with_name(...)`. Execute a descoberta a partir de `teste/`: `.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`. Os seis testes passaram tanto na cópia de ensaio quanto na pasta original já organizada. A execução final usou `-B` para não gravar caches Python. Os hashes do backend, dependências, teste, SQL e configurações da IDE foram preservados.

Não houve exclusão de arquivos nem mudança de lógica do backend. A organização preservou a versão do front encontrada no momento dos movimentos. Para reaplicar o pacote de integração, a partir de `teste/`, execute `powershell -NoProfile -ExecutionPolicy Bypass -File .\integracao\frontend-flask\aplicar-front.ps1` e confira o resultado. O script copia sua fonte em `integracao/frontend-flask/` para `Frontend/` e `static/tony-lanches/`. Editar somente `Frontend/` não atualiza automaticamente a cópia estática; uma reaplicação também substitui esse diretório pela versão do pacote.

Próximos passos: conferir o fluxo com dados reais autorizados; resolver dependências/schema/configuração de depuração quando o usuário decidir alterar o backend ou seu ambiente; verificar HTTPS e instalação em celular antes de afirmar que a publicação foi concluída. A análise copiada para `docs/` é o retrato da etapa anterior; para o estado atual da aplicação e organização, prevalecem as seções 8 e 9 deste contexto.

## 10) Verificação das APIs e PostgreSQL — 02/10/2026, 18:38

- API viva em `127.0.0.1:5000`: consulta de imposto, listagem geral e arquivos estáticos responderam HTTP 200. Os arquivos servidos corresponderam por hash aos arquivos do projeto.
- PostgreSQL 17.9 em `localhost:5432`, banco `Studies`, schema `public`: conexão e consultas diretas confirmadas.
- A tabela real `configuracao_imposto` contém id 1 e taxa 0.15 (15%). A tabela real `faturamento` tinha **zero registros**; a API retornou `[]`, igual ao SELECT SQL. Não há evidência de um lançamento financeiro real gravado nesse momento.
- O fluxo de escrita foi exercitado com cópias idênticas dos arquivos Python, conexão redirecionada somente em memória e tabelas temporárias que copiaram tipos, constraints e índices das tabelas reais. Uma sequência temporária substituiu o default serial, preservando a sequência real.
- As 16 operações autorais da API foram exercitadas. Foram aprovadas 38 verificações de fluxo/validações específicas; os seis testes existentes também passaram. A sintaxe dos seis arquivos JavaScript foi conferida.
- Exemplo em PostgreSQL temporário: bruto 1.000, despesa 250 e taxa 15% gravaram líquido 600. Atualização e totais mensais/anuais também foram conferidos por SELECT após commits.
- Problemas adicionais reproduzidos: bruto negativo aceito com 200; data duplicada na rota avulsa retorna 500; consulta antiga de despesas sem data retorna 500 e usa chave inconsistente para dias existentes; `NaN` no fechamento retorna 502; fechamento sem taxa retorna 502, porém deixa bruto e despesas gravados com líquido nulo.
- Nenhum POST foi feito na API viva nesta verificação. Nenhum lançamento fictício, alteração de taxa ou consumo de sequência ocorreu nas tabelas reais. Os dois arquivos principais do backend permaneceram com os mesmos hashes.
- Relatório detalhado: `docs/verificacao-tony-lanches.md`. Um salvamento real de faturamento ainda precisa ser comprovado com valores reais autorizados; não confundir os testes temporários com registros permanentes.

## 11) Dados fictícios gravados no banco real — 02/10/2026

O usuário solicitou inserir dados fictícios para testar. Foram criados 18 lançamentos persistentes em `Studies.public.faturamento`, pelas rotas existentes `/Faturamento/salvar_data` e `/Faturamento/calcular_dia`.

- Datas de teste: 01 a 12/03/2030 e 01 a 06/04/2030, separadas do período atual da operação.
- A tabela tinha zero registros antes da inserção e passou a ter 18. Cada data foi consultada antes da criação; registros preexistentes seriam ignorados.
- A taxa global de 15% foi mantida. Nenhum arquivo do backend nem schema foi alterado.
- Valores diários e agregações mensais foram conferidos por SELECT em conexões novas, comprovando a persistência após commit. O GET geral também retornou os 18 registros.
- Março/2030: bruto R$ 28.476,40, despesas R$ 12.735,65, líquido R$ 11.469,29.
- Abril/2030: bruto R$ 16.150,40, despesas R$ 7.480,30, líquido R$ 6.247,54.
- Foram incluídos dias com lucro, prejuízo e zero movimento. O adaptador real do front validou os meses, os dias negativos/zerado e um período personalizado, usando somente GETs depois da inserção.
- Estes valores são **fictícios**, apesar de estarem fisicamente gravados na base real. O schema não tem um campo de marcação de teste; consulte `docs/dados-ficticios-tony-lanches.json` para os IDs, datas e valores exatos.
- Documento de uso: `docs/dados-ficticios-tony-lanches.md`. Para ver no dashboard, selecione março/abril de 2030. A constatação de tabela vazia da seção 10 é histórica e foi superada por esta inserção autorizada.

## 12) Troca da conexão para Neon — 02/10/2026

O usuário informou um novo banco PostgreSQL Neon: `Financeiro_Tony_lanches`. A conexão fornecida foi salva apenas no `.env` local, ignorado pelo `.gitignore`. Não registrar a senha no contexto, no front ou em documentos de entrega.

- `database_config.py` carrega `DATABASE_URL` preservando `sslmode=require` e `channel_binding=require`. O cliente confirmou TLS 1.3. Ambiente de hospedagem tem precedência sobre `.env`.
- Em `faturamento.py`, apenas o bloco de configuração foi substituído por importação de `DB_CONFIG`. Todas as funções/decorators permaneceram iguais por AST; `calculo.py` permaneceu igual por bytes. Essa alteração de configuração atende ao novo pedido de banco, sem mudar a lógica da ideia.
- `requirements.txt` agora declara `requests` e `python-dotenv` além das dependências anteriores; ambas estavam instaladas. Foi criado `.env.example` sem credenciais.
- O Neon já tinha uma linha de faturamento. A tabela ausente `configuracao_imposto` foi criada com o SQL existente, e a taxa atual de 15% foi preservada. A linha de faturamento existente não foi alterada.
- A API viva retornou 200 para listagem, imposto e consulta diária; a listagem foi comparada ao SELECT do Neon, confirmando que o Flask em execução passou a usar o banco novo.
- O único lançamento observado, de 11/12/2026, tem bruto R$ 2.000,00, despesas e líquido ainda nulos. Trata-se de registro incompleto; não afirmar lucro nem transformar pendência em zero.
- Os 18 dados fictícios da seção 11 continuam apenas no banco local `Studies`; não foram migrados ao Neon neste pedido.
- Os seis testes existentes passaram com tabelas temporárias usando a conexão direta ao mesmo Neon. O pooler da aplicação permanece configurado. Use `.\.venv\Scripts\python.exe -B .\tests\run_tests.py` para os testes, pois o runner troca apenas em memória o hostname pooled pelo direto e evita dependência de sessão temporária no pooler.
- Relatório: `docs/configuracao-neon-tony-lanches.md`. Backup da configuração anterior: `backups/configuracao/`. Reiniciar Flask após editar `.env` quando não houver recarga automática.

## 13) Opção Atualizar taxa de imposto — 02/10/2026

- A área expansível de imposto e seu botão agora exibem “Atualizar taxa de imposto”.
- O usuário informa a nova porcentagem, confirma a alteração e o front chama o POST já existente `/Faturamento/taxa_imposto_atual`.
- Durante o envio, o botão mostra “Atualizando…”. Após a resposta, a taxa atual é consultada novamente; se a API informar que o valor já era o atual, a mensagem indica que a taxa foi mantida.
- Campo vazio continua preservando a taxa atual, e o histórico não é recalculado automaticamente.
- `Frontend/`, `static/tony-lanches/` e `integracao/frontend-flask/` foram sincronizados. O cache PWA passou para `v5-tax-update`.
- Foi conferida a sintaxe dos arquivos JavaScript alterados. Nenhuma taxa real foi mudada para testar esta alteração de interface; o backend permaneceu intacto.

## 14) Ajustes de interface e publicação — 02/10/2026

- O seletor de data do fechamento foi colocado dentro do cartão “Fechamento do caixa”, preservando `#daily-date` e o fluxo existente de consulta e salvamento. O Hosting foi publicado.
- A confirmação de salvamento passou a exibir “Salvo com sucesso!”. As mensagens de erro da interface foram reescritas em linguagem voltada ao cliente; detalhes da falha permanecem no console para diagnóstico. A versão do cache PWA foi atualizada para `v8-customer-messages` nessa publicação.
- A tipografia de elementos auxiliares em telas de até 620 px foi aumentada discretamente (em geral, 1 px). Os campos mantiveram 16 px para evitar zoom automático do Safari. CSS e service worker foram sincronizados e publicados; o cache passou a `v9-mobile-type`.
- Os rótulos visíveis de resultado foram trocados para “Lucro diário” e, quando negativo, “Prejuízo diário”. Nos agregados, a interface usa “Lucro do período” ou “Lucro do mês”. A fórmula e os textos de ajuda também usam “lucro”.
- A troca de nomenclatura é exclusivamente visual: não altera a API, cálculos, tabelas ou campos do banco (`faturamento_liquido_diario` permanece o nome técnico). O formulário não exibe mais a palavra “líquido”.
- O cache PWA foi atualizado novamente para `v10-profit-labels`. `index.html`, `app.js` e `sw.js` foram sincronizados entre `Frontend/`, `static/tony-lanches/` e `integracao/frontend-flask/`.
- A sintaxe JavaScript foi validada. O deploy final do Firebase Hosting foi concluído em `https://financeiro-tony-lanches.web.app`; os arquivos publicados foram conferidos e contêm os rótulos “Lucro diário”, “Lucro do mês” e os rótulos dinâmicos do período, sem exibir “líquido” nos textos da tela. Não foi necessário alterar nem publicar o Cloud Run.

## 15) Otimização local das APIs — 03/10/2026

O usuário autorizou otimizar consultas e reunir os POSTs de faturamento e despesas,
com a restrição explícita de não fazer deploy até nova autorização.

- O fechamento conjunto mantém `/Faturamento/calcular_dia` e adiciona o alias
  `/Faturamento/fechamento_diario`. Usa Decimal, upsert pela data e uma conexão/
  transação para bruto, despesas, lucro e agregados. Não faz HTTP interno.
- O schema consultado tem `UNIQUE (dia_mes_ano)` e valores `NUMERIC(10,2)`.
  Nenhuma migração ou alteração de registros persistentes foi feita.
- O imposto é arredondado para centavos com ROUND_HALF_UP antes de calcular o
  lucro. Valores inválidos são rejeitados antes da conexão.
- A agregação mensal/anual usa uma única query. Advisory lock por ano protege
  os fechamentos conjuntos concorrentes; as rotas avulsas seguem legadas.
- `/Faturamento/resumo_diario/<data>` reúne fechamento e taxa em uma consulta.
  `/Faturamento_geral` aceita início/fim (`inicio`, `fim`) para filtrar no banco.
- O frontend faz uma requisição por consulta diária ou salvamento. Usa intervalo
  filtrado no servidor. O cache local passou a `v11-unified-api`.
- Documentação e testes: `docs/otimizacao-apis.md`. Testes de integração usam
  tabelas e sequência temporárias, sem gravações financeiras persistentes.
- Nada desta etapa foi publicado. As seções anteriores permanecem como histórico.

## 16) Demais rotas e período sob demanda — 03/10/2026

O usuário pediu estender as otimizações, priorizando qualidade e evitando aumento
de carga/custo. O bloqueio de deploy continua vigente.

- As rotas mensais passaram a fazer apenas SELECT, sem gravar agregações em GET.
  Usam intervalos de data indexáveis, uma query e uma conexão.
- POSTs avulsos agora salvam campo e agregados na mesma transação e usam o lock
  anual. Mantêm a alteração apenas do campo pedido; o fluxo conjunto calcula o lucro.
- Reenvios iguais não executam UPDATE nem recalculam agregados. A criação de data
  trata duplicação sem erro interno. A consulta antiga de despesas foi corrigida
  para 404 quando ausente e mantém a chave antiga por compatibilidade.
- A visão por período só consulta ao enviar o formulário pelo botão. Abrir o
  painel ou trocar filtros apenas mostra “clique ver mês completo para ver os dados”
  (ou a orientação de Aplicar período). Respostas de filtros antigos são ignoradas.
- Validação: 32 testes Python e três JavaScript aprovados, com tabelas temporárias
  e testes de interação/contrato. Não foi feito deploy ou teste de carga em produção.

## 17) Limpeza com backup — 03/10/2026

O usuário autorizou apagar código sem uso, exigindo backup antes das exclusões.

- Backup: `backups/limpeza-20261003-codigo-obsoleto/`, preservando caminhos relativos.
  `manifesto.json` registra arquivos, tamanhos e SHA256. Inclui os diretórios
  removidos e os originais dos arquivos editados, antes da retirada de trechos.
- Removidos: `Financeiro_Tony_lanches/Frontend/` (versão antiga sem autenticação),
  `teste/prototipos/` e `teste/Frontend/public/` (páginas de exemplo não publicadas).
- Retirados a rota fictícia `/teste01`, o método JS `getTax()` sem chamadas, o
  estado global de taxa redundante, o ramo demo inexistente e o caminho de
  abertura de nova conexão na agregação que não tinha mais chamadores.
- Mantidos rotas de compatibilidade, frontend de Hosting, static do Flask,
  pacote de integração, testes, backups anteriores e históricos Git.
- Frontend sincronizado com cache `v13-code-cleanup`. 32 testes Python e três
  JavaScript aprovados depois da limpeza. Nenhum deploy ou exclusão de dados do banco.

## 18) Segunda revisão de código sem uso — 03/10/2026

- Backup prévio de CSS, configuração, service worker das três cópias e deste
  contexto: `backups/limpeza-20261003-estilos-sem-uso/`, com manifesto SHA256.
- Removidas 18 regras CSS de elementos ausentes no HTML e no JavaScript: abas
  antigas, categorias, identificação de lançamentos e barras de distribuição.
- Retirada a opção `mode: 'api'`, sem consumidores após a remoção do modo demo.
- Conferido que todas as demais regras CSS permanecem iguais. Três testes
  JavaScript aprovados; configuração e service worker passaram na sintaxe.
- Cópias sincronizadas, cache `v14-unused-styles`. Nenhum deploy feito.

## 19) Prioridade dos painéis no celular — 03/10/2026

- Até 620 px: seletor de data no início; calculadora antes do relatório e dos
  indicadores para hoje, datas futuras e datas passadas sem registro.
- Ao consultar uma data passada com fechamento existente, relatório, indicadores
  e tabela precedem a calculadora. Não há painel separado de consulta.
- Os mesmos elementos são reordenados no DOM, sem duplicação, para alinhar ordem
  visual, leitura e navegação. Ao ampliar a tela, a estrutura desktop é restaurada.
- Nenhuma requisição adicional foi criada. Quatro testes JavaScript passaram,
  incluindo troca de largura, valores preservados e ausência de chamadas no resize.
- Teste visual em Chrome com dados fictícios locais: 320/390 px sem overflow;
  hoje/calculadora primeiro, histórico/relatório primeiro, ausência/calculadora
  primeiro e estrutura desktop preservada. Não houve escrita na API real.
- Três cópias do frontend sincronizadas e cache `v15-mobile-daily-order`.
  Nenhum deploy foi feito.

## 20) Botões de navegação — 03/10/2026

- Textos alterados para “Calculo diário” e “Consultar mês e período”, também
  nos títulos e rótulos dos painéis para manter identificação consistente.
- Botão inativo com fundo cinza escuro, borda e texto claro; ativo permanece
  amarelo. Estados de hover e foco mantidos, com texto adaptável à largura.
- Quatro testes JavaScript aprovados e inspeção visual em 320/390 px sem overflow.
- Cópias locais sincronizadas, cache `v16-navigation-buttons`. Sem deploy.
# Regra atual de datas — 03/10/2026

Gravações diárias aceitam hoje e datas anteriores no fuso America/Sao_Paulo.
Somente datas futuras são recusadas com HTTP 400 antes do
banco em todas as seis rotas, inclusive legadas. CLI segue a mesma regra.
Calendário diário inicia em hoje, com limite máximo no dia atual e mensagem de orientação.
Consultas preservadas; dados existentes não foram apagados. Dependência tzdata
incluída para Windows. Três cópias sincronizadas e cache v18-no-future-dates.
38 testes Python e quatro JavaScript passaram. Nenhum deploy foi feito.
## 21) Editar e excluir dados — 03/10/2026

- Terceira aba com consulta manual por data, edição de bruto/despesas e exclusão
  do fechamento completo, sempre com confirmação. Lucro usa a taxa atual ao editar.
- PUT/DELETE `/Faturamento/registro/<data>` autenticados, uma conexão/transação,
  lock do ano e da linha, comparação dos valores originais (409 se alterados).
  Ausentes retornam 404, sem recriação acidental. Totais do mês/ano recalculados.
- Datas futuras não são editáveis, mas registros futuros antigos podem ser excluídos.
- Sem consultas automáticas/polling; resultados antigos são invalidados após mudanças.
- 43 testes Python e cinco JavaScript aprovados. Testes TEMP, sem apagar dados reais.
  Visual 320 px e desktop conferido sem overflow. Cache v19-manage-records.
  Três cópias locais sincronizadas. Nenhum deploy.
## 22) Alteração de datas e histórico na gestão — 04/10/2026

- Aba principal, POSTs diários e CLI salvam apenas hoje; passado vira consulta com
  botão/valores indisponíveis e orientação para usar a gestão.
- Gestão permite alterar valores, recalcular com taxa atual, mudar data para um
  dia livre até hoje e excluir. Mudança preserva id, protege destino ocupado e
  atualiza origem/destino na mesma transação, inclusive entre anos.
- Data sem registro pode ser adicionada na gestão por POST com `original: null`;
  consulta seguida de cadastro concorrente não é sobrescrita.
- 48 testes Python e cinco JavaScript aprovados; TEMP sem mudanças em dados reais.
  Cache v20-history-management. Três cópias sincronizadas. Nenhum deploy.
## 23) Sete dias para primeiro lançamento — 04/10/2026

- Principal aceita hoje e sete dias anteriores inclusive, somente para datas sem
  registro. Depois de lançar, edição e recálculo ficam na gestão; backend retorna
  409 ao reenviar um fechamento existente. POSTs avulsos também não o alteram.
- Aviso do prazo e link direto para gestão da data selecionada quando bloqueado.
- Fontes mobile ampliadas: textos auxiliares 15 px, botões 16 px, linhas mais abertas.
- 49 testes Python e cinco JavaScript aprovados. Visual em 320 px sem overflow.
  TEMP sem mudanças em dados reais. Três cópias sincronizadas, cache v21-seven-day-launch.
  Nenhum deploy.

## 24) Auditoria completa e publicação autorizada — 04/10/2026

O usuário autorizou a publicação ao final da revisão de segurança, bugs,
organização, estrutura e arquitetura, e pediu o registro do trabalho aqui e
as cotas do Cloud Run na memória. Isso substitui o bloqueio anterior de deploy.

### Correções e manutenção

- Autenticação extraída para `autenticacao.py`, inicialização Firebase protegida
  por lock, tokens revogados e allowlist continuam obrigatórios. Backend mantém
  rotas/contratos, cálculo Decimal puro e acesso ao Neon em módulos separados.
- Erros SQL deixam de retornar detalhes internos; logs preservam diagnóstico.
  Corpo de requisição limitado a 16 KiB, erro 413 em JSON e cabeçalhos defensivos.
- Primeiro lançamento usa INSERT sem sobrescrever; edição usa UPDATE e snapshot
  dos valores originais. Registro de data antigo também usa lock do ano.
  Fechamentos, mudanças de data e agregados permanecem na mesma transação.
- Taxa entre 0 e 100%, com precisão limitada; validação no frontend e backend.
  Banco com limites de tempo de consulta/lock e captura específica de erros.
- Login com prazo de validação e possibilidade de tentar novamente, limpeza de
  senha e dos dados ao sair; respostas tardias de gravação não reabrem dados após logout.
- CSP e demais cabeçalhos no Hosting; index/service worker sem cache persistente
  do navegador. Cache da interface v22-security-review; API financeira não é cacheada.
- Dependências atualizadas e fixadas por versão; Click corrigido após vulnerabilidade
  detectada. Auditoria final das dependências de produção sem vulnerabilidade conhecida.
- Container executa como usuário sem privilégios. Upload do build restrito a seis
  arquivos necessários, sem .env, backups, testes ou credenciais.
- Python formatado, lint configurado, documentação corrigida e frontend sincronizado
  nas três cópias. Backup pré-auditoria em `backups/auditoria-20261004/`, com hashes.
- Workflows de Hosting corrigidos; live manual, preview com testes JS. Novo
  `publicar-atualizacao.ps1` testa revisão sem tráfego antes de promover, preserva
  recursos/segredos e registra distribuição anterior para rollback. Identifica
  a revisão pela tag, para não promover outra revisão criada em paralelo.
- Mantidas regras anteriores: lançamento uma vez entre hoje e hoje-7 inclusive,
  gestão para alterações/histórico, bloqueio de datas futuras, consulta de período
  manual, calculadora/relatório ordenados no celular e fontes maiores.

### Testes e produção

52 testes Python e cinco JavaScript passaram, além de sintaxe JS, lint/formato,
pip check e auditoria de dependências. PostgreSQL de integração usa tabelas e
sequências TEMP; nenhum registro financeiro real foi alterado ou excluído.

- Cloud Run: projeto `financeiro-tony-lanches-510422`, serviço
  `financeiro-tony-lanches`, região `southamerica-east1`.
- Nova revisão `financeiro-tony-lanches-00006-cax`: validada primeiro sem tráfego,
  depois promovida a 100%. Revisão anterior `financeiro-tony-lanches-00005-2q8`.
- API: https://financeiro-tony-lanches-84954471063.southamerica-east1.run.app.
  `/health` 200; financeiro sem token e token inválido 401; preflight autorizado
  para edição/exclusão 204. `/healthz` externo 404 porque é reservado pelo Cloud Run,
  inclusive na versão anterior; usar `/health`. Referência oficial:
  https://cloud.google.com/run/docs/known-issues.
- Firebase Hosting/Auth: `financeiro-tony-lanches`.
  App: https://financeiro-tony-lanches.web.app.
  Versão Hosting `5f46068167084e66`, release `1791085605356000`, 03:46:45 UTC.
- Os 15 arquivos públicos foram conferidos por SHA256: todos iguais aos locais,
  cabeçalhos de segurança presentes. Evidência: `docs/verificacao-publicacao-20261004.json`.
- Navegador novo abriu login corretamente, sem erros JS ou bloqueio CSP.
  Não houve login com credenciais válidas nem gravação financeira real em produção.
- Relatório: `docs/auditoria-20261004.md`. Se o PWA instalado oferecer
  **Atualizar app**, aceitar para carregar a nova interface.

Rollback do backend, se necessário:

```powershell
gcloud run services update-traffic financeiro-tony-lanches --to-revisions=financeiro-tony-lanches-00005-2q8=100 --region=southamerica-east1 --project=financeiro-tony-lanches-510422
```

### Custos e parâmetros registrados

Fonte conferida: https://cloud.google.com/run/pricing em 04/10/2026.
Para cobrança por requisição, franquia nominal mensal:

- CPU: 180.000 vCPU-segundos.
- Memória: 360.000 GiB-segundos.
- Requisições: 2 milhões.

A franquia é compartilhada pelos projetos da conta de faturamento e renovada
mensalmente. É aplicada como desconto baseado nos preços Tier 1 de us-central1;
São Paulo possui preço regional próprio. Os números não garantem custo zero.
Builds, imagens, rede e serviços externos seguem cobranças próprias.
Não confundir com as franquias de cobrança por instância.

Configuração real preservada: 1 vCPU, 512 MiB, concorrência 8, máximo 3 instâncias,
mínimo padrão 0, cobrança por requisição, startup CPU boost existente. Conta de
serviço, permissões, allowlist e segredos preservados. Nenhum recurso foi aumentado.
Atualização de memória solicitada: nota em `extensions/ad_hoc/notes/` da memória
Codex, contendo esses parâmetros e a instalação verificada, sem credenciais.

## 25) Correção do carregamento no Neon pooled — 04/10/2026

Após a publicação, o usuário mostrou falha de carregamento. Logs de produção
confirmaram `unsupported startup parameter in options: statement_timeout` no
resumo diário. O timeout adicionado na auditoria era aceito na conexão direta
usada pelas tabelas TEMP, mas rejeitado pelo pooler usado na aplicação.

- Retirada a injeção de `statement_timeout`/`lock_timeout` em `database_config.py`.
  SSL e parâmetros fornecidos na URL, endpoint pooled e timeout de conexão
  continuam preservados. Não houve alteração de schema ou dados financeiros.
- Novo `tests/check_pooled_database.py`: GETs de resumo diário, total mensal e
  listagem por período, usando o endpoint configurado antes da troca para conexão
  direta da suíte TEMP. Auth simulada só no processo local de testes; nenhuma
  permissão ou autenticação do servidor foi alterada. Nenhum dado financeiro impresso.
- 52 testes passaram novamente, além de três consultas no endpoint pooled. As três
  leituras também passaram com a configuração exata obtida do Secret Manager
  de produção, mantida somente na memória do processo local.
- O runner e `publicar-atualizacao.ps1` passam a validar o endpoint da aplicação
  antes da suíte TEMP. Health/401 sozinhos não validam a conexão ao banco;
  a publicação anterior tinha essa limitação, agora coberta por smoke de leitura.

Correção publicada: revisão `financeiro-tony-lanches-00008-gon`, testada sem tráfego
na tag `fix-neon-20261004` e promovida a 100%. API principal `/health` 200 e
financeiro sem token 401 após a promoção. Frontend permanece na versão já publicada;
nenhuma alteração da interface foi necessária. Recursos, segredos e permissões
mantidos. No navegador basta clicar em **Tentar novamente**.

## 26) Login: antecipação de conexão sem alterar autenticação — 14/10/2026

Pedido: reduzir tempo de login somente quando possível sem comprometer segurança,
com evidência e sem inventar ganhos. Logs de /auth/me nos 14 dias anteriores:
preflights de primeiros acessos em aproximadamente 3,4–4,7 s; autorizações
normalmente cerca de 0,5–0,6 s, com variação. Eventos de instância iniciando por
AUTOSCALING coincidem com esses preflights (por exemplo, 14/10 23:50:38 UTC).
Esses tempos são do servidor, não uma medição ponta a ponta do login Firebase.

Mudança conservadora: index.html usa preconnect HTTPS para Identity Toolkit e
API Cloud Run, e dns-prefetch para Secure Token. O navegador pode antecipar
DNS/TCP/TLS enquanto a tela carrega, sem enviar uma requisição de aplicação.
Não elimina o cold start nem há ganho em segundos comprovado no login completo.
Referência: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preconnect.

Auth frontend/backend, revogação obrigatória, allowlist, CSP, CORS, tokens,
expiração, persistência e API permanecem iguais. Não foi introduzido cache de
autorização, aquecimento por HTTP, polling ou instância mínima paga. Backend
permanece na revisão financeiro-tony-lanches-00008-gon, sem novo deploy Cloud Run.

Backup index/sw em backups/login-preconnect-20261014/. Três cópias frontend
sincronizadas. Cache PWA v23-login-preconnect. Cinco testes JS e 13 testes de
autenticação Python aprovados. Publicação somente do Hosting, seguida de
verificação dos arquivos e cabeçalhos; resultado registrado abaixo ao concluir.

Publicação Hosting concluída. index/sw/auth/config públicos idênticos aos locais,
cabeçalhos CSP e frame preservados. Evidência: docs/verificacao-login-20261014.json.
No PWA, aceitar **Atualizar app** quando oferecido. Não foi realizado login com
credenciais reais nem medido ganho ponta a ponta nesta alteração.

## 27) Acompanhamento de instâncias Cloud Run — 14/10/2026

Usuário observou duas instâncias e pediu acompanhamento. Conferência pelas APIs
Cloud Run v2, Monitoring e Logging, sem chamadas ao app: mínimo zero (serviço e
revisão), escala automática, máximo de serviço 2, máximo de revisão 3, cpuIdle=true
(cobrança por requisição), 1 vCPU/512 MiB, concorrência 8. O máximo de serviço 2
já estava configurado ao consultar; nenhuma configuração foi alterada nesta análise.

Métrica run.googleapis.com/container/instance_count da revisão 00008-gon:
zero active e zero idle em todas as cinco amostras mais recentes, 21:08–21:12 de
14/10/2026 no horário de São Paulo (00:08–00:12 UTC de 15/10). Logs de última hora
mostravam somente quatro requisições às 20:50 de São Paulo. Há atraso de coleta;
não confundir limite máximo configurado ou gráfico histórico com contagem atual.
Cloud Run pode manter instâncias ociosas por até aproximadamente 15 minutos para
reduzir cold starts; mínimo zero permite scale-to-zero. Fonte:
https://docs.cloud.google.com/run/docs/about-instance-autoscaling.

Criado heartbeat neste chat a cada 30 minutos: automationId
`acompanhar-escala-do-cloud-run-tony-lanches`, ACTIVE. Consultar somente APIs de
controle, métricas e logs, nunca endpoints do app que possam acordá-lo. Investigar
mínimo acima de zero, escala fixa, mudança de cobrança ou persistência superior
a 30 minutos sem acessos observados, considerando atraso/completude dos dados.
Registrar anomalias/mudanças relevantes e informar evidências; nenhuma alteração
automática de infraestrutura autorizada por esse monitoramento. Acompanhamento
agendado no Codex, não é um alerta independente instalado no Google Cloud.

## 28) Lembretes configuráveis no app e no celular — 14/10/2026

Usuário autorizou ambos os canais e pediu redução de consumo sem perder qualidade.
Nova aba **Lembretes**: ontem ou até 2–7 dias anteriores, dias da semana de
funcionamento, ativação por conta e push opcional por aparelho. Padrão: ontem,
todos os dias; a pessoa pode ajustar. Hoje é excluído, zero é fechamento válido,
registros parciais continuam pendentes. Preferências persistidas por conta.

Implementação: `lembretes.py` Blueprint, `Frontend/reminders.js`, duas tabelas
novas via migrations/20261014_lembretes.sql. GET diário opcional acrescenta
preferências e até sete datas na mesma consulta/conexão; clientes antigos seguem
compatíveis. Nenhuma consulta ao abrir a aba ou trocar filtros; PUT somente ao
salvar. Edições/mudanças/exclusões atualizam snapshot sem consulta adicional.
Envio Web Push importado somente na tarefa diária, sem pesar no login.

Cloud Scheduler: job `tony-lanches-lembretes-diarios`, às 9h America/Sao_Paulo,
uma execução/dia, até uma repetição após 5 min em falha. Token OIDC Google,
audiência da API e e-mail verificado da conta dedicada obrigatórios. Firebase,
revogação, allowlist e demais rotas protegidas preservados. Secret Manager guarda
a chave privada VAPID; apenas a chave pública fica disponível ao frontend.

Sem instância mínima/polling/aquecimento HTTP. Recursos confirmados preservados:
1 vCPU, 512 MiB, concorrência 8, mínimo 0, máximo serviço 2 (revisão 3). A tarefa
normalmente acrescenta cerca de uma requisição por dia, mais ações de configuração.
Scheduler: 3 jobs gratuitos por conta, depois US$ 0,10/job/31 dias; franquia global
não presumida e sem promessa de custo zero. Fonte oficial e detalhes em docs/lembretes.md.
O heartbeat Codex de monitoramento desativado a pedido do usuário continua pausado.

Publicação: revisão `financeiro-tony-lanches-00010-foc`, testada sem tráfego,
promovida a 100%; Hosting publicado com cache v24-reminders. Scheduler OIDC real
retornou 200; acesso anônimo às rotas financeiras e de envio retorna 401.
Inscrições máximas: 5/conta; entrega diária registrada, inválidas 404/410 removidas,
sem redirecionamentos e com whitelist de provedores para evitar SSRF. Mensagens
não expõem valores financeiros, datas ou conta. Ao sair tenta remover a inscrição.
A entrega depende de permissão e navegador; ativação é feita em cada aparelho.

Nenhuma entrega em aparelho real foi simulada como sucesso. Verificado o caminho
real Scheduler/banco sem inscritos e criptografia com transporte simulado, sem
enviar mensagens para pessoas. Migração criou apenas tabelas novas; registros
financeiros preservados. Visual a 512 px sem overflow, preferências, datas e
isolamento de sessão testados. Três cópias frontend sincronizadas.
Backup em backups/lembretes-20261014/. Documentação: docs/lembretes.md.

Uma tentativa de build iniciada na raiz foi cancelada, não recebeu tráfego e seu
arquivo temporário de origem foi removido; o build correto usou Dockerfile e sete
arquivos permitidos em teste/. Credenciais não foram gravadas no código/Hosting.

Validação final: 60 testes Python e seis JavaScript aprovados; pip check e
auditoria das dependências sem vulnerabilidade conhecida. Sete arquivos
publicados comparados por SHA256 aos locais e aos dois espelhos: idênticos.
Evidência: docs/verificacao-lembretes-20261014.json.

## 29) Cores financeiras consistentes — 14/10/2026

Pedido: lucro verde e faturamento amarelo no diário e mensal/período.
Cartão de faturamento passa a amarelo; lucro usa fundo verde claro e valor verde.
Valores e colunas das tabelas seguem cores semânticas (amarelo/âmbar com contraste
sobre branco); gráfico e legenda usam verde para lucro e amarelo para faturamento.
Prejuízos continuam vermelhos, inclusive nas barras negativas do gráfico.

Mudança somente no frontend, sem cálculos, banco, autenticação ou requisições
adicionais. Seis testes JavaScript e sintaxe aprovados. Cores renderizadas no
navegador conferidas; backup em backups/cores-financeiras-20261014/.
Espelhos static/tony-lanches e integracao/frontend-flask sincronizados.
PWA v26-financial-colors, publicação somente Hosting. Ao receber Atualizar app,
aceitar para trocar a versão da interface.

## 30) Dia de folga para bloquear lançamentos — 19/10/2026

Foi adicionada abaixo da taxa de imposto a configuração de uma data de folga.
O dia fica persistido no banco, pode ser substituído ou removido, e bloqueia
criação/edição de lançamentos na interface e no backend. Registros existentes
permanecem preservados; exclusão continua disponível. O frontend falha fechado
enquanto não consegue carregar a configuração. Migration aditiva:
`migrations/20261019_dia_folga.sql`; tabela `configuracao_dia_folga`, singleton
inicializado sem data. Migration aplicada ao Neon de produção antes do backend.

Validação: 61 testes Python, seis JavaScript, Ruff no `faturamento.py` e `pip
check` passaram. A verificação Ruff do repositório inteiro ainda aponta 15
problemas preexistentes em outros arquivos. As três cópias do frontend foram
sincronizadas e o cache PWA mudou para `v27-day-off`.

Publicação autorizada em 19/10/2026: Cloud Run `financeiro-tony-lanches-00014-raj`
com 100% do tráfego; Firebase Hosting publicado em
`https://financeiro-tony-lanches.web.app`. Confirmado HTML e JavaScript públicos
com a opção, cache `v27-day-off`, `/health` HTTP 200 e rota financeira sem token
HTTP 401. A sessão autenticada de usuário não foi usada para um fluxo real no
navegador; o comportamento foi coberto pelos testes locais.

## 31) Folga semanal e exceções temporárias — 22/10/2026

As configurações de taxa de imposto e dia de folga agora são cartões separados.
A folga semanal fixa começa na segunda-feira e pode ser alterada. Uma única
exceção temporária pode bloquear uma data adicional ou substituir a folga fixa
na mesma semana; na substituição, a data fixa daquela semana fica liberada.
O backend aplica a regra em todas as rotas de gravação, além da interface.
O cache do aplicativo mudou para `v28-weekly-day-off`.

A migração `migrations/20261022_folga_semanal_excecao.sql` preserva a antiga
data isolada como exceção adicional, define segunda-feira como folga inicial e
adiciona os campos da exceção. Foi aplicada em produção antes da publicação;
após a troca de tráfego, a coluna antiga foi limpa sem alterar a exceção.

Publicação em 22/10/2026: Cloud Run `financeiro-tony-lanches-00016-weg` com
100% do tráfego e Firebase Hosting publicado em
`https://financeiro-tony-lanches.web.app`. A verificação pública confirmou os
dois painéis, cache `v28-weekly-day-off`, `/health` HTTP 200 e API sem token
HTTP 401. A suíte Python (63 testes), os seis testes JavaScript e Ruff em
`faturamento.py` passaram; as três cópias da interface ficaram idênticas.
