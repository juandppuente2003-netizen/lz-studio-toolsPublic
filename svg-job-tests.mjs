// Pruebas simuladas del importador SVG y de las operaciones (sin máquina).
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {inflateSync} from 'node:zlib';
import {importSVG, imageDesign, parseTransform, apply, pathToPolylines} from './web/box/svg-import.js';
import {defaultPlan, analyzePlan, vectorPaths, toBits, encodePNG1, sweepStats, planPreview, buildJobV2, placementMatrix, placedBounds, orderWarnings, makeOperation, rasterSVG, rasterArea, rasterPixels} from './web/box/job-ops.js';

const {DOMParser} = new JSDOM('').window;
const load = (text, extra = {}) => importSVG(text, {DOMParser, ...extra});
const BED = {width: 400, height: 400};
const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('unidades físicas, viewBox y preserveAspectRatio', () => {
  const d = load('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" stroke="#000" fill="none"/></svg>');
  close(d.widthMm, 100); close(d.heightMm, 50); close(d.bbox.width, 100); close(d.bbox.height, 50);
  assert.equal(d.unitsDeclared, true);
  const inches = load('<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 2 1"><line x1="0" y1="0" x2="2" y2="0" stroke="red"/></svg>');
  close(inches.bbox.width, 50.8);
  const meet = load('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 200 100"><rect width="200" height="100" stroke="#000" fill="none"/></svg>');
  close(meet.bbox.width, 100); close(meet.bbox.height, 50); close(meet.bbox.y, 25); // xMidYMid meet centra en vertical
  const px = load('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" stroke="#000" fill="none"/></svg>');
  close(px.bbox.width, 25.4);
  assert.ok(px.issues.some((i) => i.code === 'no-units'));
  const px72 = load('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" stroke="#000" fill="none"/></svg>', {unitOverride: 'px72'});
  close(px72.bbox.width, 25.4);
});

test('transformaciones anidadas, use y curvas', () => {
  const m = parseTransform('translate(10 20) rotate(90) scale(2)');
  const p = apply(m, [1, 0]); close(p[0], 10); close(p[1], 22);
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="100mm" viewBox="0 0 100 100">
    <defs><circle id="c" r="5" fill="none" stroke="#0000ff"/></defs>
    <g transform="translate(50 50)"><use xlink:href="#c" x="10"/></g>
    <path d="M0 0 C 10 0 10 10 20 10 S 30 20 40 20 Q 50 30 60 20 T 80 20 A 5 5 0 0 1 90 20" stroke="#000" fill="none"/></svg>`);
  const circle = d.elements.find((e) => e.stroke?.color === '#0000ff');
  const cb = circle.subpaths[0].points.reduce((b, q) => ({x0: Math.min(b.x0, q[0]), x1: Math.max(b.x1, q[0])}), {x0: 1e9, x1: -1e9});
  close(cb.x0, 55, 0.05); close(cb.x1, 65, 0.05);
  assert.equal(circle.subpaths[0].closed, true);
  const curve = d.elements.find((e) => e.stroke?.color === '#000000');
  assert.equal(curve.subpaths[0].closed, false);
  close(curve.subpaths[0].points.at(-1)[0], 90, 1e-6);
  assert.ok(curve.subpaths[0].points.length > 20);
});

test('arcos con indicadores compactos y comandos relativos', () => {
  const s = pathToPolylines('m10 10h10v10h-10z m30 0a5 5 0 105 5', [1, 0, 0, 1, 0, 0]);
  assert.equal(s.length, 2); assert.equal(s[0].closed, true); assert.equal(s[1].closed, false);
  close(s[1].points.at(-1)[0], 45); close(s[1].points.at(-1)[1], 15);
});

test('seguridad: scripts, eventos, recursos externos y entidades', () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10mm" height="10mm" viewBox="0 0 10 10" onload="alert(1)">
    <script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
    <image href="https://evil.example/x.png" width="5" height="5"/><a href="javascript:alert(1)"><rect width="5" height="5" fill="#000"/></a></svg>`);
  const codes = d.issues.map((i) => i.code);
  for (const c of ['script', 'handler', 'external', 'foreign']) assert.ok(codes.includes(c), c);
  assert.equal(d.images.length, 0); assert.equal(d.elements.length, 1);
  assert.throws(() => load('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>'), /entidades/);
  assert.throws(() => load('<html></html>'), /SVG válido|no es un SVG/);
});

