# Tony Lanches — aplicação

Dashboard financeiro para fechamento diário, consulta por mês ou intervalo, gestão de registros, autenticação e lembretes. A API Flask usa PostgreSQL; a interface é uma PWA publicada pelo Firebase Hosting e também servida localmente pelo Flask.

O [contexto do projeto](contexto_ideia.md) registra a publicação mais recente em 22/10/2026. O [mapa da estrutura](docs/estrutura-projeto.md) explica a função das pastas e as regras para manter as cópias do frontend sincronizadas.

## Estrutura principal

| Caminho | Função |
| --- | --- |
| `contexto_ideia.md` | Histórico de decisões e estado registrado |
| Arquivos Python na raiz | API, regras financeiras, autenticação, banco e lembretes |
| `Frontend/` | Fonte publicada pelo Firebase Hosting |
| `static/tony-lanches/` | Cópia servida pelo Flask |
| `integracao/frontend-flask/` | Pacote fonte do instalador que atualiza as duas cópias |
| `tests/` | Testes Python/JavaScript e seus fixtures SQL |
| `migrations/` | Migrações SQL aditivas |
| `docs/` | Guias, análise, evidências e registros datados |
| `backups/`, `Frontend-backups/` | Cópias de segurança locais, ignoradas pelo Git |
| Scripts `.ps1`, `Dockerfile` | Operações de publicação e imagem do Cloud Run |

## Executar e reaplicar a integração

No PowerShell, abra esta pasta (`teste/`). Com PostgreSQL e o schema do projeto
disponíveis, habilite e-mail/senha no Firebase Authentication e configure o
projeto e os e-mails cadastrados e autorizados pelo responsável antes de iniciar:

```powershell
$env:FIREBASE_PROJECT_ID = "financeiro-tony-lanches"
$env:ALLOWED_EMAILS = "dono@example.com"
$env:API_URL = "http://127.0.0.1:5000"
gcloud auth application-default login
.\.venv\Scripts\python.exe .\faturamento.py
```

O usuário de desenvolvimento do Google Cloud precisa de permissão de leitura
do Firebase Authentication para que a API confira tokens revogados. Sem projeto
e e-mail permitido, as rotas protegidas retornam erro e não consultam dados.

Para aplicar o pacote de integração — que substitui as cópias em `Frontend/` e `static/tony-lanches/` — abra outro terminal nesta pasta e confira antes se `integracao/frontend-flask/` contém a versão desejada:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\integracao\frontend-flask\aplicar-front.ps1
```

O instalador faz backup do front, copia arquivos para `Frontend/` e `static/tony-lanches/` e confere os hashes dos dois arquivos principais do backend. Depois abra `http://127.0.0.1:5000/static/tony-lanches/index.html`.

O front local servido em `localhost` usa a API Flask na mesma origem; publicado,
usa o endereço HTTPS do Cloud Run, com CORS restrito ao Hosting configurado. O
instalador copia a fonte de `integracao/frontend-flask/` para os dois destinos.
Se editar somente `Frontend/`, sincronize os arquivos servidos; o Flask lê a
cópia em `static/tony-lanches/`. Reaplicar o pacote substitui ambos os destinos
pela versão presente no pacote.

## Validar os testes existentes

Os testes isolados da autenticação e do encaminhamento do token não usam o Neon:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_authentication.py" -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_calculo_auth.py" -v
```

O runner abaixo também executa o teste de integração do banco:

```powershell
.\.venv\Scripts\python.exe -B .\tests\run_tests.py
```

O teste usa PostgreSQL com tabela temporária. O SQL foi mantido ao lado dele para preservar seu caminho relativo. Não execute a criação do schema real como parte desse teste.

## Manutenção e validação

A API salva cada fechamento em uma transação, sem chamadas HTTP a si própria.
Rotas avulsas antigas permanecem por compatibilidade, sem sobrescrever registros.
O relatório [docs/auditoria-20261004.md](docs/auditoria-20261004.md) descreve a auditoria daquela data; não representa a contagem de testes atual. O contexto registra a validação mais recente em 22/10/2026: 63 testes Python, seis JavaScript e Ruff em `faturamento.py`. Essa anotação é evidência histórica, não foi reexecutada nesta leitura.

O schema financeiro do Neon é mantido como fonte do banco; os testes de integração usam tabelas temporárias. Não execute SQL de fixtures no schema financeiro real.

## Banco atual: Neon

A conexão atual usa o arquivo local .env com DATABASE_URL. A configuração está em database_config.py; a senha não faz parte do código. Consulte docs/configuracao-neon-tony-lanches.md. O runner de testes usa endpoint direto somente durante a execução para manter tabelas temporárias isoladas. Os dados fictícios anteriores permanecem no banco local Studies.

## Publicação segura

O dashboard usa Firebase Authentication (e-mail/senha), mantém a sessão no
navegador após o primeiro login e tenta restaurá-la automaticamente nas próximas
visitas. O e-mail precisa existir no Firebase Authentication e constar em
`ALLOWED_EMAILS`; sem configuração, a API falha fechada. O acesso do container à `DATABASE_URL` deve
ser concedido pelo Secret Manager, nunca por arquivo dentro da imagem. O guia
completo de Firebase Authentication, Secret Manager, Cloud Run e Hosting está
em [docs/deploy-cloud-run.md](docs/deploy-cloud-run.md).

A API publicada é `https://financeiro-tony-lanches-84954471063.southamerica-east1.run.app`.
O serviço mantém acesso de rede público para o navegador; tokens verificados e
allowlist protegem os dados. CORS aceita apenas os domínios deste Hosting.
Para atualizar, execute `publicar-atualizacao.ps1` com as credenciais administrativas
locais. Ele preserva segredos e recursos, testa a revisão sem tráfego e publica
backend e frontend. Consulte o contexto para revisões, rollback e limites de custos.
