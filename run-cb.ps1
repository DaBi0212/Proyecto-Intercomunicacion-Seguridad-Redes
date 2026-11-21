$binDir = "C:\Users\david\Desktop\Proyecto Redes\CentralBank\bin\Release\net10.0-windows"
$exePath = Join-Path $binDir "CentralBank.exe"

Write-Host "Iniciando CentralBank desde $exePath"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exePath
$psi.WorkingDirectory = $binDir
$psi.UseShellExecute = $true

$proc = [System.Diagnostics.Process]::Start($psi)
Write-Host "Proceso lanzado con PID: $($proc.Id)"

Start-Sleep -Seconds 4

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:5050/api/health" -TimeoutSec 5
    Write-Host "¡CentralBank está RESPONDIENDO OK!"
    Write-Host ($health | ConvertTo-Json -Compress)
} catch {
    Write-Host "CentralBank aun no responde en 5050: $($_.Exception.Message)"
}
