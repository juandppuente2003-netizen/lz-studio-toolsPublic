"""Loopback-only Box Studio bridge. Simulation is the default; USB is opt-in.

M2 power is adjusted on the physical panel. This bridge never exposes a shell,
arbitrary console commands, arbitrary files, or arbitrary EGV over HTTP.
"""
import argparse
import copy
import hashlib
import hmac
import io
import json
import math
import os
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROTOCOL = 'lz-k40-m2/v1'
ENGINE_VERSION = '0.9.9100'
MAX_BODY = 4_000_000
DEFAULT_ORIGINS = {'https://www.lzstudiotools.com', 'https://lzstudiotools.com',
                   'https://lz-studio-tools-d-git-a183ed-juandppuente2003-netizens-projects.vercel.app'}


def pairing_path():
    if os.name == 'nt':
        base = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local'))
    else:
        base = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
    return base / 'LZStudioTools' / 'K40' / 'pairing.json'


def load_pairing_token(path=None, reset=False):
    """A per-user credential, outside the source tree, retained across restarts."""
    path = Path(path) if path is not None else pairing_path()
    if path.exists() and not reset:
        data = json.loads(path.read_text(encoding='utf-8'))
        token = data.get('token') if isinstance(data, dict) else None
        if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{40,100}', token):
            raise ValueError('Emparejamiento inválido. Usa --reset-pairing para generar otro código.')
        return token
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    token = secrets.token_urlsafe(32)
    # A complete private file is prepared before replacement; no partial reads.
    temporary = path.with_name(path.name + '.' + secrets.token_hex(8) + '.tmp')
    try:
        fd = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            json.dump({'version': 1, 'token': token}, out)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return token


def numeric(value, minimum, maximum, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{label}: número inválido.')
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f'{label}: fuera del rango {minimum}–{maximum}.')
    return value


def validate_job(raw, bed):
    if not isinstance(raw, dict) or raw.get('protocol') != PROTOCOL or raw.get('board') != 'M2':
        raise ValueError('Trabajo incompatible. Se requiere M2.')
    if raw.get('bed') != bed:
        raise ValueError('El área de trabajo no coincide con la configurada en el conector.')
    speed = numeric(raw.get('speed'), 1, 100, 'Velocidad')
    passes = numeric(raw.get('passes'), 1, 10, 'Pasadas')
    if int(passes) != passes:
        raise ValueError('Las pasadas deben ser enteras.')
    paths = raw.get('paths')
    if not isinstance(paths, list) or not 1 <= len(paths) <= 4000:
        raise ValueError('Cantidad de trayectorias inválida.')
    cleaned, count, length = [], 0, 0
    for path in paths:
        if not isinstance(path, dict) or type(path.get('closed')) is not bool:
            raise ValueError('Trayectoria inválida.')
        points = path.get('points')
        if not isinstance(points, list) or len(points) < (3 if path['closed'] else 2):
            raise ValueError('Faltan puntos en una trayectoria.')
        count += len(points)
        if count > 50000:
            raise ValueError('El trabajo excede 50,000 puntos.')
        ring = []
        for point in points:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError('Coordenadas inválidas.')
            ring.append([numeric(point[0], 0, bed['width'], 'X'),
                         numeric(point[1], 0, bed['height'], 'Y')])
        pairs = list(zip(ring, ring[1:]))
        if path['closed']:
            pairs.append((ring[-1], ring[0]))
        path_length = sum(math.dist(a, b) for a, b in pairs)
        if path_length < 0.0254:
            raise ValueError('Trayectoria demasiado pequeña para la resolución de la M2.')
        length += path_length
        if length * passes > 500000:
            raise ValueError('El recorrido supera el límite de esta versión.')
        cleaned.append({'points': ring, 'closed': path['closed'],
                        'role': 'hole' if path.get('role') == 'hole' else 'outer'})
    # The UI already orders holes; enforce the phase ordering again at the bridge.
    cleaned.sort(key=lambda p: p['role'] != 'hole')
    return {'protocol': PROTOCOL, 'board': 'M2', 'bed': dict(bed),
            'name': str(raw.get('name', 'Caja MDF'))[:80],
            'speed': speed, 'passes': int(passes), 'paths': cleaned}


class _StopRequested(Exception):
    """Interrupt a normal packet wait so the priority stop can run."""