test('textos, recortes y elementos incompatibles se informan, no se omiten en silencio', () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm" viewBox="0 0 50 50">
    <text x="5" y="20" font-family="Arial">PLACA</text><rect width="10" height="10" clip-path="url(#k)" stroke="red" fill="none"/>
    <rect x="20" width="10" height="10" fill="#000" style="display:none"/></svg>`);
  const byCode = Object.fromEntries(d.issues.map((i) => [i.code, i]));
  assert.equal(byCode.text.level, 'error'); assert.match(byCode.text.message, /trazados/);
  assert.ok(byCode.clip); assert.ok(byCode.hidden);
  assert.throws(() => load('<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm"><text>Hola</text></svg>'), /solo contiene textos/);
});

test('estilos CSS de clase (Illustrator) y relleno distinto de corte', () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><style>.cut{fill:none;stroke:#FF0000}.logo{fill:#000}</style>
    <rect class="cut" x="5" y="5" width="90" height="90"/><circle class="logo" cx="50" cy="50" r="20"/><path d="M10 50H90" stroke="blue" fill="none"/></svg>`);
  const plan = defaultPlan(d);
  assert.deepEqual(plan.operations.map((o) => o.type), ['raster', 'engrave', 'cut']);
  const byId = Object.fromEntries(plan.operations.map((o) => [o.type, o.id]));
  assert.equal(plan.assignment['stroke:#ff0000'], byId.cut);
  assert.equal(plan.assignment['fill:#000000'], byId.raster);   // el relleno no es corte
  assert.equal(plan.assignment['stroke:#0000ff'], byId.engrave);
});

test('colocación, giro, escala proporcional y límites de cama', () => {
  const d = load('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect width="100" height="50" stroke="red" fill="none"/></svg>');
  let b = placedBounds(d, {x: 10, y: 20, scale: 1, rotation: 0});
  close(b.x, 10); close(b.y, 20); close(b.width, 100); close(b.height, 50);
  b = placedBounds(d, {x: 0, y: 0, scale: 0.5, rotation: 90});
  close(b.width, 25); close(b.height, 50); close(b.x, 0); close(b.y, 0);
  const plan = defaultPlan(d);
  const ok = analyzePlan(d, {x: 0, y: 0, scale: 1, rotation: 0}, plan, BED); assert.equal(ok.check.ok, true);
  const out = analyzePlan(d, {x: 350, y: 0, scale: 1, rotation: 0}, plan, BED);
  assert.equal(out.check.ok, false); assert.match(out.problems[0], /sale de la cama.*derecha 50\.0 mm/);
});

test('corte: tramos compartidos una sola vez, interiores primero, pasadas intactas', () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100">
    <rect x="0" y="0" width="50" height="50" stroke="red" fill="none"/><rect x="50" y="0" width="50" height="50" stroke="red" fill="none"/>
    <circle cx="25" cy="25" r="5" stroke="red" fill="none"/></svg>`);
  const plan = defaultPlan(d); const cut = plan.operations.find((o) => o.type === 'cut'); cut.passes = 3;
  const v = vectorPaths(d, {x: 0, y: 0, scale: 1, rotation: 0}, cut, plan.assignment);
  close(v.savedMm, 50, 0.05);   // el lado común de 50 mm se corta una vez
  assert.equal(v.paths[0].role, 'hole');
  const a = analyzePlan(d, {x: 0, y: 0, scale: 1, rotation: 0}, plan, BED);
  assert.equal(a.ops.find((o) => o.op.type === 'cut').op.passes, 3);
});

test('mismo trazo en operaciones distintas no se elimina', () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
    <rect width="40" height="40" stroke="red" fill="none"/><rect width="40" height="40" stroke="#0000ff" fill="none"/></svg>`);
  const plan = defaultPlan(d), a = analyzePlan(d, {x: 0, y: 0, scale: 1, rotation: 0}, plan, BED);
  const cut = a.ops.find((o) => o.op.type === 'cut'), eng = a.ops.find((o) => o.op.type === 'engrave');
  close(cut.data.lengthMm, 160, 0.01); close(eng.data.lengthMm, 160, 0.01);
});

