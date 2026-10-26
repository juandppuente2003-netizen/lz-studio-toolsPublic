// LZ Studio Tools · comportamiento visual NEO. Solo presentación: no toca motores, rutas ni sesiones.
const doc = document;

// Ayuda: abre la guía de la herramienta actual o una guía breve del sitio.
function openSiteHelp() {
  let dialog = doc.getElementById('lzHelpDialog');
  if (!dialog) {
    dialog = doc.createElement('dialog');
    dialog.id = 'lzHelpDialog';
    dialog.className = 'lz-help-dialog';
    dialog.setAttribute('aria-labelledby', 'lzHelpTitle');
    dialog.innerHTML = '<button type="button" class="lz-help-close" aria-label="Cerrar">×</button>'
      + '<h2 id="lzHelpTitle">¿Cómo funciona LZ Studio Tools?</h2>'
      + '<ol class="lz-help-steps">'
      + '<li><strong>Elige una herramienta.</strong><span>Busca por nombre o filtra por categoría. Cada tarjeta muestra un ejemplo de lo que hace.</span></li>'
      + '<li><strong>Carga tu archivo.</strong><span>PNG, JPG o WebP. El diseño se procesa en tu dispositivo; no se sube a ningún servidor.</span></li>'
      + '<li><strong>Ajusta y compara.</strong><span>Cada herramienta tiene su guía rápida y vista de original y resultado.</span></li>'
      + '<li><strong>Descarga a tu medida.</strong><span>Elige el ancho en centímetros y la resolución; el PNG lleva los ppp correctos para imprimir.</span></li>'
      + '</ol><p class="lz-help-foot">Con <b>Continuar en…</b> puedes pasar el resultado a otra herramienta sin descargarlo.</p>';
    doc.body.append(dialog);
    dialog.querySelector('.lz-help-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }
  dialog.showModal();
}

doc.addEventListener('click', (event) => {
  const help = event.target.closest('[data-lz-help]');
  if (!help) return;
  event.preventDefault();
  const guide = doc.querySelector('.lz-quick-guide');
  if (guide) {
    guide.open = true;
    guide.scrollIntoView({ block: 'center', behavior: 'smooth' });
    guide.classList.remove('lz-flash');
    void guide.offsetWidth;
    guide.classList.add('lz-flash');
    guide.querySelector('summary')?.focus({ preventScroll: true });
  } else {
    openSiteHelp();
  }
});

// Catálogo: barra lateral sincronizada con los filtros existentes, vista de cuadrícula o lista.
const catalog = doc.body.classList.contains('lz-catalog');
if (catalog) {
  const chips = [...doc.querySelectorAll('.category-filters [data-category]')];
  const side = [...doc.querySelectorAll('.lz-side [data-side-category]')];
  const sync = () => {
    const current = chips.find((chip) => chip.classList.contains('active'))?.dataset.category || 'all';
    for (const button of side) {
      const active = button.dataset.sideCategory === current;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };
  for (const button of side) {
    button.addEventListener('click', () => {
      chips.find((chip) => chip.dataset.category === button.dataset.sideCategory)?.click();
      doc.getElementById('toolCatalog')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
  for (const chip of chips) new MutationObserver(sync).observe(chip, { attributes: true, attributeFilter: ['class'] });
  sync();

  const views = [...doc.querySelectorAll('[data-lz-view]')];
  const setView = (view) => {
    doc.body.classList.toggle('lz-list', view === 'list');
    for (const button of views) button.setAttribute('aria-pressed', String(button.dataset.lzView === view));
    try { localStorage.setItem('lz-catalog-view', view); } catch {}
  };
  let saved = 'grid';
  try { saved = localStorage.getItem('lz-catalog-view') === 'list' ? 'list' : 'grid'; } catch {}
  setView(saved);
  for (const button of views) button.addEventListener('click', () => setView(button.dataset.lzView));

  // Solo una guía "Cómo usar" abierta a la vez.
  doc.addEventListener('toggle', (event) => {
    const opened = event.target;
    if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.classList.contains('card-guide')) return;
    for (const other of doc.querySelectorAll('.card-guide[open]')) if (other !== opened) other.open = false;
  }, true);
}

// Brillo que sigue al cursor en las tarjetas.
const glowTargets = '.lz-catalog .tool-card, .lz-land-card';
doc.addEventListener('pointermove', (event) => {
  const card = event.target.closest?.(glowTargets);
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  card.style.setProperty('--my', `${event.clientY - rect.top}px`);
}, { passive: true });

// ---------------------------------------------------------------------------
// Herramientas: comparación antes/después dentro de la vista y tarjeta del archivo.
const byId = (id) => doc.getElementById(id);
const isTestDom = /jsdom/i.test(doc.defaultView?.navigator?.userAgent || '') || typeof MutationObserver === 'undefined';

function setupCompare() {
  const pairs = [['premiumOriginal', 'premiumResult', 'Resultado'], ['viewOriginal', 'viewResult', 'Resultado'], ['effectOriginal', 'effectResult', 'Resultado'], ['upscaleOriginal', 'upscaleResult', 'Mejorada']];
  const pair = pairs.find(([a, b]) => byId(a) && byId(b));
  const wrap = doc.querySelector('.lab-canvas-wrap, .preview-wrap');
  if (!pair || !wrap) return;
  const [originalButton, resultButton] = [byId(pair[0]), byId(pair[1])];
  const tabs = resultButton.closest('.tabs');
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'lz-compare-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.title = 'Ver el original y el resultado en la misma vista';
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/></svg><span>Comparar</span>';
  tabs?.append(toggle);

  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  const layer = doc.createElement('div');
  layer.className = 'lz-compare';
  layer.hidden = true;
  layer.innerHTML = '<canvas class="lz-compare-original"></canvas><span class="lz-compare-tag lz-left">Original</span><span class="lz-compare-tag lz-right"></span><div class="lz-compare-line"><button type="button" class="lz-compare-handle" aria-label="Mover la división entre original y resultado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-5 5 5 5M15 7l5 5-5 5"/></svg></button></div>';
  layer.querySelector('.lz-right').textContent = pair[2];
  wrap.append(layer);
  const snapshot = layer.querySelector('canvas');
  const line = layer.querySelector('.lz-compare-line');
  let enabled = false, busy = false, split = 50, autoDone = false, timer = 0;

  const visibleCanvas = () => [...wrap.querySelectorAll('canvas')].find((c) => c !== snapshot && !c.hidden && c.offsetWidth > 0);
  const place = () => {
    const canvas = visibleCanvas();
    if (!enabled || !canvas) return;
    const a = canvas.getBoundingClientRect(), b = wrap.getBoundingClientRect();
    Object.assign(layer.style, {left: `${a.left - b.left + wrap.scrollLeft}px`, top: `${a.top - b.top + wrap.scrollTop}px`, width: `${a.width}px`, height: `${a.height}px`});
    snapshot.style.clipPath = `inset(0 ${100 - split}% 0 0)`;
    line.style.left = `${split}%`;
  };
  const capture = () => {
    if (!enabled || busy || originalButton.disabled || resultButton.disabled) return;
    // Nunca interrumpir el cuentagotas ni una selección en curso.
    if (doc.body.classList.contains('picking') || doc.body.classList.contains('lz-picking') || doc.querySelector('.lz-picker-notice:not([hidden])')) return;
    busy = true;
    try {
      originalButton.click();
      const canvas = visibleCanvas();
      if (canvas) { snapshot.width = canvas.width; snapshot.height = canvas.height; const ctx = snapshot.getContext('2d'); ctx.clearRect(0, 0, snapshot.width, snapshot.height); ctx.drawImage(canvas, 0, 0); }
      resultButton.click();
    } finally { busy = false; }
    place();
  };
  const setEnabled = (on) => {
    on = !!on && !originalButton.disabled && !resultButton.disabled;
    if (enabled === on) return;
    enabled = on;
    layer.hidden = !on;
    toggle.setAttribute('aria-pressed', String(on));
    wrap.classList.toggle('lz-comparing', on);
    if (on) capture();
  };
  toggle.addEventListener('click', () => setEnabled(!enabled));
  // Elegir una pestaña de vista sale de la comparación.
  for (const b of [originalButton, resultButton, ...(tabs ? tabs.querySelectorAll('button:not(.lz-compare-toggle)') : [])]) b.addEventListener('click', () => { if (!busy) setEnabled(false); });
  const refreshState = () => {
    const ready = !originalButton.disabled && !resultButton.disabled;
    toggle.disabled = !ready;
    if (!ready) setEnabled(false);
    // La primera vez que hay resultado se muestra directamente la comparación.
    if (ready && !autoDone && !isTestDom && resultButton.getAttribute('aria-pressed') === 'true') { autoDone = true; setEnabled(true); }
  };
  for (const b of [originalButton, resultButton]) new MutationObserver(refreshState).observe(b, {attributes: true, attributeFilter: ['disabled', 'aria-pressed']});
  refreshState();
  doc.addEventListener('lz-work-changed', () => { if (!enabled || busy) return; clearTimeout(timer); timer = setTimeout(capture, 250); });
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(place); ro.observe(wrap); new MutationObserver(() => { const c = visibleCanvas(); if (c) ro.observe(c); place(); }).observe(wrap, {subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'width', 'height']}); }
  window.addEventListener('resize', place);
  // Arrastrar la división.
  const handle = layer.querySelector('.lz-compare-handle');
  const moveTo = (x) => { const r = layer.getBoundingClientRect(); if (!r.width) return; split = Math.max(0, Math.min(100, (x - r.left) / r.width * 100)); place(); };
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => moveTo(ev.clientX);
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); split = Math.max(0, Math.min(100, split + (e.key === 'ArrowLeft' ? -5 : 5))); place(); } });
}

