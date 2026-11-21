$bin = "C:\Users\david\Desktop\Proyecto Redes\CentralBank\bin\Release\net10.0-windows\publish"
$exe = Join-Path $bin "CentralBank.exe"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.WorkingDirectory = $bin
$psi.RedirectStandardError = $true
$psi.RedirectStandardOutput = $true
$psi.UseShellExecute = $false

$proc = [System.Diagnostics.Process]::Start($psi)
$out = $proc.StandardOutput.ReadToEnd()
$err = $proc.StandardError.ReadToEnd()
$proc.WaitForExit(3000)

Write-Host "ExitCode: $($proc.ExitCode)"
Write-Host "OUT: $out"
Write-Host "ERR: $err"
