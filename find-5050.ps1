$files = Get-ChildItem -Path "C:\Users\david\Desktop\Proyecto Redes" -Recurse -Include *.cs,*.ts,*.json,*.html,*.ps1,*.bat | Where-Object { $_.FullName -notmatch '\\(node_modules|bin|obj|\.git|\.angular|dist)\\' }
foreach ($f in $files) {
    $matches = Select-String -Path $f.FullName -Pattern "5050"
    foreach ($m in $matches) {
        Write-Host "$($f.FullName):$($m.LineNumber): $($m.Line.Trim())"
    }
}
