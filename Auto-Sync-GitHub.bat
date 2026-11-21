@echo off
title Auto-Sync GitHub y Vercel - Proyecto Redes
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Auto-Sync-GitHub.ps1"
