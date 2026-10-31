"""Single entry installer in a fixed per-user directory. No USB access."""
import ctypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.request import Request, urlopen

VERSION = '0.7.4'
SITE = 'https://www.lzstudiotools.com/box/index.html?celular=1'


def split_command(command):
    argc = ctypes.c_int()
    api = ctypes.windll.shell32.CommandLineToArgvW
    api.argtypes = [ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_int)]
    api.restype = ctypes.POINTER(ctypes.c_wchar_p)
    pointer = api(command, ctypes.byref(argc))
    if not pointer:
        raise RuntimeError('No se pudo identificar el proceso anterior.')
    try:
        return [pointer[i] for i in range(argc.value)]
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(pointer)


def lz_script(arguments):
    for argument in arguments:
        script = Path(argument)
        if script.name.lower() not in ('background.pyw', 'panel.pyw', 'bridge.py') or not script.is_file():
            continue
        source = script.parent / 'bridge.py'
        if source.is_file():
            text = source.read_text(encoding='utf-8')
            if 'lz-k40-m2/v1' in text and 'LZStudioTools' in text and 'pairing_path' in text:
                return script.resolve()
    return None


def own_processes():
    # Only our user's Python processes; never terminate unrelated Python apps.
    script = "$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; @(Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%.exe'\" | Where-Object {(Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid).Sid -eq $sid} | Select-Object ProcessId,CreationDate,CommandLine) | ConvertTo-Json -Compress"
    result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', script],
                            capture_output=True, text=True, timeout=20, check=True)
    values = json.loads(result.stdout or '[]')
    return values if isinstance(values, list) else [values]


def stop_lz_processes():
    for process in own_processes():
        pid = int(process['ProcessId'])
        if pid == os.getpid():
            continue
        script = lz_script(split_command(process.get('CommandLine') or ''))
        if not script:
            continue
        # Recheck identity immediately before termination to reject reused PIDs.
        current = next((p for p in own_processes() if int(p['ProcessId']) == pid), None)
        if not current:
            continue  # A venv redirector/child may exit with its parent.
        if current['CreationDate'] != process['CreationDate'] or current['CommandLine'] != process['CommandLine']:
            raise RuntimeError('Cambio un proceso durante la actualizacion. Vuelve a abrir este instalador.')
        print('Cerrando conector LZ anterior (PID ' + str(pid) + ').', flush=True)
        subprocess.run(['taskkill.exe', '/PID', str(pid), '/F'], capture_output=True, timeout=10, check=True)


def health(token):
    req = Request('http://127.0.0.1:17840/health', headers={
        'Origin': 'https://www.lzstudiotools.com', 'Authorization': 'Bearer ' + token})
    with urlopen(req, timeout=2) as response:
        return json.load(response)


def listener_pids():
    script = "@(Get-NetTCPConnection -LocalPort 17840 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique) | ConvertTo-Json -Compress"
    result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', script],
                            capture_output=True, text=True, timeout=10, check=True)
    value = json.loads(result.stdout or '[]')
    return set(value if isinstance(value, list) else [value])


def verify_identity(value, folder, listeners, processes):
    pid = value.get('pid')
    if not (value.get('protocol') == 'lz-k40-m2/v1' and value.get('bridgeVersion') == VERSION
            and type(pid) is int and pid > 0 and pid in listeners and value.get('ready') is True
            and Path(value.get('source', '')).resolve() == (folder / 'bridge.py').resolve()):
        return False
    process = next((p for p in processes if int(p['ProcessId']) == pid), None)
    if not process:
        return False
    script = lz_script(split_command(process.get('CommandLine') or ''))
    return script == (folder / 'background.pyw').resolve()


