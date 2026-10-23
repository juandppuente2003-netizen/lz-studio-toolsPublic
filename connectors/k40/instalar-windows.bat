@echo off
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto error
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto error
echo Verificando el motor M2 sin conectar el USB...
.venv\Scripts\python.exe -c "from bridge import M2Engine; engine=M2Engine({'width':400,'height':400}); engine.close()"
if errorlevel 1 goto error
echo Instalacion terminada. Abre simular-windows.bat para la primera prueba.
pause
exit /b 0
:error
echo No se pudo instalar. Se requiere Python 3.10 o posterior con el comando py disponible.
pause
exit /b 1
