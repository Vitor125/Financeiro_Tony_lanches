# Tony Lanches — front conectado ao backend existente

Versão publicada em 04/10/2026 em https://financeiro-tony-lanches.web.app, com API Flask no Cloud Run. Consulte [a auditoria](../docs/auditoria-20261004.md) e [o contexto](../contexto_ideia.md) para alterações e verificações.

## Aplicar ao projeto

Execute `aplicar-front.ps1` no PowerShell. O script usa por padrão `A:\Trabalho Vitor\04_devs\ideia\teste`, faz backup dos arquivos front existentes e copia apenas HTML, CSS, JavaScript, manifesto e imagens. Não modifica backend nem dados do banco.

Ele atualiza `Frontend/` e publica uma cópia em `static/tony-lanches/`, que o Flask já consegue servir pela rota estática padrão. Depois, com seu backend funcionando na porta 5000, abra:

**http://127.0.0.1:5000/static/tony-lanches/index.html**

Na execução local, a página e a API têm a mesma origem. Não abra esta versão por `file://` nem em outro servidor HTTP de outra porta. Para a publicação, `config.js` usa diretamente a URL HTTPS do Cloud Run, com CORS limitado aos domínios Firebase Hosting.

## Firebase Hosting

O Firebase Hosting publica os arquivos estáticos desta pasta (`Frontend/`), servindo o dashboard em `index.html`. As páginas padrão de exemplo foram removidas com backup na limpeza de 03/10/2026. A tela permite login com contas previamente cadastradas no Firebase Authentication e mantém a sessão neste navegador após o primeiro acesso. O dashboard abre se o e-mail também constar na lista explícita `ALLOWED_EMAILS` do backend.

As chamadas vão diretamente para `apiBaseUrl` em `config.js`, no serviço Cloud Run `financeiro-tony-lanches`, projeto `financeiro-tony-lanches-510422`, região `southamerica-east1`. O Flask valida o token Firebase, permite apenas e-mails configurados em `ALLOWED_EMAILS` e libera CORS somente para os dois domínios deste Hosting. Para atualizar, use `../publicar-atualizacao.ps1`. Consulte `../docs/deploy-cloud-run.md` para as etapas e os segredos.

Isso não coloca a senha do Neon no Hosting. O Cloud Run recebe `DATABASE_URL` pelo Secret Manager. O backend já está publicado; o dashboard só abre após a autorização em `/auth/me`.

Se editar `Frontend/` posteriormente, repita o script para atualizar a cópia servida em `static/tony-lanches/`. O script deve continuar junto dos arquivos desta versão do front, pois usa sua própria pasta como origem.

## Funcionamento

- O formulário possui **faturamento bruto total** e **somatório total de despesas** da data. O primeiro lançamento salva ambos em uma transação; alterações posteriores são feitas somente pela gestão.
- **Salvar e calcular o dia** envia os dois totais em um único `POST /Faturamento/calcular_dia`. O backend calcula e grava bruto, despesas e lucro, junto dos agregados, em uma transação sem chamadas HTTP internas.
- **Lucro do dia** corresponde ao faturamento líquido retornado pelo backend: **bruto − imposto − despesas**.
- A taxa global é consultada e pode ser alterada no painel recolhível. A tela usa percentual; a API usa fração (`15%` → `0.15`). Campo vazio preserva a taxa. Sem taxa cadastrada, o front não inventa um valor padrão.
- Dias sem cadastro ou valores `null` aparecem como pendentes (`—`). Um valor efetivamente registrado como zero aparece como R$ 0,00.
- Mês completo e período personalizado consultam `GET /Faturamento_geral?inicio=...&fim=...`; o intervalo inclusivo é filtrado no banco.
- A visão por período não consulta automaticamente. Exibe “clique ver mês completo para ver os dados” até clicar em **Ver mês completo**. No modo personalizado, clique em **Aplicar período**. Trocar filtros oculta os resultados anteriores e não chama a API.
- O período soma o líquido já salvo. Mudar a taxa atual não reaplica essa taxa a todo o histórico. O imposto descontado mostrado no histórico é a diferença entre bruto, despesas e líquido registrados.
- Não há categorias ou contador de despesas individuais. O resumo mostra dias cadastrados, completos e pendentes.

## Rotas consumidas

| Operação | Rota |
| --- | --- |
| Consultar data e taxa atual | `GET /Faturamento/resumo_diario/AAAA-MM-DD` |
| Listar registros para o período | `GET /Faturamento_geral?inicio=AAAA-MM-DD&fim=AAAA-MM-DD` |
| Consultar taxa | `GET /Faturamento/taxa_imposto_atual` |
| Salvar taxa global | `POST /Faturamento/taxa_imposto_atual` |
| Salvar e calcular o fechamento | `POST /Faturamento/calcular_dia` |
| Editar registro existente | `PUT /Faturamento/registro/<data>` |
| Adicionar data sem registro pela gestão | `POST /Faturamento/registro/<data>` |
| Excluir registro existente | `DELETE /Faturamento/registro/<data>` |

