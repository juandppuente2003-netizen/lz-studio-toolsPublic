// =====================================================================
//  LZ-PLUS · Servidor intermedio para tu casa
//  - Muestra la app en la TV:  http://IP-DE-TU-COMPUTADORA:8080
//  - Se conecta a tus servidores (Xtream, listas M3U) como si fuera VLC,
//    así no los bloquea el navegador (CORS) ni piden una app.
//  Requiere Node.js 18 o más nuevo (https://nodejs.org). Sin instalar nada más.
//  Uso:  node lz-servidor.js        (o doble clic en INICIAR-LZ-PLUS.bat en Windows)
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const { spawn, execFileSync } = require('child_process');

// ---------- FFmpeg: convierte al vuelo los videos que el navegador no abre (MKV, AC3, HEVC) ----------
function findFfmpeg() {
  const cands = [process.env.FFMPEG];
  const fix = (p) => p && p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);   // dentro de la app de Windows
  try { cands.push(fix(require('ffmpeg-static'))); } catch {}
  try { cands.push(fix(require(path.join(__dirname, 'node_modules', 'ffmpeg-static')))); } catch {}
  cands.push('ffmpeg');
  for (const c of cands.filter(Boolean)) { try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch {} }
  return null;
}
let FFMPEG = findFfmpeg();
// Si no hay FFmpeg, se instala solo la primera vez (paquete ffmpeg-static de npm, en esta misma carpeta)
function installFfmpeg() {
  if (FFMPEG || process.env.LZ_EMBEDDED) return;
  console.log('  Instalando FFmpeg por única vez (1-2 minutos). La app ya funciona mientras tanto…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const p = spawn(npm, ['install', 'ffmpeg-static', '--no-audit', '--no-fund', '--no-save', '--loglevel=error'], { cwd: __dirname, shell: process.platform === 'win32', stdio: 'inherit' });
  p.on('close', () => {
    try { delete require.cache[require.resolve(path.join(__dirname, 'node_modules', 'ffmpeg-static'))]; } catch {}
    FFMPEG = findFfmpeg();
    console.log(FFMPEG ? '\n  ✓ FFmpeg instalado: ya se pueden ver videos MKV, HEVC y AC3. Recarga la app en el navegador.\n' : '\n  No se pudo instalar FFmpeg. Revisa tu conexión a internet y vuelve a abrir este programa.\n');
  });
}

const PORT = Number(process.env.PORT) || 8080;
const APP = path.join(__dirname, 'lz-plus.html');
const UA = 'VLC/3.0.20 LibVLC/3.0.20';
const PREFIX = '/lz-proxy/p';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
}

// Las listas HLS se reescriben para que cada pedazo de video también pase por aquí
function rewriteHls(text, base, extra) {
  const wrap = (u) => { let abs; try { abs = new URL(u, base).href; } catch { return u; } return PREFIX + '?u=' + encodeURIComponent(abs) + extra; };
  return text.split(/\r?\n/).map((line) => {
    const l = line.trim();
    if (!l) return line;
    if (l.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => 'URI="' + wrap(u) + '"');
    return wrap(l);
  }).join('\n');
}

