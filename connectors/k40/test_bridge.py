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
        self.usb_failed = False; self.paused = False; self.resumed = False; self.reset_done = False
    def compile(self, job, mode): return b'IPP\nM2-test-bytes'
    def compile_motion(self, start, target, home=False): return b'IPP\n' if home else b'IBaS1P\n'
    def finished(self): return self.done and not self.lost and self.left == 0
    def rapid_ready(self): return self.finished()
    def connect(self): pass
    def connected(self): return not self.lost
    def send(self, data): self.sent.append(data)
    def remaining(self): return self.left
    def failed(self): return self.lost
    def pause(self): self.paused = True
    def resume(self): self.resumed = True
    def pause_complete(self): return self.paused
    def resume_complete(self): return self.resumed
    def cancel_complete(self): return self.reset_done
    def rearm(self): self.reset_done = False; self.paused = False; self.resumed = False
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
        b.cancel(); self.assertEqual(b.state, 'error')
        with self.assertRaises(ValueError): b.prepare(job(), 'cut')
        b.recover(); b.cleanup_thread.join(1)
        self.assertEqual(b.state, 'idle'); self.assertIsNone(b.engine)

    def test_pause_resume_keeps_job_and_cancel_recovers_without_acknowledgement(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); prepared = b.prepare(job(), 'cut'); b.run(prepared['id'], True)
        engine, payload = b.engine, b.payload
        self.assertEqual(b.pause()['state'], 'paused')
        self.assertEqual(b.pause()['state'], 'paused')
        self.assertEqual(b.payload, payload); self.assertEqual(b.id, prepared['id'])
        with self.assertRaises(ValueError): b.prepare(job(), 'cut')
        b.resume(); self.assertEqual(b.state, 'sending')
        self.assertEqual(engine.sent, [payload])  # No second submission.
        b.pause(); b.cancel(); self.assertEqual(b.state, 'cancelling')
        with self.assertRaises(ValueError): b.resume()
        self.assertIsNone(b.position); self.assertIsNone(b.id)
        engine.reset_done = True; b.status()
        self.assertEqual(b.status()['state'], 'idle'); self.assertIs(b.engine,engine); self.assertFalse(engine.closed)
        b.connect(); self.assertTrue(b.prepare(job(), 'frame')['id'])

    def test_stop_is_not_blocked_by_usb_status_query(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); b.prepare(job(), 'cut'); b.state = 'sent'; b.engine.left = 0
        entered, release = threading.Event(), threading.Event()
        def slow_finished():
            entered.set(); release.wait(2); return True
        b.engine.finished = slow_finished
        worker = threading.Thread(target=b.status); worker.start()
        try:
            self.assertTrue(entered.wait(1))
            start = time.monotonic(); result = b.pause()
            self.assertLess(time.monotonic()-start, .5)
            self.assertEqual(result['state'], 'paused')
        finally:
            release.set(); worker.join(1)
        self.assertEqual(b.state, 'paused')  # A stale FINISH must not erase pause.

    def test_unacknowledged_control_times_out_without_unlocking_motion(self):
        b = Bridge(BED, simulation=False, engine_factory=FakeEngine)
        b.connect(); p = b.prepare(job(), 'cut'); b.run(p['id'], True)
        b.engine.pause_complete = lambda: False
        self.assertEqual(b.pause()['state'], 'pausing')
        with self.assertRaises(ValueError): b.resume()
        b.control_started -= 16
        self.assertEqual(b.status()['state'], 'error')
        with self.assertRaises(ValueError): b.motion('home', confirmed=True)
        b.recover(); b.cleanup_thread.join(1)
        self.assertEqual(b.state, 'idle'); self.assertIsNone(b.position)

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
        b.state = 'prepared'; b.cancel(); self.assertIsNone(b.position)
        b.connect(); b.motion('home', confirmed=True); b.disconnect()
        self.assertIsNone(b.position)

    def test_prepared_job_cannot_be_sent_after_jog(self):
        b = self.bridge(simulation=True); b.motion('home', confirmed=True)
        prepared = b.prepare(job(), 'frame', 'current')
        b.motion('jog', 10, 0, True)
        with self.assertRaises(ValueError): b.run(prepared['id'], True)


