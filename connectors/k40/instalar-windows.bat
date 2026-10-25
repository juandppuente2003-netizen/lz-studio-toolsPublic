@echo off
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto error
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto error
echo Verificando el motor M2 sin conectar el USB...
.venv\Scripts\python.exe -c "from bridge import M2Engine; engine=M2Engine({'width':400,'height':400}); engine.close()"
if errorlevel 1 goto error
.venv\Scripts\python.exe -c "import tkinter"
if errorlevel 1 goto error
.venv\Scripts\python.exe -c "from windows_setup import configure_startup; configure_startup(True)"
if errorlevel 1 goto error
.venv\Scripts\python.exe update_windows.py
if errorlevel 1 goto error
.venv\Scripts\python.exe windows_setup.py --enable
if errorlevel 1 goto error
.venv\Scripts\python.exe update_windows.py --verify
if errorlevel 1 goto error
start "" abrir-conector.vbs
echo Instalacion terminada. Inicio automatico activado sin consola.
echo Conserva esta carpeta en su ubicacion. El conector NO mueve ni toma el USB al iniciar.
pause
exit /b 0
:error
echo No se completo la actualizacion. Revisa el mensaje anterior. No cierres trabajos activos.
echo Si el conector anterior no responde, el inicio ya apunta a esta carpeta nueva.
echo Guarda tus trabajos y reinicia Windows. Tambien puedes usar reparar-inicio-windows.bat.
pause
exit /b 1
