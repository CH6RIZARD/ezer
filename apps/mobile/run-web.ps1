# Run Expo web using D: for temp/cache to avoid "no space left on device" on C:
# From repo root: .\apps\mobile\run-web.ps1
$env:TMP = "D:\tmp"
$env:TEMP = "D:\tmp"
if (-not (Test-Path "D:\tmp")) { New-Item -ItemType Directory -Path "D:\tmp" -Force | Out-Null }
Set-Location $PSScriptRoot
npx expo start --web --clear --port 8082
