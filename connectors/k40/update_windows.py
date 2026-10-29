"""Replace an idle authenticated connector; never kill Python processes."""
import json
import socket
import time
from urllib.error import URLError
from urllib.request import Request, urlopen
from bridge import PROTOCOL, pairing_path

ORIGIN = 'https://www.lzstudiotools.com'
VERSION = '0.7.1'


def listening():
    try:
        with socket.create_connection(('127.0.0.1', 17840), timeout=.5):
            return True
    except ConnectionRefusedError:
        return False


def request(route, body=None):
    token = json.loads(pairing_path().read_text(encoding='utf-8'))['token']
    req = Request('http://127.0.0.1:17840' + route,
                  headers={'Origin': ORIGIN, 'Authorization': 'Bearer ' + token,
                           'Content-Type': 'application/json'},
                  data=None if body is None else json.dumps(body).encode())
    with urlopen(req, timeout=5) as response:
        value = json.load(response)
    if value.get('protocol') != PROTOCOL:
        raise RuntimeError('El puerto pertenece a otro servicio; no se modifico.')
    return value


def stop_previous():
    if not listening():
        return
    status = request('/status')
    if status.get('state') != 'idle':
        raise RuntimeError('Hay trabajo pendiente o estado incierto. Finalizalo antes de actualizar.')
    print('Cerrando conector ' + status.get('bridgeVersion', '?') + ' sin trabajo activo...')
    request('/shutdown', {})
    for _ in range(50):
        if not listening():
            return
        time.sleep(.1)
    raise RuntimeError('El conector anterior no termino. No se inicio otra version.')


def verify_started():
    for _ in range(60):
        if listening():
            status = request('/status')
            if status.get('bridgeVersion') != VERSION:
                raise RuntimeError('Sigue respondiendo otra version: ' + str(status.get('bridgeVersion')))
            print('Conector ' + VERSION + ' comprobado. Codigo permanente conservado.')
            return
        time.sleep(.1)
    raise RuntimeError('No arranco el conector. Revisa connector.log en los datos de LZStudioTools.')


if __name__ == '__main__':
    import sys
    try:
        if sys.argv[1:] == ['--verify']:
            verify_started()
        else:
            stop_previous()
    except Exception as error:
        print('ACTUALIZACION DETENIDA: ' + str(error))
        sys.exit(1)
