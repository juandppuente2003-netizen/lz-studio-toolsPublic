"""Build the source-only Windows connector; never include local credentials."""
import hashlib
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

FILES = (
    'LEEME-PRIMERO.txt', 'README.md', 'abrir-conector.vbs',
    'activar-inicio-windows.bat', 'desactivar-inicio-windows.bat',
    'instalar-windows.bat', 'simular-windows.bat', 'usb-windows.bat',
    'background.pyw', 'panel.pyw', 'windows_setup.py', 'bridge.py',
    'requirements.txt', 'test_bridge.py', 'test_windows.py',
    'registration.py', 'test_registration.py', 'update_windows.py',
    'operations.py', 'test_operations.py',
    'reparar-inicio-windows.bat',
    'diagnosticar-box.bat',
    'package_windows.py', 'setup_workshop.py', 'INICIAR-LZ-BOX.bat', 'test_setup_workshop.py',
)


def build():
    folder = Path(__file__).resolve().parent
    archive = folder / 'LZ-K40-Windows.zip'
    with ZipFile(archive, 'w', ZIP_DEFLATED) as package:
        for name in FILES:
            package.write(folder / name, 'LZ-K40-Windows/' + name)
    with ZipFile(archive) as package:
        assert package.testzip() is None
        assert len(package.namelist()) == len(FILES)
        bridge = package.read('LZ-K40-Windows/bridge.py')
        assert b"BRIDGE_VERSION = '0.7.1'" in bridge
        assert b"'bridgeVersion': '0.6" not in bridge, 'Versiones mezcladas en bridge.py'
        assert b"VERSION = '0.7.1'" in package.read('LZ-K40-Windows/setup_workshop.py')
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (folder / 'LZ-K40-Windows.sha256').write_text(checksum + '  ' + archive.name + '\n', encoding='utf-8')
    print(f'{archive.name}: {archive.stat().st_size} bytes, 0.7.1, CRC and SHA-256 OK')


if __name__ == '__main__':
    build()
