"""Simulated tests for lz-k40-m2/v2. They compile real M2 bytes; no USB is opened."""
import base64
import io
import unittest
from PIL import Image, ImageDraw
from bridge import Bridge, M2Engine, validate_job, PROTOCOL
from operations import PROTOCOL_V2, validate_job_v2, bounds_v2, place_v2, NATIVE_MM
from test_bridge import FakeEngine

BED = {'width': 400, 'height': 400}


def png(width=60, height=30, draw=True, mode='1'):
    image = Image.new(mode, (width, height), 255 if mode != '1' else 1)
    if draw:
        ImageDraw.Draw(image).ellipse((0, 0, width - 1, height - 1), fill=0)
    out = io.BytesIO()
    image.save(out, 'PNG')
    return base64.b64encode(out.getvalue()).decode()


def square(x, y, size, role='outer'):
    return {'points': [[x, y], [x + size, y], [x + size, y + size], [x, y + size]], 'closed': True, 'role': role}


def raster_op(**raster):
    base = {'x': 50, 'y': 60, 'step': 4, 'width': 60, 'height': 30, 'png': png(), 'bidirectional': True}
    base.update(raster)
    return {'type': 'raster', 'name': 'Grabado imagen', 'speed': 200, 'passes': 1, 'raster': base}


def combined():
    return {'protocol': PROTOCOL_V2, 'board': 'M2', 'bed': dict(BED), 'name': 'Placa', 'operations': [
        raster_op(),
        {'type': 'vector', 'name': 'Grabado vectorial', 'speed': 60, 'passes': 1,
         'paths': [{'points': [[40, 40], [120, 40]], 'closed': False}]},
        {'type': 'vector', 'name': 'Corte', 'speed': 8, 'passes': 2,
         'paths': [square(30, 30, 100), square(60, 100, 10, 'hole')]},
    ]}


class ValidationTests(unittest.TestCase):
    def test_v1_is_unchanged_and_rejected_by_v2(self):
        v1 = {'protocol': PROTOCOL, 'board': 'M2', 'bed': dict(BED), 'speed': 10, 'passes': 1,
              'paths': [square(10, 10, 10)]}
        self.assertEqual(validate_job(v1, BED)['protocol'], PROTOCOL)
        with self.assertRaises(ValueError):
            validate_job_v2(v1, BED)
        with self.assertRaises(ValueError):
            validate_job(combined(), BED)

    def test_per_operation_speed_passes_and_order(self):
        job = validate_job_v2(combined(), BED)
        self.assertEqual([op['type'] for op in job['operations']], ['raster', 'vector', 'vector'])
        self.assertEqual([op['passes'] for op in job['operations']], [1, 1, 2])
        self.assertEqual(job['operations'][2]['paths'][0]['role'], 'hole')  # holes first inside the cut

    def test_limits(self):
        cases = [
            lambda j: j['operations'][2].update(passes=1.5),
            lambda j: j['operations'][2].update(speed=150),           # vector > 100 mm/s
            lambda j: j['operations'][0].update(speed=5),             # raster < 10 mm/s
            lambda j: j['operations'][0]['raster'].update(step=0),
            lambda j: j['operations'][0]['raster'].update(width=61),  # declared size mismatch
            lambda j: j['operations'][0]['raster'].update(x=398),     # exceeds bed
            lambda j: j['operations'][0]['raster'].update(png='bm90IHBuZw=='),
            lambda j: j['operations'][0]['raster'].update(png=png(draw=False)),  # nothing to burn
            lambda j: j['operations'][1].update(type='shell'),
            lambda j: j.update(operations=[]),
            lambda j: j.update(bed={'width': 300, 'height': 400}),
        ]
        for change in cases:
            job = combined()
            change(job)
            with self.assertRaises(ValueError):
                validate_job_v2(job, BED)

    def test_greyscale_png_is_thresholded_not_power_scaled(self):
        job = combined()
        job['operations'][0]['raster']['png'] = png(mode='L')
        image = validate_job_v2(job, BED)['operations'][0]['raster']['image']
        self.assertEqual(set(image.getdata()) <= {0, 255}, True)

    def test_bounds_and_current_origin_placement(self):
        job = validate_job_v2(combined(), BED)
        x0, y0, x1, y1 = bounds_v2(job)
        self.assertEqual((x0, y0, x1), (30, 30, 130))
        placed = place_v2(job, [5, 5], BED)
        self.assertEqual(bounds_v2(placed)[:2], (5, 5))
        self.assertAlmostEqual(placed['operations'][0]['raster']['x'], 25)
        with self.assertRaises(ValueError):
            place_v2(job, [350, 5], BED)

    def test_anchor_keeps_separately_sent_operations_aligned(self):
        only_raster = combined()
        only_raster['operations'] = only_raster['operations'][:1]
        only_raster['anchor'] = [30, 30]                  # esquina del trabajo completo
        job = validate_job_v2(only_raster, BED)
        placed = place_v2(job, [5, 5], BED)
        self.assertAlmostEqual(placed['operations'][0]['raster']['x'], 25)   # 50 - 30 + 5
        bad = combined(); bad['anchor'] = [40, 40]
        with self.assertRaises(ValueError):
            validate_job_v2(bad, BED)


class CompileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = M2Engine(BED)

    @classmethod
    def tearDownClass(cls):
        cls.engine.close()

    def test_raster_vector_and_combined_compile(self):
        job = validate_job_v2(combined(), BED)
        job['_start'], job['_home'] = [0, 0], True
        cut = self.engine.compile(job, 'cut')
        self.assertTrue(cut.startswith(b'IPP'))
        self.assertIn(b'G004', cut)      # raster step 4 native units in the speed code
        self.assertIn(b'D', cut)         # laser on
        frame = self.engine.compile(job, 'frame')
        self.assertNotIn(b'D', frame)    # frame never fires

    def test_operation_passes_multiply_output(self):
        once = combined()
        once['operations'] = once['operations'][:1]
        twice = combined()
        twice['operations'] = twice['operations'][:1]
        twice['operations'][0]['passes'] = 2
        a, b = validate_job_v2(once, BED), validate_job_v2(twice, BED)
        for j in (a, b):
            j['_start'], j['_home'] = [0, 0], True
        self.assertGreater(len(self.engine.compile(b, 'cut')), len(self.engine.compile(a, 'cut')) * 1.5)

    def test_raster_resolution_is_physical(self):
        # 60 px × step 4 × 0.0254 mm = 6.096 mm wide.
        job = validate_job_v2(combined(), BED)
        self.assertAlmostEqual(job['operations'][0]['raster']['sizeMm'][0], 60 * 4 * NATIVE_MM)


