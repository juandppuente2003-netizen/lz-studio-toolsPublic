/* LZ Box Studio · «Operar máquina» con dos fuentes de trabajo (v62).
   - Diseño Box: el flujo existente (plano, hojas, kerf, registro) sin cambios.
   - Importar archivo: SVG (prioritario) o PNG/JPG para grabado de imagen.
   Ambas usan la misma cama, la misma vista y la misma conexión del controlador.
   Nada de lo que ocurre aquí mueve la máquina: importar, colocar, cambiar de
   pestaña o abrir un trabajo guardado solo actualiza la vista. El envío lo inicia
   siempre el botón de la barra de acciones (o el celular con el control). */
import {importSVG, imageDesign} from './svg-import.js?v=2';
import {OP_TYPES, RESOLUTIONS, NATIVE_MM, makeOperation, defaultPlan, compatibleTypes, analyzePlan, planPreview, renderRaster, buildJobV2, bitsPreviewURL, placedBounds} from './job-ops.js?v=3';
import {JobLibrary, makeJobItem, localPut, localGet} from './job-library.js?v=1';

const K40_V1 = 'lz-k40-m2/v1';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const btn = (text, fn, cls = 'btn outline') => { const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; };
const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d + 0).toLocaleString('es-MX', {minimumFractionDigits: d, maximumFractionDigits: d});
export const fmtTime = (s) => { if (!Number.isFinite(s) || s <= 0) return '—'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`; };
const ICON = {
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5.5 4 4 2.5-2.5L20 18"/>',
  pen: '<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 6 3 3"/>',
  scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 17M8 15.5 20 7"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  rotL: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>', rotR: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
  center: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>', corner: '<path d="M4 10V4h6"/><rect x="8" y="8" width="12" height="12" rx="1.5"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8 11h6M11 8v6"/>', zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8 11h6"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>', cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>', save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
};
const svgIcon = (name, cls = 'neo-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;
const opIcon = {raster: 'image', engrave: 'pen', cut: 'scissors'};

export function mountJobStudio(app, machine, {library = new JobLibrary()} = {}) {
  if (app.jobStudio) return app.jobStudio;
  const dialog = machine.dialog, $ = (id) => document.getElementById(id);
  const state = {sendScope: 'all', source: 'box', design: null, file: null, unitOverride: 'auto', plan: null, placement: {x: 0, y: 0, scale: 1, rotation: 0}, libraryId: null, libraryCloud: null, created: null, savedWhere: null, savedAt: null, dirty: false, review: false};
  let analysis = null, analysisKey = '', renders = new Map(), previews = new Map(), renderTimer = null, renderToken = 0, zoom = 1, saveDraftTimer = null;

  /* ------------------------------------------------------------ DOM */
  const sourceBar = el('div', 'js-source'); sourceBar.setAttribute('role', 'tablist'); sourceBar.setAttribute('aria-label', 'Fuente del trabajo');
  const boxTab = btn('', () => setSource('box'), 'js-source-tab'), importTab = btn('', () => setSource('import'), 'js-source-tab');
  boxTab.innerHTML = svgIcon('box') + '<span>Diseño Box</span>'; importTab.innerHTML = svgIcon('file') + '<span>Importar archivo</span>';
  for (const t of [boxTab, importTab]) t.setAttribute('role', 'tab');
  sourceBar.append(boxTab, importTab);

  const panel = el('div', 'js-import'); panel.hidden = true;
  const input = el('input'); input.type = 'file'; input.accept = '.svg,image/svg+xml,.png,image/png,.jpg,.jpeg,image/jpeg'; input.hidden = true;
  const fileCard = el('section', 'neo-op-card js-file');
  fileCard.innerHTML = `<div class="js-file-head"><span class="js-file-icon">${svgIcon('file')}</span><div><strong class="js-file-name">Sin archivo</strong><span class="js-file-status"><i></i><em>Importa un SVG para placas, logotipos, grabados y cortes.</em></span></div></div>
   <dl class="js-file-facts"><div><dt>Dimensiones del archivo</dt><dd class="js-file-dims">—</dd></div><div><dt>Objetos</dt><dd class="js-file-count">—</dd></div></dl>
   <label class="js-units" hidden>Interpretar unidades<select class="js-unit-select"><option value="auto">Automático (96 ppp)</option><option value="px72">px a 72 ppp (Illustrator)</option><option value="px96">px a 96 ppp (Inkscape, web)</option><option value="mm">1 unidad = 1 mm</option></select></label>`;
  const openButton = btn('', () => input.click(), 'btn outline js-open'); openButton.innerHTML = svgIcon('folder') + '<span>Abrir SVG o imagen</span>';
  fileCard.append(openButton, input);
  const drop = el('div', 'js-drop'); drop.innerHTML = `${svgIcon('file', 'js-drop-icon')}<strong>Arrastra aquí un SVG, PNG o JPG</strong><span>SVG: grabado y corte vectorial. PNG/JPG: grabado de imagen.</span>`;
  drop.onclick = () => input.click();
  const issues = el('details', 'neo-op-card js-issues'); issues.hidden = true;
  const review = el('div', 'js-review'); review.hidden = true;
  review.innerHTML = `${svgIcon('alert')}<div><strong>Trabajo abierto desde la biblioteca</strong><p>Antes de enviarlo revisa que la cama, la colocación y el origen correspondan al material actual. Las posiciones físicas no se guardan.</p></div>`;
  review.append(btn('Revisado', () => { state.review = false; update(); }, 'btn primary js-review-ok'));

  const place = el('section', 'neo-op-card js-place');
  place.innerHTML = `<div class="js-section-head"><h3>Colocación en la cama</h3><span class="js-place-bounds"></span></div>
   <div class="js-place-grid"><label>X · mm<input class="js-x" type="number" step="0.1"></label><label>Y · mm<input class="js-y" type="number" step="0.1"></label>
   <label>Ancho · mm<input class="js-w" type="number" step="0.1" min="0.1"></label><label>Alto · mm<input class="js-h" type="number" step="0.1" min="0.1"></label>
   <label>Escala · %<input class="js-scale" type="number" step="0.1" min="1" max="1000"></label><label>Giro · °<input class="js-rot" type="number" step="0.5"></label></div>
   <div class="js-place-actions"></div><p class="js-hint">Escala proporcional: ancho y alto cambian juntos. También puedes arrastrar el diseño sobre la cama.</p>`;
  const placeActions = place.querySelector('.js-place-actions');
  const rotL = btn('', () => setPlacement({rotation: norm(state.placement.rotation - 90)}), 'btn quiet js-icon-btn'); rotL.innerHTML = svgIcon('rotL'); rotL.title = 'Girar 90° a la izquierda'; rotL.setAttribute('aria-label', rotL.title);
  const rotR = btn('', () => setPlacement({rotation: norm(state.placement.rotation + 90)}), 'btn quiet js-icon-btn'); rotR.innerHTML = svgIcon('rotR'); rotR.title = 'Girar 90° a la derecha'; rotR.setAttribute('aria-label', rotR.title);
  const centerB = btn('', () => centerOnBed(), 'btn quiet'); centerB.innerHTML = svgIcon('center') + '<span>Centrar</span>';
  const cornerB = btn('', () => setPlacement({x: 0, y: 0}), 'btn quiet'); cornerB.innerHTML = svgIcon('corner') + '<span>Esquina 0,0</span>';
  placeActions.append(rotL, rotR, centerB, cornerB);

  const opsCard = el('section', 'js-ops');
  opsCard.innerHTML = `<div class="js-section-head"><h3>Operaciones <span class="js-op-count"></span></h3><button type="button" class="js-link js-to-order">Orden de ejecución</button></div><div class="js-op-list"></div>`;
  const addRow = el('div', 'js-add-op');
  for (const type of ['raster', 'engrave', 'cut']) addRow.append(btn('+ ' + OP_TYPES[type].short, () => addOperation(type), 'btn quiet'));
  const scopeLabel = el('label', 'js-scope'); scopeLabel.innerHTML = '<span>Enviar a la máquina</span>';
  const scopeSelect = el('select', 'js-scope-select'); scopeSelect.onchange = () => { state.sendScope = scopeSelect.value; update(); };
  scopeLabel.append(scopeSelect);
  opsCard.append(addRow, scopeLabel, el('p', 'js-op-power', 'Potencia: se ajusta en el panel de la máquina para cada operación; la M2 no la controla por USB. El grabado de imagen es de 1 bit (encendido/apagado).'));
  const layers = el('details', 'neo-op-card js-layers'); layers.open = true;
  layers.innerHTML = '<summary>Capas del archivo y operación asignada</summary><p class="js-hint">Regla automática: <b>rojo = corte</b> (un relleno rojo se corta por su contorno) y <b>negro y demás colores = grabado</b>. Puedes cambiar cualquier capa.</p><div class="js-layer-list"></div>';
  layers.append(btn('Volver a asignar por color (rojo = corte)', () => { if (!state.design || machine.busy) return; state.plan = defaultPlan(state.design); state.sendScope = 'all'; state.dirty = true; renderStructure(); update(); }, 'btn quiet js-reassign'));
  const saveRow = el('div', 'js-save');
  const saveB = btn('', () => openSave(), 'btn outline js-save-btn'); saveB.innerHTML = svgIcon('save') + '<span>Guardar en biblioteca</span>';
  saveRow.append(saveB);
  panel.append(fileCard, drop, review, issues, place, opsCard, layers, saveRow);

  // Centro: pestañas Vista previa / Orden de operaciones, zoom y leyenda.
  const centerBar = el('div', 'js-center-bar');
  const tabPreview = btn('Vista previa', () => setCenter('preview'), 'js-center-tab'), tabOrder = btn('Orden de operaciones', () => setCenter('order'), 'js-center-tab');
  for (const t of [tabPreview, tabOrder]) t.setAttribute('role', 'tab');
  const tabs = el('div', 'js-center-tabs'); tabs.setAttribute('role', 'tablist'); tabs.append(tabPreview, tabOrder);
  const legend = el('div', 'js-legend');
  legend.innerHTML = Object.entries(OP_TYPES).map(([k, t]) => `<span data-op="${k}"><i style="background:${t.color}"></i>${t.label}</span>`).join('');
  centerBar.append(tabs, legend);
  const zoomBar = el('div', 'js-zoom'); zoomBar.setAttribute('aria-label', 'Zoom de la vista');
  const zoomBtn = (name, label, fn) => { const b = btn('', fn, 'js-zoom-btn'); b.innerHTML = name === '1:1' ? '<b>1:1</b>' : svgIcon(name); b.title = label; b.setAttribute('aria-label', label); return b; };
  zoomBar.append(zoomBtn('zoomIn', 'Acercar', () => setZoom(zoom * 1.25)), zoomBtn('zoomOut', 'Alejar', () => setZoom(zoom / 1.25)), zoomBtn('fit', 'Ajustar a la vista', () => setZoom(1)), zoomBtn('1:1', 'Tamaño real aproximado (96 ppp)', () => realSize()));
  const orderPanel = el('section', 'js-order'); orderPanel.hidden = true;
  const bedNote = el('p', 'js-bed-note');

  // Diálogo de guardado.
  const saveDialog = el('dialog', 'js-save-dialog');
  saveDialog.innerHTML = `<form method="dialog"><h2>Guardar trabajo</h2><label>Nombre<input class="js-save-name" maxlength="80" required></label>
   <label class="js-check"><input type="checkbox" class="js-save-cloud" checked><span>También en mi cuenta (para abrirlo desde el celular u otra computadora)</span></label>
   <p class="js-hint js-save-note">Se guarda el archivo original, las operaciones, velocidades, pasadas, colocación, dimensiones y una miniatura. No se guardan posiciones físicas de la máquina.</p>
   <p class="js-save-error" role="alert"></p><div class="js-dialog-actions"><button type="submit" class="btn primary" value="save">Guardar</button><button type="button" class="btn outline js-save-cancel">Cancelar</button></div></form>`;
  document.body.append(saveDialog);
  saveDialog.querySelector('.js-save-cancel').onclick = () => saveDialog.close();

  // Ubicación inicial (neo-studio la reorganiza): todo dentro del panel de la máquina.
  const layout = dialog.querySelector('.k40-layout');
  const host = el('div', 'js-host'); host.append(sourceBar, panel); layout?.prepend(host);
  const previewEl = $('k40Preview');
  previewEl.before(centerBar); previewEl.after(orderPanel, bedNote); previewEl.parentElement.insertBefore(zoomBar, previewEl);

  /* ------------------------------------------------------------ fuente */
  function setSource(value, {silent = false} = {}) {
    if (machine.busy && value !== state.source) { app.toast?.('Hay una operación de máquina activa. Espera para cambiar de fuente.'); return; }
    state.source = value === 'import' ? 'import' : 'box';
    document.body.dataset.jobSource = state.source;
    boxTab.classList.toggle('active', state.source === 'box'); importTab.classList.toggle('active', state.source === 'import');
    boxTab.setAttribute('aria-selected', String(state.source === 'box')); importTab.setAttribute('aria-selected', String(state.source === 'import'));
    panel.hidden = state.source !== 'import';
    for (const node of dialog.querySelectorAll('.neo-job, .k40-registration, #k40Arrange, .k40-legend, .k40-section-heading label')) node.hidden = state.source === 'import';
    const aligned = $('k40Origin')?.querySelector('option[value=aligned]'); if (aligned) aligned.hidden = aligned.disabled = state.source === 'import';
    legend.hidden = state.source !== 'import'; zoomBar.hidden = state.source !== 'import'; tabOrder.hidden = state.source !== 'import';
    if (state.source !== 'import') setCenter('preview');
    try { app.putStorage?.('lzbox-job-source', state.source); } catch {}
    update(); if (!silent) machine.refresh(true);
  }
  function setCenter(which) {
    const order = which === 'order' && state.source === 'import';
    tabPreview.classList.toggle('active', !order); tabOrder.classList.toggle('active', order);
    tabPreview.setAttribute('aria-selected', String(!order)); tabOrder.setAttribute('aria-selected', String(order));
    previewEl.hidden = order; orderPanel.hidden = !order; zoomBar.hidden = order || state.source !== 'import';
    if (order) renderOrder();
  }
  opsCard.querySelector('.js-to-order').onclick = () => setCenter('order');

  /* ------------------------------------------------------------ importar */
  input.onchange = () => { const f = input.files?.[0]; input.value = ''; if (f) importFile(f); };
  for (const target of [drop, previewEl]) {
    target.addEventListener('dragover', (e) => { if (state.source !== 'import' || machine.busy) return; e.preventDefault(); drop.classList.add('is-over'); });
    target.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    target.addEventListener('drop', (e) => { if (state.source !== 'import' || machine.busy) return; e.preventDefault(); drop.classList.remove('is-over'); const f = e.dataTransfer?.files?.[0]; if (f) importFile(f); });
  }
  const readText = (f) => f.text ? f.text() : new Response(f).text();
  const readDataURL = (f) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('No se pudo leer el archivo.')); r.readAsDataURL(f); });
  async function importFile(file, {fromPhone = false} = {}) {
    if (machine.busy) throw Error('Hay una operación de máquina activa. Espera para importar.');
    const name = String(file.name || 'archivo').slice(0, 120), type = (file.type || '').toLowerCase();
    try {
      if (file.size > 8 * 1024 * 1024) throw Error('El archivo supera 8 MB.');
      if (/\.svg$/i.test(name) || type === 'image/svg+xml') {
        const text = await readText(file);
        loadSource({type: 'svg', name, mime: 'image/svg+xml', data: text}, {fresh: true});
      } else if (/\.(png|jpe?g)$/i.test(name) || /^image\/(png|jpeg)$/.test(type)) {
        const data = await readDataURL(file);
        if (!/^data:image\/(png|jpeg);base64,/.test(data)) throw Error('Solo se aceptan PNG o JPG.');
        await loadSource({type: 'image', name, mime: data.slice(5, data.indexOf(';')), data}, {fresh: true});
      } else throw Error('Formato no compatible. Usa SVG (recomendado), PNG o JPG.');
      if (state.source !== 'import') setSource('import', {silent: true});
      app.toast?.(fromPhone ? 'Archivo recibido desde el celular. Revisa colocación y operaciones.' : 'Archivo importado. Nada se envía a la máquina hasta que lo inicies.');
    } catch (e) { app.toast?.(e.message); throw e; }
  }
  /** Carga un archivo (nuevo o desde la biblioteca) sin tocar la máquina. */
  async function loadSource(source, {fresh, unitOverride = 'auto', plan = null, placement = null} = {}) {
    let design;
    if (source.type === 'svg') design = importSVG(source.data, {name: source.name, unitOverride});
    else {
      const img = new Image(); img.src = source.data; await img.decode().catch(() => { throw Error('La imagen está dañada o no es compatible.'); });
      design = imageDesign({name: source.name, href: source.data, pixelWidth: img.naturalWidth, pixelHeight: img.naturalHeight});
    }
    state.design = design; state.file = source; state.unitOverride = unitOverride;
    state.plan = plan ? reconcilePlan(plan, design) : defaultPlan(design);
    const bed = currentBed();
    if (placement) state.placement = {...placement};
    else {
      // Escala inicial 100 %; si no cabe, se reduce proporcionalmente para mostrarlo dentro de la cama.
      const b = design.bbox, fit = Math.min(1, bed.width / Math.max(b.width, 1e-6), bed.height / Math.max(b.height, 1e-6));
      state.placement = {x: 0, y: 0, scale: fit < 1 ? Math.floor(fit * 1000) / 1000 : 1, rotation: 0};
      if (fit < 1) design.issues.push({level: 'warn', code: 'fit', message: `El diseño (${fmt(b.width)} × ${fmt(b.height)} mm) no cabía en la cama: se redujo al ${fmt(state.placement.scale * 100)} %. Revisa la escala.`, count: 1});
    }
    if (placement) {
      // Una colocación guardada que ya no cabe (otra cama o un arrastre antiguo) se regresa a la cama y se avisa.
      const b = placedBounds(design, state.placement);
      if (b.width <= bed.width && b.height <= bed.height && (b.x < 0 || b.y < 0 || b.x + b.width > bed.width || b.y + b.height > bed.height)) {
        state.placement = {...state.placement, x: Math.min(Math.max(b.x, 0), bed.width - b.width), y: Math.min(Math.max(b.y, 0), bed.height - b.height)};
        design.issues.push({level: 'warn', code: 'moved', message: 'La colocación guardada quedaba fuera de la cama; se movió dentro. Revisa la posición.', count: 1});
      }
    }
    if (fresh) { state.libraryId = null; state.libraryCloud = null; state.created = null; state.savedWhere = null; state.savedAt = null; state.review = false; state.dirty = true; }
    renders = new Map(); previews = new Map(); analysisKey = '';
    renderStructure(); update(); scheduleDraft();
  }
  function reconcilePlan(plan, design) {
    const operations = (plan.operations || []).filter((o) => OP_TYPES[o.type]).map((o) => makeOperation(o.type, o));
    const ids = new Set(operations.map((o) => o.id)), assignment = {};
    for (const layer of design.layers) { const v = plan.assignment?.[layer.key]; if (v && ids.has(String(v).replace(/:outline$/, ''))) assignment[layer.key] = v; }
    return {operations, assignment};
  }

  /* ------------------------------------------------------------ colocación */
  const norm = (a) => { a = ((Number(a) || 0) % 360 + 360) % 360; return a > 180 ? a - 360 : a; };
  function currentBed() { const m = machine.machine; return m?.bed ? {...m.bed} : {width: Number($('k40Width')?.value) || 400, height: Number($('k40Height')?.value) || 400}; }
  function setPlacement(change, {silent = false} = {}) {
    if (!state.design || machine.busy) return;
    const next = {...state.placement, ...change};
    for (const k of ['x', 'y', 'scale', 'rotation']) next[k] = Number(next[k]);
    if (!(next.scale > 0.0001) || ![next.x, next.y, next.rotation].every(Number.isFinite)) return;
    state.placement = {x: Math.round(next.x * 100) / 100, y: Math.round(next.y * 100) / 100, scale: Math.min(10, next.scale), rotation: norm(next.rotation)};
    state.dirty = true; if (!silent) { update(); scheduleDraft(); }
  }
  function centerOnBed() { if (!state.design) return; const bed = currentBed(), b = placedBounds(state.design, state.placement); setPlacement({x: (bed.width - b.width) / 2, y: (bed.height - b.height) / 2}); }
  const field = (cls) => place.querySelector(cls);
  for (const [cls, fn] of [['.js-x', (v) => ({x: v})], ['.js-y', (v) => ({y: v})], ['.js-scale', (v) => ({scale: v / 100})], ['.js-rot', (v) => ({rotation: v})]]) field(cls).addEventListener('change', () => setPlacement(fn(Number(field(cls).value))));
  for (const [cls, axis] of [['.js-w', 'width'], ['.js-h', 'height']]) field(cls).addEventListener('change', () => {
    if (!state.design) return; const b = placedBounds(state.design, state.placement), v = Number(field(cls).value);
    if (v > 0 && b[axis] > 0) setPlacement({scale: state.placement.scale * v / b[axis]});
  });
  fileCard.querySelector('.js-unit-select').onchange = async (e) => {
    if (!state.file || state.file.type !== 'svg') return;
    try { await loadSource(state.file, {unitOverride: e.target.value === 'px96' ? 'px96' : e.target.value, plan: state.plan, placement: {...state.placement, scale: 1}}); state.dirty = true; } catch (err) { app.toast?.(err.message); }
  };
  // Arrastrar el diseño sobre la cama (solo vista; nunca mueve el cabezal).
  let drag = null;
  previewEl.addEventListener('pointerdown', (e) => {
    if (state.source !== 'import' || !state.design || machine.busy || machine.remoteOwner || $('k40Pick')?.textContent.includes('Selecciona')) return;
    const svg = previewEl.querySelector('svg'); if (!svg?.getScreenCTM()) return;
    const p = toBed(svg, e), b = placedBounds(state.design, state.placement);
    if (p.x < b.x || p.y < b.y || p.x > b.x + b.width || p.y > b.y + b.height) return;
    drag = {start: p, origin: {...state.placement}, svg}; previewEl.setPointerCapture(e.pointerId); previewEl.classList.add('is-dragging'); e.preventDefault();
  });
  // La vista se redibuja en cada movimiento: se usa siempre el SVG actual (el anterior ya no está en pantalla).
  previewEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const svg = previewEl.querySelector('svg'); if (!svg?.getScreenCTM()) return;
    const p = toBed(svg, e), bed = currentBed(), b = placedBounds(state.design, drag.origin);
    // Se mantiene dentro de la cama mientras se arrastra (si el diseño cabe).
    const clamp = (v, size, max) => size <= max ? Math.min(Math.max(v, 0), max - size) : v;
    const x = clamp(b.x + p.x - drag.start.x, b.width, bed.width), y = clamp(b.y + p.y - drag.start.y, b.height, bed.height);
    setPlacement({x: drag.origin.x + x - b.x, y: drag.origin.y + y - b.y}, {silent: true}); updateLight();
  });
  const endDrag = () => { if (!drag) return; drag = null; previewEl.classList.remove('is-dragging'); update(); scheduleDraft(); };
  previewEl.addEventListener('pointerup', endDrag); previewEl.addEventListener('pointercancel', endDrag);
  function toBed(svg, e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return {x: q.x, y: q.y}; }
  function setZoom(z) { zoom = Math.max(1, Math.min(12, z)); machine.refresh(false); }
  function realSize() { const bed = currentBed(), w = (previewEl.clientWidth || 600) - 28; setZoom((bed.width + 20) / 25.4 * 96 / w); }

  /* ------------------------------------------------------------ operaciones */
  function addOperation(type) {
    if (!state.plan || machine.busy) return;
    const op = makeOperation(type); const rank = {raster: 0, engrave: 1, cut: 2};
    const index = state.plan.operations.findIndex((o) => rank[o.type] > rank[type]);
    state.plan.operations.splice(index < 0 ? state.plan.operations.length : index, 0, op);
    state.dirty = true; renderStructure(); update();
  }
  function removeOperation(id) {
    if (!state.plan || machine.busy) return;
    state.plan.operations = state.plan.operations.filter((o) => o.id !== id);
    for (const [k, v] of Object.entries(state.plan.assignment)) if (String(v).replace(/:outline$/, '') === id) delete state.plan.assignment[k];
    state.dirty = true; renderStructure(); update();
  }
  function moveOperation(id, dir) {
    const list = state.plan?.operations; if (!list || machine.busy) return;
    const i = list.findIndex((o) => o.id === id), j = i + dir; if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; state.dirty = true; renderStructure(); update();
  }
  function recommendOrder() { const rank = {raster: 0, engrave: 1, cut: 2}; state.plan.operations.sort((a, b) => rank[a.type] - rank[b.type]); state.dirty = true; renderStructure(); update(); }
  function patchOperation(id, change) {
    const op = state.plan?.operations.find((o) => o.id === id); if (!op || machine.busy) return false;
    Object.assign(op, change); state.dirty = true; return true;
  }
  function renderOps() {
    const list = opsCard.querySelector('.js-op-list'); list.replaceChildren();
    const ops = state.plan?.operations || [];
    opsCard.querySelector('.js-op-count').textContent = `(${ops.length})`;
    ops.forEach((op, index) => {
      const t = OP_TYPES[op.type], card = el('article', 'js-op' + (op.enabled ? '' : ' is-off')); card.dataset.op = op.id; card.dataset.type = op.type; card.style.setProperty('--op-color', t.color);
      const head = el('div', 'js-op-head');
      head.innerHTML = `<span class="js-op-num">${index + 1}</span><span class="js-op-icon">${svgIcon(opIcon[op.type])}</span>`;
      const name = el('input', 'js-op-name'); name.value = op.name; name.maxLength = 40; name.setAttribute('aria-label', 'Nombre de la operación'); name.onchange = () => { patchOperation(op.id, {name: name.value.trim() || t.label}); update(); renderLayers(); };
      const eye = btn('', () => { patchOperation(op.id, {enabled: !op.enabled}); renderStructure(); update(); }, 'js-op-eye'); eye.innerHTML = svgIcon(op.enabled ? 'eye' : 'eyeOff'); eye.setAttribute('aria-pressed', String(op.enabled)); eye.setAttribute('aria-label', op.enabled ? 'Desactivar operación' : 'Activar operación'); eye.title = op.enabled ? 'Activa · pulsa para desactivar' : 'Desactivada · pulsa para activar';
      const del = btn('', () => removeOperation(op.id), 'js-op-del'); del.innerHTML = svgIcon('trash'); del.setAttribute('aria-label', 'Quitar operación'); del.title = 'Quitar operación';
      head.append(name, eye, del);
      const fields = el('div', 'js-op-fields');
      const [lo, hi] = t.speed;
      fields.innerHTML = `<label>Velocidad · mm/s<input class="js-op-speed" type="number" min="${lo}" max="${hi}" step="1" value="${op.speed}"></label><label>Pasadas<input class="js-op-passes" type="number" min="1" max="10" step="1" value="${op.passes}"></label>`;
      fields.querySelector('.js-op-speed').onchange = (e) => { patchOperation(op.id, {speed: Number(e.target.value)}); update(); };
      fields.querySelector('.js-op-passes').onchange = (e) => { patchOperation(op.id, {passes: Number(e.target.value)}); update(); };
      card.append(head, fields);
      if (op.type === 'raster') {
        const extra = el('div', 'js-op-fields');
        extra.innerHTML = `<label>Resolución<select class="js-op-step">${RESOLUTIONS.map((r) => `<option value="${r.step}"${r.step === op.step ? ' selected' : ''}>${r.mm.toFixed(2)} mm (${r.dpi} ppp)</option>`).join('')}</select></label><label>Tratamiento<select class="js-op-dither"><option value="auto">Colores sólidos (logotipos)</option><option value="threshold">Umbral por brillo</option><option value="floyd">Tonos · difusión (fotos)</option></select></label>`;
        extra.querySelector('.js-op-dither').value = op.dither;
        extra.querySelector('.js-op-step').onchange = (e) => { patchOperation(op.id, {step: Number(e.target.value)}); update(); };
        extra.querySelector('.js-op-dither').onchange = (e) => { patchOperation(op.id, {dither: e.target.value}); update(); };
        const inv = el('label', 'js-check'); inv.innerHTML = `<input type="checkbox" class="js-op-invert"${op.invert ? ' checked' : ''}><span>Invertir (grabar lo claro)</span>`;
        inv.querySelector('input').onchange = (e) => { patchOperation(op.id, {invert: e.target.checked}); update(); };
        card.append(extra, inv);
      }
      card.append(el('p', 'js-op-meta'));
      list.append(card);
    });
    if (!ops.length) list.append(el('p', 'js-hint', 'Agrega una operación y asígnale capas del archivo.'));
  }
  function renderLayers() {
    const host = layers.querySelector('.js-layer-list'); host.replaceChildren();
    if (!state.design) return;
    for (const layer of state.design.layers) {
      const row = el('div', 'js-layer');
      const sw = el('span', 'js-swatch'); sw.style.background = layer.kind === 'image' ? 'linear-gradient(135deg,#ddd,#555)' : /^#/.test(layer.color) ? layer.color : '#888';
      if (layer.kind === 'stroke') sw.classList.add('is-stroke');
      const label = el('span', 'js-layer-label'); const white = layer.kind !== 'image' && /^#(f[a-f0-9]){3}$/i.test(layer.color);
      label.innerHTML = `<strong>${layer.kind === 'image' ? 'Imágenes' : layer.kind === 'fill' ? 'Relleno' : 'Contorno'} ${layer.kind === 'image' ? '' : layer.color === 'gradient' ? 'degradado' : layer.color === 'other' ? 'otro color' : layer.color}</strong><small>${layer.count} elemento${layer.count === 1 ? '' : 's'}${layer.kind === 'stroke' ? ' · ' + fmt(layer.lengthMm / 10, 1) + ' cm' : ''}${white ? ' · blanco: no graba y tapa lo de abajo' : ''}</small>`;
      const select = el('select', 'js-layer-op'); select.setAttribute('aria-label', 'Operación para esta capa');
      select.append(new Option('No usar', ''));
      for (const op of state.plan.operations) {
        for (const kind of compatibleTypes(layer)) {
          if (kind === op.type) select.append(new Option(`${op.name}`, op.id));
          else if (kind === op.type + '-outline') select.append(new Option(`${op.name} · contorno del relleno`, op.id + ':outline'));
        }
      }
      select.value = state.plan.assignment[layer.key] || '';
      if (select.value !== (state.plan.assignment[layer.key] || '')) select.value = '';
      select.onchange = () => { if (machine.busy) return; if (select.value) state.plan.assignment[layer.key] = select.value; else delete state.plan.assignment[layer.key]; state.dirty = true; update(); };
      row.append(sw, label, select); host.append(row);
      if (!state.plan.assignment[layer.key]) row.classList.add('is-unassigned');
    }
    if (state.design.texts.length) host.append(el('p', 'js-layer-warn', `Textos con fuente (${state.design.texts.length}): no se pueden grabar ni cortar hasta convertirlos en trazados.`));
  }
  function renderIssues() {
    const list = state.design?.issues || [];
    issues.hidden = !list.length; issues.replaceChildren();
    if (!list.length) return;
    const errors = list.filter((i) => i.level === 'error').length, warns = list.filter((i) => i.level === 'warn').length;
    const summary = el('summary'); summary.innerHTML = `${svgIcon(errors ? 'alert' : 'check')}<span>Revisión del archivo · ${errors ? errors + ' por corregir' : warns ? warns + ' aviso' + (warns === 1 ? '' : 's') : 'información'}</span>`;
    issues.append(summary); issues.open = errors > 0 || warns > 0; issues.dataset.level = errors ? 'error' : warns ? 'warn' : 'info';
    const ul = el('ul');
    for (const i of list) { const li = el('li', 'is-' + i.level); li.textContent = i.message + (i.count > 1 ? ` (×${i.count})` : ''); ul.append(li); }
    issues.append(ul);
  }
  function renderOrder() {
    orderPanel.replaceChildren();
    const head = el('div', 'js-order-head'); head.append(el('h3', '', 'Orden de operaciones'), btn('Proponer orden recomendado', () => recommendOrder(), 'btn quiet'));
    orderPanel.append(head, el('p', 'js-hint', 'Se ejecutan de arriba hacia abajo. Recomendado: grabar imagen, grabar vectores y cortar al final para que la pieza no se mueva.'));
    const list = el('ol', 'js-order-list');
    (analysis?.ops || []).forEach((o, i) => {
      const li = el('li', 'js-order-item' + (o.op.enabled ? '' : ' is-off')); li.style.setProperty('--op-color', OP_TYPES[o.op.type].color);
      const what = o.empty ? 'sin elementos asignados' : o.op.type === 'raster' ? `${fmt(o.data.area.width)} × ${fmt(o.data.area.height)} mm · ${o.data.pixels.widthPx} × ${o.data.pixels.heightPx} puntos` : `${o.data.paths.length} trayectoria${o.data.paths.length === 1 ? '' : 's'} · ${fmt(o.data.lengthMm / 1000, 2)} m${o.data.savedMm > 0.05 ? ` · ${fmt(o.data.savedMm)} mm compartidos sin repetir` : ''}`;
      li.innerHTML = `<span class="js-op-num">${i + 1}</span><span class="js-op-icon">${svgIcon(opIcon[o.op.type])}</span><div><strong>${escapeHTML(o.op.name)}</strong><small>${o.op.enabled ? '' : 'Desactivada · '}${what} · ${o.op.speed} mm/s × ${o.op.passes} pasada${o.op.passes === 1 ? '' : 's'}</small></div><span class="js-order-time">${o.op.enabled && !o.empty ? '≈ ' + fmtTime(o.seconds) : '—'}</span>`;
      const up = btn('', () => moveOperation(o.op.id, -1), 'js-icon-btn'); up.innerHTML = svgIcon('up'); up.disabled = i === 0; up.setAttribute('aria-label', 'Subir');
      const down = btn('', () => moveOperation(o.op.id, 1), 'js-icon-btn'); down.innerHTML = svgIcon('down'); down.disabled = i === analysis.ops.length - 1; down.setAttribute('aria-label', 'Bajar');
      li.append(up, down); list.append(li);
    });
    orderPanel.append(list);
    for (const w of analysis?.warnings || []) orderPanel.append(el('p', 'js-order-warn', w));
    if (analysis) orderPanel.append(el('p', 'js-order-total', `Tiempo estimado total: ${fmtTime(analysis.seconds)} · incluye barridos y desplazamientos aproximados; la aceleración real de la M2 puede alargarlo.`));
  }
  const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
  function renderStructure() { renderOps(); renderLayers(); renderIssues(); }

  /* ------------------------------------------------------------ análisis y raster */
  function key() { return JSON.stringify([state.file?.name, state.file?.data?.length, state.unitOverride, state.plan, state.placement, currentBed()]); }
  function analyze() {
    if (!state.design) { analysis = null; return null; }
    const k = key(); if (k === analysisKey && analysis) return analysis;
    analysisKey = k; analysis = analyzePlan(state.design, state.placement, state.plan, currentBed());
    // Los raster cambian si cambia su área, resolución o tratamiento.
    for (const o of analysis.ops) if (o.op.type === 'raster') { const rk = rasterKey(o); if (renders.get(o.op.id)?.key !== rk) { renders.delete(o.op.id); previews.delete(o.op.id); } }
    scheduleRender();
    return analysis;
  }
  const rasterKey = (o) => o.data ? JSON.stringify([o.data.area.x, o.data.area.y, o.data.area.width, o.data.area.height, o.data.area.matrix, o.op.step, o.op.dither, o.op.invert, state.plan.assignment, state.file?.data?.length]) : '';
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(() => renderPending().catch(() => {}), 350); }
  async function renderPending() {
    const token = ++renderToken;
    for (const o of analysis?.ops || []) {
      if (o.op.type !== 'raster' || o.empty || !o.op.enabled || renders.has(o.op.id)) continue;
      if (o.data.pixels.widthPx * o.data.pixels.heightPx > 16e6) continue;
      const k = rasterKey(o), r = await renderRaster(o.data.area, o.op);
      if (token !== renderToken) return;
      r.key = k; renders.set(o.op.id, r); previews.set(o.op.id, bitsPreviewURL(r, {maxSide: 700}));
      o.seconds = (r.sweep.sweepMm / o.op.speed + r.sweep.rows * 0.03) * o.op.passes; o.data.sweep = r.sweep;
    }
    if (analysis) analysis.seconds = analysis.ops.filter((o) => o.op.enabled && !o.empty).reduce((s, o) => s + o.seconds, 0);
    machine.refresh(false); updateMeta();
  }
  async function ensureRenders() {
    analyze();
    for (const o of analysis.ops) {
      if (o.op.type !== 'raster' || o.empty || !o.op.enabled) continue;
      const k = rasterKey(o);
      if (renders.get(o.op.id)?.key !== k) { const r = await renderRaster(o.data.area, o.op); r.key = k; renders.set(o.op.id, r); previews.set(o.op.id, bitsPreviewURL(r, {maxSide: 700})); o.data.sweep = r.sweep; }
    }
  }

  /* ------------------------------------------------------------ interfaz del controlador */
  function problemText(a) {
    if (!state.design) return 'Importa un SVG o una imagen para preparar el trabajo.';
    if (state.design.issues.some((i) => i.level === 'error') && !a.ops.some((o) => o.op.enabled && !o.empty)) return 'Corrige el archivo: no hay elementos compatibles asignados.';
    if (a.problems.length) return a.problems[0];
    if (state.review) return 'Revisa la cama, la colocación y el origen del trabajo abierto y pulsa «Revisado».';
    return '';
  }
  const source = {
    isActive: () => state.source === 'import',
    name: () => state.file?.name?.replace(/\.(svg|png|jpe?g)$/i, '') || 'Archivo importado',
    /** Vista, resumen y estado para el controlador. Con origen actual la vista se desplaza al cabezal. */
    describe({bed, position, origin}) {
      if (!state.design) return {preview: emptyBed(bed), compact: emptyBed(bed, true), summary: '', seconds: 0, problem: problemText(null)};
      let placement = state.placement;
      if (origin) { const b = placedBounds(state.design, state.placement); placement = {...state.placement, x: state.placement.x + origin[0] - b.x, y: state.placement.y + origin[1] - b.y}; }
      const a = origin ? analyzePlan(state.design, placement, state.plan, bed) : analyze();
      if (origin) for (const o of a.ops) { const base = analysis?.ops.find((p) => p.op.id === o.op.id); if (base?.data?.sweep) { o.seconds = base.seconds; } }
      const active = state.sendScope === 'all' ? a.ops.filter((o) => o.op.enabled && !o.empty) : a.ops.filter((o) => o.op.enabled && !o.empty && o.op.id === state.sendScope);
      const seconds = active.reduce((s, o) => s + o.seconds, 0);
      const b = a.bounds;
      const summary = `${state.file.name} · ${fmt(b.width)} × ${fmt(b.height)} mm en X ${fmt(b.x)} · Y ${fmt(b.y)} · ${state.sendScope === 'all' ? `${active.length} ${active.length === 1 ? 'operación activa' : 'operaciones activas'}` : `se enviará solo «${active[0]?.op.name || '—'}»`}. Tiempo estimado: ${fmtTime(seconds)}. SVG importado: se corta sobre la línea, sin compensar kerf.`;
      const b0 = a.bounds, center = [b0.x + b0.width / 2, b0.y + b0.height / 2];
      return {preview: planPreview({bed, analysis: a, rasterPreviews: previews, position, zoom, center}), compact: planPreview({bed, analysis: a, rasterPreviews: previews, position, compact: true}), summary, seconds, problem: problemText(a)};
    },
    support(features) {
      if (features.includes('operations-v2') && features.includes('raster-1bit')) return {ok: true};
      const a = analyze(), active = scoped(a);
      if (active.length === 1 && active[0].op.type !== 'raster') return {ok: true, legacy: true};
      return {ok: false, message: 'Tu conector es 0.6.4: admite una sola operación vectorial. Para grabado de imagen y trabajos combinados instala el conector 0.7.0 (enlace en Detalles de conexión), o desactiva las demás operaciones.'};
    },
    /** Trabajo para el conector. Solo se llama al pulsar Recorrer marco o Iniciar. */
    async buildJob({bed, features, origin}) {
      const support = source.support(features); if (!support.ok) throw Error(support.message);
      if (state.review) throw Error(problemText(analysis));
      await ensureRenders();
      const a = analysis; if (a.problems.length) throw Error(a.problems[0]);
      const subset = scoped(a); if (!subset.length) throw Error('La operación elegida para enviar no tiene elementos.');
      const partial = state.sendScope !== 'all';
      if (support.legacy) {
        if (partial && origin === 'current') throw Error('Con el conector 0.6.4, enviar una sola operación desde la posición actual la desplazaría. Usa origen Home o actualiza a 0.7.0.');
        const o = subset[0];
        return {protocol: K40_V1, board: 'M2', name: source.name(), bed: {...bed}, speed: o.op.speed, passes: o.op.passes, paths: o.data.paths};
      }
      const view = partial ? {...a, ops: a.ops.map((o) => subset.includes(o) ? o : {...o, op: {...o.op, enabled: false}})} : a;
      const job = await buildJobV2({design: state.design, placement: state.placement, plan: state.plan, bed, name: source.name()}, view, renders);
      // Esquina del trabajo completo: así cada operación enviada por separado cae en su lugar.
      if (partial) job.anchor = [Math.max(0, Math.round(a.bounds.x * 1e4) / 1e4), Math.max(0, Math.round(a.bounds.y * 1e4) / 1e4)];
      return job;
    },
  };
  function scoped(a) { const list = a?.ops.filter((o) => o.op.enabled && !o.empty) || []; return state.sendScope === 'all' ? list : list.filter((o) => o.op.id === state.sendScope); }
  function renderScope() {
    const ops = (state.plan?.operations || []).filter((o) => o.enabled);
    if (state.sendScope !== 'all' && !ops.some((o) => o.id === state.sendScope)) state.sendScope = 'all';
    const options = [new Option('Todas las operaciones activas (misma potencia del panel)', 'all'), ...ops.map((o, i) => new Option(`Solo ${o.name} — para ajustar la potencia antes`, o.id))];
    if (scopeSelect.options.length !== options.length || [...scopeSelect.options].some((o, i) => o.value !== options[i].value || o.text !== options[i].text)) scopeSelect.replaceChildren(...options);
    scopeSelect.value = state.sendScope;
  }
  function emptyBed(bed, compact = false) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${compact ? `0 0 ${bed.width} ${bed.height}` : `-16 -16 ${bed.width + 20} ${bed.height + 20}`}" role="img" aria-label="Cama vacía"><rect width="${bed.width}" height="${bed.height}" fill="none" stroke="currentColor" stroke-width="0.6"/></svg>`; }

  /* ------------------------------------------------------------ actualización */
  function updateLight() { machine.refresh(false); updateFields(); }
  function updateFields() {
    if (!state.design) return;
    const b = placedBounds(state.design, state.placement);
    const set = (cls, v) => { const n = field(cls); if (document.activeElement !== n) n.value = v; };
    set('.js-x', state.placement.x.toFixed(2)); set('.js-y', state.placement.y.toFixed(2)); set('.js-w', b.width.toFixed(2)); set('.js-h', b.height.toFixed(2));
    set('.js-scale', (state.placement.scale * 100).toFixed(1)); set('.js-rot', String(state.placement.rotation));
    place.querySelector('.js-place-bounds').textContent = `${fmt(b.width)} × ${fmt(b.height)} mm`;
  }
  function updateMeta() {
    const a = analysis;
    for (const card of opsCard.querySelectorAll('.js-op')) {
      const o = a?.ops.find((x) => x.op.id === card.dataset.op), meta = card.querySelector('.js-op-meta');
      if (!o || !meta) continue;
      const assigned = state.design.layers.filter((l) => String(state.plan.assignment[l.key] || '').replace(/:outline$/, '') === o.op.id).reduce((s, l) => s + l.count, 0);
      meta.textContent = o.empty ? 'Sin elementos asignados: elige capas abajo.' : `${assigned} elemento${assigned === 1 ? '' : 's'} · ${o.op.type === 'raster' ? (o.data.sweep ? `${o.data.sweep.rows} barridos` : 'preparando barridos…') : `${o.data.paths.length} trayectorias`} · ≈ ${fmtTime(o.seconds)}`;
      card.classList.toggle('is-empty', o.empty);
      const [lo, hi] = OP_TYPES[o.op.type].speed, speed = card.querySelector('.js-op-speed');
      speed?.setAttribute('aria-invalid', String(!(o.op.speed >= lo && o.op.speed <= hi)));
      const passes = card.querySelector('.js-op-passes'); passes?.setAttribute('aria-invalid', String(!(Number.isInteger(o.op.passes) && o.op.passes >= 1 && o.op.passes <= 10)));
    }
    if (!orderPanel.hidden) renderOrder();
  }
  function update() {
    const has = !!state.design;
    fileCard.querySelector('.js-file-name').textContent = state.file?.name || 'Sin archivo';
    const status = fileCard.querySelector('.js-file-status');
    status.dataset.state = !has ? 'none' : state.dirty ? 'dirty' : state.savedWhere === 'both' ? 'synced' : 'local';
    status.querySelector('em').textContent = !has ? 'Importa un SVG para placas, logotipos, grabados y cortes.' : state.dirty ? (state.libraryId ? 'Cambios sin guardar' : 'Sin guardar en la biblioteca') : state.savedWhere === 'both' ? 'Guardado en tu cuenta y en esta computadora' : 'Guardado solo en esta computadora';
    fileCard.querySelector('.js-file-dims').textContent = has ? `${fmt(state.design.bbox.width)} × ${fmt(state.design.bbox.height)} mm` : '—';
    fileCard.querySelector('.js-file-count').textContent = has ? `${state.design.objectCount} objeto${state.design.objectCount === 1 ? '' : 's'}` : '—';
    const units = fileCard.querySelector('.js-units'); units.hidden = !has || state.file.type !== 'svg' || (state.design.unitsDeclared && state.unitOverride === 'auto');
    fileCard.querySelector('.js-unit-select').value = state.unitOverride === 'px96' ? 'px96' : state.unitOverride;
    drop.hidden = has; place.hidden = !has; opsCard.hidden = !has; layers.hidden = !has; saveRow.hidden = !has; review.hidden = !state.review;
    for (const n of panel.querySelectorAll('input,select,button')) if (!n.closest('.js-review')) n.disabled = machine.busy;
    if (has) { analyze(); updateFields(); updateMeta(); renderScope(); }
    const bed = currentBed();
    bedNote.textContent = state.source === 'import' ? `Área de trabajo: ${fmt(bed.width, 0)} × ${fmt(bed.height, 0)} mm${machine.machine ? ' (del conector)' : ' (se confirma al conectar)'} · origen de cama arriba a la izquierda.` : '';
    machine.refresh(!machine.busy && state.source === 'import');
    publish();
  }
  let publishTimer = null; function publish() { clearTimeout(publishTimer); publishTimer = setTimeout(() => app.workshopRemote?.publish?.(true), 120); }

  /* ------------------------------------------------------------ biblioteca */
  function itemFromState(name, cloud) {
    const a = analyze(), b = placedBounds(state.design, state.placement);
    return makeJobItem({id: state.libraryId || undefined, created: state.created, name, source: state.file, unitOverride: state.unitOverride, plan: state.plan, placement: state.placement, bed: currentBed(), dims: b,
      opsSummary: a.ops.map((o) => ({type: o.op.type, name: o.op.name, enabled: o.op.enabled, speed: o.op.speed, passes: o.op.passes})), thumb: thumbnail(a), cloud});
  }
  function thumbnail(a) {
    try {
      const b = a.bounds, pad = 2, size = 240, k = size / Math.max(b.width + pad * 2, b.height + pad * 2, 1);
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil((b.width + pad * 2) * k); canvas.height = Math.ceil((b.height + pad * 2) * k);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0b1218'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, (pad - b.x) * k, (pad - b.y) * k);
      for (const o of a.ops) {
        if (!o.op.enabled || o.empty) continue;
        if (o.op.type === 'raster') { ctx.fillStyle = 'rgba(232,238,245,.25)'; ctx.fillRect(o.data.area.x, o.data.area.y, o.data.area.width, o.data.area.height); continue; }
        ctx.strokeStyle = OP_TYPES[o.op.type].color; ctx.lineWidth = 0.8 / k * 2;
        for (const p of o.data.paths) { ctx.beginPath(); p.points.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); if (p.closed) ctx.closePath(); ctx.stroke(); }
      }
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch { return null; }
  }
  function openSave() {
    if (!state.design) return;
    saveDialog.querySelector('.js-save-name').value = source.name();
    const cloudBox = saveDialog.querySelector('.js-save-cloud'), note = saveDialog.querySelector('.js-save-error');
    note.textContent = library.cloudState === 'signed-out' ? 'Inicia sesión para guardar también en tu cuenta; por ahora se guardará en esta computadora.' : library.cloudState === 'not-enabled' ? 'La biblioteca de la cuenta aún no está activada en el servidor: se guardará en esta computadora.' : '';
    cloudBox.disabled = ['signed-out', 'not-enabled'].includes(library.cloudState); if (cloudBox.disabled) cloudBox.checked = false;
    saveDialog.showModal(); saveDialog.querySelector('.js-save-name').focus();
  }
  saveDialog.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const note = saveDialog.querySelector('.js-save-error');
    try { const r = await save(saveDialog.querySelector('.js-save-name').value, saveDialog.querySelector('.js-save-cloud').checked); saveDialog.close(); app.toast?.(r); }
    catch (err) { note.textContent = err.message; }
  };
  async function save(name, cloud = true) {
    if (!state.design) throw Error('No hay archivo importado.');
    const item = itemFromState(name, state.libraryCloud);
    const {cloud: result} = await library.save(item, {toCloud: cloud});
    state.libraryId = item.id; state.created = item.created; state.libraryCloud = item.cloud; state.dirty = false; state.savedAt = item.updated;
    state.savedWhere = result === 'synced' ? 'both' : 'local';
    update(); app.workshop?.refreshLibrary?.();
    return result === 'synced' ? 'Guardado en tu cuenta y en esta computadora.' : result ? `Guardado en esta computadora. Cuenta: ${result}` : 'Guardado en esta computadora.';
  }
  /** Abre un trabajo guardado. No ejecuta nada: exige revisar cama, colocación y origen. */
  async function openSaved(id) {
    if (machine.busy) throw Error('Hay una operación de máquina activa.');
    const item = await library.open(id);
    await loadSource(item.source, {unitOverride: item.unitOverride, plan: item.plan, placement: item.placement});
    state.libraryId = item.id; state.created = item.created; state.libraryCloud = item.cloud; state.dirty = false; state.savedAt = item.updated;
    state.savedWhere = item.cloud?.updatedAt ? 'both' : 'local'; state.review = true;
    if ($('k40Origin') && $('k40Origin').value !== 'home') { $('k40Origin').value = 'home'; }
    const bed = currentBed();
    if (item.bedAtSave && (item.bedAtSave.width !== bed.width || item.bedAtSave.height !== bed.height)) state.design.issues.push({level: 'warn', code: 'bed', message: `Se guardó con una cama de ${item.bedAtSave.width} × ${item.bedAtSave.height} mm; la actual es ${bed.width} × ${bed.height} mm. Revisa la colocación.`, count: 1});
    renderStructure(); setSource('import', {silent: true}); update();
    return item;
  }

  /* ------------------------------------------------------------ borrador (sobrevive a recargar la página) */
  function scheduleDraft() { clearTimeout(saveDraftTimer); saveDraftTimer = setTimeout(() => { if (!state.file) return; localPut({id: '__draft__', kind: 'draft', file: state.file, unitOverride: state.unitOverride, plan: state.plan, placement: state.placement, libraryId: state.libraryId, created: state.created, cloud: state.libraryCloud}).catch(() => {}); }, 800); }
  async function restoreDraft() {
    try {
      const d = await localGet('__draft__'); if (!d?.file) return;
      await loadSource(d.file, {unitOverride: d.unitOverride, plan: d.plan, placement: d.placement});
      state.libraryId = d.libraryId || null; state.created = d.created || null; state.libraryCloud = d.cloud || null; state.dirty = true; update();
    } catch {}
  }

  /* ------------------------------------------------------------ celular */
  function snapshot() {
    const a = state.design ? analyze() : null;
    return {source: state.source, file: state.file ? {name: state.file.name, type: state.file.type} : null, dims: state.design ? {width: state.design.bbox.width, height: state.design.bbox.height} : null, objects: state.design?.objectCount || 0,
      placement: state.placement, bounds: a?.bounds || null, sendScope: state.sendScope, review: state.review, dirty: state.dirty, savedWhere: state.savedWhere, cloud: library.cloudState,
      issues: (state.design?.issues || []).filter((i) => i.level !== 'info').map((i) => i.message).slice(0, 6),
      problems: a?.problems || [], warnings: a?.warnings || [], seconds: a?.seconds || 0,
      ops: (a?.ops || []).map((o) => ({id: o.op.id, type: o.op.type, name: o.op.name, enabled: o.op.enabled, speed: o.op.speed, passes: o.op.passes, step: o.op.step, empty: o.empty, seconds: o.seconds, range: OP_TYPES[o.op.type].speed}))};
  }
  async function remote(action, args = {}) {
    const num = (v) => Number(v);
    switch (action) {
      case 'source': return setSource(args.value);
      case 'op': {
        const op = state.plan?.operations.find((o) => o.id === args.id); if (!op) throw Error('Operación inexistente.');
        const change = {};
        if ('enabled' in args) change.enabled = !!args.enabled;
        if ('speed' in args) { const [lo, hi] = OP_TYPES[op.type].speed; if (!(num(args.speed) >= lo && num(args.speed) <= hi)) throw Error(`Velocidad entre ${lo} y ${hi} mm/s.`); change.speed = num(args.speed); }
        if ('passes' in args) { if (!Number.isInteger(num(args.passes)) || num(args.passes) < 1 || num(args.passes) > 10) throw Error('Pasadas enteras entre 1 y 10.'); change.passes = num(args.passes); }
        patchOperation(op.id, change); renderStructure(); update(); return;
      }
      case 'op-move': moveOperation(args.id, args.dir < 0 ? -1 : 1); return;
      case 'op-order': recommendOrder(); return;
      case 'scope': if (args.value !== 'all' && !state.plan?.operations.some((o) => o.id === args.value && o.enabled)) throw Error('Operación inexistente o desactivada.'); state.sendScope = args.value; update(); return;
      case 'place': {
        const change = {};
        for (const k of ['x', 'y', 'rotation']) if (k in args) change[k] = num(args[k]);
        if ('scale' in args) { if (!(num(args.scale) > 0.001 && num(args.scale) <= 10)) throw Error('Escala inválida.'); change.scale = num(args.scale); }
        setPlacement(change); return;
      }
      case 'place-center': centerOnBed(); return;
      case 'review-ok': state.review = false; update(); return;
      case 'save': { const msg = await save(String(args.name || source.name()).slice(0, 80), args.cloud !== false); app.toast?.(msg); return; }
      case 'lib-open': return libraryCommand('open', args);
      case 'lib-duplicate': return libraryCommand('duplicate', args);
      case 'lib-rename': return libraryCommand('rename', args);
      case 'lib-delete': return libraryCommand('delete', args);
      case 'lib-restore': return libraryCommand('restore', args);
      case 'lib-list': await library.refresh(); app.workshopRemote?.publishLibrary?.(); return;
      default: throw Error('Acción remota no permitida.');
    }
  }
  async function libraryCommand(kind, {id, scope, name}) {
    if (scope === 'file') {
      if (kind === 'open') await openSaved(id);
      else if (kind === 'duplicate') await library.duplicate(id);
      else if (kind === 'rename') await library.rename(id, name);
      else if (kind === 'delete') await library.remove(id);
      else if (kind === 'restore') await library.restore(id);
    } else {
      const box = app.workshop?.libraryApi; if (!box) throw Error('Biblioteca no disponible.');
      await box[kind](id, name);
      if (kind === 'open') setSource('box', {silent: true});
    }
    app.workshop?.refreshLibrary?.(); app.workshopRemote?.publishLibrary?.();
  }
  /** Archivos enviados desde el celular por el enlace (sin pasar por internet). */
  async function receiveFile({name, type, data}) {
    let file;
    if (type === 'image/svg+xml') file = new File([data], name, {type});
    else { const bin = atob(data.split(',')[1] || ''), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); file = new File([bytes], name, {type}); }
    await importFile(file, {fromPhone: true});
  }

  machine.setSource(source);
  library.onChange(() => { app.workshop?.refreshLibrary?.(); app.workshopRemote?.publishLibrary?.(); });
  library.refresh().catch(() => {});
  const api = {source, state, library, setSource, importFile, openSaved, save, snapshot, remote, receiveFile, ui: {sourceBar, panel, centerBar, zoomBar, orderPanel, bedNote}, update, get analysis() { return analysis; }};
  app.jobStudio = api;
  let initial = 'box'; try { initial = app.readStorage?.('lzbox-job-source', 'box') === 'import' ? 'import' : 'box'; } catch {}
  setSource(initial, {silent: true}); setCenter('preview');
  restoreDraft();
  return api;
}