test('orden de operaciones: aviso si se graba después de cortar', () => {
  const ops = [makeOperation('cut'), makeOperation('engrave')];
  assert.equal(orderWarnings(ops).length, 1);
  assert.equal(orderWarnings([...ops].reverse()).length, 0);
  ops[1].enabled = false; assert.equal(orderWarnings(ops).length, 0);
});

test('raster: umbral, difusión de error, PNG de 1 bit válido y barridos', async () => {
  const w = 8, h = 2, gray = new Uint8Array([0, 0, 255, 255, 0, 255, 255, 255, 255, 100, 100, 100, 100, 100, 100, 255]);
  const bits = toBits(gray, w, h, {dither: 'threshold'});
  assert.deepEqual([...bits.slice(0, 8)], [1, 1, 0, 0, 1, 0, 0, 0]);
  const floyd = toBits(new Uint8Array(64).fill(128), 8, 8, {dither: 'floyd'});
  const ratio = floyd.reduce((s, v) => s + v, 0) / 64; assert.ok(ratio > 0.35 && ratio < 0.65);
  const png = await encodePNG1(bits, w, h);
  assert.deepEqual([...png.slice(1, 4)], [80, 78, 71]);
  assert.equal(png[24], 1); assert.equal(png[25], 0); // 1 bit, gris
  const idatLen = new DataView(png.buffer).getUint32(33), raw = inflateSync(png.slice(41, 41 + idatLen));
  assert.equal(raw[0], 0); assert.equal(raw[1], 0b00110111); // negro=0 quema; fila 1
  const sw = sweepStats(bits, w, h, 0.1); assert.equal(sw.rows, 2); close(sw.sweepMm, 0.5 + 0.6);
});

test('raster: SVG de renderizado en coordenadas de cama con imágenes y rellenos', () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect width="10" height="10" fill="#000"/>
    <image href="data:image/png;base64,iVBORw0KGgo=" x="10" y="0" width="10" height="10"/></svg>`);
  const plan = defaultPlan(d), op = plan.operations[0];
  const area = rasterArea(d, {x: 30, y: 40, scale: 1, rotation: 0}, op, plan.assignment);
  close(area.x, 30); close(area.y, 40); close(area.width, 20);
  const px = rasterPixels(area, 4); assert.equal(px.widthPx, Math.ceil(20 / 0.1016));
  const svg = rasterSVG(area, px);
  assert.match(svg, /viewBox="30 40 20 10"/); assert.match(svg, /<image href="data:image\/png/); assert.doesNotMatch(svg, /script/);
});

test('trabajo v2, vista previa con reglas y vista compacta para el celular', async () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
    <rect x="1" y="1" width="98" height="58" stroke="red" fill="none"/><path d="M10 30H90" stroke="blue" fill="none"/><rect x="40" y="20" width="20" height="20" fill="#000"/></svg>`);
  const plan = defaultPlan(d), placement = {x: 20, y: 20, scale: 1, rotation: 0};
  const analysis = analyzePlan(d, placement, plan, BED);
  assert.ok(analysis.seconds > 0);
  const raster = analysis.ops.find((o) => o.op.type === 'raster');
  const {widthPx, heightPx} = raster.data.pixels, bits = new Uint8Array(widthPx * heightPx).fill(1);
  const renders = new Map([[raster.op.id, {bits, widthPx, heightPx, sweep: sweepStats(bits, widthPx, heightPx, 0.1016)}]]);
  const job = await buildJobV2({design: d, placement, plan, bed: BED, name: 'Placa'}, analysis, renders);
  assert.equal(job.protocol, 'lz-k40-m2/v2');
  assert.deepEqual(job.operations.map((o) => o.type), ['raster', 'vector', 'vector']);
  assert.ok(job.operations[0].raster.png.startsWith('iVBORw0KGgo'));
  const full = planPreview({bed: BED, analysis});
  assert.match(full, /<text/); assert.match(full, /98\.0 × 58\.0 mm/);
  const compact = new JSDOM(planPreview({bed: BED, analysis, compact: true, position: [5, 5]}), {contentType: 'image/svg+xml'}).window.document;
  const tags = new Set([...compact.querySelectorAll('*')].map((n) => n.localName));
  for (const t of tags) assert.ok(['svg', 'rect', 'path', 'circle', 'image'].includes(t), t);
});

