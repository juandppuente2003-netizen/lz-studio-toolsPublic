@echo off
cd /d "%~dp0"
.venv\Scripts\python.exe windows_setup.py --enable
if errorlevel 1 goto error
echo Listo. Al iniciar sesion en Windows el conector arrancara sin consola.
echo Conserva esta carpeta en su ubicacion. No se conecta al USB hasta que lo pidas desde Box.
start "" abrir-conector.vbs
pause
exit /b 0
:error
echo No se pudo activar. Ejecuta instalar-windows.bat primero.
pause
exit /b 1
