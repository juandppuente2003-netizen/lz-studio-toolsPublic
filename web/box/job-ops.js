/* LZ Box Studio · operaciones de máquina para archivos importados (v62).
   Une un diseño importado (svg-import.js), su colocación en la cama y una lista
   de operaciones ordenadas en un trabajo lz-k40-m2/v2:
   - Grabado de imagen: raster de 1 bit (la M2 no tiene PWM; la potencia es la
     del panel). Umbral o difusión de error, barridos horizontales.
   - Grabado vectorial y corte: trayectorias en mm. Dentro de cada operación se
     eliminan tramos repetidos con el mismo optimizador de Box (sin tocar otras
     operaciones ni las pasadas elegidas). Interiores antes que contornos.
   - Los SVG importados se cortan sobre la línea dibujada: no se aplica kerf.
   La generación de instrucciones M2 la hace el conector local. */
import {optimizeCuts, verifyOptimization} from './cut-optimizer.js?v=3.5';
import {apply, mul, boundsOf, polylineLength} from './svg-import.js?v=2';

export const K40_PROTOCOL_V2 = 'lz-k40-m2/v2';
export const NATIVE_MM = 0.0254;
export const OP_TYPES = {
  raster: {label: 'Grabado imagen', short: 'Imagen', color: '#e8eef5', speed: [10, 400], defaultSpeed: 200, icon: 'image'},
  engrave: {label: 'Grabado vectorial', short: 'Vectorial', color: '#ff4d6d', speed: [1, 100], defaultSpeed: 60, icon: 'pen'},
  cut: {label: 'Corte', short: 'Corte', color: '#3aa0ff', speed: [1, 100], defaultSpeed: 10, icon: 'scissors'},
};
export const RESOLUTIONS = [2, 3, 4, 5, 6, 8].map((step) => ({step, mm: +(step * NATIVE_MM).toFixed(4), dpi: Math.round(1000 / step)}));
const RED = (c) => { if (!/^#[0-9a-f]{6}$/.test(c || '')) return false; const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); return r > 180 && g < 90 && b < 90; };

let opSerial = 0;
export function makeOperation(type, extra = {}) {
  const t = OP_TYPES[type];
  if (!t) throw Error('Tipo de operación desconocido.');
  return {id: extra.id || `${type}-${Date.now().toString(36)}-${++opSerial}`, type, name: extra.name || t.label, enabled: extra.enabled ?? true, speed: extra.speed ?? t.defaultSpeed, passes: extra.passes ?? 1,
    ...(type === 'raster' ? {step: extra.step ?? 4, dither: extra.dither ?? 'auto', invert: !!extra.invert, bidirectional: extra.bidirectional ?? true} : {})};
}

/**
 * Propuesta inicial: imagen/rellenos → grabado imagen; contornos rojos → corte;
 * otros contornos → grabado vectorial. Orden: imagen, vectorial, corte.
 * Todo queda visible y editable en la tabla de capas.
 */
export function defaultPlan(design) {
  const ops = [], assignment = {};
  const need = (type) => ops.find((o) => o.type === type) || (ops.push(makeOperation(type)), ops.at(-1));
  for (const layer of design.layers) {
    if (layer.kind === 'image' || layer.kind === 'fill') assignment[layer.key] = need('raster').id;
    else assignment[layer.key] = (RED(layer.color) ? need('cut') : need('engrave')).id;
  }
  const rank = {raster: 0, engrave: 1, cut: 2};
  ops.sort((a, b) => rank[a.type] - rank[b.type]);
  return {operations: ops, assignment};
}

/** Qué operaciones puede recibir cada tipo de capa. Un relleno nunca se convierte en corte sin elegirlo. */
export function compatibleTypes(layer) {
  return layer.kind === 'image' ? ['raster'] : layer.kind === 'fill' ? ['raster', 'engrave-outline', 'cut-outline'] : ['engrave', 'cut', 'raster'];
}

export function orderWarnings(operations) {
  const active = operations.filter((o) => o.enabled);
  const firstCut = active.findIndex((o) => o.type === 'cut');
  const warnings = [];
  if (firstCut >= 0 && active.slice(firstCut + 1).some((o) => o.type !== 'cut')) warnings.push('Hay grabados después de un corte: la pieza puede moverse o caer antes de grabarse. Se recomienda grabar antes de cortar.');
  return warnings;
}

/* ------------------------------------------------------------ colocación */
/** Matriz documento(mm) → cama(mm): escala proporcional y giro alrededor del centro; esquina superior izquierda en (x,y). */
export function placementMatrix(design, placement) {
  const b = design.bbox, s = Math.max(0.001, Number(placement.scale) || 1), r = (Number(placement.rotation) || 0) * Math.PI / 180;
  const c = [b.x + b.width / 2, b.y + b.height / 2];
  let m = mul([Math.cos(r) * s, Math.sin(r) * s, -Math.sin(r) * s, Math.cos(r) * s, 0, 0], [1, 0, 0, 1, -c[0], -c[1]]);
  // Geometría real (no solo el rectángulo): una pieza girada no ocupa su caja original.
  const placed = boundsOf(design.elements.map((e) => ({subpaths: e.subpaths.map((p) => ({points: p.points.map((q) => apply(m, q))}))})), design.images.map((i) => ({corners: i.corners.map((q) => apply(m, q))})));
  return mul([1, 0, 0, 1, (Number(placement.x) || 0) - placed.x, (Number(placement.y) || 0) - placed.y], m);
}

export function placedBounds(design, placement) {
  const m = placementMatrix(design, placement);
  return boundsOf(design.elements.map((e) => ({subpaths: e.subpaths.map((p) => ({points: p.points.map((q) => apply(m, q))}))})), design.images.map((i) => ({corners: i.corners.map((q) => apply(m, q))})));
}

export function boundsCheck(bounds, bed) {
  const over = [];
  if (bounds.x < -1e-6) over.push(`izquierda ${(-bounds.x).toFixed(1)} mm`);
  if (bounds.y < -1e-6) over.push(`arriba ${(-bounds.y).toFixed(1)} mm`);
  if (bounds.x + bounds.width > bed.width + 1e-6) over.push(`derecha ${(bounds.x + bounds.width - bed.width).toFixed(1)} mm`);
  if (bounds.y + bounds.height > bed.height + 1e-6) over.push(`abajo ${(bounds.y + bounds.height - bed.height).toFixed(1)} mm`);
  return {ok: !over.length, message: over.length ? `El diseño sale de la cama (${over.join(', ')}). Muévelo o redúcelo.` : ''};
}

/* ------------------------------------------------------------ vectores */
function pointInPolygon(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Trayectorias de una operación vectorial en coordenadas de cama, optimizadas y verificadas. */
export function vectorPaths(design, placement, operation, assignment) {
  const m = placementMatrix(design, placement), raw = [];
  for (const e of design.elements) {
    const viaStroke = e.stroke && assignment['stroke:' + e.stroke.color] === operation.id;
    const viaFill = e.fill && assignment['fill:' + e.fill.color] === operation.id + ':outline';
    if (!viaStroke && !viaFill) continue;
    for (const s of e.subpaths) {
      const points = s.points.map((p) => apply(m, p).map((v) => Math.round(v * 1e4) / 1e4));
      // Un relleno abierto usado como contorno se cierra igual que al rellenar.
      const closed = s.closed || (viaFill && !viaStroke);
      if (points.length < (closed ? 3 : 2) || polylineLength(points, closed) < NATIVE_MM) continue;
      raw.push({points, closed, op: 'cut', passes: 1, parts: [e.id], role: 'outer'});
    }
  }
  if (!raw.length) return {paths: [], lengthMm: 0, savedMm: 0, travelMm: 0};
  // Interiores primero: un anillo cerrado dentro de otro de la misma operación.
  const closed = raw.filter((p) => p.closed);
  for (const p of closed) {
    const b = boundsOf([{subpaths: [p]}]);
    if (closed.some((q) => q !== p && (() => { const c = boundsOf([{subpaths: [q]}]); return c.width * c.height > b.width * b.height && b.x >= c.x && b.y >= c.y && b.x + b.width <= c.x + c.width && b.y + b.height <= c.y + c.height && pointInPolygon(p.points[0], q.points); })())) p.role = 'hole';
  }
  let result;
  try {
    result = optimizeCuts(raw, {tolerance: 0.01});
    const check = verifyOptimization(raw, result.paths, result.tolerance ?? 0.01);
    if (!check.ok) throw Error(check.problems[0]);
  } catch {
    // Sin optimización verificable se envía el original: nunca se pierde un tramo.
    const length = raw.reduce((s, p) => s + polylineLength(p.points, p.closed), 0);
    return {paths: raw.map(({points, closed, role}) => ({points, closed, role})), lengthMm: length, savedMm: 0, travelMm: travel(raw), optimized: false};
  }
  const paths = result.paths.map(({points, closed, role}) => ({points, closed: !!closed, role: role === 'hole' ? 'hole' : 'outer'}));
  return {paths, lengthMm: result.stats.after, savedMm: Math.max(0, result.stats.before - result.stats.after), travelMm: result.stats.travelAfter ?? travel(paths), optimized: true};
}
function travel(paths, at = [0, 0]) { let d = 0; for (const p of paths) { d += Math.hypot(p.points[0][0] - at[0], p.points[0][1] - at[1]); at = p.closed ? p.points[0] : p.points.at(-1); } return d; }

/* ------------------------------------------------------------ raster */
/** Área (cama, mm) que ocupa una operación de imagen, incluido el grosor de los contornos. */
export function rasterArea(design, placement, operation, assignment) {
  const m = placementMatrix(design, placement), s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p, pad = 0) => { x0 = Math.min(x0, p[0] - pad); y0 = Math.min(y0, p[1] - pad); x1 = Math.max(x1, p[0] + pad); y1 = Math.max(y1, p[1] + pad); };
  const items = rasterItems(design, operation, assignment);
  for (const {element, mode} of items.shapes) { const pad = mode === 'stroke' ? element.stroke.widthMm * s / 2 : 0; for (const sp of element.subpaths) for (const p of sp.points) add(apply(m, p), pad); }
  for (const image of items.images) for (const p of image.corners) add(apply(m, p));
  if (!Number.isFinite(x0)) return null;
  return {x: Math.max(0, x0), y: Math.max(0, y0), width: x1 - Math.max(0, x0), height: y1 - Math.max(0, y0), matrix: m, scale: s, items};
}
function rasterItems(design, operation, assignment) {
  const shapes = [], images = [];
  for (const e of design.elements) {
    if (e.fill && assignment['fill:' + e.fill.color] === operation.id) shapes.push({element: e, mode: 'fill'});
    if (e.stroke && assignment['stroke:' + e.stroke.color] === operation.id) shapes.push({element: e, mode: 'stroke'});
  }
  if (assignment.image === operation.id) images.push(...design.images);
  // Orden del documento: lo que está encima tapa lo de abajo (un blanco encima «borra»).
  const ordered = [...shapes.map((s) => ({...s, z: s.element.z ?? 0, sub: s.mode === 'stroke' ? 0.5 : 0})), ...images.map((image) => ({mode: 'image', image, z: image.z ?? 0, sub: 0}))].sort((a, b) => a.z - b.z || a.sub - b.sub);
  return {shapes, images, ordered};
}
const luminance = (c) => { if (!/^#[0-9a-f]{6}$/.test(c || '')) return 0; const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); return 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]; };
/** Color con el que se rasteriza: «solid» = todo color graba y solo el blanco no; «gray» = brillo real. */
export function rasterColor(color, tone) {
  if (tone === 'gray') return /^#[0-9a-f]{6}$/.test(color || '') ? color : '#000000';
  return luminance(color) >= 235 ? '#ffffff' : '#000000';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const f4 = (n) => Math.round(n * 1e4) / 1e4;
/** SVG en coordenadas de cama recortado al área raster; se dibuja en un canvas para obtener los puntos reales. */
export function rasterSVG(area, {widthPx, heightPx}, {tone = 'solid'} = {}) {
  const {items, matrix, scale} = area;
  let body = '';
  for (const item of items.ordered || [...items.shapes, ...items.images.map((image) => ({mode: 'image', image}))]) {
    if (item.mode === 'image') {
      const i = item.image, m = mul(matrix, i.matrix);
      body += `<image href="${esc(i.href)}" x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}" preserveAspectRatio="${esc(i.preserve)}" transform="matrix(${m.map(f4).join(' ')})"/>`;
      continue;
    }
    const {element, mode} = item;
    const d = element.subpaths.map((s) => 'M' + s.points.map((p) => apply(matrix, p).map(f4).join(' ')).join('L') + (s.closed || mode === 'fill' ? 'Z' : '')).join('');
    body += mode === 'fill' ? `<path d="${d}" fill="${rasterColor(element.fill.color, tone)}" fill-rule="${element.fill.rule}"/>` : `<path d="${d}" fill="none" stroke="${rasterColor(element.stroke.color, tone)}" stroke-width="${f4(element.stroke.widthMm * scale)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="${f4(area.x)} ${f4(area.y)} ${f4(area.width)} ${f4(area.height)}" preserveAspectRatio="none"><rect x="${f4(area.x)}" y="${f4(area.y)}" width="${f4(area.width)}" height="${f4(area.height)}" fill="#fff"/>${body}</svg>`;
}

export function rasterPixels(area, step) {
  const pitch = step * NATIVE_MM;
  return {widthPx: Math.max(1, Math.ceil(area.width / pitch)), heightPx: Math.max(1, Math.ceil(area.height / pitch)), pitch};
}

/** Escala de grises → 1 bit (true = quemar). Umbral para trazos y logotipos, difusión de error para fotos. */
export function toBits(gray, width, height, {dither = 'threshold', invert = false, threshold = 128} = {}) {
  const bits = new Uint8Array(width * height);
  if (dither === 'floyd') {
    const buf = Float32Array.from(gray, (v) => invert ? 255 - v : v);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, old = buf[i], value = old < 128 ? 0 : 255, err = old - value;
      bits[i] = value === 0 ? 1 : 0;
      if (x + 1 < width) buf[i + 1] += err * 7 / 16;
      if (y + 1 < height) { if (x > 0) buf[i + width - 1] += err * 3 / 16; buf[i + width] += err * 5 / 16; if (x + 1 < width) buf[i + width + 1] += err / 16; }
    }
  } else for (let i = 0; i < bits.length; i++) bits[i] = (invert ? 255 - gray[i] : gray[i]) < threshold ? 1 : 0;
  return bits;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function deflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
/** PNG gris de 1 bit (0 = negro = quemar). Compacto: una foto de 300 × 300 mm cabe en el límite del conector. */
export async function encodePNG1(bits, width, height) {
  const stride = Math.ceil(width / 8), raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) { const row = y * (stride + 1); for (let x = 0; x < width; x++) if (!bits[y * width + x]) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7); }
  const chunk = (type, data) => { const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer); v.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8); v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out; };
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer); v.setUint32(0, width); v.setUint32(4, height); ihdr[8] = 1; ihdr[9] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array())];
  const png = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}
