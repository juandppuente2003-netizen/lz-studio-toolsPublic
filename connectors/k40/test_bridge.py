import copy
import subprocess
import sys
from unittest.mock import patch
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
        self.sent = []; self.done = True; self.left = 50; self.lost = False; self.closed = False
    def compile(self, job, mode): return b'IPP\nM2-test-bytes'
    def compile_motion(self, start, target, home=False): return b'IPP\n' if home else b'IBaS1P\n'
    def finished(self): return self.done and not self.lost and self.left == 0
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

    def test_transmitted_is_not_finished_then_automatically_ready(self):
        for operation in ('frame', 'cut'):
            b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
            b.connect(); prepared = b.prepare(job(), operation); b.run(prepared['id'], True)
            b.engine.done = False; b.engine.left = 0
            self.assertEqual(b.status()['state'], 'sent')
            with self.assertRaises(ValueError): b.prepare(job(), operation)
            b.engine.done = True
            self.assertEqual(b.status()['state'], 'idle')
            self.assertEqual(b.position, [0, 0]); self.assertIsNotNone(b.engine)
            with self.assertRaises(ValueError): b.run(prepared['id'], True)
            self.assertTrue(b.prepare(job(), operation)['id'])

    def test_lost_usb_does_not_resubmit_and_cancel_locks(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine); b.connect(); p = b.prepare(job(), 'cut'); b.run(p['id'], True)
        b.engine.lost = True; self.assertEqual(b.status()['state'], 'error'); self.assertEqual(len(b.engine.sent), 1)
        b.cancel(); self.assertEqual(b.state, 'cancelled')
        with self.assertRaises(ValueError): b.prepare(job(), 'cut')
        b.acknowledge(True)

