param([ValidateSet('app','publisher')][string]$Service='app')
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
. (Join-Path $PSScriptRoot 'environment.ps1')
if($Service -eq 'app'){pnpm exec turbo run dev --env-mode=loose}else{node scripts/local-system/publish.mjs}
exit $LASTEXITCODE