function setupFileCards() {
  const pairs = [['premiumFile', 'premiumName'], ['file', 'fileName'], ['effectFile', 'effectName'], ['upscaleFile', 'upscaleName'], ['cropFile', 'cropName'], ['extractFile', 'extractName'], ['vectorFile', 'vectorName'], ['analyzerFile', 'analyzerName']];
  const pair = pairs.find(([a, b]) => byId(a) && byId(b));
  if (!pair) return;
  const input = byId(pair[0]), name = byId(pair[1]);
  const upload = doc.querySelector(`label[for="${pair[0]}"]`) || input.closest('.upload') || input.parentElement;
  const card = doc.createElement('div');
  card.className = 'lz-file-card';
  card.hidden = true;
  card.innerHTML = '<div class="lz-file-thumb"><canvas width="112" height="112"></canvas></div><div class="lz-file-info"><strong class="lz-file-name"></strong><span class="lz-file-meta"></span><small class="lz-file-extra"></small></div><button type="button" class="lz-file-remove" aria-label="Quitar imagen y empezar de nuevo" title="Quitar imagen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button>';
  (upload?.parentElement ? upload : name).after(card);
  const thumb = card.querySelector('canvas');
  let lastFile = null;
  input.addEventListener('change', () => { lastFile = input.files?.[0] || null; });
  const drawThumb = (source, w, h) => { const ctx = thumb.getContext('2d'); ctx.clearRect(0, 0, 112, 112); const k = Math.max(112 / w, 112 / h); ctx.drawImage(source, (112 - w * k) / 2, (112 - h * k) / 2, w * k, h * k); };
  const paint = () => {
    const text = (name.textContent || '').trim();
    const loaded = text && !/^sin imagen/i.test(text);
    card.hidden = !loaded;
    name.classList.toggle('lz-file-hidden', !!loaded);
    if (!loaded) return;
    const [first, ...rest] = text.split(' · ');
    card.querySelector('.lz-file-name').textContent = first;
    const sizeEl = doc.querySelector('[id$="SourceSize"]');
    if (sizeEl) sizeEl.classList.toggle('lz-file-hidden', !!loaded);
    const dims = text.match(/(\d[\d.,]*)\s*×\s*(\d[\d.,]*)\s*px/) || (sizeEl?.textContent || '').match(/(\d[\d.,]*)\s*×\s*(\d[\d.,]*)\s*px/);
    const size = lastFile && lastFile.name === first ? `${(lastFile.size / 1048576).toFixed(lastFile.size > 10485760 ? 0 : 1)} MB` : '';
    card.querySelector('.lz-file-meta').textContent = [dims ? `${dims[1]} × ${dims[2]} px` : '', size].filter(Boolean).join(' · ') || 'Imagen cargada';
    card.querySelector('.lz-file-extra').textContent = rest.filter((part) => !/×.*px/.test(part) || part.includes('IA')).join(' · ');
    if (lastFile && lastFile.name === first && typeof createImageBitmap === 'function') {
      createImageBitmap(lastFile, {resizeWidth: 224, resizeQuality: 'medium'}).then((bmp) => { drawThumb(bmp, bmp.width, bmp.height); bmp.close?.(); }).catch(() => fromCanvas());
    } else fromCanvas();
  };
  const fromCanvas = () => { const c = [...doc.querySelectorAll('.lab-canvas-wrap canvas, .preview-wrap canvas, .extract-studio canvas')].find((x) => !x.hidden && x.width > 1 && !x.classList.contains('lz-compare-original')); if (c) try { drawThumb(c, c.width, c.height); } catch {} };
  new MutationObserver(paint).observe(name, {childList: true, characterData: true, subtree: true});
  card.querySelector('.lz-file-remove').addEventListener('click', () => {
    if (confirm('¿Quitar la imagen y empezar de nuevo? Los ajustes guardados se conservan.')) location.reload();
  });
  paint();
}

