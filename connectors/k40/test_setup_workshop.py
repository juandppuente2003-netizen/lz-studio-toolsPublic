import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import setup_workshop as setup


class InstallerTests(unittest.TestCase):
    def test_requires_protocol_pairing_and_expected_script(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory); script=folder/'background.pyw'; script.touch()
            (folder/'bridge.py').write_text('unrelated application')
            self.assertIsNone(setup.lz_script(['pythonw.exe',str(script)]))
            (folder/'bridge.py').write_text('lz-k40-m2/v1 LZStudioTools pairing_path')
            self.assertEqual(setup.lz_script(['pythonw.exe',str(script)]),script.resolve())
            unknown=folder/'something.py'; unknown.touch()
            self.assertIsNone(setup.lz_script(['python.exe',str(unknown)]))

    def test_only_verified_process_is_stopped_and_pid_reuse_is_rejected(self):
        known={'ProcessId':80000,'CreationDate':'same','CommandLine':'known'}
        other={'ProcessId':80001,'CreationDate':'same','CommandLine':'other'}
        with patch.object(setup,'own_processes',side_effect=[[known,other],[known,other]]),patch.object(setup,'split_command',side_effect=lambda x:[x]),patch.object(setup,'lz_script',side_effect=lambda x:Path('bridge.py') if x==['known'] else None),patch.object(setup.subprocess,'run') as run:
            setup.stop_lz_processes()
            self.assertEqual(run.call_count,1)
            self.assertEqual(run.call_args.args[0],['taskkill.exe','/PID','80000','/F'])
        with patch.object(setup,'own_processes',side_effect=[[known],[dict(known,CreationDate='reused')]]),patch.object(setup,'split_command',return_value=['known']),patch.object(setup,'lz_script',return_value=Path('bridge.py')),patch.object(setup.subprocess,'run') as run:
            with self.assertRaises(RuntimeError):setup.stop_lz_processes()
            run.assert_not_called()

    def test_identity_checks_pid_version_and_source(self):
        folder=Path('/local/connector'); good={'protocol':'lz-k40-m2/v1','bridgeVersion':setup.VERSION,'pid':123,'source':str(folder/'bridge.py'),'ready':True}
        self.assertTrue(setup.verify_identity(good,folder,123))
        for changes in [{'pid':124},{'bridgeVersion':'0.6.0'},{'source':'/old/bridge.py'},{'ready':False}]:
            self.assertFalse(setup.verify_identity(dict(good,**changes),folder,123))