export function base64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

/** Estadística de barridos: filas con puntos y longitud recorrida (incluye huecos dentro de la fila). */
export function sweepStats(bits, width, height, pitch) {
  let rows = 0, length = 0, burn = 0;
  for (let y = 0; y < height; y++) {
    let first = -1, last = -1;
    for (let x = 0; x < width; x++) if (bits[y * width + x]) { if (first < 0) first = x; last = x; burn++; }
    if (first >= 0) { rows++; length += (last - first + 1) * pitch; }
  }
  return {rows, sweepMm: length, burnPixels: burn};
}

/* ------------------------------------------------------------ estimaciones */
const RAPID = 120;      // mm/s aproximado entre trazos (la M2 acelera; es estimación)
const LINE_CHANGE = 0.03; // s por cambio de fila del raster
export function estimateOperation(op, data) {
  if (!op.enabled || !data) return 0;
  if (op.type === 'raster') { if (!data.sweep) return (data.area.height / (op.step * NATIVE_MM)) * (data.area.width / op.speed + LINE_CHANGE) * op.passes; return (data.sweep.sweepMm / op.speed + data.sweep.rows * LINE_CHANGE) * op.passes; }
  return (data.lengthMm / op.speed + data.travelMm / RAPID) * op.passes;
}

/* ------------------------------------------------------------ plan completo */
/** Calcula todo lo que no necesita el canvas: vectores, áreas raster, límites y tiempos. */
export function analyzePlan(design, placement, plan, bed) {
  const ops = plan.operations.map((op) => {
    const data = op.type === 'raster' ? (() => { const area = rasterArea(design, placement, op, plan.assignment); return area ? {area, pixels: rasterPixels(area, op.step)} : null; })() : vectorPaths(design, placement, op, plan.assignment);
    const empty = !data || (op.type !== 'raster' && !data.paths.length);
    return {op, data, empty, seconds: empty ? 0 : estimateOperation(op, data)};
  });
  const bounds = placedBounds(design, placement), check = boundsCheck(bounds, bed);
  const active = ops.filter((o) => o.op.enabled && !o.empty);
  const problems = [];
  if (!check.ok) problems.push(check.message);
  if (!active.length) problems.push('No hay operaciones activas con elementos asignados.');
  for (const o of ops) {
    if (!o.op.enabled || o.empty) continue;
    const [lo, hi] = OP_TYPES[o.op.type].speed;
    if (!(o.op.speed >= lo && o.op.speed <= hi)) problems.push(`${o.op.name}: velocidad entre ${lo} y ${hi} mm/s.`);
    if (!Number.isInteger(o.op.passes) || o.op.passes < 1 || o.op.passes > 10) problems.push(`${o.op.name}: pasadas enteras entre 1 y 10.`);
    if (o.op.type === 'raster' && o.data.pixels.widthPx * o.data.pixels.heightPx > 16e6) problems.push(`${o.op.name}: el área es demasiado grande para esa resolución. Usa una resolución menor.`);
  }
  return {ops, bounds, check, problems, warnings: orderWarnings(plan.operations), seconds: active.reduce((s, o) => s + o.seconds, 0)};
}