async function proxy(req, res, q) {
  const target = q.get('u');
  if (!target || !/^https?:\/\//i.test(target)) { res.writeHead(400); return res.end('Falta el link'); }
  const headers = { 'User-Agent': q.get('a') || UA, 'Accept': '*/*' };
  if (q.get('r')) headers['Referer'] = q.get('r');
  if (req.headers.range) headers['Range'] = req.headers.range;
  const ctrl = new AbortController();
  req.on('close', () => ctrl.abort());
  let up;
  try { up = await fetch(target, { headers, redirect: 'follow', signal: ctrl.signal }); }
  catch (e) { if (e.name !== 'AbortError') console.log('  ✗ No responde: ' + new URL(target).host + ' (' + (e.cause?.code || e.message) + ')'); cors(res); res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No se pudo conectar: ' + (e.cause?.code || e.message)); }
  cors(res);
  if (up.status >= 400) console.log('  ✗ ' + up.status + ' en ' + new URL(target).host + ' (esa opción no está disponible)');
  const type = up.headers.get('content-type') || '';
  const finalUrl = up.url || target;
  const isHls = /mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(finalUrl);
  if (isHls && up.ok) {
    const text = await up.text();
    if (text.includes('#EXT-X-')) {
      const extra = (q.get('r') ? '&r=' + encodeURIComponent(q.get('r')) : '') + (q.get('a') ? '&a=' + encodeURIComponent(q.get('a')) : '');
      res.writeHead(up.status, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
      return res.end(rewriteHls(text, finalUrl, extra));
    }
    res.writeHead(up.status, { 'Content-Type': type || 'text/plain' });
    return res.end(text);
  }
  const out = { 'Content-Type': type || 'application/octet-stream' };
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'last-modified']) { const v = up.headers.get(h); if (v) out[h] = v; }
  res.writeHead(up.status, out);
  if (!up.body) return res.end();
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

function ffInput(q, level = 'error') {
  const args = ['-hide_banner', '-loglevel', level, '-user_agent', q.get('a') || UA];
  if (q.get('r')) args.push('-headers', 'Referer: ' + q.get('r') + '\r\n');
  args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  return args;
}
// Duración y códecs (para la barra de tiempo y decidir si hay que convertir la imagen)
function info(req, res, q) {
  cors(res);
  const target = q.get('u');
  if (!FFMPEG || !/^https?:\/\//i.test(target || '')) { res.writeHead(400); return res.end('{}'); }
  const p = spawn(FFMPEG, [...ffInput(q, 'info'), '-i', target]);
  let err = '';
  p.stderr.on('data', (d) => { err += d; if (err.length > 200000) p.kill('SIGKILL'); });
  const t = setTimeout(() => p.kill('SIGKILL'), 15000);
  p.on('close', () => {
    clearTimeout(t);
    const m = err.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    const v = (err.match(/Video: (\w+)/) || [])[1] || '';
    // Pistas de audio y subtítulos con su idioma y título
    const audios = [], subs = []; let last = null;
    for (const line of err.split(/\r?\n/)) {
      const s = line.match(/Stream #\d+:\d+(?:\[\w+\])?(?:\((\w+)\))?: (Audio|Subtitle): (\w+)(.*)/);
      if (s) { const list = s[2] === 'Audio' ? audios : subs; last = { n: list.length, lang: s[1] || '', codec: s[3], ch: (s[4].match(/(mono|stereo|5\.1|7\.1)/) || [])[1] || '', title: '' }; list.push(last); continue; }
      const tt = line.match(/^\s+title\s*:\s*(.+)$/); if (tt && last) { last.title = tt[1].trim(); continue; }
      if (/Stream #/.test(line)) last = null;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ duration: m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0, video: v, audio: audios[0]?.codec || '', audios, subs }));
  });
  req.on('close', () => p.kill('SIGKILL'));
}
// Video convertido a MP4 en vivo. v=copy (rápido, solo cambia el empaque) o v=h264 (convierte la imagen; usa más CPU)
function mp4(req, res, q) {
  cors(res);
  const target = q.get('u');
  if (!FFMPEG || !/^https?:\/\//i.test(target || '')) { res.writeHead(400); return res.end('Sin FFmpeg'); }
  const args = ffInput(q);
  const t = parseFloat(q.get('t') || '0');
  if (t > 0) args.push('-ss', String(t));
  args.push('-probesize', '5M', '-analyzeduration', '3M', '-fflags', '+genpts');   // arranca más rápido
  const au = Math.max(0, parseInt(q.get('au') || '0', 10) || 0);   // pista de audio elegida (Latino, Inglés…)
  args.push('-i', target, '-map', '0:v:0', '-map', '0:a:' + au + '?', '-sn', '-dn');
  if (q.get('v') === 'h264') args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-vf', "scale='min(1920,iw)':-2");
  else args.push('-c:v', 'copy');
  args.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
  const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let started = false, err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  p.stdout.once('data', () => { started = true; });
  res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-cache' });
  p.stdout.pipe(res);
  p.on('close', (code) => { if (!started && code) console.log('  FFmpeg no pudo abrir un video:', err.trim().split('\n').pop()); res.end(); });
  req.on('close', () => p.kill('SIGKILL'));
}

const server = http.createServer((req, res) => {
  if (req.url === '/lz-proxy/salir' && /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress)) { if (process.env.LZ_EMBEDDED) { res.end('no'); return; } res.end('ok'); setTimeout(() => process.exit(0), 100); return; }
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (u.pathname === '/prueba') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<body style="font:32px sans-serif;background:#06080F;color:#fff;display:grid;place-items:center;height:90vh"><div>✅ LZ-PLUS funciona en esta red.<br><a style="color:#F5B84B" href="/">Abrir la app</a></div></body>'); }
  if (u.pathname === '/lz-proxy/ping') { cors(res); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ lzproxy: true, ffmpeg: !!FFMPEG })); }
  if (u.pathname === '/lz-proxy/info') return info(req, res, u.searchParams);
  // Configuración para pasarla a la TV (se guarda solo en esta computadora)
  if (u.pathname === '/lz-proxy/config') {
    cors(res);
    const file = path.join(__dirname, 'lz-config.json');
    if (req.method === 'POST') { let b = ''; req.on('data', (d) => { b += d; if (b.length > 5e6) req.destroy(); }); req.on('end', () => { try { JSON.parse(b); fs.writeFileSync(file, b); res.writeHead(200); res.end('ok'); console.log('  ✓ Configuración guardada para pasarla a la TV'); } catch { res.writeHead(400); res.end('mal'); } }); return; }
    return fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end('{}'); } res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(data); });
  }
  if (u.pathname === '/lz-proxy/mp4') return mp4(req, res, u.searchParams);
  if (u.pathname === PREFIX) return proxy(req, res, u.searchParams).catch(() => { try { res.destroy(); } catch {} });
  if (u.pathname === '/' || u.pathname === '/index.html' || u.pathname === '/lz-plus.html') {
    fs.readFile(APP, (err, data) => {
      if (err) { res.writeHead(500); return res.end('No encuentro lz-plus.html junto a este archivo.'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end();
});
// Si ya hay otro LZ-PLUS abierto en el mismo puerto, se cierra solo y arranca este
let retried = false;
server.on('error', async (e) => {
  if (e.code !== 'EADDRINUSE' || retried) { console.log('\n  No se pudo abrir el puerto ' + PORT + ': ' + e.message + '\n'); if (!process.env.LZ_EMBEDDED) process.exit(1); return; }
  retried = true;
  console.log('  Ya había un LZ-PLUS abierto. Cerrándolo para abrir la versión nueva…');
  try { await fetch('http://127.0.0.1:' + PORT + '/lz-proxy/salir'); } catch {}
  await new Promise((r) => setTimeout(r, 800));
  if (process.platform === 'win32') {
    try {   // versiones viejas no saben cerrarse solas: se cierra el programa que ocupa el puerto (solo si es Node)
      const lines = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).split(/\r?\n/).filter((l) => /LISTENING/i.test(l) && new RegExp(':' + PORT + '\\s').test(l));
      for (const pid of new Set(lines.map((l) => l.trim().split(/\s+/).pop()))) {
        if (!pid || pid === String(process.pid)) continue;
        const info = execFileSync('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
        if (/node\.exe/i.test(info)) execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
        else console.log('  El puerto ' + PORT + ' lo usa otro programa: ' + info.split(',')[0] + '. Ciérralo o cambia el puerto.');
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  server.listen(PORT, '0.0.0.0');
});
server.listen(PORT, '0.0.0.0');
server.on('listening', () => {
  // La IP de la red de tu casa va primero; las de programas virtuales (VirtualBox, WSL, etc.) al final
  const rank = (name, ip) => (/virtual|vmware|vbox|wsl|hyper-v|vethernet|docker|loopback|tailscale|zerotier|bluetooth/i.test(name) ? 10 : 0) + (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 3 : 5) + (/^192\.168\.56\./.test(ip) ? 10 : 0);
  const ips = Object.entries(os.networkInterfaces()).flatMap(([name, l]) => (l || []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ip: i.address, r: rank(name, i.address)}))).sort((a, b) => a.r - b.r).map((x) => x.ip);
  console.log('\n  LZ-PLUS está listo.' + (FFMPEG ? '  (FFmpeg activo: abre MKV, HEVC y AC3)' : '  (Sin FFmpeg: algunos videos no abrirán)') + '\n');
  if (ips.length) {
    console.log('  >>> En el navegador de tu TV escribe:   http://' + ips[0] + ':' + PORT + '   <<<\n');
    console.log('  Para comprobar la conexión desde la TV: http://' + ips[0] + ':' + PORT + '/prueba');
    if (ips.length > 1) console.log('  Si esa no abre, prueba: ' + ips.slice(1).map((ip) => 'http://' + ip + ':' + PORT).join('  '));
  }
  console.log('  En esta computadora:  http://localhost:' + PORT);
  console.log('\n  Si la TV no abre la dirección: haz doble clic en PERMITIR-EN-RED.bat (abre el Firewall de Windows)');
  console.log('  y revisa que la TV y la computadora estén en el mismo Wi-Fi.');
  console.log('\n  Deja esta ventana abierta mientras usas la app.\n');
  installFfmpeg();
});
