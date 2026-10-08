$env:DATABASE_URL='postgresql://review:local-financial-only@127.0.0.1:15449/solar_financial_flow_review'
$env:REDIS_URL='redis://127.0.0.1:16449'
$env:MQTT_ENABLED='false'
$env:MQTT_DEFAULT_BROKER_ENABLED='false'
$env:MQTT_URL=''
$env:MQTT_USERNAME=''
$env:MQTT_PASSWORD=''
$env:NODE_ENV='development'
$env:LOCAL_FINANCIAL_FIXTURE_MARKER='solar-financial-flow-review-v1'
$env:JWT_ACCESS_SECRET='synthetic-local-financial-access-secret-2026-only'
$env:JWT_REFRESH_SECRET='synthetic-local-financial-refresh-secret-2026-only'
$env:STORAGE_ENDPOINT='http://127.0.0.1:19049'
$env:STORAGE_REGION='us-east-1'
$env:STORAGE_BUCKET='solar-financial-flow-review'
$env:STORAGE_ACCESS_KEY='localfinancial'
$env:STORAGE_SECRET_KEY='local-financial-storage-only'
$env:WEB_URL='http://localhost:13049'
$env:API_HOST='127.0.0.1'
$env:API_PORT='13059'
$env:API_INTERNAL_URL='http://127.0.0.1:13059'
$env:NEXT_PUBLIC_API_URL='http://localhost:13059'
$env:ENERGY_READ_MODEL_ENABLED='false'
$env:SMTP_HOST='127.0.0.1'
$env:SMTP_PORT='11049'
$env:FINANCIAL_WRITES_ENABLED='true'
# Verify the exact bundled faces; financial TEST readiness/policy gates stay server-owned.
$documentFontDirectory=Join-Path $PSScriptRoot '../../apps/api/assets/fonts/th-sarabun-new'
$documentFontHashes=@{
 'THSarabunNew.ttf'='b248f824f3d7a8576bc396826a4d898070c1420564f6ce6aa716aa8ad24f824a'
 'THSarabunNew Bold.ttf'='49596f298a8fe248c5340b4589b3b4adfcf34a3e24084ebeb4f49c6600f75fa7'
 'THSarabunNew Italic.ttf'='341b9b5d13b696f74c6318d32bbae7ff183e6bdc07ef3ca1a6f9c5dd83c6494b'
 'THSarabunNew BoldItalic.ttf'='64a69cbeca6d34dc754a7ab2106615c14fbd359d339ed0f65d2a7b17de14cdfa'
}
foreach($documentFontName in $documentFontHashes.Keys){
 $documentFontFile=Join-Path $documentFontDirectory $documentFontName
 if(!(Test-Path -LiteralPath $documentFontFile) -or (Get-FileHash -LiteralPath $documentFontFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $documentFontHashes[$documentFontName]){throw "Bundled TH Sarabun New verification failed: $documentFontName"}
}
$env:USER_CREATE_ENABLED='true'