class BridgeFlowTests(unittest.TestCase):
    def bridge(self):
        b = Bridge(BED, simulation=True, engine_factory=FakeEngine)
        b.connect()
        return b

    def test_simulated_v2_flow_and_outcome(self):
        b = self.bridge()
        prepared = b.prepare(combined(), 'cut')
        self.assertEqual([o['type'] for o in prepared['operations']], ['raster', 'vector', 'vector'])
        self.assertIn('operations-v2', prepared['features'])
        self.assertEqual(b.run(prepared['id'], True)['state'], 'simulated')
        done = b.acknowledge(True)
        self.assertEqual(done['outcome']['result'], 'simulated')
        with self.assertRaises(ValueError):
            b.run(prepared['id'], True)   # no duplicate send

    def test_v2_current_origin_requires_reference_and_aligned_is_rejected(self):
        b = self.bridge()
        with self.assertRaises(ValueError):
            b.prepare(combined(), 'frame', 'current')
        b.motion('home', confirmed=True)
        b.motion('jog', 10, 0, confirmed=True)
        prepared = b.prepare(combined(), 'frame', 'current')
        self.assertEqual(b.job['_start'], b.position)
        self.assertEqual(list(bounds_v2(b.job)[:2]), b.position)
        self.assertTrue(prepared['id'])
        with self.assertRaises(ValueError):
            b.prepare(combined(), 'cut', 'aligned', {})

    def test_real_usb_cancel_keeps_engine_and_reports_cancelled(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect()
        prepared = b.prepare(combined(), 'cut')
        b.run(prepared['id'], True)
        engine = b.engine
        b.cancel()
        engine.reset_done = True
        status = b.status()
        self.assertEqual(status['state'], 'idle')
        self.assertEqual(status['outcome']['result'], 'cancelled')
        self.assertIs(b.engine, engine)     # Stop/cancel never closes USB
        self.assertIsNone(status['position'])  # stopped mid-job: Home is required

    def test_real_usb_finish_requires_controller_not_transfer(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect()
        b.motion('home', confirmed=True)
        b.engine.left = 0
        b.status()
        prepared = b.prepare(combined(), 'cut')
        b.engine.left = 50
        self.assertEqual(b.run(prepared['id'], True)['state'], 'sending')
        b.engine.left, b.engine.done = 0, False
        self.assertEqual(b.status()['state'], 'sent')   # data sent, motion not finished
        b.engine.done = True
        final = b.status()
        self.assertEqual(final['state'], 'idle')
        self.assertEqual(final['outcome'], {'operation': 'cut', 'result': 'finished'})


if __name__ == '__main__':
    unittest.main()


class InstallerIdentityTests(unittest.TestCase):
    def test_health_reports_the_same_version_the_installer_expects(self):
        # Regresión 0.7.0: /health decía 0.6.4 y el instalador rechazaba el conector nuevo.
        import http.client, json, threading
        from bridge import Bridge, make_server, BRIDGE_VERSION
        import setup_workshop
        self.assertEqual(setup_workshop.VERSION, BRIDGE_VERSION)
        self.assertIn('www.lzstudiotools.com', setup_workshop.SITE)
        server = make_server(Bridge(BED, simulation=True, engine_factory=FakeEngine), 'token', {'https://www.lzstudiotools.com'}, port=0)
        server.pairing_token = 'token'
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            port = server.server_port
            c = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
            c.request('GET', '/health', headers={'Origin': 'https://www.lzstudiotools.com', 'Authorization': 'Bearer token', 'Host': f'127.0.0.1:{port}'})
            value = json.loads(c.getresponse().read())
            self.assertEqual(value['bridgeVersion'], BRIDGE_VERSION)
            self.assertTrue(value['ready'])
        finally:
            server.shutdown(); server.server_close()


class UnlockRailTests(unittest.TestCase):
    def test_unlock_rail_frees_motors_without_laser_and_requires_home(self):
        engine = M2Engine(BED)
        try:
            data = engine.compile_motion(None, None, unlock=True)
            self.assertIn(b'IS2P', data)
            self.assertNotIn(b'D', data)
        finally:
            engine.close()
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); b.motion('home', confirmed=True); b.engine.left = 0; b.status()
        self.assertEqual(b.position, [0, 0])
        b.engine.left = 10
        self.assertEqual(b.motion('unlock', confirmed=True)['state'], 'sending')
        self.assertEqual(b.engine.sent[-1], b'IS2P\n')
        b.engine.left = 0
        status = b.status()
        self.assertEqual(status['state'], 'idle')
        self.assertIsNone(status['position'])           # posición desconocida: Home obligatorio
        self.assertTrue(status['railUnlocked'])
        with self.assertRaises(ValueError):
            b.motion('jog', 5, 0, confirmed=True)
        with self.assertRaises(ValueError):
            b.motion('unlock', confirmed=False)


class PowerAndPauseTests(unittest.TestCase):
    def m3(self):
        job = combined(); job['board'] = 'M3'; job['maxPower'] = 60
        for op, pw in zip(job['operations'], (20, 30, 80)):
            op['power'] = pw
        return job

    def test_m3_sends_pwm_power_per_operation_scaled_by_maximum(self):
        job = validate_job_v2(self.m3(), BED)
        job['_start'], job['_home'] = [0, 0], True
        engine = M2Engine(BED)
        try:
            data = engine.compile(job, 'cut')
            import re
            values = [data[m.start() + 3] * 254 + data[m.start() + 4] for m in re.finditer(b'AT1', data)]
            # % de operación × 10 × máximo 60 % → 20 %→120, 30 %→180, 80 %→480 (de 1000)
            for expected in (120, 180, 480):
                self.assertIn(expected, values)
            v2 = combined(); v2['operations'] = v2['operations'][2:]
            plain = validate_job_v2(v2, BED); plain['_start'], plain['_home'] = [0, 0], True
            self.assertNotIn(b'AT1', engine.compile(plain, 'cut'))   # M2: nunca códigos de potencia
        finally:
            engine.close()

    def test_m2_rejects_software_power_and_m3_requires_limits(self):
        job = combined(); job['operations'][0]['power'] = 50
        with self.assertRaises(ValueError):
            validate_job_v2(job, BED)
        job = self.m3(); del job['maxPower']
        with self.assertRaises(ValueError):
            validate_job_v2(job, BED)
        job = self.m3(); job['operations'][1]['power'] = 120
        with self.assertRaises(ValueError):
            validate_job_v2(job, BED)

    def test_real_compiler_splits_parts_at_pauses_and_second_part_starts_without_home(self):
        job = combined(); job['operations'][2]['pauseBefore'] = True
        job = validate_job_v2(job, BED); job['_start'], job['_home'] = [0, 0], True
        engine = M2Engine(BED)
        try:
            parts = engine.compile_segments(job, 'cut')
        finally:
            engine.close()
        self.assertEqual(len(parts), 2)
        self.assertTrue(parts[0].startswith(b'IPP'))          # la primera parte hace Home
        self.assertFalse(parts[1].startswith(b'IPP'))         # la segunda empieza en el origen, sin Home
        self.assertIn(b'D', parts[1])

    def test_pause_between_operations_waits_for_continue_and_cancel_keeps_position(self):
        job = combined(); job['operations'][2]['pauseBefore'] = True
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); b.motion('home', confirmed=True); b.engine.left = 0; b.status()
        prepared = b.prepare(job, 'cut')
        self.assertEqual(prepared['partCount'], 2)
        b.engine.left = 50; b.run(prepared['id'], True)
        self.assertEqual(len(b.engine.sent), 2)                       # Home + parte 1
        b.engine.left = 0
        status = b.status()
        self.assertEqual(status['state'], 'awaiting')
        self.assertIn('Corte', status['message']); self.assertEqual(status['position'], [0, 0])
        self.assertEqual(len(b.engine.sent), 2, 'no continúa solo')
        with self.assertRaises(ValueError):
            b.continue_job(False)
        b.engine.left = 50
        self.assertEqual(b.continue_job(True)['state'], 'sending')
        self.assertEqual(b.engine.sent[-1], b'IPP\nM2-test-part-1')
        with self.assertRaises(ValueError):
            b.continue_job(True)                                       # sin envíos duplicados
        b.engine.left = 0
        final = b.status()
        self.assertEqual(final['state'], 'idle'); self.assertEqual(final['outcome']['result'], 'finished')
        # Cancelar mientras espera: nada corre, se conserva la posición conocida.
        prepared = b.prepare(job, 'cut'); b.engine.left = 50; b.run(prepared['id'], True); b.engine.left = 0; b.status()
        cancelled = b.cancel()
        self.assertEqual(cancelled['state'], 'idle'); self.assertEqual(cancelled['position'], [0, 0])
        self.assertEqual(cancelled['outcome']['result'], 'cancelled')

    def test_simulated_parts(self):
        job = combined(); job['operations'][1]['pauseBefore'] = True; job['operations'][2]['pauseBefore'] = True
        b = Bridge(BED, simulation=True, engine_factory=FakeEngine); b.connect()
        prepared = b.prepare(job, 'cut')
        self.assertEqual(b.run(prepared['id'], True)['state'], 'awaiting')
        self.assertEqual(b.continue_job(True)['state'], 'awaiting')
        done = b.continue_job(True)
        self.assertEqual(done['state'], 'idle'); self.assertEqual(done['outcome']['result'], 'simulated')


