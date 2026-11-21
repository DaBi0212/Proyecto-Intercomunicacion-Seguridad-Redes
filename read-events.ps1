$events = Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='.NET Runtime'} -MaxEvents 3
foreach ($e in $events) {
    Write-Host "--- EVENT ---"
    Write-Host $e.TimeCreated
    Write-Host $e.Message
}