class MotionTests(unittest.TestCase):
    def bridge(self, simulation=False):
        b = Bridge(BED, simulation=simulation, engine_factory=FakeEngine)
        b.connect()
        return b

    def test_home_then_jog_waits_for_controller_finish(self):
        b = self.bridge()
        with self.assertRaises(ValueError): b.motion('jog', 5, 0, True)
        with self.assertRaises(ValueError): b.motion('home', confirmed=False)
        b.motion('home', confirmed=True)
        self.assertIsNone(b.position)
        with self.assertRaises(ValueError): b.motion('home', confirmed=True)
        b.engine.left = 0
        self.assertEqual(b.status()['state'], 'idle')
        self.assertEqual(b.position, [0, 0])
        b.engine.left = 50
        b.motion('jog', 5, 0, True)
        self.assertIsNone(b.position)
        b.engine.left = 0
        b.status()
        self.assertAlmostEqual(b.position[0], 5, delta=0.0254)
        for dx, dy in [(-50, 0), (0, -1), (1, 1), (0, 0), (51, 0), (float('nan'), 0)]:
            with self.subTest(dx=dx, dy=dy), self.assertRaises(ValueError): b.motion('jog', dx, dy, True)

    def test_current_origin_bounds_cancel_and_disconnect_invalidate_reference(self):
        b = self.bridge(simulation=True)
        with self.assertRaises(ValueError): b.prepare(job(), 'cut', 'current')
        b.motion('home', confirmed=True); b.motion('jog', 25, 0, True)
        position = list(b.position)
        prepared = b.prepare(job(), 'cut', 'current')
        self.assertFalse(b.job['_home'])
        self.assertEqual(b.job['_start'], position)
        self.assertAlmostEqual(b.job['paths'][0]['points'][0][0], position[0])
        b.run(prepared['id'], True); self.assertIsNone(b.position)
        b.acknowledge(True); self.assertEqual(b.position, position)
        b.position = [399, 399]
        with self.assertRaises(ValueError): b.prepare(job(), 'cut', 'current')
        b.state = 'idle'; b.cancel(); self.assertIsNone(b.position)
        b.acknowledge(True); b.connect(); b.motion('home', confirmed=True); b.disconnect()
        self.assertIsNone(b.position)

    def test_prepared_job_cannot_be_sent_after_jog(self):
        b = self.bridge(simulation=True); b.motion('home', confirmed=True)
        prepared = b.prepare(job(), 'frame', 'current')
        b.motion('jog', 10, 0, True)
        with self.assertRaises(ValueError): b.run(prepared['id'], True)


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
    def test_cancel_sends_priority_reset_before_terminating_without_usb(self):
        engine = M2Engine(BED)
        c = engine.device.controller
        packets = []
        c.start = lambda: None  # Drive the real packet parser synchronously.
        engine.connected = lambda: True
        c._send_and_confirm_packet = lambda packet, checksum: packets.append(packet) or True
        try:
            c.update_state('active')
            c.write(b'Dangerous-old-job\n')
            c._check_transfer_buffer()
            engine.cancel()
            self.assertFalse(c.aborted_retries)  # Must let the reset get through.
            c._check_transfer_buffer()
            c.process_queue()
            self.assertEqual(packets, [b'I' + b'F' * 29])
            self.assertEqual(c.state, 'terminate')
            self.assertEqual(len(c), 0)
            self.assertIsNone(c.connection)
        finally:
            engine.close()

    def test_current_origin_and_jog_compile_without_home_or_laser(self):
        raw = validate_job(job(), BED)
        raw['_start'], raw['_home'] = [10, 10], False
        frame = self.engine.compile(raw, 'frame')
        cut = self.engine.compile(raw, 'cut')
        self.assertNotIn(b'IPP', frame); self.assertNotIn(b'D', frame)
        self.assertNotIn(b'IPP', cut); self.assertIn(b'D', cut)
        jog = self.engine.compile_motion([10, 10], [20, 10])
        self.assertTrue(jog); self.assertNotIn(b'D', jog); self.assertNotIn(b'IPP', jog)
        self.assertIn(b'IPP', self.engine.compile_motion([0, 0], [0, 0], home=True))
        self.assertIsNone(self.engine.device.controller.connection)

    def test_job_returns_to_mm_origin_not_last_native_segment(self):
        from meerk40t.lihuiyu.driver import LihuiyuDriver
        from meerk40t.core.units import UNITS_PER_MM
        drivers = []
        def capture(*args, **kwargs):
            driver = LihuiyuDriver(*args, **kwargs)
            drivers.append(driver)
            return driver
        for mode in ('cut', 'frame'):
            for home, origin in [(True, [0, 0]), (False, [10, 10])]:
                raw = validate_job(job(), BED)
                raw['_start'], raw['_home'] = origin, home
                with patch('meerk40t.lihuiyu.driver.LihuiyuDriver', side_effect=capture):
                    self.engine.compile(raw, mode)
                expected = [int(round(v)) for v in self.engine.device.view.position(origin[0] * UNITS_PER_MM, origin[1] * UNITS_PER_MM)]
                self.assertEqual([drivers[-1].native_x, drivers[-1].native_y], expected)

    def test_cancel_does_not_wait_for_busy_packet_and_only_writes_reset(self):
        engine = M2Engine(BED); c = engine.device.controller
        c.stop()  # No background sender competes with the deterministic test thread.
        entered, release = threading.Event(), threading.Event()
        packets = []
        class BusyUSB:
            stopped = False
            ready = False
            def is_connected(self): return True
            def get_status(self):
                entered.set()
                time.sleep(.005)
                return [0, 0xCE if self.stopped or self.ready else 0xEE]
            def write(self, packet):
                packets.append(packet)
                self.stopped = packet[1:31] == b'I' + b'F' * 29
            def close(self): pass
        connection = BusyUSB(); c.connection = connection
        engine._guard_connection(connection)
        c.start = lambda: None
        c.open = lambda: None
        c.update_state('active'); c.pre_ok = False
        c.write(b'IBaS1P\n'); c._check_transfer_buffer()
        worker = threading.Thread(target=c.process_queue)
        try:
            worker.start(); self.assertTrue(entered.wait(1))
            cancelled = threading.Event()
            def request_stop():
                engine.cancel(); cancelled.set()
            cancel_worker = threading.Thread(target=request_stop)
            cancel_worker.start()
            self.assertTrue(cancelled.wait(.5), 'Cancellation blocked behind transport lock')
            cancel_worker.join(1); worker.join(1)
            self.assertFalse(worker.is_alive())
            self.assertEqual(packets, [], 'An old movement was sent after cancellation')
            self.assertFalse(c.aborted_retries)
            connection.ready = True
            c._check_transfer_buffer(); c.process_queue()
            self.assertEqual(len(packets), 1)
            self.assertEqual(packets[0][1:31], b'I' + b'F' * 29)
            self.assertEqual(c.state, 'terminate')
        finally:
            c.abort_waiting = True
            worker.join(1)
            engine.close()

    def test_transport_fail_closed(self):
        with self.assertRaises(ConnectionError): self.engine.device.controller.process_queue()
        self.assertTrue(self.engine.usb_failed); self.assertTrue(self.engine.device.controller.aborted_retries)

if __name__ == '__main__': unittest.main()