if (!doc.body.classList.contains('lz-catalog') && !doc.body.classList.contains('lz-landing') && !isTestDom) {
  try { setupCompare(); } catch (error) { console.warn('[LZ] comparar', error); }
  try { setupFileCards(); } catch (error) { console.warn('[LZ] archivo', error); }
}

// Secciones de ajustes plegables (todas abiertas al inicio; se recuerda lo que el usuario pliega).
function setupCollapsibleSections() {
  const key = 'lz-folded:' + location.pathname.split('/').pop() + (new URLSearchParams(location.search).get('tool') || '');
  let folded = [];
  try { folded = JSON.parse(localStorage.getItem(key)) || []; } catch {}
  const sections = [...doc.querySelectorAll(':is(.lab-sidebar,.tools,.text-tools,.mockup-tools) :is(.step-card,.panel)')].filter((s) => s.querySelector(':scope > h2'));
  sections.forEach((section, index) => {
    const title = section.querySelector(':scope > h2');
    const id = (title.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) || String(index);
    title.classList.add('lz-fold-title');
    title.setAttribute('role', 'button');
    title.tabIndex = 0;
    title.insertAdjacentHTML('beforeend', '<svg class="lz-fold-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
    const apply = (closed) => { section.classList.toggle('lz-folded', closed); title.setAttribute('aria-expanded', String(!closed)); };
    apply(folded.includes(id));
    const flip = (event) => {
      if (event.target.closest('input,select,button:not(.lz-fold-title),a')) return;
      const closed = !section.classList.contains('lz-folded');
      apply(closed);
      folded = closed ? [...new Set([...folded, id])] : folded.filter((x) => x !== id);
      try { localStorage.setItem(key, JSON.stringify(folded)); } catch {}
    };
    title.addEventListener('click', flip);
    title.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(event); } });
  });
}
if (!doc.body.classList.contains('lz-catalog') && !doc.body.classList.contains('lz-landing') && !isTestDom) {
  try { setupCollapsibleSections(); } catch (error) { console.warn('[LZ] secciones', error); }
}
