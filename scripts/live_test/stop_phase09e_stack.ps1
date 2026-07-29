# Cleanly stop processes listening on ports 3000, 8000, 8001, 8002
param()

$ports = @(3000, 8000, 8001, 8002)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $targetPid = $conn.OwningProcess
            if ($targetPid -and $targetPid -ne 0 -and $targetPid -ne 4) {
                Write-Host "Stopping process PID $targetPid listening on port $port..."
                Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
Write-Host "Ports 3000, 8000, 8001, 8002 are clean."
