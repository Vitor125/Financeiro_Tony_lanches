# Análise do projeto e validação da integração

Fonte examinada: `A:\Trabalho Vitor\04_devs\ideia\teste\contexto_ideia.md`, todos os arquivos de código/configuração/documentação autorais listados no projeto, incluindo `faturamento.py`, `calculo.py`, SQL, testes, arquivos da IDE e front. A pasta `.venv`, caches Python e imagens não foram interpretados como código da ideia. `calculo_2.py` está vazio e `teste.html` contém somente um input de protótipo.

## Ideia confirmada no código

Fechamento por data, com faturamento bruto, total diário de despesas, taxa atual de imposto e líquido. `calculo.py` usa `Decimal`, faz consultas/escritas na API, calcula `imposto = taxa × bruto` e `líquido = bruto − imposto − despesas`, depois salva o líquido. `faturamento.py` expõe essa rotina em `/Faturamento/calcular_dia`.

O backend registra um total diário de despesas, não despesas individuais nem categorias. O front anterior usava `/days`, valores em centavos no contrato e uma fórmula sem imposto: não estava conectado a este backend. Esses contratos foram substituídos exclusivamente na cópia nova do front.

## Diferenças e decisões

- Usar POST de cálculo com os dois totais, para seguir a rotina existente; não calcular/persistir o líquido por uma fórmula paralela no front.
- Exibir líquido histórico salvo, sem reaplicar a taxa global atual ao passado.
- Aceitar strings Decimal e datas GMT; `null` é pendência, não zero.
- Filtrar `/Faturamento_geral` por datas inclusivas, pois a API não possui rota de intervalo.
- Evitar os GETs específicos de agregações que também atualizam colunas no banco; a consulta geral não escreve.
- Servir o front pelo static padrão do Flask. Nenhum CORS foi encontrado na API viva; uma página em outra porta não consegue consumir a API diretamente no navegador.
- Manifesto abre `index.html`, e o cache não inclui o diretório raiz, porque Flask não serve listagem de diretórios.

## Evidências observadas e seus limites

Em 02/10/2026, a API viva respondeu HTTP 200 a `/teste01`, `/Faturamento/taxa_imposto_atual` e `/Faturamento_geral`. A taxa consultada foi `0.15`. A lista de registros mudou entre consultas (havia atividade externa); essa observação não comprova quem alterou o banco. Não foram feitos POSTs na API viva durante esta análise.

Os testes de escrita importaram cópias byte a byte dos arquivos backend em um servidor isolado e redirecionaram as dependências em memória para uma conexão PostgreSQL com tabelas **TEMP**. Os arquivos Python originais e as tabelas reais não foram alterados. Assim, o teste demonstra compatibilidade com as rotas e persistência/cálculo do código atual em banco temporário, não um salvamento final na base real.

Resultados validados: consulta diária, ausência de data, registros incompletos, criação e atualização, taxa de 15%, taxa zero, GET posterior, filtros inclusivos, soma do líquido histórico e POST de taxa. O formulário no navegador enviou R$ 1.000,00 de bruto e R$ 250,00 de despesas, retornando R$ 150,00 de imposto e R$ 600,00 líquidos. A rota estática padrão serviu a interface sem CORS.

## Limitações encontradas sem alterar o backend

- Cálculo depende de chamadas internas a `127.0.0.1:5000`.
- Várias transações no fechamento permitem salvamento parcial se uma etapa posterior falhar.
- `requirements.txt` não lista `requests`, embora ambos os arquivos Python o importem. No ambiente verificado, essa dependência estava instalada.
- A configuração de depuração aponta para `app.py`, que não consta na pasta; o backend principal é `faturamento.py`.
- O único SQL fornecido cria a configuração de imposto, não documenta o schema completo de `faturamento`. A API viva conseguiu consultá-lo; isso não confirma que uma instalação nova já tenha todas as colunas.
- Algumas rotas antigas de relatório fazem escritas em GET. A rota diária de despesas tem um nome de chave inconsistente (`despesas_mensais`). O front novo não depende dessas rotas.
- A versão atual do backend não oferece autenticação ou um contrato de lançamentos individuais. Nenhuma dessas capacidades foi criada nesta integração.

## Estado da entrega

A versão adaptada está em `outputs/tony-lanches-conectado`. Esta sessão não possui permissão de gravação em `A:` e não aplicou mudanças nessa pasta. `aplicar-front.ps1` faz a aplicação pelo usuário, com backup do front, cópia para static e verificação de hashes do backend. Instalação/publicação em HTTPS e uso em aparelho real continuam não verificados.
