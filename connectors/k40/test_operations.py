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
