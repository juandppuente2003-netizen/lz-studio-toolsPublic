@echo off
title LZ-PLUS - Permitir en la red
:: Pide permiso de administrador y abre el puerto 8080 en el Firewall de Windows
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath \"%~f0\" -Verb RunAs" & exit /b)
netsh advfirewall firewall delete rule name="LZ-PLUS 8080" >nul 2>&1
netsh advfirewall firewall add rule name="LZ-PLUS 8080" dir=in action=allow protocol=TCP localport=8080 profile=any
echo.
echo Listo. La TV ya puede abrir LZ-PLUS.
pause
