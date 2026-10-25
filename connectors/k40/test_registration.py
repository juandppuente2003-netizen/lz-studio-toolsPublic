import copy
import math
import unittest
from bridge import Bridge, M2Engine, validate_job
from registration import register_job
from test_bridge import BED, FakeEngine, job


def registration(session):
    return {'session':session, 'mode':'rigid', 'pairs':[
        {'design':[10,10], 'machine':[100,100]},
        {'design':[110,10], 'machine':[100,200]},
        {'design':[110,110], 'machine':[0,200]},
    ]}


class RegistrationTests(unittest.TestCase):
    def test_rigid_transform_preserves_lengths_and_server_rejects_bad_measurements(self):
        original = validate_job(job(), BED)
        refs = registration('session')
        transformed = register_job(original, refs, 'session', [0,0])
        points = transformed['paths'][0]['points']
        self.assertEqual(points[0], [100,100])
        self.assertAlmostEqual(math.dist(points[0],points[1]), 10)
        for bad in (
            dict(refs, session='other'), dict(refs, pairs=[]),
            dict(refs, pairs=[refs['pairs'][0], refs['pairs'][0]]),
            dict(refs, pairs=[{'design':[0,0],'machine':[0,0]}, {'design':[100,0],'machine':[120,0]}]),
            dict(refs, pairs=[{'design':[True,0],'machine':[0,0]}, refs['pairs'][1]]),
        ):
            with self.assertRaises(ValueError): register_job(original, bad, 'session', [0,0])

    def test_real_compiler_registered_origin_no_home_and_session_invalidated(self):
        b = Bridge(BED)
        try:
            info = b.connect(); self.assertIn('rigid-registration',info['features'])
            b.motion('home',confirmed=True)
            refs = registration(info['sessionId'])
            prepared = b.prepare(job(),'frame','aligned',refs)
            self.assertNotIn(b'IPP', b.payload); self.assertNotIn(b'D', b.payload)
            self.assertEqual(b.job['paths'][0]['points'][0], [100,100])
            self.assertFalse(b.job['_home']); b.run(prepared['id'],True); b.acknowledge(True)
            b.disconnect(); next_info = b.connect()
            self.assertNotEqual(info['sessionId'], next_info['sessionId'])
            b.motion('home',confirmed=True)
            with self.assertRaises(ValueError): b.prepare(job(),'cut','aligned',refs)
        finally:
            b.close()

    def test_bounds_revalidated_after_registration_and_missing_home_rejected(self):
        b = Bridge(BED,simulation=True,engine_factory=FakeEngine); info=b.connect()
        with self.assertRaises(ValueError): b.prepare(job(),'cut','aligned',registration(info['sessionId']))
        b.motion('home',confirmed=True)
        refs={'session':info['sessionId'],'mode':'translation','pairs':[{'design':[10,10],'machine':[399,399]}]}
        with self.assertRaises(ValueError): b.prepare(job(),'cut','aligned',refs)
        refs['pairs'][0]['machine']=[30,40]
        b.prepare(job(),'cut','aligned',refs)
        self.assertEqual(b.job['paths'][0]['points'][0],[30,40])


if __name__ == '__main__':
    unittest.main()
