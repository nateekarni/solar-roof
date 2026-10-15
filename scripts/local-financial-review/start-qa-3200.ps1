$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

# Verify ports 3200, 3201, 3202 are not currently listening
$conflict = Get-NetTCPConnection -State Listen -LocalPort 3200,3201,3202 -ErrorAction SilentlyContinue
if ($conflict) {
  throw "Ports 3200-3202 are already in use. Please inspect or stop them before starting."
}

# Verify Docker dependencies are up
$dockerCheck = docker ps --format '{{.Names}}'
if ($dockerCheck -notcontains 'solar-financial-flow-review-postgres-1') {
  docker compose -f scripts/local-financial-review/compose.yml -p solar-financial-flow-review up -d --wait
}

# Load base review environment
. (Join-Path $PSScriptRoot 'environment.ps1')

# Configure specific ports and URLs for QA stack (3200-3202)
$env:PORT = '3201'
$env:API_PORT = '3201'
$env:API_HOST = '127.0.0.1'
$env:WEB_URL = 'http://localhost:3200'
$env:API_INTERNAL_URL = 'http://127.0.0.1:3201'
$env:NEXT_PUBLIC_API_URL = 'http://localhost:3201'
$env:WORKER_PORT = '3202'
$env:NODE_ENV = 'production'
$env:FINANCIAL_WRITES_ENABLED = 'true'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '11049'
$env:SMTP_FROM = 'billing@acceptance.example.test'
$env:SMTP_SECURE = 'false'
$env:REDIS_URL = 'redis://127.0.0.1:16449'
$env:NEXT_BUILD_OUTPUT_DIR = '.next/verification-final'

# Ensure logs directory
$logDir = Join-Path $repoRoot '.tmp/qa-3200'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

Write-Host "Launching API on port 3201..."
$apiProcess = Start-Process -FilePath "node" -ArgumentList @(
  "node_modules/tsx/dist/cli.mjs",
  "--tsconfig", "apps/api/tsconfig.json",
  "apps/api/src/main.ts"
) -WorkingDirectory $repoRoot -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir "api.log") `
  -RedirectStandardError (Join-Path $logDir "api-error.log") -PassThru
$apiProcess.Id | Set-Content (Join-Path $logDir "api.pid")

Write-Host "Launching Web on port 3200..."
$webProcess = Start-Process -FilePath "node" -ArgumentList @(
  "node_modules/next/dist/bin/next",
  "start", "-H", "127.0.0.1", "-p", "3200"
) -WorkingDirectory (Join-Path $repoRoot "apps/web") -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir "web.log") `
  -RedirectStandardError (Join-Path $logDir "web-error.log") -PassThru
$webProcess.Id | Set-Content (Join-Path $logDir "web.pid")

Write-Host "Launching Worker on port 3202..."
$workerProcess = Start-Process -FilePath "node" -ArgumentList @(
  "node_modules/tsx/dist/cli.mjs",
  "--tsconfig", "apps/worker/tsconfig.json",
  "apps/worker/src/main.ts"
) -WorkingDirectory $repoRoot -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir "worker.log") `
  -RedirectStandardError (Join-Path $logDir "worker-error.log") -PassThru
$workerProcess.Id | Set-Content (Join-Path $logDir "worker.pid")

# Wait for services to respond
$targets = @(
  @{ Name = "API"; Url = "http://127.0.0.1:3201/health"; Port = 3201 },
  @{ Name = "Web"; Url = "http://127.0.0.1:3200/login"; Port = 3200 },
  @{ Name = "Worker"; Url = "http://127.0.0.1:3202/health"; Port = 3202 }
)

foreach ($target in $targets) {
  Write-Host "Waiting for $($target.Name) to be healthy..."
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $target.Url -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
        $ready = $true
        break
      }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw "$($target.Name) failed to start on port $($target.Port). Check logs in $logDir"
  }
  Write-Host "OK: $($target.Name) is UP on port $($target.Port)!"
}

Write-Host ""
Write-Host "============================================================"
Write-Host "QA Local Stack is ready!"
Write-Host "Web:     http://localhost:3200"
Write-Host "API:     http://127.0.0.1:3201"
Write-Host "Worker:  http://127.0.0.1:3202"
Write-Host "Mailpit: http://localhost:18049"
Write-Host "============================================================"

