# Aplica apenas os arquivos do front. Não modifica Python, SQL nem dados PostgreSQL.
param([string]$Projeto = 'A:\Trabalho Vitor\04_devs\ideia\teste')
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath($Projeto)
if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'faturamento.py')) -or !(Test-Path -LiteralPath (Join-Path $taskRoot 'calculo.py'))) {
    throw 'A pasta indicada deve conter faturamento.py e calculo.py. Nenhum arquivo foi alterado.'
}
# Registra hashes para comprovar ao final que o backend ficou intacto.
$taskBackendFiles = @('faturamento.py', 'calculo.py')
$taskBackendHashes = @{}
foreach ($taskName in $taskBackendFiles) {
    $taskBackendHashes[$taskName] = (Get-FileHash -LiteralPath (Join-Path $taskRoot $taskName)).Hash
}
$taskFiles = @('index.html','styles.css','app.js','api.js','auth.js','finance.js','config.js','pwa.js','sw.js','manifest.webmanifest')
$taskFiles += @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'assets') -File | ForEach-Object { 'assets\' + $_.Name })
# Valida toda a origem antes de copiar para que um pacote incompleto não substitua o front.
foreach ($taskName in $taskFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $taskName) -PathType Leaf)) { throw "Arquivo ausente no pacote: $taskName" }
}
$taskBackup = Join-Path $taskRoot ('Frontend-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
$taskTargets = @((Join-Path $taskRoot 'Frontend'), (Join-Path $taskRoot 'static\tony-lanches'))
foreach ($taskTarget in $taskTargets) {
    $taskBackupSection = if ($taskTarget -eq $taskTargets[0]) { 'Frontend' } else { 'static-tony-lanches' }
    foreach ($taskName in $taskFiles) {
        $taskDestination = Join-Path $taskTarget $taskName
        if (Test-Path -LiteralPath $taskDestination -PathType Leaf) {
            $taskBackupPath = Join-Path (Join-Path $taskBackup $taskBackupSection) $taskName
            New-Item -ItemType Directory -Path (Split-Path $taskBackupPath) -Force | Out-Null
            Copy-Item -LiteralPath $taskDestination -Destination $taskBackupPath
        }
        New-Item -ItemType Directory -Path (Split-Path $taskDestination) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $taskName) -Destination $taskDestination -Force
        if ((Get-FileHash -LiteralPath $taskDestination).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $taskName)).Hash) { throw "Falha na cópia de $taskName" }
    }
}
foreach ($taskName in $taskBackendFiles) {
    if ((Get-FileHash -LiteralPath (Join-Path $taskRoot $taskName)).Hash -ne $taskBackendHashes[$taskName]) { throw "O backend $taskName mudou durante a execução. Confira antes de continuar." }
}
Write-Host 'Front aplicado. Backend preservado e arquivos copiados conferidos.'
Write-Host "Backup dos arquivos anteriores: $taskBackup"
Write-Host 'Com o Flask rodando, abra http://127.0.0.1:5000/static/tony-lanches/index.html'
Write-Host 'O login online exige Firebase Authentication e a API publicada no Cloud Run.'
