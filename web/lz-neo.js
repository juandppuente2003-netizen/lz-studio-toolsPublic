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
