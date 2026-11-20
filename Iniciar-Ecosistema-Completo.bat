@echo off
title Ecosistema Completo - CentralBank + WalletPay + MarketStore
cd /d "%~dp0"

echo [1/3] Iniciando software de escritorio CentralBank (SQLite + API :5050)...
start "" "c:\Users\david\Desktop\Proyecto Redes\CentralBank\bin\Release\net10.0-windows\CentralBank.exe"

echo [2/3] Iniciando aplicacion movil WalletPay en http://localhost:4200 ...
start "WalletPay (:4200)" cmd /k "cd /d ""c:\Users\david\Desktop\Proyecto Redes\WalletPay"" && npm start"

echo [3/3] Iniciando tienda virtual MarketStore en http://localhost:4201 ...
start "MarketStore (:4201)" cmd /k "cd /d ""c:\Users\david\Desktop\Proyecto Redes\MarketStore"" && npm start"