/** Renderiza una operación raster a 1 bit con el canvas del navegador. */
export async function renderRaster(area, op, {document: doc = globalThis.document} = {}) {
  const {widthPx, heightPx, pitch} = rasterPixels(area, op.step);
  if (widthPx * heightPx > 16e6) throw Error(`${op.name}: el área supera 16 millones de puntos. Reduce la resolución.`);
  const photo = area.items.images.length > 0;
  // auto: logotipos con colores sólidos (todo color graba, el blanco no); umbral/difusión usan el brillo real.
  const tone = op.dither === 'auto' ? 'solid' : 'gray';
  const svg = rasterSVG(area, {widthPx, heightPx}, {tone});
  const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    const canvas = doc.createElement('canvas'); canvas.width = widthPx; canvas.height = heightPx;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, widthPx, heightPx); ctx.drawImage(img, 0, 0, widthPx, heightPx);
    const rgba = ctx.getImageData(0, 0, widthPx, heightPx).data, gray = new Uint8ClampedArray(widthPx * heightPx);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    const dither = op.dither === 'auto' ? (photo ? 'floyd' : 'threshold') : op.dither;
    const bits = toBits(gray, widthPx, heightPx, {dither, invert: op.invert});
    return {bits, widthPx, heightPx, pitch, sweep: sweepStats(bits, widthPx, heightPx, pitch), dither};
  } finally { URL.revokeObjectURL(url); }
}

