/* LZ Box Studio · interfaz NEO (v60).
   Reorganiza los espacios Diseñar, Preparar corte y Operar máquina, y agrega vistas
   rápidas, panel de pieza y opciones de visualización. Todo usa las funciones que ya
   existen (cámara, ocultar/aislar, plano, posiciones, control de máquina): la
   geometría, los planos exportados y los comandos a la máquina no cambian. */
import {modelInfo} from './models.js?v=3.5';
import {sheetPresets} from './layout-plus.js?v=3.5';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
const r1 = (n) => (Math.round(n * 10) / 10).toLocaleString('es-MX', {maximumFractionDigits: 1});
const ICONS = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  isolate: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  cursor: '<path d="M5 3 19 12l-6 1.5L10 20z"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18h2"/>',
  usb: '<path d="M12 3v14"/><path d="m9 6 3-3 3 3"/><circle cx="12" cy="19" r="2"/><path d="M12 13 7 10V7M12 11l5-3V6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  material: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5M3 8v5M21 8v5"/>',
  speed: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/>',
  passes: '<path d="M7 4v16M12 4v16M17 4v16"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
  laser: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17"/>',
  ruler: '<path d="M3 16 16 3l5 5L8 21z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
  texture: '<path d="M4 20 20 4M4 14 14 4M10 20 20 10M4 8l4-4M16 20l4-4"/>',
  joints: '<path d="M4 7h4v4h4V7h4v4h4"/><path d="M4 17h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>',
  frame: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
};
const icon = (name, cls = 'neo-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const withIcon = (node, name) => { if (node && !node.querySelector(':scope > .neo-ico')) node.insertAdjacentHTML('afterbegin', icon(name)); return node; };
const textureNames = {mdf: 'MDF natural', oak: 'Madera clara', walnut: 'Nogal oscuro', birch: 'Abedul', white: 'Blanco mate', black: 'Negro mate'};

function ready(fn) {
  let tries = 0;
  const timer = setInterval(() => {
    const app = globalThis.lzApp;
    if (app?.workshop || ++tries > 400) { clearInterval(timer); if (app?.workshop) fn(app); }
  }, 25);
}

ready((app) => {
  if (document.body.dataset.neoStudio) return;
  document.body.dataset.neoStudio = '1';
  const prefs = store.get('lzbox-neo-view', {grid: true, texture: true});
  safe(() => header(app));
  safe(() => design(app, prefs));
  safe(() => prepare(app));
  safe(() => operate(app));
  safe(() => machineStrip(app));
  document.body.classList.add('neo-ready');
});

function safe(fn) { try { fn(); } catch (error) { (globalThis.__lzNeoErrors ||= []).push(String(error?.stack || error)); console.error('[LZ Box NEO]', error); } }

/* ---------------------------------------------------------------- Cabecera */
function header(app) {
  const topbar = document.querySelector('body.workshop .topbar');
  const nav = document.querySelector('.workshop-nav');
  if (topbar && nav) {
    nav.classList.add('neo-tabs');
    topbar.querySelector('.brand')?.after(nav);
  }
  // Iconos para los cuatro espacios.
  const tabIcons = {design: 'material', prepare: 'layers', operate: 'target', library: 'file'};
  for (const tab of document.querySelectorAll('.workshop-tab')) {
    const name = tabIcons[tab.dataset.space];
    if (name && !tab.querySelector('.neo-ico')) tab.querySelector('.workshop-number')?.insertAdjacentHTML('afterend', icon(name));
  }
  // Distribución del panel: botón compacto en la barra superior.
  const tools = document.querySelector('.workshop-layout-tools');
  if (tools && topbar) {
    tools.classList.add('neo-layout-tools');
    const collapse = tools.querySelector('.btn');
    if (collapse) { collapse.classList.add('neo-collapse'); collapse.title = 'Ocultar o mostrar el panel de propiedades'; collapse.insertAdjacentHTML('afterbegin', icon('panel')); new MutationObserver(() => { if (!collapse.querySelector('.neo-ico')) collapse.insertAdjacentHTML('afterbegin', icon('panel')); }).observe(collapse, {childList: true}); }
    topbar.querySelector('.top-actions')?.prepend(tools);
  }
}

/* ---------------------------------------------------------------- Diseñar */
function design(app, prefs) {
  const {renderer, editor} = app;
  const config = document.querySelector('.config');
  const viewerBody = document.querySelector('.viewer-body');
  const stage = $('stage');
  if (!config || !viewerBody || !stage) return;

  // Tarjeta del modelo con imagen.
  const launcher = document.querySelector('.workshop-model-button');
  const paintLauncher = () => {
    if (!launcher) return;
    const id = app.state.model;
    const card = document.querySelector(`#modelCatalog [data-model="${CSS.escape(id)}"]`);
    const src = card?.querySelector('img')?.getAttribute('src');
    const name = modelInfo[id]?.name || card?.querySelector('strong')?.textContent || 'Caja';
    const sub = card?.querySelector('span')?.textContent || '';
    if (launcher.dataset.neoModel === id + '|' + name && launcher.querySelector('.neo-model-text')) return;
    launcher.dataset.neoModel = id + '|' + name;
    launcher.classList.add('neo-model-card');
    launcher.replaceChildren();
    if (src) { const img = el('img'); img.src = src; img.alt = ''; launcher.append(img); }
    const text = el('span', 'neo-model-text');
    text.append(el('strong', '', name), el('small', '', sub), el('em', '', 'Cambiar modelo →'));
    launcher.append(text);
    launcher.setAttribute('aria-label', `${name}. Cambiar modelo`);
  };

  // Opciones de visualización (solo afectan al visor).
  const options = el('section', 'neo-view-options');
  options.innerHTML = '<h3>Opciones de visualización</h3>';
  const toggle = (label, iconName, checked, onChange, id) => {
    const row = el('label', 'neo-switch');
    row.innerHTML = icon(iconName) + `<span>${label}</span>`;
    const input = el('input'); input.type = 'checkbox'; input.checked = checked; input.setAttribute('role', 'switch'); if (id) input.id = id;
    input.addEventListener('change', () => onChange(input.checked));
    row.append(input, el('i', 'neo-switch-ui'));
    options.append(row);
    return input;
  };
  const dims = $('showDimensions');
  const dimsSwitch = toggle('Mostrar medidas', 'ruler', dims ? dims.checked : true, (on) => { if (dims && dims.checked !== on) dims.click(); });
  dims?.addEventListener('change', () => { dimsSwitch.checked = dims.checked; });
  const applyView = () => { renderer.showGrid = prefs.grid !== false; renderer.showTexture = prefs.texture !== false; renderer.draw(); store.set('lzbox-neo-view', prefs); scheduleThumbs(); syncPiece(); };
  toggle('Mostrar cuadrícula', 'grid', prefs.grid !== false, (on) => { prefs.grid = on; applyView(); }, 'neoShowGrid');
  const textureSwitch = toggle('Textura de material', 'texture', prefs.texture !== false, (on) => { prefs.texture = on; applyView(); }, 'neoShowTexture');
  const joints = $('showJoints');
  if (joints) {
    const jointSwitch = toggle('Resaltar uniones', 'joints', joints.checked, (on) => { if (joints.checked !== on) joints.click(); });
    joints.addEventListener('change', () => { jointSwitch.checked = joints.checked; });
  }
  const preview = document.querySelector('.workshop-preview-controls');
  (preview || config.querySelector('.panel-head'))?.after(options);
  renderer.showGrid = prefs.grid !== false;
  renderer.showTexture = prefs.texture !== false;

  // Tira de vistas con miniaturas reales del modelo.
  const views = [['iso', 'Vista 3D'], ['front', 'Frontal'], ['right', 'Lateral'], ['top', 'Superior'], ['iso-back', 'Isométrica']];
  const strip = el('div', 'neo-view-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Vistas del modelo');
  const thumbs = new Map();
  for (const [mode, label] of views) {
    const b = el('button', 'neo-view-thumb');
    b.type = 'button';
    b.dataset.neoCamera = mode;
    const canvas = el('canvas');
    canvas.width = 168; canvas.height = 112;
    b.append(canvas, el('span', '', label));
    b.onclick = () => { renderer.camera(mode); markView(mode); };
    strip.append(b);
    thumbs.set(mode, canvas);
  }
  const resetView = el('button', 'neo-view-thumb neo-view-reset');
  resetView.type = 'button';
  resetView.innerHTML = icon('reset', 'neo-ico neo-big-ico') + '<span>Restablecer vista</span>';
  resetView.onclick = () => { renderer.camera('iso'); markView('iso'); };
  strip.append(resetView);
  const more = $('moreViews');
  if (more) { const holder = el('label', 'neo-more-views'); holder.append(el('span', '', 'Más vistas'), more); strip.append(holder); }
  const markView = (mode) => { for (const b of strip.querySelectorAll('[data-neo-camera]')) b.classList.toggle('active', b.dataset.neoCamera === mode); };
  markView('iso');
  viewerBody.after(strip);
  // El arrastre libre deja de coincidir con una vista guardada.
  renderer.canvas.addEventListener('pointermove', () => { if (renderer.drag?.active) markView(''); });

  let thumbTimer = 0;
  function scheduleThumbs() { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderThumbs, 450); }
  function renderThumbs() {
    if (app.view !== '3d' || document.body.dataset.workshopSpace !== 'design' || renderer.drag || !renderer.data || !renderer.canvas.clientWidth) return;
    const keep = {yaw: renderer.yaw, pitch: renderer.pitch, zoom: renderer.zoom, panX: renderer.panX, panY: renderer.panY, cotas: renderer.cotas, capture: renderer.capture, exportRatio: renderer.exportRatio};
    const selected = renderer.gpu?.selectedId;
    try {
      renderer.capture = true;
      renderer.cotas = false;
      if (renderer.gpu) renderer.gpu.selectedId = null;
      renderer.exportRatio = Math.max(.2, 260 / renderer.canvas.clientWidth);
      for (const [mode] of views) {
        renderer.zoom = 1; renderer.panX = 0; renderer.panY = 0;
        setCamera(renderer, mode);
        renderer.draw();
        const target = thumbs.get(mode), ctx = target.getContext('2d');
        ctx.clearRect(0, 0, target.width, target.height);
        const src = renderer.canvas, k = Math.min(target.width / src.width, target.height / src.height) * 1.18;
        ctx.drawImage(src, (target.width - src.width * k) / 2, (target.height - src.height * k) / 2, src.width * k, src.height * k);
      }
    } catch (error) {
      console.warn('[LZ Box NEO] miniaturas', error);
    } finally {
      Object.assign(renderer, keep);
      if (renderer.gpu) renderer.gpu.selectedId = selected;
      renderer.draw();
    }
  }

  // Panel derecho: pieza seleccionada.
  const panel = el('aside', 'neo-piece-panel');
  panel.setAttribute('aria-label', 'Pieza seleccionada');
  panel.innerHTML = `
    <div class="neo-panel-head"><h2>${icon('material')}Pieza seleccionada</h2></div>
    <div class="neo-piece-empty"><p>Haz clic en una pieza del modelo o elígela de la lista.</p><div class="neo-piece-chips"></div></div>
    <div class="neo-piece-body" hidden>
      <figure class="neo-piece-preview"></figure>
      <div class="neo-piece-title"><strong class="neo-piece-name"></strong><button type="button" class="neo-icon-btn neo-piece-eye" aria-label="Ocultar pieza en el visor"></button></div>
      <dl class="neo-piece-facts"><div><dt>Tipo</dt><dd class="neo-piece-type"></dd></div><div><dt>Material</dt><dd class="neo-piece-material"></dd></div><div><dt>Medidas</dt><dd class="neo-piece-size"></dd></div><div><dt>Hoja</dt><dd class="neo-piece-sheet"></dd></div></dl>
      <h3>Posición en la hoja de corte</h3>
      <div class="neo-xy"><label>X<input type="number" step="0.5" class="neo-piece-x"><span>mm</span></label><label>Y<input type="number" step="0.5" class="neo-piece-y"><span>mm</span></label></div>
      <div class="neo-piece-actions"><button type="button" class="btn outline neo-piece-apply">Aplicar posición</button><button type="button" class="btn outline neo-piece-rotate">${icon('rotate')}Girar 90°</button></div>
      <h3>Apariencia</h3>
      <label class="neo-switch">${icon('eye')}<span>Visible</span><input type="checkbox" class="neo-piece-visible" role="switch"><i class="neo-switch-ui"></i></label>
      <label class="neo-switch">${icon('texture')}<span>Mostrar textura</span><input type="checkbox" class="neo-piece-texture" role="switch"><i class="neo-switch-ui"></i></label>
      <div class="neo-piece-actions"><button type="button" class="btn outline neo-piece-isolate">${icon('isolate')}Aislar pieza</button><button type="button" class="btn quiet neo-piece-all">Mostrar todas</button></div>
      <p class="neo-note">Girar y mover cambian solo su lugar en la hoja de corte. Ocultar y aislar afectan únicamente al visor; los planos no cambian.</p>
    </div>`;
  viewerBody.append(panel);
  viewerBody.classList.add('neo-has-piece-panel');
  const q = (s) => panel.querySelector(s);

  const hiddenIds = () => renderer.hiddenIds || new Set();
  const selectPiece = (id) => {
    if (app.view !== '3d') app.setView('3d');
    editor.select?.(id);
    app.planEdit.selected = id;
    renderer.draw();
    syncPiece();
  };
  const outline = (p) => {
    const rings = [p.points, ...(p.holePoints || [])].filter(Boolean);
    if (!rings.length) return '';
    const xs = rings.flat().map((v) => v[0]), ys = rings.flat().map((v) => v[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1, pad = Math.max(w, h) * .08;
    const d = rings.map((r) => 'M' + r.map((v) => `${(v[0] - x0).toFixed(1)} ${(v[1] - y0).toFixed(1)}`).join('L') + 'Z').join('');
    return `<svg viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" role="img" aria-label="Contorno de ${p.name}"><path d="${d}" fill-rule="evenodd"/></svg>`;
  };
  let lastPiece = null;
  function syncPiece() {
    const id = editor.selected;
    const part = app.panels?.find((p) => p.id === id);
    const placed = app.packed?.panels?.find((p) => p.id === id);
    q('.neo-piece-body').hidden = !part;
    q('.neo-piece-empty').hidden = !!part;
    if (!part) {
      const chips = q('.neo-piece-chips');
      const key = (app.panels || []).map((p) => p.id).join('|');
      if (chips.dataset.key !== key) {
        chips.dataset.key = key;
        chips.replaceChildren(...(app.panels || []).map((p) => { const b = el('button', 'neo-chip', p.name); b.type = 'button'; b.onclick = () => selectPiece(p.id); return b; }));
      }
      lastPiece = null;
      return;
    }
    const hidden = hiddenIds().has(id);
    q('.neo-piece-name').textContent = part.name;
    q('.neo-piece-type').textContent = part.gridRun ? 'División interior' : 'Pieza individual';
    q('.neo-piece-material').textContent = `${textureNames[app.state.texture] || 'MDF'} ${app.state.thickness} mm`;
    q('.neo-piece-size').textContent = placed ? `${r1(placed.bw)} × ${r1(placed.bh)} × ${app.state.thickness} mm` : '—';
    q('.neo-piece-sheet').textContent = placed ? `Hoja ${placed.sheet + 1} · giro ${placed.rotation || 0}°` : '—';
    if (placed && lastPiece !== id + ':' + placed.x + ':' + placed.y) {
      q('.neo-piece-preview').innerHTML = outline(placed);
      if (!panel.contains(document.activeElement)) { q('.neo-piece-x').value = placed.x; q('.neo-piece-y').value = placed.y; }
      lastPiece = id + ':' + placed.x + ':' + placed.y;
    }
    q('.neo-piece-eye').innerHTML = icon(hidden ? 'eyeOff' : 'eye');
    q('.neo-piece-eye').setAttribute('aria-label', hidden ? 'Mostrar pieza en el visor' : 'Ocultar pieza en el visor');
    q('.neo-piece-visible').checked = !hidden;
    q('.neo-piece-texture').checked = prefs.texture !== false;
    const isolated = renderer.isolateId === id;
    q('.neo-piece-isolate').lastChild.textContent = isolated ? 'Quitar aislado' : 'Aislar pieza';
    q('.neo-piece-all').disabled = !hiddenIds().size && !renderer.isolateId;
    for (const b of panel.querySelectorAll('.neo-piece-apply,.neo-piece-rotate,.neo-piece-x,.neo-piece-y')) b.disabled = !placed;
  }
  const toggleHidden = () => { $('hidePiece')?.click(); syncPiece(); };
  q('.neo-piece-eye').onclick = toggleHidden;
  q('.neo-piece-visible').onchange = toggleHidden;
  q('.neo-piece-texture').onchange = () => { prefs.texture = q('.neo-piece-texture').checked; textureSwitch.checked = prefs.texture; applyView(); };
  q('.neo-piece-isolate').onclick = () => { $('isolatePiece')?.click(); syncPiece(); };
  q('.neo-piece-all').onclick = () => { $('showAllPieces')?.click(); syncPiece(); };
  q('.neo-piece-rotate').onclick = () => { app.planEdit.selected = editor.selected; app.planEdit.rotate(); };
  q('.neo-piece-apply').onclick = () => {
    const x = Number(q('.neo-piece-x').value), y = Number(q('.neo-piece-y').value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return app.toast('Coordenadas inválidas.');
    app.planEdit.setPlacement(editor.selected, (p) => ({...p, x, y}));
  };
  // La selección también funciona con «Editar en 3D» apagado.
  let down = null;
  renderer.canvas.addEventListener('pointerdown', (e) => { down = {x: e.clientX, y: e.clientY}; });
  renderer.canvas.addEventListener('pointerup', (e) => {
    if (editor.enabled || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
    const r = renderer.canvas.getBoundingClientRect(), hit = renderer.pick?.(e.clientX - r.left, e.clientY - r.top);
    if (hit?.part) selectPiece(hit.part.id);
  });
  const refresh = editor.refresh.bind(editor);
  editor.refresh = (...args) => { const out = refresh(...args); syncPiece(); return out; };
  new MutationObserver(() => panel.classList.toggle('neo-under-inspector', !$('editInspector')?.hidden)).observe($('editInspector'), {attributes: true, attributeFilter: ['hidden']});

  app.onUpdate(() => { paintLauncher(); syncPiece(); scheduleThumbs(); });
  // workshop.js reescribe el texto del botón en cada cambio: se vuelve a pintar la tarjeta.
  if (launcher) new MutationObserver(() => { if (!launcher.querySelector('.neo-model-text')) paintLauncher(); }).observe(launcher, {childList: true});
  const show = app.workshop.show;
  app.workshop.show = (space) => { show(space); if (space === 'design') scheduleThumbs(); };
  paintLauncher();
  syncPiece();
  scheduleThumbs();

  // Barra del visor: iconos en las acciones.
}

function setCamera(renderer, mode) {
  if (mode === 'front') { renderer.yaw = 0; renderer.pitch = .03; }
  else if (mode === 'right') { renderer.yaw = -Math.PI / 2; renderer.pitch = .03; }
  else if (mode === 'top') { renderer.yaw = 0; renderer.pitch = 1.54; }
  else if (mode === 'iso-back') { renderer.yaw = Math.PI - .62; renderer.pitch = .64; }
  else { renderer.yaw = -.62; renderer.pitch = .64; }
}

/* ---------------------------------------------------------------- Preparar corte */
function prepare(app) {
  const dock = document.querySelector('.workshop-prepare-dock');
  const tools = $('planTools');
  const stage = $('stage');
  if (!dock || !tools || !stage) return;

  // Barra de herramientas con iconos.
  const toolbar = el('div', 'neo-plan-toolbar');
  const group = el('div', 'neo-tool-group');
  const mk = (label, name, fn, title) => { const b = el('button', 'neo-tool'); b.type = 'button'; b.innerHTML = icon(name) + `<span>${label}</span>`; if (title) b.title = title; b.onclick = fn; return b; };
  const selectBtn = mk('Seleccionar', 'cursor', () => { setEditing(false); }, 'Ver y seleccionar sin mover');
  const moveBtn = mk('Mover', 'move', () => { setEditing(true); }, 'Arrastra piezas en la hoja · flechas ajustan 1 mm');
  const rotateBtn = mk('Girar', 'rotate', () => app.planEdit.rotate(), 'Girar la pieza seleccionada 90° · tecla R');
  const fitBtn = mk('Encajar', 'fit', () => app.planViewer.fit(), 'Ver todas las hojas completas');
  group.append(selectBtn, moveBtn, rotateBtn, fitBtn);
  const sheetTabs = el('div', 'neo-sheet-tabs');
  sheetTabs.setAttribute('role', 'tablist');
  sheetTabs.setAttribute('aria-label', 'Hojas de corte');
  const addSheet = mk('Hoja', 'plus', () => $('planAddSheet')?.click(), 'Agregar una hoja vacía');
  addSheet.classList.add('neo-add-sheet');
  toolbar.append(group, sheetTabs, addSheet);
  tools.prepend(toolbar);
  function setEditing(on) { if (app.planEdit.editing !== on) $('planEditToggle')?.click(); paint(); }

  // Panel izquierdo: resultado y checklist.
  const result = el('section', 'neo-result');
  result.innerHTML = `<h3>Resultado del acomodo</h3><div class="neo-saving"><div class="neo-ring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5"/><circle class="neo-ring-value" cx="18" cy="18" r="15.5" pathLength="100"/></svg>${icon('check')}</div><div><strong class="neo-saving-text">Ahorro estimado: —</strong><span>Recorrido de corte comparado con cortar cada pieza por separado.</span></div></div><div class="neo-usage"><span>Aprovechamiento</span><strong class="neo-usage-value">—</strong></div>`;
  const checklist = el('section', 'neo-checklist');
  checklist.innerHTML = '<h3>' + icon('check') + 'Checklist de validación</h3><ul></ul>';
  dock.querySelector('.panel-head')?.after(result);
  result.after(checklist);
  // Datos del material en tarjeta y fusión más compacta.
  $('workshopFusion')?.classList.add('neo-fusion');
  withIcon($('workshopFuseCuts'), 'layers');
  withIcon($('workshopRemoveDuplicates'), 'layers');

  // Barra inferior: hoja, pieza y coordenadas.
  const info = el('div', 'neo-plan-info');
  info.innerHTML = `<div class="neo-info-card">${icon('sheet')}<div><span>Hoja seleccionada</span><strong class="neo-info-sheet">—</strong><small class="neo-info-sheet-meta"></small></div></div><div class="neo-info-card">${icon('material')}<div><span>Pieza seleccionada</span><strong class="neo-info-piece">Ninguna</strong><small class="neo-info-piece-meta"></small></div></div><div class="neo-info-card neo-info-coords">${icon('target')}<div class="neo-coords-slot"><span>Coordenadas de la pieza</span></div></div>`;
  const props = document.querySelector('.workshop-piece-properties');
  if (props) { props.classList.add('neo-coords'); info.querySelector('.neo-coords-slot').append(props); }
  stage.after(info);

  let focusSheet = 0;
  function paint() {
    if (!app.packed) return;
    const packed = app.packed, check = app.planEdit.check, s = app.state;
    selectBtn.classList.toggle('active', !app.planEdit.editing);
    moveBtn.classList.toggle('active', !!app.planEdit.editing);
    selectBtn.setAttribute('aria-pressed', String(!app.planEdit.editing));
    moveBtn.setAttribute('aria-pressed', String(!!app.planEdit.editing));
    rotateBtn.disabled = !app.planEdit.editing || !app.planEdit.selected;
    const sel = packed.panels.find((p) => p.id === app.planEdit.selected);
    if (sel) focusSheet = sel.sheet;
    focusSheet = Math.min(focusSheet, packed.count - 1);
    // Pestañas de hojas.
    if (sheetTabs.childElementCount !== packed.count) {
      sheetTabs.replaceChildren(...Array.from({length: packed.count}, (_, i) => {
        const b = el('button', 'neo-sheet-tab', `Hoja ${i + 1}`); b.type = 'button'; b.setAttribute('role', 'tab');
        b.onclick = () => { focusSheet = i; document.querySelectorAll('#plan .sheet-wrap')[i]?.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'}); paint(); };
        return b;
      }));
    }
    [...sheetTabs.children].forEach((b, i) => { b.classList.toggle('active', i === focusSheet); b.setAttribute('aria-selected', String(i === focusSheet)); });
    document.querySelectorAll('#plan .sheet-wrap').forEach((w, i) => w.classList.toggle('neo-focus', i === focusSheet && packed.count > 1));
    // Hoja y pieza.
    const u = check?.sheets?.[focusSheet];
    q('.neo-info-sheet').textContent = `Hoja ${focusSheet + 1} (${+s.sheetW} × ${+s.sheetH} mm)`;
    q('.neo-info-sheet-meta').textContent = u ? `${u.pieces} pieza${u.pieces === 1 ? '' : 's'} · ${u.pct.toFixed(1)}% aprovechado` : '';
    q('.neo-info-piece').textContent = sel ? sel.name : 'Ninguna';
    q('.neo-info-piece-meta').textContent = sel ? `${r1(sel.bw)} × ${r1(sel.bh)} mm · giro ${sel.rotation || 0}°` : (app.planEdit.editing ? 'Haz clic en una pieza del plano.' : 'Activa Mover para seleccionar y acomodar.');
    // Aprovechamiento y ahorro.
    const total = check ? check.sheets.reduce((a, x) => a + x.net, 0) : 0, used = check ? (check.sheets.filter((x) => x.pieces).length || 1) : 1;
    q('.neo-usage-value').textContent = check ? `${(100 * total / (used * +s.sheetW * +s.sheetH)).toFixed(1)}%` : '—';
    const summary = $('workshopFusionSummary')?.textContent || '';
    const m = summary.match(/Ahorro:\s*[\d.,]+\s*mm\s*\(([\d.,]+)%\)/);
    const pct = m ? Number(m[1]) : 0;
    q('.neo-saving-text').textContent = `Ahorro estimado: ${m ? m[1] : '0'}%`;
    result.querySelector('.neo-ring-value').style.strokeDasharray = `${Math.max(0, Math.min(100, pct))} 100`;
    // Checklist.
    const items = [];
    if (check) {
      items.push([!check.overlaps.length, 'Sin superposiciones', check.overlaps.length ? `${check.overlaps.length} par(es) de piezas encimadas.` : 'Ninguna pieza se encima con otra.']);
      items.push([!check.outside.length, 'Dentro del material', check.outside.length ? `${check.outside.length} pieza(s) salen del área de corte.` : 'Todas las piezas están dentro de la hoja.']);
      items.push([!check.tight.length, `Separación mínima ${s.gap} mm`, check.tight.length ? `${check.tight.length} par(es) más juntos de lo indicado.` : 'Las piezas respetan la separación.']);
      items.push([!packed.unplaced?.length, 'Todas las piezas colocadas', packed.unplaced?.length ? `${packed.unplaced.length} pieza(s) no caben en la hoja.` : `${packed.panels.length} piezas en ${packed.count} hoja${packed.count > 1 ? 's' : ''}.`]);
    }
    checklist.querySelector('ul').replaceChildren(...items.map(([ok, title, text]) => { const li = el('li', ok ? 'ok' : 'bad'); li.innerHTML = icon(ok ? 'check' : 'alert'); const d = el('div'); d.append(el('strong', '', title), el('span', '', text)); li.append(d); return li; }));
  }
  const q = (s) => info.querySelector(s) || result.querySelector(s);
  const refreshTools = app.planEdit.refreshTools.bind(app.planEdit);
  app.planEdit.refreshTools = (...args) => { const out = refreshTools(...args); paint(); return out; };
  app.onUpdate(paint);
  const show = app.workshop.show;
  app.workshop.show = (space) => { show(space); if (space === 'prepare') { paint(); requestAnimationFrame(() => app.planViewer.fit()); } };
  paint();
  // Tamaño de hoja visible en la barra de material.
  const preset = $('sheetPreset');
  if (preset && !preset.options.length) for (const p of sheetPresets) preset.append(new Option(p.label || `${p.w} × ${p.h} mm`, p.id));
}

/* ---------------------------------------------------------------- Operar máquina */
function operate(app) {
  const dialog = $('k40Dialog');
  const operator = $('workshopOperator');
  if (!dialog || !operator) return;
  dialog.classList.add('neo-operate');
  const find = (s) => dialog.querySelector(s);

  // Columna izquierda: trabajo actual, conexión y control desde celular.
  const left = el('div', 'neo-op-left');
  const job = el('section', 'neo-op-card neo-job');
  job.innerHTML = `<div class="neo-job-head"><span class="neo-job-icon">${icon('file')}</span><div><span>Trabajo actual</span><strong class="neo-job-name"></strong></div></div><div class="neo-job-rows"></div>`;
  const rows = job.querySelector('.neo-job-rows');
  const row = (name, label, control) => { const r = el('div', 'neo-job-row'); r.innerHTML = icon(name) + `<span>${label}</span>`; if (control) r.append(control); rows.append(r); return r; };
  const sheet = $('k40Sheet');
  if (sheet) { sheet.closest('label')?.classList.add('neo-moved'); row('sheet', 'Hoja', sheet); }
  const material = el('output', 'neo-job-material');
  row('material', 'Material', material);
  const speed = $('k40Speed'), passes = $('k40Passes');
  if (speed) row('speed', 'Velocidad', speed);
  if (passes) row('passes', 'Pasadas', passes);
  const origin = $('k40Origin');
  if (origin) { const r = row('target', 'Origen', origin); r.classList.add('neo-job-origin'); const note = $('k40OriginNote'); if (note) job.append(note); }
  find('.k40-job-settings')?.classList.add('neo-emptied');

  const usb = $('k40BridgePanel');
  const usbCard = el('section', 'neo-op-card neo-usb');
  usbCard.innerHTML = `<div class="neo-usb-head"><span class="neo-led" aria-hidden="true"></span><strong>Conexión USB</strong><span class="neo-usb-state"></span></div>`;
  if (usb) { usb.open = false; usbCard.append(usb); usb.querySelector('summary').textContent = 'Detalles de conexión'; }

  const phone = el('section', 'neo-op-card neo-phone');
  phone.innerHTML = `<div class="neo-phone-head"><span class="neo-job-icon">${icon('phone')}</span><div><strong>Control desde celular</strong><p>Accede y controla la máquina desde tu celular en la misma red.</p></div></div>`;
  const remoteButton = [...document.querySelectorAll('.workshop-operator-tools button')].find((b) => /celular/i.test(b.textContent));
  const openPhone = el('button', 'btn outline neo-wide', 'Abrir control');
  openPhone.type = 'button';
  openPhone.onclick = () => remoteButton?.click();
  phone.append(openPhone);
  if (!remoteButton) phone.hidden = true;
  left.append(job, usbCard, phone);
  const registration = find('.k40-registration');
  if (registration) { registration.classList.add('neo-op-card'); left.append(registration); }
  const power = find('.k40-controls > p.k40-note');
  if (power) { power.classList.add('neo-power-note'); left.append(power); }
  find('.k40-controls')?.classList.add('neo-emptied');

  // Columna derecha: mover cabezal.
  const right = el('div', 'neo-op-right');
  // Las columnas entran al documento antes de mover nodos: así getElementById los sigue encontrando.
  const layout = find('.k40-layout');
  layout?.prepend(left);
  layout?.append(right);
  const jog = find('.k40-jog-panel');
  if (jog) {
    right.append(jog);
    jog.classList.add('neo-op-card');
    const heading = jog.querySelector('.k40-section-heading');
    const position = $('k40Position');
    const readout = el('div', 'neo-readout');
    readout.innerHTML = '<span>Posición estimada (mm)</span><div><b>X</b><strong class="neo-pos-x">—</strong><b>Y</b><strong class="neo-pos-y">—</strong></div>';
    heading?.after(readout);
    const syncPosition = () => {
      const match = position?.textContent.match(/X\s*(-?[\d.]+)\s*·\s*Y\s*(-?[\d.]+)/);
      readout.querySelector('.neo-pos-x').textContent = match ? match[1] : '—';
      readout.querySelector('.neo-pos-y').textContent = match ? match[2] : '—';
      readout.classList.toggle('neo-unknown', !match);
    };
    if (position) new MutationObserver(syncPosition).observe(position, {childList: true, characterData: true, subtree: true});
    syncPosition();
    // Paso como botones segmentados (la lista original sigue mandando).
    const step = $('k40Step');
    if (step) {
      const seg = el('div', 'neo-steps');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Paso de movimiento en mm');
      const paintSteps = () => { for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.value === step.value)); };
      for (const option of step.options) {
        const b = el('button', 'neo-step', option.value); b.type = 'button'; b.dataset.value = option.value;
        b.onclick = () => { step.value = option.value; step.dispatchEvent(new Event('change', {bubbles: true})); step.dispatchEvent(new Event('input', {bubbles: true})); paintSteps(); };
        seg.append(b);
      }
      step.addEventListener('change', paintSteps);
      const label = el('p', 'neo-sub', 'Paso de movimiento (mm)');
      step.closest('div')?.prepend(label, seg);
      step.classList.add('neo-visually-hidden');
      jog.querySelector('label[for=k40Step]')?.classList.add('neo-visually-hidden');
      paintSteps();
    }
    withIcon($('k40Home'), 'home');
    withIcon($('k40UsePosition'), 'target');
    withIcon($('k40Goto'), 'target');
    withIcon($('k40Pick'), 'cursor');
    withIcon($('k40Pulse'), 'laser');
  }

  // Centro: plano con encabezado y medidas.
  const canvas = find('.k40-canvas-panel');
  canvas?.classList.add('neo-op-card', 'neo-op-plan');
  withIcon($('k40Arrange'), 'layers');

  // Consola inferior: estado, tiempo estimado y acciones.
  const consoleBar = find('.k40-console');
  const time = $('k40Time');
  if (consoleBar && time) {
    const clock = el('div', 'neo-clock');
    clock.innerHTML = '<span>Tiempo estimado</span>';
    const value = el('strong', 'neo-clock-value', '—');
    const note = el('small', 'neo-clock-note', '');
    clock.append(value, note);
    consoleBar.querySelector('.k40-feedback')?.after(clock);
    time.classList.add('neo-visually-hidden');
    clock.append(time);
    const summary = $('k40Summary');
    const syncClock = () => {
      const live = time.textContent;
      if (/restante\s+(\d+)\s*s/.test(live)) { const s = Number(live.match(/restante\s+(\d+)\s*s/)[1]); value.textContent = fmtTime(s); note.textContent = 'Restante · en curso'; return; }
      const est = (summary?.textContent || '').match(/Tiempo\s+m[ií]nimo de corte:\s*([\d.]+)\s*s/i);
      value.textContent = est ? fmtTime(Number(est[1])) : '—';
      note.textContent = est ? 'Estimación, más movimientos y aceleraciones.' : 'Sin trabajo preparado.';
    };
    for (const node of [time, summary].filter(Boolean)) new MutationObserver(syncClock).observe(node, {childList: true, characterData: true, subtree: true});
    syncClock();
  }
  withIcon($('k40Frame'), 'frame');
  withIcon($('k40Run'), 'play');
  withIcon($('k40Resume'), 'play');
  withIcon($('k40Cancel'), 'stop');


  // Material y nombre del trabajo; estado de conexión en la tarjeta USB.
  const state = $('k40State');
  const paintJob = () => {
    job.querySelector('.neo-job-name').textContent = app.state.name || modelInfo[app.state.model]?.name || 'Trabajo';
    material.textContent = `${textureNames[app.state.texture] || 'MDF'} ${app.state.thickness} mm`;
    const connected = !!app.machineControl?.machine?.connected;
    usbCard.classList.toggle('is-connected', connected);
    usbCard.querySelector('.neo-usb-state').textContent = connected ? 'Conectada' : (state?.textContent || 'Sin conectar').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  };
  app.onUpdate(paintJob);
  if (state) new MutationObserver(paintJob).observe(state, {childList: true, characterData: true, subtree: true});
  paintJob();
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

/* ---------------------------------------------------------------- Aviso de máquina activa */
// Barra que aparece fuera de «Operar máquina» mientras hay un trabajo: queda fija bajo la
// cabecera (no flota sobre el diseño) y ofrece las acciones válidas para cada estado.
// Los botones nuevos solo pulsan los controles originales de k40-control.js.
function machineStrip(app) {
  const strip = document.querySelector('.workshop-machine-strip');
  const message = $('workshopMachineMessage');
  if (!strip || !message) return;
  strip.classList.add('neo-machine-strip');
  strip.setAttribute('role', 'status');
  const lead = el('span', 'neo-strip-icon');
  lead.innerHTML = icon('alert');
  strip.prepend(lead);
  const text = el('div', 'neo-strip-text');
  const title = el('strong', 'neo-strip-title');
  message.before(text);
  const detail = el('span', 'neo-strip-detail');
  text.append(title, detail, message);
  message.classList.add('neo-visually-hidden');
  const stop = [...strip.querySelectorAll('button')].find((b) => /STOP/i.test(b.textContent));
  const view = [...strip.querySelectorAll('button')].find((b) => /Ver trabajo/i.test(b.textContent));
  const mirror = (id, label, iconName, cls) => {
    const source = $(id);
    const b = el('button', 'btn ' + cls);
    b.type = 'button';
    b.innerHTML = icon(iconName) + `<span>${label}</span>`;
    b.onclick = () => { if (source && !source.disabled && !source.hidden) source.click(); };
    b.dataset.mirror = id;
    return b;
  };
  const recover = mirror('k40Recover', 'Restablecer USB', 'usb', 'neo-strip-recover');
  const cancel = mirror('k40Cancel', 'Cancelar trabajo', 'stop', 'outline neo-strip-cancel');
  const resume = mirror('k40Resume', 'Reanudar', 'play', 'primary neo-strip-resume');
  (stop || view)?.before(resume, recover, cancel);
  if (view) { view.classList.add('neo-strip-view'); view.insertAdjacentHTML('afterbegin', icon('target')); }

  const titles = {error: 'Revisa la conexión USB', unknown: 'La máquina no responde', paused: 'Trabajo en pausa', pausing: 'Solicitando pausa', resuming: 'Reanudando', cancelling: 'Cancelando trabajo', recovering: 'Liberando USB', sending: 'Cortando', sent: 'Terminando corte', pulsing: 'Pulso láser'};
  const paint = () => {
    const machine = app.machineControl;
    const state = machine?.snapshot?.().state || 'idle';
    const alert = ['error', 'unknown'].includes(state);
    strip.dataset.state = state;
    strip.classList.toggle('is-alert', alert);
    strip.classList.toggle('is-paused', ['paused', 'pausing'].includes(state));
    title.textContent = titles[state] || 'Trabajo de máquina activo';
    // El mensaje original repite la etiqueta del estado («REVISAR USB · …»): se muestra sin ella.
    detail.textContent = (machine?.message || message.textContent || '').replace(/^[A-ZÁÉÍÓÚÑ ]+ · /, '');
    lead.innerHTML = icon(alert ? 'alert' : state === 'paused' ? 'pause' : 'laser');
    for (const b of [recover, cancel, resume]) {
      const source = $(b.dataset.mirror);
      // La sección de máquina está oculta en las otras pestañas: solo cuenta el panel de pausa.
      const usable = !!source && !source.hidden && !source.disabled && !source.closest('#k40PausePanel')?.hidden;
      b.hidden = !usable;
    }
    // STOP solo se muestra cuando realmente puede pedir la pausa.
    if (stop) stop.hidden = stop.disabled;
  };
  const watch = (node, opts) => node && new MutationObserver(paint).observe(node, opts);
  watch(strip, {attributes: true, attributeFilter: ['hidden']});
  watch(message, {childList: true, characterData: true, subtree: true});
  watch($('k40State'), {childList: true, characterData: true, subtree: true});
  for (const id of ['k40Recover', 'k40Cancel', 'k40Resume', 'k40Stop', 'k40PausePanel']) watch($(id), {attributes: true, attributeFilter: ['hidden', 'disabled']});
  if (stop) watch(stop, {attributes: true, attributeFilter: ['disabled']});
  paint();
}
