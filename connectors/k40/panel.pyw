"""Small Windows control window; closing it leaves the bridge available."""
import json
import threading
import tkinter as tk
from tkinter import ttk
from urllib.request import Request, urlopen
from urllib.error import URLError
import webbrowser
from bridge import load_pairing_token, PROTOCOL
from windows_setup import start_background, configure_startup

SITE = 'https://lz-studio-tools-d-git-a183ed-juandppuente2003-netizens-projects.vercel.app'
root = tk.Tk()
root.title('LZ Studio · Conector K40')
root.geometry('580x390')
root.minsize(520, 350)
root.configure(bg='#f4f4f2')
frame = ttk.Frame(root, padding=24)
frame.pack(fill='both', expand=True)
ttk.Label(frame, text='LZ Studio · Conector K40', font=('Segoe UI', 17, 'bold')).pack(anchor='w')
ttk.Label(frame, text='Disponible para Box. No mueve la máquina al iniciar.', wraplength=510).pack(anchor='w', pady=(8, 16))
message = tk.StringVar(value='Comprobando conector…')
ttk.Label(frame, textvariable=message, wraplength=510).pack(anchor='w', pady=8)
token_var = tk.StringVar()
ttk.Label(frame, text='Código permanente · úsalo una vez en Box').pack(anchor='w')
entry = ttk.Entry(frame, textvariable=token_var, show='•')
entry.pack(fill='x', pady=8)


def credential():
    # Never create/rotate pairing until the background bridge has bound its port.
    from bridge import pairing_path
    path = pairing_path()
    if not path.exists():
        raise RuntimeError('El conector aún no está listo. Pulsa Actualizar estado.')
    return json.loads(path.read_text(encoding='utf-8'))['token']


def request(path, body=None):
    headers = {'Origin': SITE, 'Authorization': 'Bearer ' + credential()}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = Request('http://127.0.0.1:17840' + path, headers=headers,
                  data=None if body is None else json.dumps(body).encode())
    with urlopen(req, timeout=4) as response:
        result = json.load(response)
    if result.get('protocol') != PROTOCOL:
        raise RuntimeError('El puerto está ocupado por un servicio distinto.')
    return result


def worker(action):
    def execute():
        try:
            result = action()
            root.after(0, lambda: message.set(str(result)))
        except Exception as error:
            text = str(error)
            root.after(0, lambda: message.set(text))
    threading.Thread(target=execute, daemon=True).start()


def refresh():
    def read():
        result = request('/status')
        code = credential()
        root.after(0, lambda: token_var.set(code))
        return 'Conector ' + result.get('bridgeVersion', '?') + ' · ' + result['message']
    worker(read)


def copy_code():
    if token_var.get():
        root.clipboard_clear()
        root.clipboard_append(token_var.get())
        message.set('Código copiado. Marca Recordar esta computadora al conectar en Box.')


def startup(enabled):
    def set_value():
        configure_startup(enabled)
        if enabled:
            start_background()
        return 'Inicio automático ' + ('activado.' if enabled else 'desactivado. El conector actual sigue disponible.')
    worker(set_value)


buttons = ttk.Frame(frame)
buttons.pack(fill='x', pady=8)
ttk.Button(buttons, text='Copiar código', command=copy_code).pack(side='left')
ttk.Button(buttons, text='Abrir Box Studio', command=lambda: webbrowser.open(SITE + '/box/index.html?celular=1')).pack(side='left', padx=8)
ttk.Button(buttons, text='Actualizar estado', command=refresh).pack(side='left')
options = ttk.Frame(frame)
options.pack(fill='x', pady=8)
ttk.Button(options, text='Activar inicio con Windows', command=lambda: startup(True)).pack(side='left')
ttk.Button(options, text='Desactivar inicio', command=lambda: startup(False)).pack(side='left', padx=8)
def stop_connector():
    request('/shutdown', {})
    return 'Conector cerrado. Puedes volver a iniciarlo abriendo este panel.'

ttk.Button(frame, text='Cerrar conector · solo sin trabajo pendiente', command=lambda: worker(stop_connector)).pack(anchor='w', pady=8)
ttk.Label(frame, text='Cerrar esta ventana mantiene el conector en segundo plano.\nLibera USB desde Box para usar Sagaon. Los drivers no se modifican.', wraplength=510).pack(anchor='w', pady=8)
try:
    start_background()
    root.after(1000, refresh)
except Exception as error:
    message.set(str(error))
root.mainloop()
