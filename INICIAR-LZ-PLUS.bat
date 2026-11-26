@echo off
title LZ-PLUS
cd /d "%~dp0"
where node >nul 2>nul || (echo Necesitas instalar Node.js desde https://nodejs.org & pause & exit /b)
node lz-servidor.js
pause
