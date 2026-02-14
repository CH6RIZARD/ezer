# Run any command with TMP/TEMP on D: to avoid "no space left on device" on C:
# Usage (from repo root): .\run-with-d-temp.ps1 pnpm mobile
#                         .\run-with-d-temp.ps1 pnpm mobile:web
#                         .\run-with-d-temp.ps1 pnpm dev
#                         .\run-with-d-temp.ps1 pnpm dev:api
$env:TMP = "D:\tmp"
$env:TEMP = "D:\tmp"
if (-not (Test-Path "D:\tmp")) { New-Item -ItemType Directory -Path "D:\tmp" -Force | Out-Null }
if ($args.Count -eq 0) {
    Write-Host "Usage: .\run-with-d-temp.ps1 <command> [args...]"
    Write-Host "Example: .\run-with-d-temp.ps1 pnpm mobile"
    exit 1
}
$cmd = $args[0]
$rest = @($args[1..($args.Count - 1)])
if ($rest.Count -gt 0) { & $cmd @rest } else { & $cmd }