class FieldFixes073Tests(unittest.TestCase):
    """0.7.3: la pausa no se queda en «sent» y el punto manual tras desbloquear el riel."""

    def paused_job(self):
        job = combined(); job['operations'][2]['pauseBefore'] = True
        return job

    def test_continue_is_offered_when_board_never_reports_finish(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); b.motion('home', confirmed=True); b.engine.left = 0; b.status()
        prepared = b.prepare(self.paused_job(), 'cut')
        b.engine.left = 50; b.run(prepared['id'], True)
        b.engine.left, b.engine.done = 0, False          # datos enviados, la placa no avisa el fin
        status = b.status()
        self.assertEqual(status['state'], 'sent')
        self.assertTrue(status['canContinue'])
        self.assertIn('Continuar', status['message'])
        sent = len(b.engine.sent)
        b.engine.left = 50
        self.assertEqual(b.continue_job(True)['state'], 'sending')
        self.assertEqual(len(b.engine.sent), sent + 1)
        self.assertEqual(b.engine.sent[-1], b'IPP\nM2-test-part-1')
        b.engine.left, b.engine.done = 0, True
        self.assertFalse(b.status()['canContinue'])     # última parte: nada más que continuar
        self.assertEqual(b.status()['state'], 'idle')

    def test_single_part_job_never_offers_continue(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); b.motion('home', confirmed=True); b.engine.left = 0; b.status()
        prepared = b.prepare(combined(), 'cut')
        b.engine.left = 50; b.run(prepared['id'], True); b.engine.left, b.engine.done = 0, False
        self.assertFalse(b.status()['canContinue'])
        with self.assertRaises(ValueError):
            b.continue_job(True)

    def test_manual_origin_after_unlock_runs_from_head_without_home(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect()
        with self.assertRaises(ValueError):
            b.prepare(combined(), 'cut', 'current')        # sin Home ni desbloqueo: no hay origen
        b.engine.left = 10; b.motion('unlock', confirmed=True); b.engine.left = 0
        status = b.status()
        self.assertTrue(status['manualOrigin']); self.assertIsNone(status['position'])
        prepared = b.prepare(combined(), 'frame', 'current')
        self.assertFalse(b.job['_home'])
        self.assertEqual(b.job['_start'], [0, 0])
        x0, y0, _, _ = bounds_v2(b.job)
        self.assertAlmostEqual(x0, 0); self.assertAlmostEqual(y0, 0)   # el diseño empieza en el cabezal
        b.engine.left = 10; b.run(prepared['id'], True); b.engine.left = 0
        done = b.status()
        self.assertEqual(done['state'], 'idle')
        self.assertIsNone(done['position'])               # sigue sin coordenadas absolutas
        self.assertTrue(done['manualOrigin'])             # se puede repetir desde el mismo punto
        with self.assertRaises(ValueError):
            b.motion('jog', 5, 0, confirmed=True)
        b.engine.left = 10; b.motion('home', confirmed=True); b.engine.left = 0
        homed = b.status()
        self.assertEqual(homed['position'], [0, 0]); self.assertFalse(homed['manualOrigin'])

    def test_real_compiler_manual_origin_does_not_home(self):
        job = validate_job_v2(combined(), BED)
        job = place_v2(job, [0, 0], BED); job['_start'], job['_home'] = [0, 0], False
        engine = M2Engine(BED)
        try:
            data = engine.compile(job, 'cut')
        finally:
            engine.close()
        self.assertFalse(data.startswith(b'IPP'))
        self.assertIn(b'FNSE-\n', data)                     # la controladora espera el fin de la emisión

    def test_completion_accepts_ready_status_only_after_controller_wait(self):
        engine = M2Engine(BED)
        try:
            controller = engine.device.controller
            engine.remaining = lambda: 0
            engine.failed = lambda: False
            controller.update_status = lambda: None
            controller._status = [255, 0xCE, 0, 0, 0, 1]
            controller.state = 'idle'
            engine.waits_for_finish = False                # sin bloque «FNSE-»: OK no prueba el fin
            self.assertFalse(engine.finished())
            engine.waits_for_finish = True
            self.assertTrue(engine.finished())
            controller.state = 'wait'                      # aún esperando el fin del bloque «FNSE-»
            self.assertFalse(engine.finished())
            controller.state = 'idle'; controller._status = [255, 0xEE, 0, 0, 0, 1]   # ocupada
            self.assertFalse(engine.finished())
        finally:
            controller.state = 'idle'
            engine.close()