class HttpTests(unittest.TestCase):
    def test_health_is_authenticated_and_does_not_wait_for_state_or_usb(self):
        entered,release=threading.Event(),threading.Event()
        def blocked_operation():
            with self.b.lock:
                entered.set();release.wait(3)
        worker=threading.Thread(target=blocked_operation);worker.start()
        try:
            self.assertTrue(entered.wait(1)); start=time.monotonic()
            code,value,_=self.request('/health')
            self.assertEqual(code,200);self.assertLess(time.monotonic()-start,.5)
            self.assertEqual(value['pid'],os.getpid());self.assertTrue(value['ready'])
            self.assertEqual(self.request('/health',token='incorrect')[0],401)
        finally:
            release.set();worker.join(1)
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

    def test_http_pause_resume_cancel_and_automatic_recovery(self):
        self.b.simulation = False
        self.request('/connect', {})
        _, p, _ = self.request('/prepare', {'job':job(), 'mode':'cut'})
        self.request('/run', {'id':p['id'], 'confirmed':True})
        engine = self.b.engine
        self.assertEqual(self.request('/pause', {})[1]['state'], 'paused')
        self.assertEqual(self.request('/motion', {'action':'home', 'confirmed':True})[0], 400)
        self.assertEqual(self.request('/resume', {})[1]['state'], 'sending')
        self.assertEqual(len(engine.sent), 1)
        self.assertEqual(self.request('/cancel', {'confirmed':True})[1]['state'], 'cancelling')
        self.assertEqual(self.request('/resume', {})[0], 400)
        engine.reset_done = True
        self.request('/status')
        self.assertEqual(self.request('/status')[1]['state'], 'idle')
        self.assertEqual(self.request('/connect', {})[0], 200)

class RealCompilerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.engine = M2Engine(BED)
    @classmethod
    def tearDownClass(cls): cls.engine.close()
    def test_ce_accepts_home_and_jog_but_does_not_complete_a_cut(self):
        engine = M2Engine(BED); c = engine.device.controller; c.stop()
        class USB:
            status = 0xCE
            def is_connected(self): return True
            def get_status(self): return [0, self.status]
            def write(self, packet): pass
            def close(self): pass
        usb = USB(); c.connection = usb; engine._guard_connection(usb)
        c.open = lambda: None; c.start = lambda: None; c.update_state('active')
        b = Bridge(BED, simulation=False, engine_factory=lambda bed: engine)
        try:
            b.connect(); b.motion('home', confirmed=True)
            c._check_transfer_buffer(); c.process_queue()
            state = b.status()
            self.assertEqual(state['state'], 'idle'); self.assertEqual(state['position'], [0,0])
            self.assertTrue(state['operationAccepted']); self.assertFalse(engine.finished())
            b.motion('jog', 0, 5, True); c._check_transfer_buffer(); c.process_queue()
            usb.status = 0xEE
            self.assertEqual(b.status()['state'], 'sent'); self.assertIsNone(b.position)
            usb.status = 0xCE
            self.assertEqual(b.status()['state'], 'idle'); self.assertAlmostEqual(b.position[1],5,delta=.0254)
            b.motion('jog', 0, -1, True); c._check_transfer_buffer(); c.process_queue()
            self.assertEqual(b.status()['state'], 'idle'); self.assertAlmostEqual(b.position[1],4,delta=.0254)
            for _ in range(3):
                prepared = b.prepare(job(), 'frame', 'current'); b.run(prepared['id'], True)
                for i in range(100):
                    c._check_transfer_buffer()
                    if not c.process_queue(): break
                self.assertEqual(b.status()['state'], 'idle')
                self.assertIsNotNone(b.position)
                b.motion('goto', 30, 40, True)
                for i in range(100):
                    c._check_transfer_buffer()
                    if not c.process_queue(): break
                self.assertEqual(b.status()['state'], 'idle')
                self.assertAlmostEqual(b.position[0], 30, delta=.0254)
                self.assertAlmostEqual(b.position[1], 40, delta=.0254)
            b.prepare(job(), 'cut'); b.state = 'sent'; b.operation = 'cut'
            self.assertEqual(b.status()['state'], 'sent')
            with self.assertRaises(ValueError): b.motion('jog', 1, 0, True)
            usb.status = 0xEC
            self.assertEqual(b.status()['state'], 'idle')
        finally:
            engine.close()
    def test_real_driver_pulse_writes_on_and_off_and_no_movement(self):
        engine=M2Engine(BED);sent=[]
        engine.send=lambda data: sent.append(('on',data))
        engine.device.controller.realtime_write=lambda data: sent.append(('off',data))
        engine.remaining=lambda:0;engine.failed=lambda:False
        try:
            abort=threading.Event()
            engine.timed_pulse(50,abort)
            self.assertEqual([kind for kind,_ in sent],['on','off'])
            self.assertIn(b'D',sent[0][1]);self.assertIn(b'U',sent[1][1])
            self.assertNotIn(b'IPP',sent[0][1]);self.assertNotIn(b'IPP',sent[1][1])
        finally: engine.close()

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
            engine.rearm(); self.assertEqual(c.state,'init'); self.assertFalse(engine.stop_requested.is_set())
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

    def test_real_pause_resume_preserves_unsent_packet_and_no_usb_before_ready(self):
        engine = M2Engine(BED); c = engine.device.controller; c.stop()
        entered = threading.Event(); packets = []
        class USB:
            ready = False
            def is_connected(self): return True
            def get_status(self):
                entered.set(); return [0, 0xCE if self.ready else 0xEE]
            def write(self, packet): packets.append(packet[1:31])
            def close(self): pass
        usb = USB(); c.connection = usb; engine._guard_connection(usb)
        c.open = lambda: None; c.start = lambda: None
        c.update_state('active'); c.pre_ok = False
        c.write(b'IBaS1P\n'); c._check_transfer_buffer()
        before = bytes(c._buffer)
        worker = threading.Thread(target=c.process_queue)
        try:
            worker.start(); self.assertTrue(entered.wait(1))
            engine.pause(); worker.join(1); self.assertFalse(worker.is_alive())
            self.assertEqual(packets, []); self.assertEqual(bytes(c._buffer), before)
            self.assertFalse(engine.pause_complete())
            usb.ready = True; c._check_transfer_buffer(); c.process_queue()
            self.assertEqual(packets, [b'PN' + b'F' * 28])
            self.assertTrue(engine.pause_complete()); self.assertEqual(bytes(c._buffer), before)
            c.process_queue(); self.assertEqual(len(packets), 1)
            engine.resume(); c._check_transfer_buffer(); c.process_queue()
            self.assertTrue(engine.resume_complete()); self.assertFalse(engine.pause_requested.is_set())
            c.process_queue(); self.assertEqual(len(packets), 3)
            self.assertTrue(packets[-1].startswith(b'IBaS1P'))
            self.assertEqual(len(c), 0)
        finally:
            engine.cancel(); worker.join(1); engine.close()

    def test_pause_after_write_confirms_packet_before_queuing_pause_no_replay(self):
        engine = M2Engine(BED); c = engine.device.controller; c.stop(); packets = []
        class USB:
            pause_on_write = True
            def is_connected(self): return True
            def get_status(self): return [0, 0xCE]
            def write(self, packet):
                packets.append(packet[1:31])
                if self.pause_on_write:
                    self.pause_on_write = False
                    engine.pause()  # Pause arrives during an in-flight write.
            def close(self): pass
        usb = USB(); c.connection = usb; engine._guard_connection(usb)
        c.open = lambda: None; c.start = lambda: None; c.update_state('active')
        try:
            c.write(b'IBaS1P\n'); c._check_transfer_buffer(); c.process_queue()
            self.assertEqual(len(c._buffer), 0)  # Confirmed packet already consumed.
            c._check_transfer_buffer(); c.process_queue(); self.assertTrue(engine.pause_complete())
            engine.resume(); c._check_transfer_buffer(); c.process_queue(); c.process_queue()
            self.assertEqual(len(packets), 3)
            self.assertEqual(sum(p.startswith(b'IBaS1P') for p in packets), 1)
        finally:
            engine.close()