/** Trabajo v2 listo para el conector (raster ya convertido a PNG de 1 bit). */
export async function buildJobV2({design, placement, plan, bed, name}, analysis, renders) {
  const operations = [];
  for (const o of analysis.ops) {
    if (!o.op.enabled || o.empty) continue;
    if (o.op.type === 'raster') {
      const r = renders.get(o.op.id);
      if (!r) throw Error(`${o.op.name}: falta preparar la imagen.`);
      if (!r.sweep.burnPixels) continue;
      const png = await encodePNG1(r.bits, r.widthPx, r.heightPx);
      operations.push({type: 'raster', name: o.op.name, speed: o.op.speed, passes: o.op.passes, raster: {x: f4(o.data.area.x), y: f4(o.data.area.y), step: o.op.step, width: r.widthPx, height: r.heightPx, png: base64(png), bidirectional: o.op.bidirectional !== false}});
    } else operations.push({type: 'vector', name: o.op.name, speed: o.op.speed, passes: o.op.passes, paths: o.data.paths});
  }
  if (!operations.length) throw Error('No hay nada que grabar o cortar con las operaciones activas.');
  return {protocol: K40_PROTOCOL_V2, board: 'M2', bed: {...bed}, name: String(name || design.name || 'Trabajo').slice(0, 80), operations};
}

