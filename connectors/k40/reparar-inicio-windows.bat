@echo off
cd /d "%~dp0"
echo LZ Studio - Reparar inicio del conector 0.6.2
echo Carpeta: %CD%
echo.
if not exist ".venv\Scripts\python.exe" goto missing
if not exist "background.pyw" goto missing
if not exist "registration.py" goto missing
.venv\Scripts\python.exe -c "from bridge import Bridge; from windows_setup import configure_startup; assert Bridge({'width':400,'height':400},simulation=True).info()['bridgeVersion']=='0.7.3', 'Esta carpeta no contiene el conector 0.7.3'; configure_startup(True); print('Inicio de Windows actualizado a esta carpeta. No se abrio el USB. No se cambio el codigo.')"
if errorlevel 1 goto error
echo.
echo REPARACION DE INICIO COMPLETADA.
echo Guarda tus trabajos y REINICIA WINDOWS desde Inicio - Encendido - Reiniciar.
echo No abras el conector de la carpeta anterior.
echo Despues del reinicio abre abrir-conector.vbs desde ESTA carpeta.
echo Debe mostrar Conector 0.6.2. Luego recarga Box.
pause
exit /b 0
:missing
echo Coloca este archivo dentro de la carpeta nueva LZ-K40-Windows,
echo junto a instalar-windows.bat y la carpeta .venv ya instalada.
goto error
:error
echo No se pudo reparar. Conserva esta ventana para ver el mensaje anterior.
pause
exit /b 1