class M2Engine:
    """Compile using MeerK40t's real M2 driver. Compilation never opens USB."""
    def __init__(self, bed):
        from importlib.metadata import version
        if version('meerk40t') != ENGINE_VERSION:
            raise RuntimeError(f'Instala meerk40t=={ENGINE_VERSION} con requirements.txt.')
        from meerk40t.kernel import Kernel
        from meerk40t.internal_plugins import plugin
        from meerk40t.main import parser
        from meerk40t.lihuiyu.device import LihuiyuDevice
        self.kernel = Kernel('LZ-K40-Bridge', '0.1.0', 'LZ-K40-Bridge', ignore_settings=True)
        self.kernel.args = parser.parse_args(['-z'])
        self.kernel.add_plugin(plugin)
        self.kernel(partial=True)
        self.device = LihuiyuDevice(self.kernel, 'lz-box-m2', choices=[
            {'attr': 'board', 'default': 'M2'},
            {'attr': 'bedwidth', 'default': f"{bed['width']}mm"},
            {'attr': 'bedheight', 'default': f"{bed['height']}mm"},
            {'attr': 'supports_pwm', 'default': False},
            {'attr': 'mock', 'default': False},
            {'attr': 'home_corner', 'default': 'top-left'}])
        self.kernel.add_service('device', self.device, registered_path='provider/device/lhystudios')
        self.device.realize()
        self.usb_failed = False
        self.last_controller_status = None
        self.stop_requested = threading.Event()
        self.sending_stop = False
        self.transport_lock = threading.RLock()
        # MeerK40t normally retries USB errors. This bridge must NOT resume an
        # unattended job after a lost cable: stop at the first transport error.
        controller = self.device.controller
        read_status = controller.update_status
        def interruptible_status():
            if self.stop_requested.is_set() and not self.sending_stop:
                raise _StopRequested()
            return read_status()
        controller.update_status = interruptible_status
        send_packet = controller._send_and_confirm_packet
        def confirmed_packet(packet, checksum):
            stop_packet = packet == b'I' + b'F' * 29
            if self.stop_requested.is_set() and not stop_packet:
                raise _StopRequested()
            self.sending_stop = stop_packet
            try:
                result = send_packet(packet, checksum)
                if not result:
                    raise ConnectionError('La M2 no confirmó el paquete; no se avanzará la cola.')
                return result
            finally:
                self.sending_stop = False
        controller._send_and_confirm_packet = confirmed_packet
        process_queue = controller.process_queue
        def fail_closed_queue():
            try:
                if not self.connected():
                    raise ConnectionError('USB desconectado.')
                with self.transport_lock:
                    return process_queue()
            except _StopRequested:
                # Do not terminate here: the queued priority reset must still run.
                return False
            except ConnectionError:
                self.usb_failed = True
                controller.abort_retry()
                controller.abort()
                raise
        controller.process_queue = fail_closed_queue

    def compile(self, job, mode):
        from meerk40t.lihuiyu.driver import LihuiyuDriver
        from meerk40t.core.cutcode.linecut import LineCut
        from meerk40t.core.units import UNITS_PER_MM
        driver, output = LihuiyuDriver(self.device), io.BytesIO()
        driver.out_pipe = output
        origin = job.get('_start', [0, 0])
        if job.get('_home', True):
            driver.home()
        else:
            native = self.device.view.position(origin[0] * UNITS_PER_MM, origin[1] * UNITS_PER_MM)
            driver.native_x, driver.native_y = map(lambda n: int(round(n)), native)
        if mode == 'frame':
            points = [p for path in job['paths'] for p in path['points']]
            xs, ys = [p[0] for p in points], [p[1] for p in points]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]:
                driver.move_abs(x * UNITS_PER_MM, y * UNITS_PER_MM)
            # No LineCut and no laser_on in the frame branch.
        else:
            settings = {'speed': job['speed'], 'power': 1000,
                        'raster_step_x': 0, 'raster_step_y': 0}
            # power=1000 is continuous firing/PPI, NOT a software power setting.
            for _ in range(job['passes']):
                for path in job['paths']:
                    points = [self.device.view.position(x * UNITS_PER_MM, y * UNITS_PER_MM)
                              for x, y in path['points']]
                    pairs = list(zip(points, points[1:]))
                    if path['closed']:
                        pairs.append((points[-1], points[0]))
                    for start, end in pairs:
                        if start != end:
                            driver.plot(LineCut(start, end, settings=settings))
                    driver.plot_start()
            driver.rapid_mode()
            driver.laser_off()
        # Return to the selected work origin, never to Home in current mode.
        if '_start' in job:
            driver.move_abs(origin[0] * UNITS_PER_MM, origin[1] * UNITS_PER_MM)
        return output.getvalue()

    def compile_motion(self, start, target, home=False):
        from meerk40t.lihuiyu.driver import LihuiyuDriver
        from meerk40t.core.units import UNITS_PER_MM
        driver, output = LihuiyuDriver(self.device), io.BytesIO()
        driver.out_pipe = output
        if home:
            driver.home()
        else:
            driver.native_x, driver.native_y = [int(round(v)) for v in
                self.device.view.position(start[0] * UNITS_PER_MM, start[1] * UNITS_PER_MM)]
            driver.laser_off()
            driver.move_abs(target[0] * UNITS_PER_MM, target[1] * UNITS_PER_MM)
        return output.getvalue()

    def finished(self):
        # Same FINISH statuses used by the pinned driver's wait_finished().
        if not self.transport_lock.acquire(blocking=False):
            return False
        try:
            if self.remaining() or self.failed():
                return False
            self.device.controller.update_status()
            status = self.device.controller._status
            self.last_controller_status = status[1] if status and len(status) > 1 else None
            return bool(status and len(status) > 1 and status[1] in (0xEC, 0xCC))
        except _StopRequested:
            return False
        except ConnectionError:
            self.usb_failed = True
            self.device.controller.abort_retry()
            self.device.controller.abort()
            raise
        finally:
            self.transport_lock.release()

    def _guard_connection(self, connection):
        if getattr(connection, '_lz_stop_guard', False):
            return
        write = connection.write
        def guarded_write(packet):
            if self.stop_requested.is_set() and not self.sending_stop:
                raise _StopRequested()
            return write(packet)
        connection.write = guarded_write
        connection._lz_stop_guard = True

    def connect(self):
        self.device.controller.open()
        connection = self.device.controller.connection
        if connection is None or not connection.is_connected():
            raise ConnectionError('No se encontró una M2 disponible por USB. Cierra Sagaon/K40 Whisperer.')
        self._guard_connection(connection)

    def send(self, data):
        self.device.controller.write(data)

    def remaining(self):
        return len(self.device.controller)

    def connected(self):
        c = self.device.controller.connection
        return c is not None and c.is_connected()

    def failed(self):
        return self.usb_failed or self.device.controller.state == 'terminate' or not self.connected()

    def cancel(self):
        controller = self.device.controller
        self.stop_requested.set()
        controller.pause()
        controller.abort_waiting = True
        if self.usb_failed or not self.connected() or controller.aborted_retries:
            controller.abort_retry()
            controller.abort()
            raise ConnectionError('Sin USB para solicitar parada. Usa el paro físico.')
        # Never acquire transport_lock here: process_queue may hold it while
        # waiting for the very movement we are trying to cancel. Queue locks
        # only protect memory, not USB. An in-flight USB call may still finish.
        controller._acquire_all_buffer_locks()
        try:
            controller._buffer.clear()
            controller._queue.clear()
            controller._realtime_buffer.clear()
            controller._preempt.clear()
        finally:
            controller._release_all_buffer_locks()
        # This wakes the queue and transmits MeerK40t's priority reset. Normal
        # packet waits are interrupted above; reset waits remain allowed.
        self.device.driver.reset()

    def close(self):
        try:
            self.device.controller.abort_retry()
            self.device.controller.abort()
            self.device.controller.close()
        finally:
            self.kernel()


