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
  catch (e) { cors(res); res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No se pudo conectar: ' + (e.cause?.code || e.message)); }
  cors(res);
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

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (u.pathname === '/prueba') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<body style="font:32px sans-serif;background:#06080F;color:#fff;display:grid;place-items:center;height:90vh"><div>✅ LZ-PLUS funciona en esta red.<br><a style="color:#F5B84B" href="/">Abrir la app</a></div></body>'); }
  if (u.pathname === '/lz-proxy/ping') { cors(res); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"lzproxy":true}'); }
  if (u.pathname === PREFIX) return proxy(req, res, u.searchParams).catch(() => { try { res.destroy(); } catch {} });
  if (u.pathname === '/' || u.pathname === '/index.html' || u.pathname === '/lz-plus.html') {
    fs.readFile(APP, (err, data) => {
      if (err) { res.writeHead(500); return res.end('No encuentro lz-plus.html junto a este archivo.'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, '0.0.0.0', () => {
  // La IP de la red de tu casa va primero; las de programas virtuales (VirtualBox, WSL, etc.) al final
  const rank = (name, ip) => (/virtual|vmware|vbox|wsl|hyper-v|vethernet|docker|loopback|tailscale|zerotier|bluetooth/i.test(name) ? 10 : 0) + (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 3 : 5) + (/^192\.168\.56\./.test(ip) ? 10 : 0);
  const ips = Object.entries(os.networkInterfaces()).flatMap(([name, l]) => (l || []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ip: i.address, r: rank(name, i.address)}))).sort((a, b) => a.r - b.r).map((x) => x.ip);
  console.log('\n  LZ-PLUS está listo.\n');
  if (ips.length) {
    console.log('  >>> En el navegador de tu TV escribe:   http://' + ips[0] + ':' + PORT + '   <<<\n');
    console.log('  Para comprobar la conexión desde la TV: http://' + ips[0] + ':' + PORT + '/prueba');
    if (ips.length > 1) console.log('  Si esa no abre, prueba: ' + ips.slice(1).map((ip) => 'http://' + ip + ':' + PORT).join('  '));
  }
  console.log('  En esta computadora:  http://localhost:' + PORT);
  console.log('\n  Si la TV no abre la dirección: haz doble clic en PERMITIR-EN-RED.bat (abre el Firewall de Windows)');
  console.log('  y revisa que la TV y la computadora estén en el mismo Wi-Fi.');
  console.log('\n  Deja esta ventana abierta mientras usas la app.\n');
});
