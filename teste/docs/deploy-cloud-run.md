# Publicação protegida no Firebase Hosting e Cloud Run

O Firebase Hosting entrega a interface estática. O navegador chama diretamente
a URL HTTPS do serviço Cloud Run; o Flask permite CORS somente para os domínios
`web.app` e `firebaseapp.com` do projeto. O Flask exige um token Firebase válido
em todas as rotas, exceto `/health`, e também confere o e-mail contra
`ALLOWED_EMAILS`. Uma lista ausente ou vazia bloqueia a API.

O serviço Cloud Run recebe chamadas HTTPS públicas do navegador. Isso **não**
é a política IAM privada do Cloud Run: o controle de acesso aos dados é feito
pelo Firebase Authentication e pela validação obrigatória no backend. Sem um
token de uma conta autorizada, as rotas financeiras respondem 401 ou 403.

## 1. Preparar o Firebase Authentication

No Firebase Console do projeto `financeiro-tony-lanches`:

1. Em **Authentication → Sign-in method**, habilite **E-mail/senha**.
2. Em **Authentication → Users**, crie as contas que poderão entrar.
3. Copie os e-mails autorizados; serão usados em `ALLOWED_EMAILS`. A lista
   explícita continua necessária: contas com login Firebase fora dela não veem
   o dashboard, e contas incluídas nela também precisam existir no Firebase.
4. Em **Authentication → Settings → Authorized domains**, confirme os domínios
   `financeiro-tony-lanches.web.app` e
   `financeiro-tony-lanches.firebaseapp.com`. Para desenvolvimento local pelo
   Flask, adicione também `localhost`.

A configuração web do Firebase em `Frontend/config.js` contém apenas os dados
públicos do app web. A API key do Firebase não substitui a validação do token nem
é uma senha do banco.

## 2. Criar o segredo do Neon

O serviço Cloud Run fornecido chama-se `financeiro-tony-lanches` e está no projeto Google Cloud
`financeiro-tony-lanches-510422`; o Firebase Authentication e o Hosting estão
no projeto Firebase `financeiro-tony-lanches`. São IDs de projetos diferentes:
o backend valida tokens emitidos pelo segundo, mas roda no primeiro. Instale e
configure o Google Cloud SDK (`gcloud`) com acesso aos dois projetos. O projeto
Cloud Run precisa de faturamento e das APIs Cloud Run, Cloud Build e Secret
Manager habilitadas.

Crie, fora da pasta do projeto, um arquivo local protegido contendo somente o
valor da `DATABASE_URL` do Neon, sem o nome `DATABASE_URL=`. Não o adicione ao
Git nem o envie por chat. Então, no PowerShell:

```powershell
$PROJECT_ID = "financeiro-tony-lanches-510422"
$FIREBASE_PROJECT_ID = "financeiro-tony-lanches"
$SERVICE_ACCOUNT = "tony-lanches-api@$PROJECT_ID.iam.gserviceaccount.com"

gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
gcloud iam service-accounts create tony-lanches-api --display-name "Tony Lanches API"
gcloud secrets create neon-database-url --data-file "C:\caminho\seguro\DATABASE_URL.txt"
gcloud secrets add-iam-policy-binding neon-database-url `
  --member "serviceAccount:$SERVICE_ACCOUNT" `
  --role "roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding $FIREBASE_PROJECT_ID `
  --member "serviceAccount:$SERVICE_ACCOUNT" `
  --role "roles/firebaseauth.viewer"
```

Conceda `roles/firebaseauth.viewer` apenas no projeto Firebase que emite os
tokens. O script de deploy usa os dois IDs separadamente.

Se o segredo já existir, adicione uma nova versão com
`gcloud secrets versions add neon-database-url --data-file "C:\caminho\seguro\DATABASE_URL.txt"`.

## 3. Publicar o Flask

Instale o Google Cloud SDK, abra um PowerShell em `teste/`, faça login e
substitua o exemplo pelo(s) e-mail(s) que você autorizou no Firebase
Authentication. Crie primeiro o segredo conforme o passo 2; o script não lê,
armazena nem envia uma senha local.

```powershell
gcloud auth login
gcloud config set project financeiro-tony-lanches-510422
.\deploy-cloud-run.ps1 -AllowedEmails "dono@example.com"
```

O script habilita as APIs necessárias, cria a conta de serviço se faltar,
concede acesso somente ao segredo do Neon e à leitura de usuários do Firebase
Authentication, faz o deploy e verifica `/health`, CORS do Hosting e a rejeição
HTTP 401 de uma rota financeira sem token. O serviço é público no nível de rede para aceitar
chamadas do navegador; o acesso a dados continua protegido pelo token e pela
allowlist do Flask. `--min=0` e `--max=2` evitam instâncias ociosas e limitam a
escala, mas **não garantem custo zero**. Verifique faturamento e preços do
projeto antes de executar o deploy.

