@echo off
cd /d "%~dp0"
title LZ Studio - Instalacion y arranque
echo LZ Studio - Instalacion y arranque del taller
echo Antes de continuar: apaga la maquina y desconecta su cable USB.
echo Esto permite reemplazar el conector anterior sin interrumpir la maquina.
echo.
py -3 setup_workshop.py
if errorlevel 1 echo No se completo. El detalle aparece arriba y en instalar-lz.log.
pause
