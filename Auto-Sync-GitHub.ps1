# ==============================================================================
# AUTO-SYNC GITHUB & VERCEL WATCHER
# Monitorea automáticamente cambios en la carpeta del proyecto y hace
# git add, commit y push a origin/main para que GitHub y Vercel se actualicen solos.
# ==============================================================================
$ErrorActionPreference = "Continue"
$repoPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoPath

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "  AUTO-SYNC GITHUB + VERCEL ACTIVO" -ForegroundColor Green
Write-Host "  Repositorio: https://github.com/DaBi0212/Proyecto-Intercomunicacion-Seguridad-Redes.git" -ForegroundColor Gray
Write-Host "  Monitoreando cambios en: $repoPath" -ForegroundColor Gray
Write-Host "==============================================================" -ForegroundColor Cyan

while ($true) {
    try {
        $status = git status --porcelain
        if (-not [string]::IsNullOrWhiteSpace($status)) {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Write-Host "[$timestamp] Cambios detectados. Sincronizando con GitHub (origin/main)..." -ForegroundColor Yellow
            git add -A
            $commitMsg = "Auto-sync: actualizacion automatica ($timestamp)"
            git commit -m $commitMsg | Out-Null
            git push origin main
            Write-Host "[$timestamp] Sincronizado con GitHub y desplegando en Vercel." -ForegroundColor Green
        }
    } catch {
        Write-Host "Aviso en ciclo de sincronizacion: $_" -ForegroundColor DarkYellow
    }
    Start-Sleep -Seconds 8
}