O script usa `-ProjectId financeiro-tony-lanches-510422`,
`-FirebaseProjectId financeiro-tony-lanches` e o serviço
`financeiro-tony-lanches` por padrão. A versão `latest` do
segredo do Neon deve existir antes do deploy.

O container inicia Gunicorn com debug desligado e escuta a porta `PORT` definida
por Cloud Run. A URL
`https://financeiro-tony-lanches-84954471063.southamerica-east1.run.app` é usada pelo
frontend e em `API_URL`. O cálculo encaminha o token autenticado em cada chamada
interna ao serviço. O CORS não habilita credenciais/cookies; somente o token
Bearer Firebase identifica a sessão.

## 4. Publicar o frontend

Após o serviço estar publicado e o Authentication habilitado, publique a
interface a partir de `Frontend/`:

```powershell
Set-Location "A:\Trabalho Vitor\04_devs\ideia\teste\Frontend"
firebase deploy --only hosting
```

Entre em `https://financeiro-tony-lanches.web.app`. Após o primeiro login
completo, a sessão Firebase fica persistida neste navegador e será restaurada
automaticamente nas visitas seguintes; **Sair** encerra a sessão local. O
formulário de login só
libera a interface depois que `/auth/me` confirmar no backend que a conta está
na lista autorizada. `https://financeiro-tony-lanches-84954471063.southamerica-east1.run.app/health`
deve retornar `{"status":"ok"}`; sem token, uma rota financeira deve retornar
HTTP 401. O `/health` não consulta o banco e não expõe dados. A página do
Hosting pode ser aberta antes do backend, mas o login só libera o dashboard
quando o `/auth/me` do Cloud Run responde.

## Alterações operacionais

- Para adicionar ou remover acessos, atualize `ALLOWED_EMAILS` no Cloud Run.
- Para trocar a senha do banco, crie uma nova versão do segredo e atualize a
  revisão do serviço.
- A interface não grava respostas financeiras no service worker.
- O teste `tests/test_authentication.py` verifica bloqueio sem token, bloqueio
  por e-mail e falha fechada sem configuração; `tests/test_calculo_auth.py`
  verifica o encaminhamento do token no POST enviado pelo cliente CLI.


## Atualizar um serviço existente

Use `publicar-atualizacao.ps1` em `teste/` para revisar testes, construir uma revisão
sem tráfego e validar `/health`/401 antes de promover e publicar o Hosting. O script
preserva segredos, allowlist, conta de serviço e recursos atuais. `/healthz` funciona
localmente, mas é reservado na camada externa do Cloud Run e retorna 404; use
`/health` externamente. Fonte: https://cloud.google.com/run/docs/known-issues.

Instalação verificada em 04/10/2026: Cloud Run `financeiro-tony-lanches` no projeto
`financeiro-tony-lanches-510422`, região `southamerica-east1`; Firebase Authentication
 e Hosting no projeto `financeiro-tony-lanches`. As etapas iniciais acima são para
provisionamento, não precisam ser repetidas a cada atualização.

## Migrações do banco

Revise e aplique as migrações SQL em `migrations/` ao banco Neon antes de
publicar uma revisão que dependa delas. O script `publicar-atualizacao.ps1`
valida e publica código, mas não aplica alterações de esquema. A migration
`20261019_dia_folga.sql` cria a configuração singleton usada por
`/Faturamento/dia_folga`; ela foi aplicada ao banco de produção em 19/10/2026
antes da revisão `financeiro-tony-lanches-00014-raj`. Pode ser reexecutada sem
apagar a configuração existente.

Antes de publicar a versão com a folga semanal, aplique também
`20261022_folga_semanal_excecao.sql`, depois da migração anterior. Ela preserva
a antiga data configurada como exceção adicional e define segunda-feira como a
folga semanal inicial. O campo legado permanece intacto durante a transição
para que a revisão ativa continue respeitando a configuração até a promoção.
Depois de confirmar a revisão e o Hosting, limpe-o com:

```sql
UPDATE configuracao_dia_folga SET dia_folga = NULL WHERE id = 1;
```

O script de publicação não executa SQL; valide a migração no banco antes de
iniciar `publicar-atualizacao.ps1`.

Aplicada em 22/10/2026 antes da publicação Cloud Run
`financeiro-tony-lanches-00016-weg`; o campo legado foi limpo depois da
confirmação do tráfego e do Hosting.
