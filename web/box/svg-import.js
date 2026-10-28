/* LZ Box Studio · importación segura de SVG (v62).
   Convierte un SVG externo en geometría física (mm) sin ejecutar nada:
   - Se rechazan entidades DTD; scripts, foreignObject, manejadores on* y
     recursos externos se eliminan y se informan.
   - Respeta width/height con unidades, viewBox, preserveAspectRatio y todas las
     transformaciones (matrix, translate, scale, rotate, skewX, skewY) y <use>.
   - Cada trazado conserva si es abierto o cerrado; las curvas y arcos se
     aproximan con tolerancia en mm.
   - Textos, recortes, máscaras y elementos desconocidos se enumeran con su
     corrección; nunca se omiten en silencio.
   El resultado no se dibuja con el SVG original: la vista previa y el raster se
   generan a partir de esta geometría ya validada. */

export const MM_PER = {mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, q: 0.25};
export const MAX_SVG_BYTES = 8 * 1024 * 1024;
const FLATNESS = 0.03; // mm
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['svg', 'g', 'a', 'switch']);
const NON_RENDERED = new Set(['defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'filter', 'metadata', 'title', 'desc', 'style', 'namedview', 'font', 'font-face', 'cursor', 'view', 'animate', 'animateTransform', 'animateMotion', 'set', 'mpath', 'solidcolor', 'meshgradient']);
const NAMED = {black: '#000000', white: '#ffffff', red: '#ff0000', lime: '#00ff00', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000', navy: '#000080', purple: '#800080', teal: '#008080', orange: '#ffa500', darkgray: '#a9a9a9', lightgray: '#d3d3d3', pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700'};

/* ------------------------------------------------------------ matrices */
const I = [1, 0, 0, 1, 0, 0];
export const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const numbers = (s) => (String(s || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);

export function parseTransform(text) {
  let m = I;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  const source = String(text || '').trim();
  let consumed = '';
  for (let r; (r = re.exec(source));) {
    consumed += r[0];
    const a = numbers(r[2]);
    let t;
    switch (r[1]) {
      case 'matrix': if (a.length !== 6) throw Error('matrix() necesita 6 valores'); t = a; break;
      case 'translate': t = [1, 0, 0, 1, a[0] || 0, a[1] || 0]; break;
      case 'scale': t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const r0 = (a[0] || 0) * Math.PI / 180, c = Math.cos(r0), s = Math.sin(r0);
        t = [c, s, -s, c, 0, 0];
        if (a.length >= 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX': t = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0]; break;
    }
    if (!t.every(Number.isFinite)) throw Error('transformación no finita');
    m = mul(m, t);
  }
  if (source && !consumed) throw Error('transformación no reconocida');
  return m;
}

/* ------------------------------------------------------------ unidades */
export function lengthMm(value, fallbackUnit = 'px') {
  const r = String(value ?? '').trim().match(/^([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)\s*([a-zA-Z%]*)$/);
  if (!r) return null;
  const unit = (r[2] || fallbackUnit).toLowerCase();
  if (!(unit in MM_PER)) return {invalid: unit};
  return Number(r[1]) * MM_PER[unit];
}

/* ------------------------------------------------------------ colores */
export function normalizeColor(value, current = '#000000') {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor') return normalizeColor(current);
  if (v.startsWith('url(')) return 'gradient';
  if (NAMED[v]) return NAMED[v];
  let r = v.match(/^#([0-9a-f]{3})$/);
  if (r) return '#' + r[1].split('').map((c) => c + c).join('');
  r = v.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (r) return '#' + r[1];
  r = v.match(/^rgba?\(([^)]*)\)$/);
  if (r) {
    const parts = r[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map((p) => p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p));
    if (parts.length === 3 && parts.every(Number.isFinite)) return '#' + parts.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
  }
  return 'other';
}

/* ------------------------------------------------------------ CSS simple */
function parseStyleSheets(doc, issues) {
  const rules = [];
  for (const node of doc.getElementsByTagName('style')) {
    const css = (node.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/@import|url\(\s*['"]?(?!#|data:)/i.test(css)) issues.push({level: 'warn', code: 'css-external', message: 'Se ignoró un recurso CSS externo (@import o url()).'});
    for (const r of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const decls = parseDeclarations(r[2]);
      for (const sel of r[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const m = sel.match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/);
        if (!m) { issues.push({level: 'warn', code: 'css-selector', message: `Regla CSS no compatible ignorada: «${sel.slice(0, 40)}». Usa clases simples o estilos en línea.`}); continue; }
        const classes = [...m[2].matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
        const id = m[2].match(/#([\w-]+)/)?.[1] || null;
        rules.push({tag: m[1] || null, classes, id, decls, specificity: (id ? 100 : 0) + classes.length * 10 + (m[1] ? 1 : 0), order: rules.length});
      }
    }
  }
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}
function parseDeclarations(text) {
  const out = {};
  for (const part of String(text || '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).replace(/!important/i, '').trim();
  }
  return out;
}
const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'display', 'visibility', 'fill-rule', 'color', 'opacity', 'fill-opacity', 'stroke-opacity'];
const INHERITED = new Set(['fill', 'stroke', 'stroke-width', 'visibility', 'fill-rule', 'color', 'fill-opacity', 'stroke-opacity']);
function ownStyle(node, rules) {
  const style = {};
  for (const p of STYLE_PROPS) if (node.hasAttribute?.(p)) style[p] = node.getAttribute(p);
  const classes = (node.getAttribute?.('class') || '').split(/\s+/).filter(Boolean), id = node.getAttribute?.('id');
  for (const r of rules) {
    if (r.tag && r.tag !== node.localName) continue;
    if (r.id && r.id !== id) continue;
    if (!r.classes.every((c) => classes.includes(c))) continue;
    Object.assign(style, r.decls);
  }
  Object.assign(style, parseDeclarations(node.getAttribute?.('style')));
  return style;
}

/* ------------------------------------------------------------ geometría */
function flattenCubic(out, p0, p1, p2, p3, depth = 0) {
  const d1 = Math.abs((p1[0] - p3[0]) * (p0[1] - p3[1]) - (p1[1] - p3[1]) * (p0[0] - p3[0]));
  const d2 = Math.abs((p2[0] - p3[0]) * (p0[1] - p3[1]) - (p2[1] - p3[1]) * (p0[0] - p3[0]));
  const len = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  if (depth > 16 || (d1 + d2) <= FLATNESS * Math.max(len, 1e-9) && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) <= len * 1.5 + FLATNESS) { out.push(p3); return; }
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = m(p0, p1), b = m(p1, p2), c = m(p2, p3), ab = m(a, b), bc = m(b, c), mid = m(ab, bc);
  flattenCubic(out, p0, a, ab, mid, depth + 1);
  flattenCubic(out, mid, bc, c, p3, depth + 1);
}

/** Convierte el atributo d en subtrayectorias de puntos ya transformados (mm). */
export function pathToPolylines(d, matrix) {
  const tokens = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const T = (p) => apply(matrix, p);
  const out = [];
  let i = 0, cmd = '', cur = [0, 0], start = [0, 0], lastCtrl = null, lastCmd = '', sub = null;
  const num = () => { const v = Number(tokens[i++]); if (!Number.isFinite(v)) throw Error('Trazado con números inválidos.'); return v; };
  const flag = () => { // los indicadores de arco pueden venir pegados («a5 5 0 016 0»)
    const t = tokens[i];
    if (/^[01]/.test(t) && t.length > 1 && !/[eE.]/.test(t.slice(0, 2))) { tokens[i] = t.slice(1); return Number(t[0]); }
    return num();
  };
  const begin = (p) => { if (sub && sub.points.length > 1) out.push(sub); sub = {points: [T(p)], closed: false}; };
  const lineTo = (p) => { if (!sub) begin(cur); sub.points.push(T(p)); };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) throw Error('El trazado no empieza con M.');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const pt = () => { const x = num(), y = num(); return rel ? [cur[0] + x, cur[1] + y] : [x, y]; };
    switch (C) {
      case 'M': cur = pt(); start = cur; begin(cur); cmd = rel ? 'l' : 'L'; break;
      case 'L': cur = pt(); lineTo(cur); break;
      case 'H': { const x = num(); cur = [rel ? cur[0] + x : x, cur[1]]; lineTo(cur); break; }
      case 'V': { const y = num(); cur = [cur[0], rel ? cur[1] + y : y]; lineTo(cur); break; }
      case 'C': case 'S': {
        const c1 = C === 'C' ? pt() : (lastCtrl && /[CS]/.test(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur);
        const c2 = pt(), end = pt();
        if (!sub) begin(cur);
        const pts = []; flattenCubic(pts, T(cur), T(c1), T(c2), T(end)); sub.points.push(...pts);
        lastCtrl = c2; cur = end; break;
      }
      case 'Q': case 'T': {
        const q = C === 'Q' ? pt() : (lastCtrl && /[QT]/.test(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur);
        const end = pt();
        const c1 = [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])], c2 = [end[0] + 2 / 3 * (q[0] - end[0]), end[1] + 2 / 3 * (q[1] - end[1])];
        if (!sub) begin(cur);
        const pts = []; flattenCubic(pts, T(cur), T(c1), T(c2), T(end)); sub.points.push(...pts);
        lastCtrl = q; cur = end; break;
      }
      case 'A': {
        let rx = Math.abs(num()), ry = Math.abs(num()); const rot = num() * Math.PI / 180, large = flag(), sweep = flag(); const end = pt();
        if (!sub) begin(cur);
        if (!rx || !ry) { lineTo(end); cur = end; break; }
        const cos = Math.cos(rot), sin = Math.sin(rot), dx = (cur[0] - end[0]) / 2, dy = (cur[1] - end[1]) / 2;
        const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
        const lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
        const sign = large === sweep ? -1 : 1, num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
        const k = sign * Math.sqrt(Math.max(0, num2 / den)), cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx;
        const cx = cos * cx1 - sin * cy1 + (cur[0] + end[0]) / 2, cy = sin * cx1 + cos * cy1 + (cur[1] + end[1]) / 2;
        const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
        const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry); let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
        if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
        const radius = Math.max(rx, ry) * scaleOf(matrix), steps = Math.max(4, Math.min(720, Math.ceil(Math.abs(dt) / Math.acos(Math.max(-1, 1 - FLATNESS / Math.max(radius, FLATNESS))) )));
        for (let s = 1; s <= steps; s++) {
          const t = t1 + dt * s / steps, x = rx * Math.cos(t), y = ry * Math.sin(t);
          sub.points.push(s === steps ? T(end) : T([cos * x - sin * y + cx, sin * x + cos * y + cy]));
        }
        cur = end; break;
      }
      case 'Z':
        if (sub) { sub.closed = true; const f = sub.points[0], l = sub.points[sub.points.length - 1]; if (sub.points.length > 1 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) sub.points.pop(); out.push(sub); sub = null; }
        cur = start; break;
      default: throw Error('Comando de trazado desconocido: ' + cmd);
    }
    lastCmd = C;
    if (!/[CSQT]/.test(C)) lastCtrl = null;
  }
  if (sub && sub.points.length > 1) out.push(sub);
  return out.filter((s) => s.points.length >= (s.closed ? 3 : 2) || (s.closed && s.points.length === 2));
}

function shapeToPath(node) {
  const a = (k, d = 0) => { const v = node.getAttribute(k); if (v === null || v === '') return d; const r = parseFloat(v); return Number.isFinite(r) ? r : d; };
  switch (node.localName) {
    case 'path': return node.getAttribute('d') || '';
    case 'rect': {
      const x = a('x'), y = a('y'), w = a('width'), h = a('height');
      if (!(w > 0 && h > 0)) return '';
      let rx = node.hasAttribute('rx') ? a('rx') : null, ry = node.hasAttribute('ry') ? a('ry') : null;
      rx = rx ?? ry ?? 0; ry = ry ?? rx; rx = Math.min(Math.max(rx, 0), w / 2); ry = Math.min(Math.max(ry, 0), h / 2);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle': case 'ellipse': {
      const cx = a('cx'), cy = a('cy'), rx = node.localName === 'circle' ? a('r') : a('rx'), ry = node.localName === 'circle' ? a('r') : a('ry');
      if (!(rx > 0 && ry > 0)) return '';
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'line': return `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`;
    case 'polyline': case 'polygon': {
      const n = numbers(node.getAttribute('points'));
      if (n.length < 4) return '';
      let d = `M${n[0]} ${n[1]}`; for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
      return d + (node.localName === 'polygon' ? 'Z' : '');
    }
  }
  return '';
}

/* ------------------------------------------------------------ análisis */
const hrefOf = (node) => node.getAttribute('href') ?? node.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href') ?? node.getAttribute('xlink:href');

/**
 * @param {string} text  contenido del SVG
 * @param {{DOMParser, name, unitOverride}} options  unitOverride: 'auto' | 'px96' | 'px72' | 'mm'
 */
export function importSVG(text, {DOMParser: Parser = globalThis.DOMParser, name = 'archivo.svg', unitOverride = 'auto'} = {}) {
  const issues = [];
  const note = (level, code, message, count = 1) => { const found = issues.find((i) => i.code === code && i.message === message); if (found) found.count += count; else issues.push({level, code, message, count}); };
  if (typeof text !== 'string' || !text.trim()) throw Error('El archivo está vacío.');
  if (text.length > MAX_SVG_BYTES) throw Error('El SVG supera 8 MB. Simplifica el diseño o exporta sin imágenes incrustadas.');
  if (/<!ENTITY/i.test(text)) throw Error('El SVG declara entidades DTD. Por seguridad no se importa; vuelve a exportarlo como SVG simple.');
  const doc = new Parser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) throw Error('El archivo no es un SVG válido.');

  // 1 · Saneamiento: nada ejecutable ni externo sobrevive.
  for (const node of [...root.querySelectorAll('script')]) { node.remove(); note('info', 'script', 'Se eliminó un script incrustado; nunca se ejecuta.'); }
  for (const node of [...root.querySelectorAll('foreignObject, iframe, embed, object, audio, video, canvas')]) { node.remove(); note('warn', 'foreign', `Se eliminó contenido no SVG (${node.localName}). Conviértelo en trazados o imagen incrustada.`); }
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) { node.removeAttribute(attr.name); note('info', 'handler', 'Se eliminaron atributos de evento (on…); nunca se ejecutan.'); }
      else if (/href$/i.test(attr.name)) {
        const v = attr.value.trim();
        const allowed = v.startsWith('#') || (node.localName === 'image' && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(v));
        if (!allowed) { node.removeAttributeNode(attr); note('warn', 'external', node.localName === 'image' ? 'Se bloqueó una imagen enlazada desde fuera del archivo. Incrústala en el SVG (data:) para grabarla.' : 'Se bloqueó un enlace a un recurso externo.'); }
      }
    }
  }
  const rules = parseStyleSheets(doc, issues);

  // 2 · Unidades físicas y viewBox.
  const vb = numbers(root.getAttribute('viewBox'));
  const hasViewBox = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  let wAttr = root.getAttribute('width'), hAttr = root.getAttribute('height');
  if (/%/.test(wAttr || '')) wAttr = null; if (/%/.test(hAttr || '')) hAttr = null;
  const unitless = (v) => v !== null && /^[-+\d.eE]+$/.test(String(v).trim());
  const pxUnit = unitOverride === 'px72' ? 25.4 / 72 : unitOverride === 'mm' ? 1 : 25.4 / 96;
  const physical = (v) => { if (v === null || v === undefined || v === '') return null; if (unitless(v)) return Number(v) * pxUnit; const r = lengthMm(v); if (r && typeof r === 'object') { note('warn', 'unit', `Unidad «${r.invalid}» no compatible; se interpretó en px.`); return parseFloat(v) * pxUnit; } return r; };
  let widthMm = physical(wAttr), heightMm = physical(hAttr);
  let unitsDeclared = !!(wAttr && hAttr && !unitless(wAttr) && !unitless(hAttr));
  if (hasViewBox) {
    if (widthMm === null && heightMm === null) { widthMm = vb[2] * pxUnit; heightMm = vb[3] * pxUnit; }
    else if (widthMm === null) widthMm = heightMm * vb[2] / vb[3];
    else if (heightMm === null) heightMm = widthMm * vb[3] / vb[2];
  }
  let rootMatrix;
  if (hasViewBox) {
    const sx = widthMm / vb[2], sy = heightMm / vb[3];
    const par = (root.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim().split(/\s+/);
    if (par[0] === 'none') rootMatrix = [sx, 0, 0, sy, -vb[0] * sx, -vb[1] * sy];
    else {
      const s = par[1] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
      const ax = /xMid/.test(par[0]) ? .5 : /xMax/.test(par[0]) ? 1 : 0, ay = /YMid/.test(par[0]) ? .5 : /YMax/.test(par[0]) ? 1 : 0;
      rootMatrix = [s, 0, 0, s, (widthMm - vb[2] * s) * ax - vb[0] * s, (heightMm - vb[3] * s) * ay - vb[1] * s];
    }
  } else {
    // Sin viewBox, una unidad de usuario es 1 px CSS.
    rootMatrix = [pxUnit, 0, 0, pxUnit, 0, 0];
  }
  if (unitOverride !== 'auto') { note('info', 'unit-override', unitOverride === 'mm' ? 'Unidades sin dimensión interpretadas como milímetros (ajuste manual).' : `Unidades sin dimensión interpretadas como px a ${unitOverride === 'px72' ? 72 : 96} ppp (ajuste manual).`); }
  else if (!unitsDeclared) note('warn', 'no-units', `El SVG no declara medidas físicas (mm, cm o in). Se interpretó 1 unidad = 1 px a 96 ppp. Si la medida no coincide (p. ej. Illustrator a 72 ppp), cambia la interpretación de unidades.`);

  // 3 · Recorrido del árbol.
  const elements = [], images = [], texts = [];
  const byId = new Map(); for (const n of root.querySelectorAll('[id]')) byId.set(n.getAttribute('id'), n);
  let serial = 0;
  const walk = (node, matrix, inherited, depth, useStack) => {
    if (depth > 64) { note('warn', 'depth', 'Anidamiento excesivo: se ignoró contenido profundo.'); return; }
    const tag = node.localName;
    if (!tag) return;
    if (NON_RENDERED.has(tag) || node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/2000/svg') {
      if (!NON_RENDERED.has(tag) && node.namespaceURI && !/sodipodi|inkscape/.test(node.namespaceURI)) note('info', 'foreign-ns', `Se ignoró un elemento de otro espacio de nombres (${tag}).`);
      return;
    }
    const own = ownStyle(node, rules);
    if (own.display === 'none') { note('info', 'hidden', 'Se omitieron elementos ocultos (display:none). Muéstralos en tu editor si deben grabarse.'); return; }
    const style = {...Object.fromEntries(Object.entries(inherited).filter(([k]) => INHERITED.has(k))), ...own};
    let m = matrix;
    if (node !== root && node.hasAttribute('transform')) {
      try { m = mul(matrix, parseTransform(node.getAttribute('transform'))); }
      catch (e) { note('error', 'transform', `Transformación inválida en <${tag}> (${e.message}). Ese elemento no se importó; corrígelo en tu editor.`); return; }
    }
    if (node !== root && (node.hasAttribute('clip-path') || node.hasAttribute('mask') || own['clip-path'] || own.mask)) note('warn', 'clip', 'Hay recortes o máscaras: se usan los trazados completos, sin recortar. Aplica el recorte en tu editor (Objeto › Recorte › Liberar/Aplicar como trazado).');
    if (tag === 'svg' && node !== root) {
      const x = parseFloat(node.getAttribute('x')) || 0, y = parseFloat(node.getAttribute('y')) || 0;
      const v = numbers(node.getAttribute('viewBox')), w = parseFloat(node.getAttribute('width')), h = parseFloat(node.getAttribute('height'));
      m = mul(m, [1, 0, 0, 1, x, y]);
      if (v.length === 4 && v[2] > 0 && v[3] > 0 && w > 0 && h > 0) m = mul(m, [w / v[2], 0, 0, h / v[3], -v[0] * w / v[2], -v[1] * h / v[3]]);
    }
    if (CONTAINERS.has(tag)) { for (const child of node.children) walk(child, m, style, depth + 1, useStack); return; }
    if (tag === 'use') {
      const ref = (hrefOf(node) || '').replace(/^#/, ''), target = byId.get(ref);
      if (!target || useStack.includes(ref)) { note('warn', 'use', 'Un clon (<use>) apunta a un elemento inexistente o circular; no se importó.'); return; }
      const um = mul(m, [1, 0, 0, 1, parseFloat(node.getAttribute('x')) || 0, parseFloat(node.getAttribute('y')) || 0]);
      if (target.localName === 'symbol') { for (const child of target.children) walk(child, um, style, depth + 1, [...useStack, ref]); }
      else walk(target, um, style, depth + 1, [...useStack, ref]);
      return;
    }
    if (tag === 'text' || tag === 'tspan' || tag === 'textPath') {
      const content = (node.textContent || '').trim().replace(/\s+/g, ' ');
      texts.push({text: content.slice(0, 60), font: style['font-family'] || node.getAttribute('font-family') || ''});
      return;
    }
    if (tag === 'image') {
      const href = hrefOf(node);
      if (!href) return; // bloqueada arriba y ya informada
      const x = parseFloat(node.getAttribute('x')) || 0, y = parseFloat(node.getAttribute('y')) || 0, w = parseFloat(node.getAttribute('width')), h = parseFloat(node.getAttribute('height'));
      if (!(w > 0 && h > 0)) { note('warn', 'image-size', 'Una imagen incrustada no declara ancho y alto; no se puede medir. Asígnale tamaño en tu editor.'); return; }
      const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => apply(m, p));
      images.push({id: 'img' + (++serial), href, x, y, width: w, height: h, matrix: m, corners, preserve: node.getAttribute('preserveAspectRatio') || 'xMidYMid meet', opacity: Number(style.opacity ?? 1)});
      return;
    }
    if (SHAPES.has(tag)) {
      if (style.visibility === 'hidden' || style.visibility === 'collapse') { note('info', 'hidden', 'Se omitieron elementos ocultos (visibility:hidden).'); return; }
      let subpaths;
      try { subpaths = pathToPolylines(shapeToPath(node), m); }
      catch (e) { note('error', 'path', `Trazado dañado en <${tag}${node.id ? ' #' + node.id : ''}>: ${e.message} No se importó; repáralo en tu editor.`); return; }
      if (!subpaths.length) { note('info', 'empty', 'Se omitieron formas vacías (sin tamaño).'); return; }
      const fill = normalizeColor(style.fill ?? 'black', style.color);
      const stroke = normalizeColor(style.stroke ?? 'none', style.color);
      if (fill === 'other' || stroke === 'other') note('warn', 'color', 'Hay colores no reconocidos; se agruparon como «otro color». Revisa la asignación de operaciones.');
      if (fill === 'gradient') note('info', 'gradient', 'Los rellenos con degradado o patrón se graban como relleno sólido.');
      const strokeWidth = parseFloat(style['stroke-width'] ?? 1);
      const widthMm = Number.isFinite(strokeWidth) ? Math.max(0, strokeWidth * scaleOf(m)) : 0.1;
      const id = node.getAttribute('id') || tag + (++serial);
      elements.push({id, tag, subpaths, fill: fill ? {color: fill, rule: style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero'} : null, stroke: stroke && widthMm > 0 ? {color: stroke, widthMm} : null});
      if (!fill && !(stroke && widthMm > 0)) note('info', 'invisible', 'Hay formas sin relleno ni contorno (invisibles). Se listan como «sin color» y no se asignan a ninguna operación.');
      return;
    }
    note('warn', 'unknown', `Elemento no compatible <${tag}> sin importar. Conviértelo en trazado en tu editor.`);
  };
  walk(root, rootMatrix, {fill: 'black'}, 0, []);
  if (texts.length) note('error', 'text', `Hay ${texts.length} texto${texts.length === 1 ? '' : 's'} que depende${texts.length === 1 ? '' : 'n'} de fuentes (${[...new Set(texts.map((t) => '«' + t.text + '»'))].slice(0, 3).join(', ')}). No se graban: conviértelos en trazados (Inkscape: Trayecto › Objeto a trayecto; Illustrator: Texto › Crear contornos).`);
  if (!elements.length && !images.length) throw Error(texts.length ? 'El SVG solo contiene textos con fuentes. Conviértelos en trazados y vuelve a importar.' : 'El SVG no contiene trazados ni imágenes que se puedan grabar o cortar.');
  for (const e of elements) for (const s of e.subpaths) if (!s.closed && e.fill && !e.stroke) note('info', 'open-fill', 'Algunos rellenos tienen trazados abiertos: el relleno se cierra al grabar como imagen (como en tu editor).');
  const bbox = boundsOf(elements, images);
  return {name, widthMm, heightMm, unitsDeclared, unitOverride, viewBox: hasViewBox ? vb : null, elements, images, texts, issues, bbox, layers: layersOf(elements, images), objectCount: elements.length + images.length};
}

export function boundsOf(elements, images = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p) => { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; };
  for (const e of elements) for (const s of e.subpaths) s.points.forEach(add);
  for (const i of images) i.corners.forEach(add);
  return Number.isFinite(x0) ? {x: x0, y: y0, width: x1 - x0, height: y1 - y0} : {x: 0, y: 0, width: 0, height: 0};
}

/** Capas por tipo y color. La asignación a operaciones se hace sobre estas capas. */
export function layersOf(elements, images) {
  const map = new Map();
  const add = (key, kind, color, length) => { const l = map.get(key) || {key, kind, color, count: 0, lengthMm: 0}; l.count++; l.lengthMm += length; map.set(key, l); };
  for (const e of elements) {
    const length = e.subpaths.reduce((sum, s) => sum + polylineLength(s.points, s.closed), 0);
    if (e.stroke) add('stroke:' + e.stroke.color, 'stroke', e.stroke.color, length);
    if (e.fill) add('fill:' + e.fill.color, 'fill', e.fill.color, length);
  }
  if (images.length) for (const i of images) add('image', 'image', null, 0);
  return [...map.values()].sort((a, b) => ({image: 0, fill: 1, stroke: 2})[a.kind] - ({image: 0, fill: 1, stroke: 2})[b.kind] || String(a.color).localeCompare(String(b.color)));
}

export function polylineLength(points, closed) {
  let L = 0; for (let i = 1; i < points.length; i++) L += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  if (closed && points.length > 2) L += Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]);
  return L;
}

/** Imagen PNG/JPG como diseño de grabado (una sola capa de imagen). */
export function imageDesign({name, href, pixelWidth, pixelHeight, widthMm}) {
  if (!(pixelWidth > 0 && pixelHeight > 0)) throw Error('La imagen no tiene dimensiones válidas.');
  const w = widthMm > 0 ? widthMm : pixelWidth * 25.4 / 96, h = w * pixelHeight / pixelWidth;
  const sx = w / pixelWidth;
  const m = [sx, 0, 0, sx, 0, 0];
  const corners = [[0, 0], [pixelWidth, 0], [pixelWidth, pixelHeight], [0, pixelHeight]].map((p) => apply(m, p));
  const images = [{id: 'img1', href, x: 0, y: 0, width: pixelWidth, height: pixelHeight, matrix: m, corners, preserve: 'none', opacity: 1}];
  return {name, widthMm: w, heightMm: h, unitsDeclared: false, unitOverride: 'auto', viewBox: null, elements: [], images, texts: [], bbox: boundsOf([], images), layers: layersOf([], images), objectCount: 1, raster: true,
    issues: [{level: 'info', code: 'photo', message: `Imagen de ${pixelWidth} × ${pixelHeight} px. Se interpretó a 96 ppp (${w.toFixed(1)} × ${h.toFixed(1)} mm); ajusta la escala a la medida real.`, count: 1}]};
}
