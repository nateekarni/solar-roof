. (Join-Path $PSScriptRoot '../local-financial-review/environment.ps1')
$env:API_PORT='3001'
$env:WORKER_PORT='3002'
$env:WEB_URL='http://localhost:3000'
$env:API_INTERNAL_URL='http://127.0.0.1:3001'
$env:NEXT_PUBLIC_API_URL='http://localhost:3001'
$env:MQTT_ENABLED='true'
$env:MQTT_DEFAULT_BROKER_ENABLED='false'
$env:TECHNICAL_ALERTS_ENABLED='true'
