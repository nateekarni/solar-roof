param([switch]$RunBilling)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot
. (Join-Path $PSScriptRoot 'environment.ps1')
docker compose -f scripts/local-financial-review/compose.yml -p solar-financial-flow-review up -d --wait
if($LASTEXITCODE -ne 0){throw 'Test infrastructure failed'}
pnpm db:migrate
if($LASTEXITCODE -ne 0){throw 'Migration failed'}
pnpm --filter './packages/**' --recursive build
if($LASTEXITCODE -ne 0){throw 'Shared package build failed'}
pnpm exec tsx scripts/local-financial-review/seed-september.mjs
if($LASTEXITCODE -ne 0){throw 'Seed failed'}
$logDirectory=Join-Path $repoRoot '.superpowers'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$serviceScript='"'+(Join-Path $PSScriptRoot 'service.ps1')+'"'
foreach($target in @(@{Name='api';Port=13059;Url='http://127.0.0.1:13059/health'},@{Name='web';Port=13049;Url='http://127.0.0.1:13049/login'})){
 $listener=Get-NetTCPConnection -State Listen -LocalPort $target.Port -ErrorAction SilentlyContinue
 if($listener){
  $pidFile=Join-Path $logDirectory ('september-'+$target.Name+'.pid')
  if(!(Test-Path $pidFile)){throw ('Unverified existing listener on port '+$target.Port)}
  $expectedProcessId=[int](Get-Content $pidFile)
  $wrapper=Get-CimInstance Win32_Process -Filter "ProcessId=$expectedProcessId"
  if(!$wrapper -or !$wrapper.CommandLine.Contains((Join-Path $PSScriptRoot 'service.ps1')) -or !$wrapper.CommandLine.Contains($target.Name)){throw ('Unverified test service owner on port '+$target.Port)}
  foreach($connection in $listener){
   $ancestor=[int]$connection.OwningProcess
   for($depth=0;$depth -lt 12 -and $ancestor -ne $expectedProcessId -and $ancestor -gt 0;$depth++){
    $ancestorProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$ancestor"
    if(!$ancestorProcess){break};$ancestor=[int]$ancestorProcess.ParentProcessId
   }
   if($ancestor -ne $expectedProcessId){throw ('Port is not owned by the test launcher: '+$target.Port)}
  }
 }
 if(!(Get-NetTCPConnection -State Listen -LocalPort $target.Port -ErrorAction SilentlyContinue)){
  $job=Start-Process -FilePath (Get-Command pwsh).Source -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$serviceScript,$target.Name) -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory ('september-'+$target.Name+'.log')) -RedirectStandardError (Join-Path $logDirectory ('september-'+$target.Name+'-error.log')) -PassThru
  $job.Id | Set-Content (Join-Path $logDirectory ('september-'+$target.Name+'.pid'))
 }
 $ready=$false
 for($attempt=0;$attempt -lt 90;$attempt++){
  try{$response=Invoke-WebRequest -Uri $target.Url -TimeoutSec 2;if($response.StatusCode -eq 200){$ready=$true;break}}catch{}
  Start-Sleep -Seconds 1
 }
 if(!$ready){throw ('Server not ready: '+$target.Name+'. Check .superpowers/september logs')}
}
if($RunBilling){pnpm exec tsx scripts/local-financial-review/run-september.mjs;if($LASTEXITCODE -ne 0){throw 'Billing workflow failed'}}
Write-Host 'Test app: http://localhost:13049 | Mailpit: http://localhost:18049'
