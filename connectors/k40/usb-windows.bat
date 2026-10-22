@echo off
cd /d "%~dp0"
echo M2 experimental. Revisa primero la simulacion, el area real y el origen superior izquierdo.
echo Este perfil usa cama de 400 x 400 mm. Si tu cama difiere, ajusta --width y --height.
.venv\Scripts\python.exe bridge.py --usb --width 400 --height 400
pause