class Bridge:
    def __init__(self, bed, simulation=True, engine_factory=M2Engine):
        self.bed, self.simulation = bed, simulation
        self.engine_factory, self.engine = engine_factory, None
        self.state, self.message = 'idle', 'Sin trabajo activo.'
        self.job, self.payload, self.id, self.expires = None, b'', None, 0
        self.lock = threading.RLock()
        self.position, self.pending_position, self.operation = None, None, None
        self.shutting_down = False

    def info(self):
        return {'protocol': PROTOCOL, 'board': 'M2', 'bed': self.bed,
                'simulation': self.simulation, 'powerControl': 'manual',
                'bridgeVersion': '0.4.1', 'features': ['persistent-pairing', 'disconnect', 'priority-stop', 'jog', 'current-origin', 'automatic-completion'],
                'position': self.position, 'positionEstimated': True, 'operation': self.operation,
                'controllerStatus': getattr(self.engine, 'last_controller_status', None),
                'connected': self.engine is not None and (self.simulation or self.engine.connected())}

    def get_engine(self):
        if self.shutting_down:
            raise RuntimeError('El conector se está cerrando.')
        if self.engine is None:
            self.engine = self.engine_factory(self.bed)
        return self.engine

    def connect(self):
        with self.lock:
            if self.state in ('sending', 'sent', 'cancelled', 'error'):
                raise ValueError('Confirma primero que la máquina se detuvo.')
            engine = self.get_engine()
            if not self.simulation:
                engine.connect()
            return self.info()

    def prepare(self, raw, mode, origin='home'):
        with self.lock:
            if self.state not in ('idle', 'prepared'):
                raise ValueError('Hay un trabajo pendiente. Verifica la máquina antes de continuar.')
            if mode not in ('cut', 'frame'):
                raise ValueError('Operación no compatible.')
            self.id, self.payload, self.state = None, b'', 'idle'
            job = validate_job(raw, self.bed)
            if origin not in ('home', 'current'):
                raise ValueError('Origen no compatible.')
            start = [0, 0]
            if origin == 'current':
                if self.position is None:
                    raise ValueError('Haz Home una vez para establecer la posición antes de usar el origen actual.')
                start = list(self.position)
                minimum = [min(p[axis] for path in job['paths'] for p in path['points']) for axis in (0, 1)]
                placed = copy.deepcopy(job)
                for path in placed['paths']:
                    path['points'] = [[round(p[axis] - minimum[axis] + start[axis], 6) for axis in (0, 1)] for p in path['points']]
                job = validate_job(placed, self.bed)
            job['_start'], job['_home'] = start, origin == 'home'
            self.pending_position, self.operation = start, mode
            payload = self.get_engine().compile(job, mode)
            if not payload:
                raise ValueError('El motor no generó instrucciones.')
            self.job, self.payload = job, payload
            self.id = hashlib.sha256(payload + secrets.token_bytes(32)).hexdigest()
            self.expires = time.monotonic() + 300
            self.state = 'prepared'
            return {'id': self.id, 'bytes': len(payload), 'mode': mode, **self.info()}

    def run(self, job_id, confirmed):
        with self.lock:
            if confirmed is not True or self.state != 'prepared' or not self.id or not isinstance(job_id, str) or not hmac.compare_digest(job_id, self.id):
                raise ValueError('El trabajo no está preparado, ya se envió o falta confirmarlo.')
            if time.monotonic() > self.expires:
                self.state, self.id = 'idle', None
                raise ValueError('El trabajo preparado expiró. Prepáralo nuevamente.')
            self.state = 'sending'
            if self.simulation:
                self.state, self.message = 'simulated', 'Simulación completada: instrucciones M2 generadas, sin conexión USB ni movimiento.'
            else:
                try:
                    engine = self.get_engine()
                    if not engine.connected():
                        raise ConnectionError('La conexión USB se perdió. No se reenvió el trabajo.')
                    engine.send(self.payload)
                    self.message = 'Enviando instrucciones a la controladora.'
                except Exception:
                    self.state, self.message = 'error', 'Falló el envío. Verifica físicamente la máquina; no se reintentará este trabajo automáticamente.'
                    raise
            self.position = None  # Unknown until completion/explicit acknowledgement.
            return self.status()

    def motion(self, action, dx=0, dy=0, confirmed=False):
        with self.lock:
            if confirmed is not True:
                raise ValueError('Confirma el área libre antes de mover el cabezal.')
            if self.state not in ('idle', 'prepared'):
                raise ValueError('Hay una operación pendiente. No se acumulan movimientos.')
            if not self.engine or (not self.simulation and not self.engine.connected()):
                self.position = None
                raise ConnectionError('Conecta la M2 antes de moverla.')
            if action == 'home':
                start, target = [0, 0], [0, 0]
            elif action == 'jog':
                if self.position is None:
                    raise ValueError('Haz Home una vez para establecer la posición.')
                dx, dy = numeric(dx, -50, 50, 'Movimiento X'), numeric(dy, -50, 50, 'Movimiento Y')
                if (dx == 0) == (dy == 0):
                    raise ValueError('Mueve solo un eje por pulsación, entre 0.1 y 50 mm.')
                if max(abs(dx), abs(dy)) < 0.1:
                    raise ValueError('El paso mínimo es 0.1 mm.')
                start = list(self.position)
                target = [round(round((start[i] + d) / 0.0254) * 0.0254, 6) for i, d in enumerate((dx, dy))]
                for i, size in enumerate((self.bed['width'], self.bed['height'])):
                    numeric(target[i], 0, size, 'Posición destino')
            else:
                raise ValueError('Movimiento no compatible.')
            payload = self.engine.compile_motion(start, target, home=action == 'home')
            if not payload or b'D' in payload:
                raise ValueError('El movimiento no produjo instrucciones válidas sin láser.')
            self.payload, self.id, self.job = payload, None, None
            self.operation, self.pending_position, self.position = action, target, None
            self.state = 'sending'
            if self.simulation:
                self.position, self.pending_position, self.state = target, None, 'idle'
                self.message = 'Simulación: movimiento calculado, sin USB ni movimiento físico.'
            else:
                try:
                    self.engine.send(payload)
                    self.message = 'Movimiento enviado. Esperando que la controladora indique fin.'
                except Exception:
                    self.state, self.pending_position = 'error', None
                    self.message = 'Falló el movimiento. La posición quedó sin referencia.'
                    raise
            return self.status()

    def status(self):
        with self.lock:
            remaining = 0
            if self.state == 'sending':
                remaining = self.engine.remaining()
                if self.engine.failed():
                    self.state, self.message = 'error', 'Se perdió la comunicación USB. Verifica la máquina; no reinicies el trabajo automáticamente.'
                elif remaining == 0:
                    self.state, self.message = 'sent', 'Datos enviados. Esperando fin de la controladora; el panel quedará listo automáticamente.'
            if self.state == 'error':
                self.position, self.pending_position = None, None
            if self.state == 'sent' and self.operation in ('home', 'jog', 'frame', 'cut'):
                try:
                    if self.engine.finished():
                        self.position, self.pending_position, self.state = self.pending_position, None, 'idle'
                        self.message = 'Operación terminada según la controladora. Lista para continuar.'
                        self.id, self.payload = None, b''
                except ConnectionError:
                    self.state, self.position, self.pending_position = 'error', None, None
                    self.message = 'Se perdió USB al comprobar el movimiento. Haz Home tras recuperar la conexión.'
            if self.state == 'idle' and self.engine and not self.simulation and not self.engine.connected():
                self.position = None
            percent = max(0, min(100, round(100 * (1 - remaining / max(1, len(self.payload))))))
            return {'state': self.state, 'message': self.message, 'percent': percent, **self.info()}

    def cancel(self):
        with self.lock:
            self.position, self.pending_position = None, None
            if self.engine and not self.simulation:
                try:
                    self.engine.cancel()
                except Exception:
                    self.state, self.message, self.id = 'error', 'No se pudo solicitar parada por USB. Usa el paro físico; no se reintentará el trabajo.', None
                    raise
            self.state, self.message = 'cancelled', 'Cancelación solicitada: cola descartada y reinicio M2 solicitado. La parada física NO está confirmada. Si sigue funcionando, usa el paro físico.'
            self.id = None
            return self.status()

    def acknowledge(self, confirmed):
        with self.lock:
            if confirmed is not True or self.state not in ('sent', 'simulated', 'cancelled', 'error'):
                raise ValueError('Cancela o espera el envío y verifica que la máquina se detuvo.')
            if self.state in ('sent', 'simulated'):
                self.position = self.pending_position
            else:
                self.position = None
                if self.engine:
                    self.engine.close()
                    self.engine = None
            self.pending_position = None
            self.state, self.message, self.id, self.payload = 'idle', 'Lista para otra operación.', None, b''
            return self.status()

    def disconnect(self):
        with self.lock:
            if self.state not in ('idle', 'prepared'):
                raise ValueError('Espera o cancela el envío y confirma que la máquina se detuvo antes de liberar el USB.')
            if self.engine:
                self.engine.close()
                self.engine = None
            self.id, self.payload, self.job = None, b'', None
            self.position, self.pending_position = None, None
            self.state, self.message = 'idle', 'USB liberado. Puedes usar Sagaon/K40 Whisperer.'
            return self.status()

    def shutdown(self):
        with self.lock:
            result = self.disconnect()
            self.shutting_down = True
            return result

    def close(self):
        if self.engine:
            self.engine.close()


