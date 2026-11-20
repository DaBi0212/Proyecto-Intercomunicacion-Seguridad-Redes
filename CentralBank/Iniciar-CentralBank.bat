@echo off
title CentralBank - Consola Maestra de Administracion
cd /d "%~dp0"
if exist "bin\Release\net10.0-windows\CentralBank.exe" (
    start "" "bin\Release\net10.0-windows\CentralBank.exe"
) else if exist "bin\Debug\net10.0-windows\CentralBank.exe" (
    start "" "bin\Debug\net10.0-windows\CentralBank.exe"
) else (
    dotnet run --configuration Release
)

