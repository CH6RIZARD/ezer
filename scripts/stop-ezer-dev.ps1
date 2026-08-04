# Stops the EZER dev environment started by start-ezer-dev.ps1.
# Only touches Metro/web on EZER's ports plus the tunnel agents, so other
# projects' dev servers (e.g. ezer-morgan-futures on 8082) are left alone.

foreach ($port in 8081, 8083) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        Write-Host "[ezer] stopping listener on $port (pid $($c.OwningProcess))"
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

foreach ($name in 'ngrok', 'cloudflared') {
    Get-Process $name -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "[ezer] stopping $name (pid $($_.Id))"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

Write-Host '[ezer] stopped.'