class PulseTests(unittest.TestCase):
    def test_pulse_is_bounded_exclusive_and_stop_preserves_position(self):
        entered, released = threading.Event(), threading.Event()
        class Engine(FakeEngine):
            def timed_pulse(self, ms, abort):
                self.ms = ms; entered.set(); abort.wait(1); released.set()
        b = Bridge(BED, simulation=False, engine_factory=Engine)
        b.connect(); b.position = [20,30]
        for value in (0, -1, 101, float('inf')):
            with self.assertRaises(ValueError): b.pulse(value, True)
        with self.assertRaises(ValueError): b.pulse(50, False)
        b.pulse(50, True); self.assertTrue(entered.wait(1))
        with self.assertRaises(ValueError): b.pulse(50, True)
        with self.assertRaises(ValueError): b.motion('jog',1,0,True)
        b.pause(); self.assertTrue(released.wait(1))
        for _ in range(100):
            if b.status()['state'] == 'idle': break
            time.sleep(.002)
        self.assertEqual(b.state,'idle'); self.assertEqual(b.position,[20,30])
        self.assertFalse(b.engine.paused)

    def test_pulse_error_never_claims_ready(self):
        class Engine(FakeEngine):
            def timed_pulse(self, ms, abort): raise ConnectionError('lost')
        b=Bridge(BED,simulation=False,engine_factory=Engine);b.connect();b.position=[0,0]
        b.pulse(50,True)
        for _ in range(100):
            if b.state=='error': break
            time.sleep(.002)
        self.assertEqual(b.state,'error');self.assertIsNone(b.position)

if __name__ == '__main__': unittest.main()