Exemplo de envio real, em **reais**, compatível com o backend:

```json
{
  "dia_mes_ano": "2030-03-02",
  "faturamento_bruto_diario": "1000.00",
  "despesas_diarias": "250.00"
}
```

O frontend aceita os valores Decimal que o Flask serializa em strings e as datas GMT que ele retorna. Centavos são uma representação interna do front para exibir/somar valores; não são enviados ao backend como unidade monetária.

## Limites reais do backend atual

- O fechamento conjunto é atômico: uma falha no banco reverte o dia e os agregados. Uma falha de rede pode acontecer depois do commit, portanto consulte a data antes de reenviar.
- O backend calcula diretamente, sem `API_URL` ou chamadas a si próprio. O cliente CLI continua aceitando `API_URL` e encaminha o token em um único POST.
- A taxa deve existir na tabela `configuracao_imposto`. A aplicação mantém as regras e validações já implementadas no backend.
- O schema atual usa duas casas decimais; os valores informados são limitados a R$ 99.999.999,99. O imposto é arredondado em centavos antes de calcular o lucro.
- Os totais por intervalo usam somente os dias solicitados, ainda sem paginação. Registros incompletos tornam os campos afetados pendentes, em vez de serem somados como zero.
- A autenticação permanece obrigatória. As rotas avulsas permanecem por compatibilidade, mas não permitem alterar um fechamento existente. Use o fechamento conjunto para calcular e salvar todos os valores do dia juntos.

## PWA e celular

Em telas de até 620 px, a calculadora aparece antes do relatório e dos indicadores
para hoje, datas futuras ou dias sem cadastro. Um dia passado com fechamento
existente mostra o relatório primeiro e a calculadora depois. O seletor de data
fica acessível acima dos painéis. A ordem muda nos próprios elementos, mantendo
leitura e teclado coerentes, sem duplicar controles ou fazer novas requisições.
Em telas maiores, o layout anterior é restaurado. A ordem usa a data local do
dispositivo, sem converter o dia para UTC.

O layout responsivo e a instalação como webapp foram mantidos. Para instalar em um celular usando um endereço de rede, sirva a aplicação em HTTPS. O manifesto abre `index.html` explicitamente: a rota estática padrão do Flask não lista diretórios.

O service worker guarda somente a interface; GETs financeiros e POSTs não são armazenados ou enfileirados. Offline, valores reais só podem ser consultados/salvos quando a API voltar. Após uma publicação, use o aviso **Atualizar app** para trocar a versão instalada.

## Arquivos principais

`finance.js`: normalização monetária/data e somas; `api.js`: contrato real do backend; `app.js`: interface e eventos; `config.js`: URL da API; `index.html`/`styles.css`: estrutura e visual; `sw.js`/`pwa.js`/manifesto: instalação e cache. O código tem comentários em português.
## Editar e excluir dados

A terceira aba consulta uma data somente ao clicar em **Consultar registro**.
Permite corrigir bruto e despesas de um registro existente ou excluir todo o
fechamento, com confirmação da data antes de cada ação. A edição recalcula o
lucro com a taxa global atual, informada na tela, e aceita hoje e datas passadas.
Também permite mudar a data de um registro para uma data livre até hoje,
preservando sua identidade. Se a data estiver ocupada, a alteração é recusada.
Registros futuros antigos podem ser excluídos ou ter sua data corrigida para
hoje/passado. Datas futuras nunca recebem novos valores.

Na aba principal, **Salvar e calcular o dia** aceita hoje e os sete dias anteriores,
inclusive, uma única vez por data. Registros existentes e datas fora do prazo
exibem um link para abrir a gestão na data selecionada. Essa restrição também vale
no backend e no cliente CLI. Na gestão, uma consulta sem registro permite adicionar
o fechamento histórico, com POST que recusa sobrepor registros existentes.

As operações atualizam os totais do mês/ano na mesma transação. Ao mudar de data,
os períodos de origem e destino são atualizados, inclusive anos diferentes. Os valores
originais consultados são enviados para impedir alterações sobre registros já
modificados em outra sessão (409) ou removidos (404). Uma falha exige nova consulta
antes de tentar outra operação. Não há consulta automática ao abrir a aba nem
polling; cada consulta/alteração/exclusão envia uma requisição. As alterações foram publicadas em 04/10/2026. Nenhum registro real foi excluído nos testes.

No celular, textos auxiliares usam 15 px e botões usam 16 px, com mais espaço
entre linhas para facilitar a leitura. Cache v24-reminders.

## Lembretes

A aba Lembretes configura a janela de ontem até sete dias e os dias com lançamento.
Notificações opcionais por aparelho, com verificação diária às 9h (São Paulo).
Detalhes de segurança, custos e ativação em `../docs/lembretes.md`.
