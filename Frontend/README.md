# Tony Lanches — front conectado ao backend existente

Este front segue `teste/faturamento.py` e `teste/calculo.py`. Nenhum arquivo Python, SQL ou de configuração do backend foi alterado.

## Aplicar ao projeto

Execute `aplicar-front.ps1` no PowerShell. O script usa por padrão `A:\Trabalho Vitor\04_devs\ideia\teste`, faz backup dos arquivos front existentes e copia apenas HTML, CSS, JavaScript, manifesto e imagens. Não modifica backend nem dados do banco.

Ele atualiza `Frontend/` e publica uma cópia em `static/tony-lanches/`, que o Flask já consegue servir pela rota estática padrão. Depois, com seu backend funcionando na porta 5000, abra:

**http://127.0.0.1:5000/static/tony-lanches/index.html**

Isso elimina a necessidade de CORS: página e API têm o mesmo protocolo, host e porta. Não abra esta versão por `file://` nem em outro servidor HTTP de outra porta. O `config.js` usa `apiBaseUrl: ''` para acompanhar a origem da página, inclusive em HTTPS.

Se editar `Frontend/` posteriormente, repita o script para atualizar a cópia servida em `static/tony-lanches/`. O script deve continuar junto dos arquivos desta versão do front, pois usa sua própria pasta como origem.

## Funcionamento

- O formulário possui **faturamento bruto total** e **somatório total de despesas** da data. Salvar substitui esses dois totais, em vez de adicionar despesas individuais que o backend não registra.
- **Salvar e calcular o dia** chama a rotina já existente `POST /Faturamento/calcular_dia`. O backend consulta/cadastra a data, salva os dois valores, consulta a taxa, calcula e salva o faturamento líquido.
- **Lucro do dia** corresponde ao faturamento líquido retornado pelo backend: **bruto − imposto − despesas**.
- A taxa global é consultada e pode ser alterada no painel recolhível. A tela usa percentual; a API usa fração (`15%` → `0.15`). Campo vazio preserva a taxa. Sem taxa cadastrada, o front não inventa um valor padrão.
- Dias sem cadastro ou valores `null` aparecem como pendentes (`—`). Um valor efetivamente registrado como zero aparece como R$ 0,00.
- Mês completo e período personalizado consultam `GET /Faturamento_geral` e filtram as datas inclusivamente no front. O backend não possui uma rota de intervalo e não foi alterado para criar uma.
- O período soma o líquido já salvo. Mudar a taxa atual não reaplica essa taxa a todo o histórico. O imposto descontado mostrado no histórico é a diferença entre bruto, despesas e líquido registrados.
- Não há categorias ou contador de despesas individuais. O resumo mostra dias cadastrados, completos e pendentes.

## Rotas consumidas

| Operação | Rota |
| --- | --- |
| Consultar data | `GET /Faturamento/dia_mes_ano/AAAA-MM-DD` |
| Listar registros para o período | `GET /Faturamento_geral` |
| Consultar taxa | `GET /Faturamento/taxa_imposto_atual` |
| Salvar taxa global | `POST /Faturamento/taxa_imposto_atual` |
| Salvar e calcular o fechamento | `POST /Faturamento/calcular_dia` |

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

- A rotina de cálculo usa várias requisições/transações. Uma falha tardia pode deixar valores parcialmente salvos. O front informa a falha e não afirma que houve rollback; consulte a data antes de reenviar.
- O cálculo Python faz chamadas HTTP internas para `http://127.0.0.1:5000`. Esse endereço e o funcionamento do Flask/PostgreSQL devem continuar válidos; o front não muda essa configuração.
- A taxa deve existir na tabela `configuracao_imposto`. A aplicação mantém as regras e validações já implementadas no backend.
- Valores monetários são exibidos arredondados para centavos. O banco pode conter mais casas decimais; esta tela não altera a precisão de persistência do backend.
- Os totais por intervalo dependem da lista completa de `Faturamento_geral`, sem paginação. Registros incompletos tornam os totais dos campos afetados pendentes, em vez de serem somados como zero.
- Conexão, validações, autenticação e concorrência do backend não foram reformuladas.

## PWA e celular

O layout responsivo e a instalação como webapp foram mantidos. Para instalar em um celular usando um endereço de rede, sirva a aplicação em HTTPS. O manifesto abre `index.html` explicitamente: a rota estática padrão do Flask não lista diretórios.

O service worker guarda somente a interface; GETs financeiros e POSTs não são armazenados ou enfileirados. Offline, valores reais só podem ser consultados/salvos quando a API voltar. Após uma publicação, use o aviso **Atualizar app** para trocar a versão instalada.

## Arquivos principais

`finance.js`: normalização monetária/data e somas; `api.js`: contrato real do backend; `app.js`: interface e eventos; `config.js`: URL da API; `index.html`/`styles.css`: estrutura e visual; `sw.js`/`pwa.js`/manifesto: instalação e cache. O código tem comentários em português.