def make_server(bridge, token, origins, port=17840):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log the Authorization header or design content.

        def reply(self, code, data):
            body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(code)
            origin = self.headers.get('Origin')
            if origin in origins:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def allowed(self, authenticate=True):
            if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}' or self.headers.get('Origin') not in origins:
                self.reply(403, {'error': 'Origen no permitido.'})
                return False
            if authenticate and not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + self.server.pairing_token):
                self.reply(401, {'error': 'Código del conector incorrecto.'})
                return False
            return True

        def do_OPTIONS(self):
            if self.allowed(False):
                self.reply(200, {})

        def do_GET(self):
            if not self.allowed():
                return
            if self.path == '/status':
                self.reply(200, bridge.status())
            else:
                self.reply(404, {'error': 'Ruta no encontrada.'})

        def do_POST(self):
            if not self.allowed():
                return
            try:
                if self.headers.get('Content-Type') != 'application/json' or self.headers.get('Transfer-Encoding'):
                    raise ValueError('Envía JSON con longitud conocida.')
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_BODY:
                    raise ValueError('El cuerpo de la solicitud es demasiado grande o está vacío.')
                data = json.loads(self.rfile.read(length), parse_constant=lambda _: (_ for _ in ()).throw(ValueError('JSON no finito.')))
                if not isinstance(data, dict):
                    raise ValueError('Solicitud inválida.')
                if self.path == '/connect':
                    result = bridge.connect()
                elif self.path == '/disconnect':
                    result = bridge.disconnect()
                elif self.path == '/prepare':
                    result = bridge.prepare(data.get('job'), data.get('mode'), data.get('origin', 'home'))
                elif self.path == '/motion':
                    result = bridge.motion(data.get('action'), data.get('dx', 0), data.get('dy', 0), data.get('confirmed'))
                elif self.path == '/shutdown':
                    result = bridge.shutdown()
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                elif self.path == '/run':
                    result = bridge.run(data.get('id'), data.get('confirmed'))
                elif self.path == '/cancel':
                    if data.get('confirmed') is not True:
                        raise ValueError('Falta confirmar la cancelación.')
                    result = bridge.cancel()
                elif self.path == '/acknowledge':
                    result = bridge.acknowledge(data.get('confirmed'))
                else:
                    self.reply(404, {'error': 'Ruta no encontrada.'})
                    return
                self.reply(200, result)
            except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
                self.reply(400, {'error': str(error)})
            except ImportError as error:
                message = ('Falta Pillow (PIL). Cierra el conector y vuelve a ejecutar instalar-windows.bat actualizado.'
                           if getattr(error, 'name', None) == 'PIL' else
                           'Falta una dependencia del conector. Cierra el conector y vuelve a ejecutar instalar-windows.bat actualizado.')
                self.reply(503, {'error': message})
            except RuntimeError as error:
                self.reply(503, {'error': str(error)})
            except Exception:
                self.reply(503, {'error': 'No se pudo completar la operación. Comprueba el USB, el driver y que Sagaon/K40 Whisperer esté cerrado.'})
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.pairing_token = token
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description='Conector local experimental LZ K40 M2. Simulación por defecto.')
    parser.add_argument('--usb', action='store_true', help='Habilita USB real; los cortes aún requieren confirmación desde Box.')
    parser.add_argument('--width', type=float, default=400)
    parser.add_argument('--height', type=float, default=400)
    parser.add_argument('--origin', action='append', default=[], help='Origen exacto adicional para pruebas; sin barra final.')
    parser.add_argument('--reset-pairing', action='store_true', help='Genera un nuevo código e invalida los guardados anteriormente.')
    args = parser.parse_args()
    bed = {'width': numeric(args.width, 50, 2500, 'Ancho'), 'height': numeric(args.height, 50, 2500, 'Alto')}
    bridge = Bridge(bed, simulation=not args.usb)
    # Bind first: a second launch must not rotate the running bridge's credential.
    server = make_server(bridge, '', DEFAULT_ORIGINS | set(args.origin))
    try:
        token = load_pairing_token(reset=args.reset_pairing)
        server.pairing_token = token
    except Exception:
        server.server_close()
        raise
    print('LZ K40 M2 · ' + ('USB REAL · experimental' if args.usb else 'SIMULACIÓN · no mueve la máquina'))
    print(f"Cama: {bed['width']} × {bed['height']} mm · Home superior izquierdo")
    print('Código para emparejar Box (se conserva al reiniciar): ' + token)
    print('Deja esta ventana abierta. Ctrl+C cierra el conector.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        bridge.close()


if __name__ == '__main__':
    main()
