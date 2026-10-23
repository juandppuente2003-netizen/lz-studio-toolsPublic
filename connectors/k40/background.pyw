"""Per-user background bridge. No USB claim, homing or cutting at startup."""
import os
import sys
import traceback
from pathlib import Path
from bridge import Bridge, DEFAULT_ORIGINS, load_pairing_token, make_server, pairing_path


def run():
    # Binding is the single-instance lock; a second launch cannot replace pairing.
    bridge = Bridge({'width': 400, 'height': 400}, simulation=False)
    try:
        server = make_server(bridge, '', DEFAULT_ORIGINS)
    except OSError:
        return
    try:
        server.pairing_token = load_pairing_token()
        server.serve_forever()
    finally:
        server.server_close()
        bridge.close()


if __name__ == '__main__':
    folder = pairing_path().parent
    folder.mkdir(parents=True, exist_ok=True)
    log = folder / 'connector.log'
    if log.exists() and log.stat().st_size > 1_000_000:
        log.replace(folder / 'connector.previous.log')
    with log.open('a', encoding='utf-8') as stream:
        sys.stdout = sys.stderr = stream
        try:
            run()
        except Exception:
            traceback.print_exc()
