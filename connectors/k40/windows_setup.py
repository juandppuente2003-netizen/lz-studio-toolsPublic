"""Own HKCU startup entry only; never installs or changes USB drivers."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

RUN_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'
RUN_NAME = 'LZStudioK40'


def startup_command(folder=None):
    folder = Path(folder or __file__).resolve()
    if folder.is_file():
        folder = folder.parent
    pythonw = folder / '.venv' / 'Scripts' / 'pythonw.exe'
    script = folder / 'background.pyw'
    if not pythonw.is_file() or not script.is_file():
        raise RuntimeError('Ejecuta instalar-windows.bat desde la carpeta completa del conector.')
    return subprocess.list2cmdline([str(pythonw), str(script)])


def configure_startup(enabled):
    if sys.platform != 'win32':
        raise RuntimeError('Esta configuración se ejecuta en Windows.')
    import winreg
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            winreg.SetValueEx(key, RUN_NAME, 0, winreg.REG_SZ, startup_command())
        else:
            try:
                winreg.DeleteValue(key, RUN_NAME)
            except FileNotFoundError:
                pass


def start_background():
    folder = Path(__file__).resolve().parent
    command = startup_command(folder)
    # list2cmdline is only used for the registry string. Launch without a shell.
    return subprocess.Popen([str(folder / '.venv' / 'Scripts' / 'pythonw.exe'),
                             str(folder / 'background.pyw')], cwd=folder,
                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--enable', action='store_true')
    parser.add_argument('--disable', action='store_true')
    args = parser.parse_args()
    try:
        if args.enable == args.disable:
            raise RuntimeError('Elige --enable o --disable.')
        configure_startup(args.enable)
        if args.enable:
            start_background()
        print('Inicio automático ' + ('activado. Conector iniciado sin consola.' if args.enable else 'desactivado para próximos inicios de sesión.'))
    except Exception as error:
        print(str(error))
        sys.exit(1)
