@echo off
chcp 65001 > nul
title dental-report worker - PC2 자동 세팅

REM 더블클릭 진입점 — PowerShell 본체 실행
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-pc2.ps1"

echo.
pause
