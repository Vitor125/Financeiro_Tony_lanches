param(
    [Parameter(Mandatory = $true)]
    [string]$AllowedEmails,
    [string]$ProjectId = 'financeiro-tony-lanches-510422',
    [string]$FirebaseProjectId = 'financeiro-tony-lanches',
    [string]$Region = 'southamerica-east1',
    [string]$ServiceName = 'financeiro-tony-lanches',
    [string]$SecretName = 'neon-database-url'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$ServiceAccountName = 'tony-lanches-api'
$ServiceAccount = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$script:GcloudPath = $null

function Invoke-Gcloud {
    param([string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $script:GcloudPath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $output | ForEach-Object { Write-Host "$_" }
    if ($exitCode -ne 0) {
        throw "gcloud falhou com código $exitCode. Os argumentos da implantação foram omitidos para não revelar configurações privadas."
    }
}

if (-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)) {
    throw 'Google Cloud CLI (gcloud) não está instalado. Instale-o e autentique com gcloud auth login.'
}
$script:GcloudPath = (Get-Command gcloud.cmd).Source
if ([string]::IsNullOrWhiteSpace($AllowedEmails)) {
    throw 'Informe ao menos um e-mail autorizado em -AllowedEmails.'
}
if ($AllowedEmails.Split(',') | Where-Object { [string]::IsNullOrWhiteSpace($_.Trim()) }) {
    throw 'A lista -AllowedEmails contém um item vazio.'
}

$projectNumber = (& $script:GcloudPath projects describe $ProjectId --format='value(projectNumber)' 2>$null | Out-String).Trim()
$projectNumberExitCode = $LASTEXITCODE
if ($projectNumberExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($projectNumber)) {
    throw "Não foi possível consultar o número do projeto $ProjectId."
}

$apiUrl = "https://$ServiceName-$projectNumber.$Region.run.app"
$origins = "https://$FirebaseProjectId.web.app https://$FirebaseProjectId.firebaseapp.com"
$envVars = "FIREBASE_PROJECT_ID=$FirebaseProjectId~ALLOWED_EMAILS=$AllowedEmails~API_URL=$apiUrl~FRONTEND_ORIGINS=$origins"

Push-Location $ProjectRoot
try {
    Invoke-Gcloud @(
        'services', 'enable',
        'run.googleapis.com',
        'cloudbuild.googleapis.com',
        'artifactregistry.googleapis.com',
        'secretmanager.googleapis.com',
        'firebase.googleapis.com',
        'identitytoolkit.googleapis.com',
        "--project=$ProjectId"
    )

    $serviceAccountFound = (& $script:GcloudPath iam service-accounts list "--filter=email=$ServiceAccount" --format='value(email)' "--project=$ProjectId" 2>$null | Out-String).Trim()
    $serviceAccountExitCode = $LASTEXITCODE
    if ($serviceAccountExitCode -ne 0) {
        throw 'Não foi possível consultar as contas de serviço do projeto Cloud Run.'
    }
    if (-not $serviceAccountFound) {
        Invoke-Gcloud @(
            'iam', 'service-accounts', 'create', $ServiceAccountName,
            '--display-name=Tony Lanches API',
            "--project=$ProjectId"
        )
    }

    $secret = (& $script:GcloudPath secrets list "--filter=name:$SecretName" --format='value(name)' "--project=$ProjectId" 2>$null | Out-String).Trim()
    $secretExitCode = $LASTEXITCODE
    if ($secretExitCode -ne 0) {
        throw 'Não foi possível consultar os segredos do projeto Cloud Run.'
    }
    if (-not $secret) {
        throw "O segredo $SecretName não existe. Crie-o no Secret Manager com a DATABASE_URL do Neon antes do deploy; não salve a URL neste projeto."
    }

    Invoke-Gcloud @(
        'secrets', 'add-iam-policy-binding', $SecretName,
        "--member=serviceAccount:$ServiceAccount",
        '--role=roles/secretmanager.secretAccessor',
        "--project=$ProjectId"
    )
    Invoke-Gcloud @(
        'projects', 'add-iam-policy-binding', $FirebaseProjectId,
        "--member=serviceAccount:$ServiceAccount",
        '--role=roles/firebaseauth.viewer'
        "--project=$FirebaseProjectId"
    )
    Invoke-Gcloud @(
        'run', 'deploy', $ServiceName,
        '--source', '.',
        "--region=$Region",
        "--project=$ProjectId",
        "--service-account=$ServiceAccount",
        '--allow-unauthenticated',
        '--port=8080',
        '--min=0',
        '--max=2',
        '--memory=512Mi',
        '--cpu=1',
        '--concurrency=8',
        '--timeout=60',
        "--set-secrets=DATABASE_URL=$SecretName`:latest",
        "--set-env-vars=^~^$envVars"
    )

    $healthStatus = (& $script:GcloudPath run services describe $ServiceName "--region=$Region" "--project=$ProjectId" '--format=value(status.url)' 2>$null | Out-String).Trim()
    $healthStatusExitCode = $LASTEXITCODE
    if ($healthStatusExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($healthStatus)) {
        throw "Não foi possível confirmar a URL de status do serviço $ServiceName."
    }

    $healthCode = (& curl.exe -sS -o NUL -w '%{http_code}' "$apiUrl/health" 2>$null | Out-String).Trim()
    $healthExitCode = $LASTEXITCODE
    if ($healthExitCode -ne 0 -or $healthCode -ne '200') {
        throw "O healthcheck do Cloud Run deveria retornar HTTP 200, mas retornou $healthCode."
    }

    $origin = "https://$FirebaseProjectId.web.app"
    $preflight = (& curl.exe -sS -D - -o NUL -X OPTIONS "$apiUrl/auth/me" `
        -H "Origin: $origin" `
        -H 'Access-Control-Request-Method: GET' `
        -H 'Access-Control-Request-Headers: authorization' 2>$null | Out-String)
    $preflightExitCode = $LASTEXITCODE
    if (
        $preflightExitCode -ne 0 -or
        $preflight -notmatch 'HTTP/\S+ 204' -or
        $preflight -notmatch [regex]::Escape("Access-Control-Allow-Origin: $origin")
    ) {
        throw 'O preflight do Firebase Hosting falhou; confira FRONTEND_ORIGINS no Cloud Run.'
    }

    $unauthenticatedCode = (& curl.exe -sS -o NUL -w '%{http_code}' "$apiUrl/Faturamento_geral" 2>$null | Out-String).Trim()
    $unauthenticatedExitCode = $LASTEXITCODE
    if ($unauthenticatedExitCode -ne 0 -or $unauthenticatedCode -ne '401') {
        throw "A rota financeira sem token deveria retornar 401, mas retornou $unauthenticatedCode."
    }

    Write-Host "Cloud Run publicado e healthcheck aprovado: $apiUrl"
    Write-Host 'Healthcheck HTTP 200, CORS do Hosting e recusa HTTP 401 sem token foram verificados.'
    Write-Host 'O frontend deste projeto já aponta para a URL determinística do serviço.'
    Write-Host 'Após habilitar E-mail/senha no Firebase Authentication e cadastrar usuários autorizados, publique o Hosting na pasta Frontend.'
} finally {
    Pop-Location
}
