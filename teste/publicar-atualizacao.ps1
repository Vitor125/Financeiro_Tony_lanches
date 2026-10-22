# Atualiza um serviço existente sem alterar contas, allowlist, segredos ou escala.
param(
    [string]$ProjectId = 'financeiro-tony-lanches-510422',
    [string]$FirebaseProjectId = 'financeiro-tony-lanches',
    [string]$Region = 'southamerica-east1',
    [string]$ServiceName = 'financeiro-tony-lanches'
)
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program falhou; a próxima etapa não foi executada." }
}
function Get-ServiceStatus {
    $json = & gcloud.cmd run services describe $ServiceName "--project=$ProjectId" "--region=$Region" '--format=json(status)'
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível consultar o serviço.' }
    return ($json | ConvertFrom-Json).status
}
function Assert-Http {
    param([string]$Url, [string]$Expected)
    $code = & curl.exe --silent --show-error --max-time 60 --output NUL --write-out '%{http_code}' $Url
    if ($LASTEXITCODE -ne 0 -or $code -ne $Expected) { throw "Verificação HTTP falhou em $Url (esperado $Expected; recebido $code)." }
}

Push-Location $PSScriptRoot
try {
    $previous = Get-ServiceStatus
    Invoke-Checked '.\.venv\Scripts\python.exe' @('tests/run_tests.py')
    foreach ($test in Get-ChildItem -LiteralPath 'tests' -Filter 'test_*.js') {
        Invoke-Checked 'node' @($test.FullName)
    }
    $tag = 'review-' + (Get-Date -Format 'yyyyMMddHHmmss')
    Invoke-Checked 'gcloud.cmd' @('run','deploy',$ServiceName,'--source=.',"--region=$Region","--project=$ProjectId",'--no-traffic',"--tag=$tag",'--quiet')
    $status = Get-ServiceStatus
    $candidateTraffic = $status.traffic | Where-Object { $_.tag -eq $tag }
    $candidate = $candidateTraffic.url
    if (!$candidate) { throw 'A URL da revisão de teste não foi encontrada.' }
    Assert-Http "$candidate/health" '200'
    Assert-Http "$candidate/Faturamento_geral" '401'
    $revision = $candidateTraffic.revisionName
    if (!$revision) { throw 'A revisão de teste não foi encontrada.' }
    $rollback = @($previous.traffic | Where-Object { $_.percent -gt 0 } | ForEach-Object { "$($_.revisionName)=$($_.percent)" }) -join ','
    Write-Host "Distribuição anterior para rollback: $rollback"
    Invoke-Checked 'gcloud.cmd' @('run','services','update-traffic',$ServiceName,"--to-revisions=$revision=100","--region=$Region","--project=$ProjectId",'--quiet')
    Push-Location 'Frontend'
    try { Invoke-Checked 'firebase.cmd' @('deploy','--only','hosting',"--project=$FirebaseProjectId",'--non-interactive') }
    finally { Pop-Location }
    Assert-Http "https://$FirebaseProjectId.web.app" '200'
    Write-Host "Backend $revision e Hosting publicados. Confira o login e Atualizar app no navegador."
} finally { Pop-Location }
