"""Own startup entry and no-USB background lifecycle."""
import http.client
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch
import windows_setup
import update_windows

class WindowsSetupTests(unittest.TestCase):
    def test_update_rejects_pending_operation_and_verifies_version(self):
        with patch.object(update_windows, 'listening', return_value=True), patch.object(update_windows, 'request', return_value={'state':'paused'}) as request:
            with self.assertRaises(RuntimeError): update_windows.stop_previous()
            request.assert_called_once_with('/status')
        with patch.object(update_windows, 'listening', side_effect=[True,False]), patch.object(update_windows, 'request', side_effect=[{'state':'idle','bridgeVersion':'0.4.1'},{}]) as request:
            update_windows.stop_previous()
            self.assertEqual(request.call_args_list[-1].args,('/shutdown',{}))
        with patch.object(update_windows, 'listening', return_value=True), patch.object(update_windows, 'request', return_value={'bridgeVersion':'0.4.1'}):
            with self.assertRaises(RuntimeError): update_windows.verify_started()
        with patch.object(update_windows, 'listening', return_value=True), patch.object(update_windows, 'request', return_value={'bridgeVersion':'0.7.3'}):
            update_windows.verify_started()

    def test_command_quotes_paths_and_requires_runtime(self):
        with tempfile.TemporaryDirectory(prefix='LZ Studio ') as directory:
            folder=Path(directory)
            with self.assertRaises(RuntimeError): windows_setup.startup_command(folder)
            runtime=folder/'.venv'/'Scripts'/'pythonw.exe'
            runtime.parent.mkdir(parents=True); runtime.touch(); (folder/'background.pyw').touch()
            command=windows_setup.startup_command(folder)
            self.assertTrue(command.startswith('"')); self.assertIn('pythonw.exe" "',command)
            self.assertTrue(command.endswith('background.pyw"')); self.assertNotIn('cmd.exe',command)

    def test_only_own_hkcu_value_is_changed(self):
        calls=[]
        class Key:
            def __enter__(self): return self
            def __exit__(self,*args): pass
        registry=types.SimpleNamespace(HKEY_CURRENT_USER='HKCU',KEY_SET_VALUE=2,REG_SZ=1,
            CreateKeyEx=lambda *a: calls.append(('key',a)) or Key(),
            SetValueEx=lambda *a: calls.append(('set',a)),DeleteValue=lambda *a: calls.append(('delete',a)))
        with patch.dict(sys.modules,{'winreg':registry}),patch.object(sys,'platform','win32'),patch.object(windows_setup,'startup_command',return_value='pythonw background.pyw'):
            windows_setup.configure_startup(True); windows_setup.configure_startup(False)
        self.assertEqual(len(calls),4); self.assertEqual(calls[0][1][0],'HKCU')
        self.assertEqual(calls[1][1][1],'LZStudioK40'); self.assertEqual(calls[-1][1][1],'LZStudioK40')

    @unittest.skipIf(sys.platform=='win32','XDG isolation fixture is for Linux CI')
    def test_background_single_instance_and_no_usb_at_startup(self):
        probe=socket.socket()
        try: probe.bind(('127.0.0.1',17840))
        except OSError: self.skipTest('Port occupied; never stop an existing connector')
        finally: probe.close()
        with tempfile.TemporaryDirectory() as directory:
            env=dict(os.environ,XDG_CONFIG_HOME=directory)
            script=str(Path(__file__).with_name('background.pyw'))
            child=subprocess.Popen([sys.executable,script],env=env)
            try:
                path=Path(directory)/'LZStudioTools'/'K40'/'pairing.json'
                for _ in range(100):
                    if path.exists(): break
                    if child.poll() is not None: self.fail('Background process exited')
                    time.sleep(.02)
                token=json.loads(path.read_text())['token']
                def request(route,body=None):
                    c=http.client.HTTPConnection('127.0.0.1',17840,timeout=3)
                    c.request('POST' if body is not None else 'GET',route,body=None if body is None else json.dumps(body),headers={'Origin':'https://www.lzstudiotools.com','Authorization':'Bearer '+token,'Content-Type':'application/json'})
                    r=c.getresponse(); data=json.loads(r.read()); c.close(); self.assertEqual(r.status,200,data); return data
                status=request('/status')
                self.assertFalse(status['connected']); self.assertFalse(status['simulation']); self.assertIsNone(status['position'])
                self.assertEqual(subprocess.run([sys.executable,script],env=env,timeout=5).returncode,0)
                self.assertIsNone(child.poll()); self.assertEqual(json.loads(path.read_text())['token'],token)
                request('/shutdown',{}); child.wait(timeout=5); self.assertEqual(child.returncode,0)
                self.assertNotIn(token,(path.parent/'connector.log').read_text())
            finally:
                if child.poll() is None: child.terminate(); child.wait(timeout=5)

if __name__=='__main__': unittest.main()
