# Banco Neon configurado — Tony Lanches

Banco atual: `Financeiro_Tony_lanches`, schema `public`. A senha não faz parte deste documento.

## Aplicação

- `teste/.env`: conexão privada fornecida pelo usuário em `DATABASE_URL`.
- `.gitignore` na raiz: ignora `.env` e arquivos locais derivados; permite `.env.example`.
- `teste/database_config.py`: carrega `.env` pelo caminho do módulo; uma variável `DATABASE_URL` já definida no ambiente tem precedência. Usa `parse_dsn` para preservar SSL/channel binding. Timeout padrão de 15 segundos pelo ambiente libpq, permitindo overrides de ferramentas.
- `teste/faturamento.py`: substituído somente o bloco de conexão pela importação de `DB_CONFIG`.
- `teste/requirements.txt`: declara também `requests` e `python-dotenv`, já instalados no ambiente verificado.
- `teste/.env.example`: modelo sem credencial.

Todas as funções/decorators das rotas foram comparadas por AST e permaneceram iguais. `calculo.py` permaneceu idêntico por bytes. Backup da configuração anterior está em `teste/backups/configuracao/`.

## Banco e evidências

A conexão do cliente foi confirmada com TLS 1.3, `sslmode=require` e `channel_binding=require`. Foi mantida a URL pooled fornecida para a aplicação.

O banco já tinha uma linha em `faturamento`. Foi criada apenas a tabela ausente `configuracao_imposto`, com o SQL existente do projeto. A taxa atual de 15% foi copiada da configuração local usando inserção que não substitui uma configuração existente. O registro de faturamento permaneceu igual. Os 18 exemplos fictícios não foram migrados: continuam no banco local `Studies`.

Os GETs da API viva de listagem, imposto e consulta diária retornaram HTTP 200. A lista da API correspondeu ao SELECT direto no Neon, comprovando a troca no Flask em execução. O único registro observado, de 11/12/2026, possui bruto de R$ 2.000,00 e despesas/líquido ainda nulos; o front deve apresentá-lo como incompleto, não inventar zero ou lucro.

## Testes e execução

Os seis testes existentes passaram no mesmo Neon usando tabelas temporárias pelo endpoint direto. Isso não alterou a conexão pooled da aplicação nem os dados persistentes.

O pooler usa modo de transação; testes que dependem de tabelas temporárias entre commits precisam de conexão direta. Consulte a [documentação oficial do Neon sobre conexões pooled e diretas](https://neon.com/docs/connect/connection-pooling).

Use o runner da pasta de aplicação (`teste/`):

```powershell
.\.venv\Scripts\python.exe -B .\tests\run_tests.py
```

Para iniciar o servidor:

```powershell
.\.venv\Scripts\python.exe .\faturamento.py
```

Se estiver executando sem recarga automática, reinicie o Flask após alterações no `.env`. Abra o dashboard em `http://127.0.0.1:5000/static/tony-lanches/index.html`.

## Limites mantidos

A troca de banco não corrigiu os problemas de negócio já documentados: fechamento em múltiplas transações, valores negativos aceitos pela API, conflitos e certas ausências tratados como erro interno. Não foram migrados lançamentos do banco local nem foram adicionados novos fechamentos persistentes no Neon nesta etapa.
