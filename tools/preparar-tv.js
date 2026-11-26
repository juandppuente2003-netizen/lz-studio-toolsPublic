// Prepara lz-plus.html para el navegador interno (WebView) de televisiones con Android viejo:
//  1) agrega funciones que faltan en navegadores viejos,
//  2) muestra en pantalla cualquier error (para poder reportarlo),
//  3) convierte el código moderno a uno que entiendan (Chrome 61 en adelante).
// Uso: node tools/preparar-tv.js entrada.html salida.html
const fs = require('fs');
const esbuild = require('esbuild');

const [, , input, output] = process.argv;
let html = fs.readFileSync(input, 'utf8');

const PRE = `<script>
/* Funciones que faltan en navegadores viejos */
(function () {
  function rc() { while (this.firstChild) this.removeChild(this.firstChild); for (var i = 0; i < arguments.length; i++) { var n = arguments[i]; this.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); } }
  if (!Element.prototype.replaceChildren) { Element.prototype.replaceChildren = rc; if (window.DocumentFragment) DocumentFragment.prototype.replaceChildren = rc; }
  if (!Element.prototype.append) Element.prototype.append = function () { for (var i = 0; i < arguments.length; i++) { var n = arguments[i]; this.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); } };
  if (!Element.prototype.prepend) Element.prototype.prepend = function () { var f = this.firstChild; for (var i = 0; i < arguments.length; i++) { var n = arguments[i]; this.insertBefore(typeof n === 'string' ? document.createTextNode(n) : n, f); } };
  if (!Element.prototype.remove) Element.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
  if (!Promise.allSettled) Promise.allSettled = function (ps) { return Promise.all(Array.prototype.map.call(ps, function (p) { return Promise.resolve(p).then(function (v) { return { status: 'fulfilled', value: v }; }, function (r) { return { status: 'rejected', reason: r }; }); })); };
  if (!Array.prototype.flatMap) Array.prototype.flatMap = function (f, t) { return [].concat.apply([], this.map(f, t)); };
  if (!window.AbortController) { window.AbortController = function () { this.signal = {}; }; window.AbortController.prototype.abort = function () {}; }
  if (!window.CSS) window.CSS = {};
  if (!CSS.escape) CSS.escape = function (s) { return String(s).replace(/[^a-zA-Z0-9_\\u00A0-\\uFFFF-]/g, function (c) { return '\\\\' + c; }); };
  /* Si algo falla, se muestra en pantalla en vez de quedar en blanco */
  function show(m) {
    var d = document.getElementById('lz-err');
    if (!d) { d = document.createElement('div'); d.id = 'lz-err'; d.style.cssText = 'position:fixed;left:2rem;right:2rem;bottom:2rem;z-index:99;background:#7a1f1f;color:#fff;font:16px sans-serif;padding:16px 20px;border-radius:12px;white-space:pre-wrap'; (document.body || document.documentElement).appendChild(d); }
    d.textContent = 'Error en LZ-PLUS (toma foto y envíala):\\n' + m + '\\nNavegador: ' + navigator.userAgent;
  }
  window.addEventListener('error', function (e) { show((e.message || 'error') + (e.lineno ? ' (línea ' + e.lineno + ')' : '')); });
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; if (r && /JSON|SyntaxError|TypeError|ReferenceError/.test(String(r))) show(String(r)); });
})();
</script>`;

// Convertir el script principal (el último <script> sin src)
const re = /<script>([\s\S]*?)<\/script>(?![\s\S]*<script>)/;
const m = html.match(re);
if (!m) throw new Error('No encontré el script principal');
const out = esbuild.transformSync(m[1], { loader: 'js', target: 'chrome61', minify: false, charset: 'utf8' });
html = html.replace(re, () => '<script>' + out.code + '</script>');
html = html.replace('<meta charset="utf-8">', (x) => x + '\n' + PRE);
fs.writeFileSync(output, html);
console.log('Listo:', output, '(' + Math.round(html.length / 1024) + ' KB)');
