# =============================================================================
# EZER dev environment launcher
#
# Starts everything needed to run EZER on the phone and in a browser, and — the
# important part — starts each piece DETACHED via Start-Process. Servers
# launched as children of a calling shell get reaped when that shell exits,
# which is why Metro/tunnels kept dying mid-session.
#
# Starts:
#   * Metro bundler on 8090   -> serves BOTH the Android dev-client and web
#   * ngrok on 8090           -> public URL for the phone (sticky hostname)
#   * cloudflared on 8090     -> public URL for the browser
#
# ONE Metro, not two. This machine has a 25.8 GB commit limit and sits near
# 21 GB with Chrome + VS Code open; a second Metro pushed it over and Windows
# killed both servers mid-bundle (the same exhaustion that made eas-cli die
# with "VirtualAlloc failed"). A single `expo start` serves android and web.
#
# PORTS: ezer-morgan-futures also lives in this repo and grabs Expo's defaults
# (8081/8082). It once took 8081 while EZER's Metro was down, which silently
# pointed the phone at the WRONG app — the dev-client loaded Morgan's bundle.
# EZER therefore uses 8090/8083, which nothing else claims. Do not move these
# back to 8081/8082.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\start-ezer-dev.ps1
# Stop:   scripts\stop-ezer-dev.ps1
# =============================================================================

param(
    # Skip the low-memory confirmation prompt. Required when launching this
    # script non-interactively � Read-Host would otherwise block with no window.
    [switch]$Force
)

$ErrorActionPreference = 'Continue'

$MobileDir   = Join-Path $PSScriptRoot '..\apps\mobile' | Resolve-Path
$StateDir    = Join-Path $PSScriptRoot '..\.tunnel'
$Tools       = 'D:\TEMP\claude\d--all-projects\5553444f-0523-4668-be53-9149fc36ad25\scratchpad'
$Ngrok       = Join-Path $Tools 'ngrok.exe'
$Cloudflared = Join-Path $Tools 'cloudflared.exe'
$PidFile     = Join-Path $StateDir 'pids.json'

New-Item -ItemType Directory -Force $StateDir | Out-Null
New-Item -ItemType Directory -Force 'D:\tmp'  | Out-Null

# =============================================================================
# Self-scoped cleanup.
#
# Only ever touch processes THIS script started. morgan-futures runs its own
# Metro on 8081 and its own cloudflared; sweeping by process name or by an
# "*expo*" command line would kill it. Re-running this script therefore replaces
# ezer's own Metro/ngrok/cloudflared and leaves everything else alone.
# =============================================================================

function Stop-TrackedProcess {
    param([int]$ProcessId, [string]$Name, [datetime]$StartTime)
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($proc.ProcessName -ne $Name) { return $false }          # PID recycled
    if ($StartTime -and [math]::Abs(($proc.StartTime - $StartTime).TotalSeconds) -gt 2) { return $false }
    return (Stop-ProcessHard -ProcessId $ProcessId)
}

# Stop-Process alone is not enough: node started from a detached cmd wrapper can
# return "Access is denied". taskkill /T /F walks the tree and succeeds where it
# does not. The failure must never be swallowed � a surviving Metro still answers
# on its port, and the phone then loads a stale bundle.
function Stop-ProcessHard {
    param([int]$ProcessId)
    try { Stop-Process -Id $ProcessId -Force -ErrorAction Stop; return $true } catch { }
    # Route taskkill through cmd so its stderr never reaches PowerShell. In PS 5.1
    # both "2>&1" and "2>$null" still surface a native exe's stderr as an
    # ErrorRecord, which can appear as a terminating error in the caller.
    try { & cmd.exe /c "taskkill /PID $ProcessId /T /F >nul 2>&1" | Out-Null } catch { }
    Start-Sleep -Milliseconds 500
    return ((Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) -eq $null)
}

function Save-TrackedPids {
    param([int[]]$Ids)
    $records = @()
    foreach ($id in $Ids) {
        if (-not $id) { continue }
        $p = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($p) { $records += @{ pid = $p.Id; name = $p.ProcessName; startTime = $p.StartTime.ToString('o') } }
    }
    $records | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $PidFile -Encoding utf8
}

# Memory pre-flight. Metro is commit-hungry and this machine has had Windows
# kill BOTH bundlers mid-bundle when ezer's and morgan's ran with no headroom.
$os = Get-CimInstance Win32_OperatingSystem
$commitFreeGb = [math]::Round($os.FreeVirtualMemory / 1MB, 1)
if ($commitFreeGb -lt 2) {
    Write-Host ''
    Write-Host "[ezer] WARNING: only $commitFreeGb GB of commit memory free." -ForegroundColor Yellow
    $other = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($other) {
        Write-Host "[ezer]          morgan-futures Metro is on port 8081 (PID $($other.OwningProcess))." -ForegroundColor Yellow
        Write-Host '[ezer]          Two bundlers at this headroom have been killed by Windows before.' -ForegroundColor Yellow
    }
    Write-Host ''
    if ($Force) {
        Write-Host '[ezer]          -Force given, continuing anyway.' -ForegroundColor Yellow
    } else {
        $answer = Read-Host 'Continue anyway? (y/N)'
        if ($answer -notmatch '^[Yy]') { Write-Host '[ezer] aborted.' -ForegroundColor DarkGray; exit 0 }
    }
}

