param()

$action = New-ScheduledTaskAction -Execute "C:\Users\david\Desktop\Proyecto Redes\CentralBank\bin\Release\net10.0-windows\CentralBank.exe" -WorkingDirectory "C:\Users\david\Desktop\Proyecto Redes\CentralBank\bin\Release\net10.0-windows"
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "LaunchCentralBankTask" -Action $action -Principal $principal -Settings $settings -Force
Start-ScheduledTask -TaskName "LaunchCentralBankTask"
Start-Sleep -Seconds 5

$p = Get-Process -Name "CentralBank" -ErrorAction SilentlyContinue
if ($p) {
    Write-Host "CentralBank ESTA CORRIENDO EXITOSAMENTE! PID: $($p.Id)"
} else {
    Write-Host "No se encontró el proceso CentralBank."
}

try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:7070/api/health" -TimeoutSec 3
    Write-Host "API Health Response:" ($res | ConvertTo-Json -Compress)
} catch {
    Write-Host "Health check error: $($_.Exception.Message)"
}

Unregister-ScheduledTask -TaskName "LaunchCentralBankTask" -Confirm:$false