def main():
    if sys.platform != 'win32':
        raise RuntimeError('Este instalador se ejecuta en Windows.')
    if ctypes.windll.user32.MessageBoxW(None,
        'Apaga la maquina y desconecta su cable USB antes de continuar.\n\nSe cerraran las copias anteriores del conector LZ. No se conservan operaciones pendientes.\n\n¿La maquina esta apagada y el USB desconectado?',
        'Actualizar LZ Box Studio', 0x24) != 6:
        print('Instalacion cancelada; no se modifico el sistema.')
        return
    source = Path(__file__).resolve().parent
    folder = Path(os.environ['LOCALAPPDATA']) / 'LZStudioTools' / 'K40' / 'connector'
    folder.mkdir(parents=True, exist_ok=True)
    log_path = folder.parent / 'instalar-lz.log'
    from package_windows import FILES
    for name in FILES:
        if not (source / name).is_file():
            raise RuntimeError('Extrae TODO el ZIP antes de ejecutar INICIAR-LZ-BOX.bat. Falta ' + name)
    print('Preparando carpeta fija: ' + str(folder), flush=True)
    python = folder / '.venv' / 'Scripts' / 'python.exe'
    if not python.is_file():
        subprocess.run([sys.executable, '-m', 'venv', str(folder / '.venv')], check=True)
    # Validate dependencies before replacing the running connector.
    with log_path.open('w', encoding='utf-8') as log:
        print('Instalando dependencias. Registro: ' + str(log_path), flush=True)
        subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(source / 'requirements.txt')],
                       stdout=log, stderr=log, check=True)
    stop_lz_processes()
    for name in FILES:
        if (source / name).resolve() != (folder / name).resolve():
            shutil.copy2(source / name, folder / name)
    subprocess.run([str(python), '-c', 'from windows_setup import configure_startup; configure_startup(True)'],
                   cwd=folder, check=True)
    child = subprocess.Popen([str(folder / '.venv' / 'Scripts' / 'pythonw.exe'), str(folder / 'background.pyw')],
                             cwd=folder, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    token_file = folder.parent / 'pairing.json'
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            token = json.loads(token_file.read_text(encoding='utf-8'))['token']
            value = health(token)
            # Windows venv pythonw.exe can redirect to another Python PID.
            # Verify the real authenticated listener, not the launcher PID.
            if not verify_identity(value, folder, listener_pids(), own_processes()):
                raise RuntimeError('No coincide el conector: version=' + str(value.get('bridgeVersion'))
                    + ', PID=' + str(value.get('pid')) + ', carpeta=' + str(value.get('source')))
            print('Servidor comprobado: PID real ' + str(value['pid']) + '.', flush=True)
            break
        except (OSError, ValueError):
            if child.poll() is not None:
                raise RuntimeError('El conector no respondio y el lanzador termino. Revisa connector.log.')
            time.sleep(.25)
    else:
        raise RuntimeError('No respondio el proceso nuevo; no se abrio la maquina. Revisa connector.log.')
    # WScript uses Windows' actual Desktop location, including redirected folders.
    shortcut = "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path $w.SpecialFolders.Item('Desktop') 'LZ Box Studio.lnk')); $s.TargetPath='" + str(folder / 'abrir-conector.vbs').replace("'", "''") + "'; $s.WorkingDirectory='" + str(folder).replace("'", "''") + "'; $s.Save()"
    subprocess.run(['powershell.exe', '-NoProfile', '-Command', shortcut], check=True)
    os.startfile(str(folder / 'abrir-conector.vbs'))
    import webbrowser
    webbrowser.open(SITE)
    print('\nLISTO: conector ' + VERSION + ' verificado por PID, version y carpeta.', flush=True)
    print('Inicio con Windows y acceso LZ Box Studio creados. Codigo permanente conservado.')
    print('Ahora conecta USB, conecta desde Box y prueba Home con emision deshabilitada.')
    print('Celular: Operar maquina > Control desde celular > Generar emparejamiento.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('\nNO SE COMPLETO: ' + str(error), flush=True)
        sys.exit(1)
