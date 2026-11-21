@echo off
title Ecosistema Completo - CentralBank + WalletPay + MarketStore + AutoSync GitHub
cd /d "%~dp0"

echo [1/4] Iniciando sincronizador automatico con GitHub y Vercel...
start "Auto-Sync GitHub & Vercel" cmd /c "cd /d ""%~dp0"" && Auto-Sync-GitHub.bat"

echo [2/4] Iniciando software de escritorio CentralBank (SQLite + API :5050)...
start "" "%~dp0CentralBank\bin\Release\net10.0-windows\CentralBank.exe"

echo [3/4] Iniciando aplicacion movil WalletPay en http://localhost:4200 ...
start "WalletPay (:4200)" cmd /k "cd /d ""%~dp0WalletPay"" && npm start"

echo [4/4] Iniciando tienda virtual MarketStore en http://localhost:4201 ...
start "MarketStore (:4201)" cmd /k "cd /d ""%~dp0MarketStore"" && npm start"