test('imagen PNG/JPG como grabado raster', () => {
  const d = imageDesign({name: 'foto.jpg', href: 'data:image/jpeg;base64,AAAA', pixelWidth: 960, pixelHeight: 480});
  close(d.bbox.width, 254); close(d.bbox.height, 127);
  const plan = defaultPlan(d); assert.deepEqual(plan.operations.map((o) => o.type), ['raster']);
  const m = placementMatrix(d, {x: 0, y: 0, scale: 0.5, rotation: 0}); close(apply(m, [254, 127])[0], 127);
});

test('colores: todos los colores graban, el blanco encima tapa, orden del documento y CSS de Illustrator', async () => {
  const {rasterColor} = await import('./web/box/job-ops.js');
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.st0{fill:#1D1D1B;}.st1{fill:#FFFFFF;}.st2{fill:#FFED00;}</style>
    <rect class="st0" width="100" height="100"/><rect class="st1" x="20" y="20" width="60" height="60"/><circle class="st2" cx="50" cy="50" r="10"/><rect x="0" y="0" width="5" height="5" fill="DarkOrange"/><rect x="5" y="0" width="5" height="5" fill="hsl(200,50%,50%)" fill-opacity="0"/></svg>`);
  assert.deepEqual(d.layers.map((l) => l.color).sort(), ['#1d1d1b', '#ff8c00', '#ffed00', '#ffffff']);
  const plan = defaultPlan(d), op = plan.operations[0];
  const area = rasterArea(d, {x: 0, y: 0, scale: 1, rotation: 0}, op, plan.assignment);
  const svg = rasterSVG(area, rasterPixels(area, 4), {tone: 'solid'});
  const fills = [...svg.matchAll(/<path[^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  assert.deepEqual(fills, ['#000000', '#ffffff', '#000000', '#000000']); // amarillo y naranja graban; blanco tapa
  assert.equal(rasterColor('#ffed00', 'gray'), '#ffed00');
});

test('regla del taller: rojo = corte (también relleno rojo, por su contorno), negro = grabado', () => {
  const d = load(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
    <rect x="5" y="5" width="90" height="90" fill="#E30613"/><path d="M20 50H80" stroke="#000" fill="none"/><circle cx="50" cy="30" r="10" fill="#000"/><rect x="10" y="10" width="10" height="10" stroke="#ff0000" fill="none"/></svg>`);
  const plan = defaultPlan(d), id = Object.fromEntries(plan.operations.map((o) => [o.type, o.id]));
  assert.equal(plan.assignment['fill:#e30613'], id.cut + ':outline');
  assert.equal(plan.assignment['stroke:#ff0000'], id.cut);
  assert.equal(plan.assignment['fill:#000000'], id.raster);
  assert.equal(plan.assignment['stroke:#000000'], id.engrave);
  const a = analyzePlan(d, {x: 0, y: 0, scale: 1, rotation: 0}, plan, BED);
  const cut = a.ops.find((o) => o.op.type === 'cut'); assert.equal(cut.data.paths.length, 2);
  const raster = a.ops.find((o) => o.op.type === 'raster'); assert.ok(raster.data.area.width < 25); // el rojo no entra al grabado
});
