import copy
import http.client
import json
import os
import tempfile
from pathlib import Path
import threading
import time
import unittest
from bridge import Bridge, M2Engine, make_server, validate_job, PROTOCOL, load_pairing_token

BED = {'width': 400, 'height': 400}
def job():
    return {'protocol': PROTOCOL, 'board': 'M2', 'bed': dict(BED), 'speed': 10, 'passes': 1,
            'paths': [{'points': [[10, 10], [20, 10], [20, 20], [10, 20]], 'closed': True, 'role': 'outer'}]}

class FakeEngine:
    def __init__(self, bed):
        self.sent = []; self.left = 50; self.lost = False; self.closed = False
    def compile(self, job, mode): return b'IPP\nM2-test-bytes'
    def connect(self): pass
    def connected(self): return not self.lost
    def send(self, data): self.sent.append(data)
    def remaining(self): return self.left
    def failed(self): return self.lost
    def cancel(self): self.left = 0
    def close(self): self.closed = True

class PairingTests(unittest.TestCase):
    def test_restart_retains_code_and_reset_rotates_it(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'user' / 'pairing.json'
            first = load_pairing_token(path)
            self.assertEqual(first, load_pairing_token(path))
            second = load_pairing_token(path, reset=True)
            self.assertNotEqual(first, second)
            self.assertEqual(second, load_pairing_token(path))
            if os.name != 'nt': self.assertEqual(path.stat().st_mode & 0o777, 0o600)
    def test_corrupt_pairing_is_not_silently_replaced(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'pairing.json'; path.write_text('{"token":"bad"}')
            with self.assertRaises(ValueError): load_pairing_token(path)
            self.assertEqual(path.read_text(), '{"token":"bad"}')

class JobTests(unittest.TestCase):
    def test_disconnect_releases_engine_and_invalidates_prepared_job(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); p = b.prepare(job(), 'cut'); engine = b.engine
        b.disconnect(); self.assertTrue(engine.closed); self.assertIsNone(b.engine)
        with self.assertRaises(ValueError): b.run(p['id'], True)
        b.connect(); p = b.prepare(job(), 'cut'); b.run(p['id'], True)
        with self.assertRaises(ValueError): b.disconnect()
        self.assertFalse(b.engine.closed)
    def test_bounds_speed_passes_nonfinite_and_board(self):
        for field, value in [('speed', 0), ('speed', float('nan')), ('speed', True), ('passes', 1.5), ('board', 'M3')]:
            raw = job(); raw[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError): validate_job(raw, BED)
        for point in [[-1, 0], [401, 0], [0, float('inf')], [True, 10]]:
            raw = job(); raw['paths'][0]['points'][0] = point
            with self.subTest(point=point), self.assertRaises(ValueError): validate_job(raw, BED)

    def test_snapshot_is_independent_and_holes_first(self):
        raw = job(); hole = copy.deepcopy(raw['paths'][0]); hole['role'] = 'hole'; raw['paths'].append(hole)
        clean = validate_job(raw, BED); raw['paths'][0]['points'][0][0] = 300
        self.assertEqual(clean['paths'][0]['role'], 'hole'); self.assertEqual(clean['paths'][1]['points'][0][0], 10)

    def test_default_simulation_and_double_submission(self):
        b = Bridge(BED, engine_factory=FakeEngine); prepared = b.prepare(job(), 'cut')
        result = b.run(prepared['id'], True); self.assertEqual(result['state'], 'simulated'); self.assertEqual(b.engine.sent, [])
        with self.assertRaises(ValueError): b.run(prepared['id'], True)
        with self.assertRaises(ValueError): b.prepare(job(), 'cut')
        b.acknowledge(True); self.assertEqual(b.state, 'idle')

    def test_confirmation_expiry_and_wrong_id(self):
        b = Bridge(BED, engine_factory=FakeEngine); p = b.prepare(job(), 'cut')
        for job_id, confirmed in [('wrong', True), (p['id'], False)]:
            with self.assertRaises(ValueError): b.run(job_id, confirmed)
        b.expires = time.monotonic() - 1
        with self.assertRaises(ValueError): b.run(p['id'], True)
        self.assertEqual(b.state, 'idle')

    def test_usb_sent_is_not_finished_and_requires_acknowledgement(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine); b.connect(); p = b.prepare(job(), 'cut'); b.run(p['id'], True)
        self.assertEqual(b.state, 'sending'); b.engine.left = 0
        s = b.status(); self.assertEqual(s['state'], 'sent'); self.assertIn('NO', s['message'])
        with self.assertRaises(ValueError): b.prepare(job(), 'cut')
        b.acknowledge(True); self.assertEqual(b.state, 'idle'); self.assertIsNone(b.engine)

    def test_lost_usb_does_not_resubmit_and_cancel_locks(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine); b.connect(); p = b.prepare(job(), 'cut'); b.run(p['id'], True)
        b.engine.lost = True; self.assertEqual(b.status()['state'], 'error'); self.assertEqual(len(b.engine.sent), 1)
        b.cancel(); self.assertEqual(b.state, 'cancelled')
        with self.assertRaises(ValueError): b.prepare(job(), 'cut')
        b.acknowledge(True)

class HttpTests(unittest.TestCase):
    def setUp(self):
        self.b = Bridge(BED, engine_factory=FakeEngine)
        self.origin = 'https://www.lzstudiotools.com'; self.token = 'test-code'
        self.server = make_server(self.b, self.token, {self.origin}, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
    def request(self, path, body=None, origin=None, token=None, host=None, method=None):
        port = self.server.server_port; c = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        headers = {'Origin': origin or self.origin, 'Authorization': 'Bearer ' + (token or self.token), 'Content-Type': 'application/json'}
        if host: headers['Host'] = host
        c.request(method or ('POST' if body is not None else 'GET'), path, json.dumps(body) if body is not None else None, headers)
        r = c.getresponse(); result = (r.status, json.loads(r.read()), dict(r.headers)); c.close(); return result
    def test_origin_token_and_dns_rebinding(self):
        for kwargs, code in [({'origin':'https://attacker.invalid'},403), ({'token':'bad'},401), ({'host':'attacker.invalid'},403)]:
            self.assertEqual(self.request('/connect',{},**kwargs)[0],code)
        code, _, headers = self.request('/status'); self.assertEqual(code,200); self.assertEqual(headers['Access-Control-Allow-Origin'],self.origin)
    def test_prepare_run_and_replay_over_http(self):
        self.assertEqual(self.request('/connect',{})[0],200)
        code, p, _ = self.request('/prepare',{'job':job(),'mode':'frame'}); self.assertEqual(code,200)
        self.assertEqual(self.request('/run',{'id':p['id'],'confirmed':True})[1]['state'],'simulated')
        self.assertEqual(self.request('/run',{'id':p['id'],'confirmed':True})[0],400)
        self.assertEqual(self.request('/acknowledge',{'confirmed':True})[0],200)
        self.assertEqual(self.request('/disconnect',{})[0],200)

class RealCompilerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.engine = M2Engine(BED)
    @classmethod
    def tearDownClass(cls): cls.engine.close()
    def test_real_m2_cut_and_laser_off_frame(self):
        raw = validate_job(job(), BED); cut = self.engine.compile(raw,'cut'); frame = self.engine.compile(raw,'frame')
        self.assertTrue(cut.startswith(b'IPP\n')); self.assertIn(b'D',cut)
        self.assertTrue(frame.startswith(b'IPP\n')); self.assertNotIn(b'D',frame)
        self.assertEqual(self.engine.device.board,'M2'); self.assertFalse(self.engine.device.supports_pwm)
        self.assertIsNone(self.engine.device.controller.connection)
    def test_real_driver_preserves_multiple_passes(self):
        a = validate_job(job(),BED); once = self.engine.compile(a,'cut'); a['passes']=2
        twice = self.engine.compile(a,'cut'); self.assertGreater(len(twice),len(once)); self.assertEqual(twice.count(b'D'),2)
    def test_transport_fail_closed(self):
        with self.assertRaises(ConnectionError): self.engine.device.controller.process_queue()
        self.assertTrue(self.engine.usb_failed); self.assertTrue(self.engine.device.controller.aborted_retries)

if __name__ == '__main__': unittest.main()
