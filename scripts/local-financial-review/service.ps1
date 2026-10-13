param([ValidateSet('api','web')][string]$Service)
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
. (Join-Path $PSScriptRoot 'environment.ps1')
if($Service -eq 'api'){pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json src/main.ts}else{pnpm --filter @solar/web exec next dev -H 127.0.0.1 -p 13049}
exit $LASTEXITCODE