/* ------------------------------------------------------------ vista previa */
const ruler = (bed) => {
  let s = '';
  const major = bed.width > 600 ? 100 : 50;
  for (let x = 0; x <= bed.width + 1e-6; x += 10) s += `<path d="M${x} 0V${x % major === 0 ? -6 : -3}" stroke="currentColor" stroke-width="0.4" opacity="0.6"/>`;
  for (let y = 0; y <= bed.height + 1e-6; y += 10) s += `<path d="M0 ${y}H${y % major === 0 ? -6 : -3}" stroke="currentColor" stroke-width="0.4" opacity="0.6"/>`;
  for (let x = 0; x <= bed.width + 1e-6; x += major) s += `<text x="${x}" y="-9" font-size="6" text-anchor="middle" fill="currentColor" opacity="0.75">${x}</text>`;
  for (let y = major; y <= bed.height + 1e-6; y += major) s += `<text x="-9" y="${y + 2}" font-size="6" text-anchor="end" fill="currentColor" opacity="0.75">${y}</text>`;
  return s;
};
/**
 * Vista de cama compartida por escritorio y celular. compact=true usa solo
 * etiquetas permitidas por el visor del celular (svg, rect, path, circle, image).
 */
export function planPreview({bed, analysis, rasterPreviews = new Map(), position = null, compact = false, zoom = 1, center = null}) {
  const pad = compact ? 0 : 16;
  let vb = compact ? `0 0 ${bed.width} ${bed.height}` : `${-pad} ${-pad} ${bed.width + pad + 4} ${bed.height + pad + 4}`;
  if (!compact && zoom > 1.001) {
    // Acercar = recortar la vista alrededor del diseño (sin barras de desplazamiento).
    const w = (bed.width + pad + 4) / zoom, h = (bed.height + pad + 4) / zoom, c = center || [bed.width / 2, bed.height / 2];
    const x = Math.min(Math.max(c[0] - w / 2, -pad), bed.width + 4 - w), y = Math.min(Math.max(c[1] - h / 2, -pad), bed.height + 4 - h);
    vb = `${f4(x)} ${f4(y)} ${f4(w)} ${f4(h)}`;
  }
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Cama de ${bed.width} por ${bed.height} mm con el trabajo colocado">`;
  if (!compact) {
    s += `<defs><pattern id="lzgrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-width="0.15" opacity="0.35"/></pattern></defs>`;
    s += `<rect width="${bed.width}" height="${bed.height}" fill="url(#lzgrid)"/>` + ruler(bed);
  }
  s += `<rect width="${bed.width}" height="${bed.height}" fill="none" stroke="currentColor" stroke-width="0.6"/>`;
  for (const o of analysis.ops) {
    if (!o.op.enabled || o.empty) continue;
    if (o.op.type === 'raster') {
      const a = o.data.area, href = rasterPreviews.get(o.op.id);
      if (href && /^data:image\/png;base64,/.test(href)) s += `<image href="${href}" x="${f4(a.x)}" y="${f4(a.y)}" width="${f4(a.width)}" height="${f4(a.height)}" preserveAspectRatio="none" opacity="0.92"/>`;
      s += `<rect x="${f4(a.x)}" y="${f4(a.y)}" width="${f4(a.width)}" height="${f4(a.height)}" fill="${href ? 'none' : OP_TYPES.raster.color}" fill-opacity="0.12" stroke="${OP_TYPES.raster.color}" stroke-width="0.4" stroke-dasharray="2 1.5"/>`;
    } else {
      const color = OP_TYPES[o.op.type].color;
      s += o.data.paths.map((p) => `<path d="M${p.points.map((q) => q.map(f4).join(' ')).join('L')}${p.closed ? 'Z' : ''}" fill="none" stroke="${color}" stroke-width="${o.op.type === 'cut' ? 0.6 : 0.45}"/>`).join('');
    }
  }
  const b = analysis.bounds;
  if (b.width > 0) {
    const bad = !analysis.check.ok;
    s += `<rect x="${f4(b.x)}" y="${f4(b.y)}" width="${f4(b.width)}" height="${f4(b.height)}" fill="${bad ? '#ff3b5c' : 'none'}" fill-opacity="${bad ? 0.12 : 0}" stroke="${bad ? '#ff3b5c' : '#9b7bff'}" stroke-width="0.5" stroke-dasharray="3 2"/>`;
    if (!compact) s += `<text x="${f4(b.x + b.width / 2)}" y="${f4(b.y < 12 ? b.y + b.height + 7 : b.y - 2.5)}" font-size="5.5" text-anchor="middle" fill="${bad ? '#ff3b5c' : '#b9a6ff'}">${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm · X ${(Math.abs(b.x) < 0.05 ? 0 : b.x).toFixed(1)} Y ${(Math.abs(b.y) < 0.05 ? 0 : b.y).toFixed(1)}</text>`;
  }
  if (Array.isArray(position)) s += `<circle cx="${f4(position[0])}" cy="${f4(position[1])}" r="2.2" fill="#ff3b5c" stroke="#fff" stroke-width="0.7"/>`;
  return s + '</svg>';
}

/** Miniatura PNG de una operación raster ya convertida (para vista previa y biblioteca). */
export function bitsPreviewURL(render, {document: doc = globalThis.document, maxSide = 900} = {}) {
  const k = Math.min(1, maxSide / Math.max(render.widthPx, render.heightPx)), w = Math.max(1, Math.round(render.widthPx * k)), h = Math.max(1, Math.round(render.heightPx * k));
  const canvas = doc.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = render.bits[Math.min(render.heightPx - 1, Math.floor(y / k)) * render.widthPx + Math.min(render.widthPx - 1, Math.floor(x / k))], i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 235; img.data[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
