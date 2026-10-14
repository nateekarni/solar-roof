$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot
docker compose -f scripts/local-financial-review/compose.yml up -d --wait
if($LASTEXITCODE -ne 0){throw 'Local financial dependencies failed'}
. (Join-Path $PSScriptRoot 'environment.ps1')
node scripts/local-system/prepare-history.mjs
if($LASTEXITCODE -ne 0){throw 'Local history preparation failed'}
node scripts/local-system/reconcile-demo-identities.mjs
if($LASTEXITCODE -ne 0){throw 'Local demo identity reconciliation failed'}
node scripts/local-system/restore-mailpit.mjs
if($LASTEXITCODE -ne 0){throw 'Local Mailpit restoration failed'}
if(Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002 -ErrorAction SilentlyContinue){throw 'A local app already owns ports 3000–3002; inspect it before starting another instance'}
$launcher=Join-Path $PSScriptRoot 'service.ps1'
foreach($service in @('app','publisher')){
 $process=Start-Process -FilePath (Get-Command pwsh).Source -ArgumentList @('-NoProfile','-File',('"'+$launcher+'"'),$service) -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $repoRoot ('.tmp/local-system-'+$service+'.log')) -RedirectStandardError (Join-Path $repoRoot ('.tmp/local-system-'+$service+'-errors.log')) -PassThru
 $process.Id | Set-Content (Join-Path $repoRoot ('.tmp/local-system-'+$service+'-wrapper.pid'))
}
Write-Output 'Local app started: http://localhost:3000 | Mailpit: http://localhost:18049'
