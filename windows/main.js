// LZ-PLUS para Windows: abre la app en su propia ventana y trae adentro
// el intermediario y FFmpeg (ya no hace falta abrir INICIAR-LZ-PLUS.bat).
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

process.env.PORT = process.env.PORT || '8080';
process.env.LZ_EMBEDDED = '1';
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Solo una ventana de LZ-PLUS a la vez
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
function createWindow() {
  require('./lz-servidor.js');   // arranca el intermediario dentro de la app
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#06080F', title: 'LZ-PLUS', icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true, show: false,
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  const url = 'http://localhost:' + process.env.PORT + '/';
  const load = (n) => win.loadURL(url).catch(() => { if (n < 40) setTimeout(() => load(n + 1), 250); });
  load(0);
  // F11: pantalla completa
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // Links externos (VLC, páginas) se abren fuera de la app
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(url)) { e.preventDefault(); shell.openExternal(u); } });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
