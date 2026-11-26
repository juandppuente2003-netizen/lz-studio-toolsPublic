@echo off
title LZ-PLUS
cd /d "%~dp0"
where node >nul 2>nul || (echo Necesitas instalar Node.js desde https://nodejs.org & pause & exit /b)
if not exist "node_modules\ffmpeg-static" (
  echo Instalando FFmpeg por unica vez, espera un momento...
  call npm install ffmpeg-static --no-audit --no-fund --loglevel=error
)
node lz-servidor.js
pause