Write-Host '[ezer] cleaning up previous ezer run...' -ForegroundColor Cyan
if (Test-Path -LiteralPath $PidFile) {
    try {
        $tracked = Get-Content -LiteralPath $PidFile -Raw | ConvertFrom-Json
        foreach ($t in @($tracked)) {
            if (Stop-TrackedProcess -ProcessId $t.pid -Name $t.name -StartTime ([datetime]$t.startTime)) {
                Write-Host "[ezer]   stopped $($t.name) (PID $($t.pid))" -ForegroundColor DarkGray
            }
        }
    } catch { Write-Host '[ezer]   (pids.json unreadable, falling back to port check)' -ForegroundColor DarkGray }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

# Fallback: whatever holds EZER's own port. Never 8081.
$heldEzer = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($heldEzer) {
    if (Stop-ProcessHard -ProcessId ([int]$heldEzer.OwningProcess)) {
        Write-Host "[ezer]   freed port 8090 (PID $($heldEzer.OwningProcess))" -ForegroundColor DarkGray
    }
}
Start-Sleep -Seconds 2

# Refuse to continue against a port we could not free � otherwise Wait-Port
# succeeds against the OLD Metro and the phone silently loads a stale bundle.
$stillEzer = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($stillEzer) {
    Write-Host ''
    Write-Host "[ezer] ERROR: port 8090 still held by PID $($stillEzer.OwningProcess) and could not be stopped." -ForegroundColor Red
    Write-Host '[ezer]        Refusing to continue against a stale server.' -ForegroundColor Red
    Write-Host "[ezer]        From an ADMIN PowerShell:  taskkill /PID $($stillEzer.OwningProcess) /T /F" -ForegroundColor Yellow
    exit 1
}

# Expo/Metro are temp-heavy and C: is tight on this machine.
$env:TMP = 'D:\tmp'; $env:TEMP = 'D:\tmp'

function Start-Detached($exe, $argList, $logName) {
    $out = Join-Path $StateDir "$logName.log"
    $err = Join-Path $StateDir "$logName.err.log"
    Start-Process -FilePath $exe -ArgumentList $argList `
        -WorkingDirectory $MobileDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $err
}

function Wait-Port($port, $seconds = 180) {
    foreach ($i in 1..$seconds) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

$trackedIds = @()

Write-Host '[ezer] starting Metro (8090)...' -ForegroundColor Cyan
$metroProc = Start-Detached 'cmd.exe' '/c npx expo start --port 8090' 'metro'
if ($metroProc) { $trackedIds += $metroProc.Id }

if (Wait-Port 8090) {
    Write-Host '[ezer] Metro listening on 8090' -ForegroundColor Green
    # The node process owning the port is a child of the cmd wrapper; track it too.
    $metroPid = (Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue |
                 Select-Object -First 1).OwningProcess
    if ($metroPid) { $trackedIds += [int]$metroPid }
}
else { Write-Host '[ezer] Metro did NOT come up — see .tunnel\metro.err.log' -ForegroundColor Red }

# --- public URL for the phone -------------------------------------------------
if (Test-Path $Ngrok) {
    Write-Host '[ezer] starting ngrok -> 8090...' -ForegroundColor Cyan
    $ngrokProc = Start-Detached $Ngrok 'http 8090 --log stdout --log-format json' 'ngrok'
    if ($ngrokProc) { $trackedIds += $ngrokProc.Id }

    $phoneUrl = $null
    foreach ($i in 1..40) {
        Start-Sleep -Seconds 3
        try {
            $t = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5
            $phoneUrl = ($t.tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1).public_url
            if ($phoneUrl) { break }
        } catch { }
    }
    if ($phoneUrl) {
        [System.IO.File]::WriteAllText((Join-Path $StateDir 'phone-url.txt'), $phoneUrl)
        Write-Host "[ezer] PHONE URL: $phoneUrl" -ForegroundColor Green
    }
}

# --- public URL for the web build --------------------------------------------
if (Test-Path $Cloudflared) {
    Write-Host '[ezer] starting cloudflared -> 8083...' -ForegroundColor Cyan
    $cfLog = Join-Path $StateDir 'cloudflared.err.log'
    if (Test-Path $cfLog) { Remove-Item $cfLog -Force -ErrorAction SilentlyContinue }
    $cfProc = Start-Detached $Cloudflared 'tunnel --url http://127.0.0.1:8090 --no-autoupdate' 'cloudflared'
    if ($cfProc) { $trackedIds += $cfProc.Id }

    $webUrl = $null
    foreach ($i in 1..40) {
        Start-Sleep -Seconds 3
        if (Test-Path $cfLog) {
            $m = Select-String -Path $cfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue
            if ($m) {
                $webUrl = ($m.Matches.Value | Where-Object { $_ -notlike '*api.*' } | Select-Object -First 1)
                if ($webUrl) { break }
            }
        }
    }
    if ($webUrl) {
        [System.IO.File]::WriteAllText((Join-Path $StateDir 'web-url.txt'), $webUrl)
        Write-Host "[ezer] WEB URL: $webUrl" -ForegroundColor Green
    }
}

# Record what we started so the next run replaces only these.
Save-TrackedPids -Ids $trackedIds

Write-Host ''
Write-Host '[ezer] ready. URLs are also saved in ezer\.tunnel\' -ForegroundColor Cyan
Write-Host '       morgan-futures (port 8081) is unaffected by this script.' -ForegroundColor DarkGray
Write-Host '       phone-url.txt  -> paste into the EZER dev-client launcher' -ForegroundColor DarkGray
Write-Host '       web-url.txt    -> open in any browser' -ForegroundColor DarkGray
Write-Host '       local web      -> http://localhost:8090' -ForegroundColor DarkGray


