$ErrorActionPreference = 'SilentlyContinue'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$logDir = Join-Path $repoRoot '.tmp/qa-3200'

foreach ($service in @('api', 'web', 'worker')) {
  $pidFile = Join-Path $logDir "$service.pid"
  if (Test-Path $pidFile) {
    $p = Get-Content $pidFile
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
}

# Also ensure any lingering listeners on 3200-3202 are stopped
foreach ($port in @(3200, 3201, 3202)) {
  $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "QA stack (3200-3202) stopped."
