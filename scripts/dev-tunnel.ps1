# =============================================================================
# EZER dev tunnel supervisor
#
# Exposes the local Metro bundler to the internet so the Android dev-client
# build can load JS from this machine over any network (phone off-WiFi).
#
# Cloudflare "quick" tunnels drop on their own — this happened three times in
# one session — and cloudflared does not always recover, so this script watches
# it and restarts it. Each restart mints a NEW random hostname, so the current
# URL is always written to current-url.txt for whoever needs it.
#
# The random-hostname churn is inherent to account-less quick tunnels. A free
# ngrok account (no domain purchase) grants one fixed hostname and removes it;
# see PERMANENT-SETUP note at the bottom.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\dev-tunnel.ps1
# =============================================================================

$ErrorActionPreference = 'Continue'

$MetroPort   = 8081
$Cloudflared = "D:\TEMP\claude\d--all-projects\5553444f-0523-4668-be53-9149fc36ad25\scratchpad\cloudflared.exe"
$StateDir    = Join-Path $PSScriptRoot '..\.tunnel'
$UrlFile     = Join-Path $StateDir 'current-url.txt'
$LogFile     = Join-Path $StateDir 'tunnel.log'

New-Item -ItemType Directory -Force $StateDir | Out-Null

if (-not (Test-Path $Cloudflared)) {
    Write-Host "cloudflared not found at $Cloudflared" -ForegroundColor Red
    Write-Host "Download: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    exit 1
}

$attempt = 0
while ($true) {
    $attempt++
    Write-Host "[tunnel] attempt $attempt -> http://127.0.0.1:$MetroPort" -ForegroundColor Cyan

    # Fresh log per attempt so the URL scrape below can't pick up a stale hostname.
    if (Test-Path $LogFile) { Remove-Item $LogFile -Force -ErrorAction SilentlyContinue }

    $proc = Start-Process -FilePath $Cloudflared `
        -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$MetroPort", '--no-autoupdate') `
        -RedirectStandardError $LogFile -RedirectStandardOutput "$LogFile.out" `
        -NoNewWindow -PassThru

    # Wait for the hostname to appear (cloudflared prints it on stderr).
    $url = $null
    foreach ($i in 1..60) {
        Start-Sleep -Seconds 2
        if (Test-Path $LogFile) {
            $m = Select-String -Path $LogFile -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue
            if ($m) {
                $url = ($m.Matches.Value | Where-Object { $_ -notlike '*api.*' } | Select-Object -First 1)
                if ($url) { break }
            }
        }
        if ($proc.HasExited) { break }
    }

    if ($url) {
        # No BOM: this file gets read by curl/bash, and a BOM corrupts the URL.
        [System.IO.File]::WriteAllText($UrlFile, $url)
        Write-Host "[tunnel] LIVE: $url" -ForegroundColor Green
        Write-Host "[tunnel] (written to $UrlFile)" -ForegroundColor DarkGray
        Write-Host "[tunnel] Enter this in the EZER dev-client launcher on your phone." -ForegroundColor DarkGray
    } else {
        Write-Host "[tunnel] no hostname yet; supervising anyway" -ForegroundColor Yellow
    }

    # Block until cloudflared dies, then loop and replace it.
    $proc.WaitForExit()
    [System.IO.File]::WriteAllText($UrlFile, "DOWN (restarting)")
    Write-Host "[tunnel] exited (code $($proc.ExitCode)); restarting in 5s" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

# --- PERMANENT-SETUP -------------------------------------------------------
# To stop the hostname changing on every restart:
#   1. Free account at https://dashboard.ngrok.com (no domain, no card)
#   2. Claim the included static domain, e.g. something.ngrok-free.app
#   3. ngrok config add-authtoken <TOKEN>
#   4. Replace the cloudflared call above with:
#        ngrok http $MetroPort --domain=<your-static-domain>
# The URL then never changes and the phone keeps working across reboots.
