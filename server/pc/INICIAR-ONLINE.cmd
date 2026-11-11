@echo off
chcp 65001 >nul
title CAATINGA - Servidor online
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Iniciar-Online.ps1"
if errorlevel 1 (
  echo.
  echo O servidor nao conseguiu iniciar. Veja a mensagem acima.
  pause
)
