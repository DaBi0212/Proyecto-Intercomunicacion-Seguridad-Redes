$port = 7070
$sock = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
try {
    $sock.Start()
    Write-Host "Puerto 7070 abierto con EXITO"
    $sock.Stop()
} catch {
    Write-Host "Error en 7070: $($_.Exception.Message)"
}
