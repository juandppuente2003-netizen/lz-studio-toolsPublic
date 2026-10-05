import {setupWorkspace} from './account/workspace.js';
import './account/account-nav.js';
import {setupImageHandoff} from './handoff-ui.js';
import {setupViewport} from './viewport.js';
const MODULES={crop:{name:'Recortar imagen',description:'Quitar márgenes y ajustar el archivo al diseño.',steps:[['Carga','Sube tu imagen original.'],['Recorta','Quita márgenes transparentes o dibuja el recorte.'],['Descarga','Revisa la medida y descarga el PNG.']]},
  color:{name:'Mejorar colores',description:'Luz, vibrancia, contraste y estilos rápidos.',steps:[['Carga','Sube tu imagen original.'],['Ajusta','Usa Auto, un estilo o los controles de luz y color.'],['Descarga','Compara y exporta el PNG a tu medida.']]},
  upscale:{name:'Mejorar imágenes',description:'Mejorar resolución y detalle ×2 con IA.',steps:[['Carga','Sube una imagen compatible.'],['Mejora','Pulsa Mejorar imagen ×2 y espera el proceso.'],['Compara','Revisa original y resultado antes de descargar.']]},
  home:{name:'Inicio',description:'Todas las herramientas de LZ Studio.'},
  thickness:{name:'Auditor de grosor',description:'Puntos pequeños y corrección automática.',steps:[['Carga','Sube un diseño, preferentemente PNG transparente.'],['Medida','Indica el ancho final de impresión.'],['Corrige','Analiza o corrige automáticamente; compara y continúa.']]},
  opacity:{name:'Semitransparencias',description:'Analizar y corregir el alfa automáticamente.',steps:[['Carga','Sube el diseño original.'],['Medida','Indica el ancho real de impresión.'],['Corrige','Pulsa Corregir automáticamente y compara con el original.']]},
  texture:{name:'Texturas',description:'Desgaste, grano, rayaduras y patrones transparentes.',steps:[['Carga','Sube el diseño que quieres desgastar.'],['Textura','Elige un acabado y ajusta tamaño y desgaste.'],['Descarga','Define la medida de impresión y exporta el PNG.']]},
  editor:{name:'Editor DTF',description:'Quitar fondo, limpiar residuos, color y semitonos.',steps:[['Carga','Sube tu PNG, JPG o WebP.'],['Prepara','Elige una herramienta y revisa el resultado.'],['Descarga','Define la medida final y descarga el PNG.']]},
  text:{name:'Textos',description:'Crear lettering y exportarlo en PNG o SVG.',steps:[['Escribe','Cambia el texto y elige un estilo.'],['Personaliza','Ajusta tipografía, color, borde y forma.'],['Descarga','Exporta PNG o SVG editable.']]},
  mockups:{name:'Mockups',description:'Probar un diseño sobre prendas y gorras.',steps:[['Producto','Elige la prenda o gorra.'],['Diseño','Carga tu imagen, preferentemente PNG.'],['Acomoda','Mueve, escala y descarga el mockup.']]},
  vectorize:{name:'Vectorizar',description:'Convertir imágenes de colores sólidos a SVG.',steps:[['Carga','Usa un logotipo o arte de colores sólidos.'],['Simplifica','Elige colores, detalle y tipo de trazado.'],['Vectoriza','Genera y descarga el SVG editable.']]},
  analyzer:{name:'Preparar para impresión',description:'Detectar y corregir problemas antes de imprimir.',steps:[['Carga','Sube el diseño que mandarás a producción.'],['Medida','Indica el ancho final de impresión.'],['Revisa','Analiza el original, elige las correcciones y compara.']]},
  sheet:{name:'Pliego DTF',description:'Acomodar diseños en un pliego de 58 cm.',steps:[['Pliego','Define el largo y la resolución.'],['Diseños','Selecciona una imagen y arrastra sus esquinas para cambiar el tamaño.'],['Exporta','Acomoda, revisa y descarga el PNG final.']]}
};

const URL_IDS={'crop.html':'crop','index.html':'home','./':'home','color-enhance.html':'color','upscale.html':'upscale','editor.html':'editor','thickness.html':'thickness','opacity.html':'opacity','textures.html':'texture','text-creator.html':'text','mockups.html':'mockups','vectorize.html':'vectorize','analyzer.html':'analyzer','gang-sheet.html':'sheet'};
let registration=null,initialized=false;

export function registerStudioModule(config){
  registration=config;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else queueMicrotask(initialize);
}

function initialize(){
  if(initialized||!registration)return;initialized=true;
  improveNavigation();addQuickGuide();setupMobileSwitch();setupStepFocus();setupPreviewNavigation();setupPreviewSpace();setupWorkspace(registration).catch(()=>{});
}

function setupPreviewNavigation(){
  const selectors={crop:['.lab-canvas-wrap','.zoom-controls'],color:['.lab-canvas-wrap','.lab-toolbar-actions'],upscale:['.lab-canvas-wrap','.lab-toolbar-actions'],editor:['.preview-wrap','.zoom-controls'],text:['.text-canvas-wrap','.zoom-controls'],mockups:['.mockup-canvas-wrap','.zoom-controls'],vectorize:['.lab-canvas-wrap','.lab-toolbar-actions'],analyzer:['.lab-canvas-wrap','.lab-toolbar-actions'],sheet:['.pliego-wrap','.lab-toolbar-actions'],thickness:['.lab-canvas-wrap','.lab-toolbar-actions'],opacity:['.lab-canvas-wrap','.lab-toolbar-actions'],texture:['.lab-canvas-wrap','.lab-toolbar-actions']};
  const [wrap,controls]=selectors[registration.id]||[];
  if(!wrap)return;
  const viewport=document.querySelector(wrap);if(!viewport)return;let toolbar=document.querySelector(controls)||document.querySelector('.zoom-controls');if(!toolbar){toolbar=document.createElement('div');toolbar.className='zoom-controls';viewport.before(toolbar);}
  setupViewport({wrap:viewport,controls:toolbar,editable:['sheet','mockups','crop'].includes(registration.id),canPan:registration.canPan,onZoom:registration.onZoom,onFit:registration.onFit,zoomButtons:!toolbar.querySelector('button[aria-label="Acercar"],button[id*="ZoomIn"],#zoomIn,#zoomSheetIn')});
}

function moduleId(link){const href=(link.getAttribute('href')||'').split('?')[0].split('#')[0];return URL_IDS[href]||URL_IDS[href.split('/').pop()]}

function improveNavigation(){
  for(const link of document.querySelectorAll('.top-modules a')){const id=moduleId(link),module=MODULES[id];if(!module)continue;link.textContent=module.name;if(id===registration.id)link.setAttribute('aria-current','page')}
  for(const link of document.querySelectorAll('.module-menu .module')){if(link.getAttribute('href')?.includes('?tool='))continue;const id=moduleId(link),module=MODULES[id];if(!module)continue;const strong=link.querySelector('strong'),small=link.querySelector('small');if(strong)strong.textContent=module.name;if(small)small.textContent=id===registration.id?'Módulo actual':module.description}
}

function addQuickGuide(){
  const module=MODULES[registration.id],intro=document.querySelector('.tool-intro');if(!module||!intro)return;
  const guide=document.createElement('details');guide.className='lz-quick-guide';guide.open=!['opacity','thickness'].includes(registration.id);guide.innerHTML=`<summary><span>GUÍA RÁPIDA</span><strong>Cómo usar esta herramienta</strong></summary><ol>${module.steps.map(([title,copy])=>`<li><b>${title}</b><span>${copy}</span></li>`).join('')}</ol>`;
  intro.after(guide);
}

function setupStepFocus(){
  const sidebar=document.querySelector('.tools,.text-tools,.mockup-tools,.lab-sidebar');if(!sidebar)return;
  const cards=[...sidebar.querySelectorAll('.panel,.step-card,.ai-card')];
  const activate=card=>{for(const item of cards)item.classList.toggle('lz-current-step',item===card)};
  sidebar.addEventListener('focusin',event=>{const card=event.target.closest('.panel,.step-card,.ai-card');if(card)activate(card)});
  sidebar.addEventListener('click',event=>{const card=event.target.closest('.panel,.step-card,.ai-card');if(card)activate(card)});
}

function setupMobileSwitch(){
  const layouts={crop:['.lab-sidebar','.lab-workspace'],color:['.lab-sidebar','.lab-workspace'],upscale:['.lab-sidebar','.lab-workspace'],editor:['.tools','.workspace'],text:['.text-tools','.text-workspace'],mockups:['.mockup-tools','.mockup-workspace'],vectorize:['.lab-sidebar','.lab-workspace'],analyzer:['.lab-sidebar','.lab-workspace'],sheet:['.lab-sidebar','.lab-workspace'],thickness:['.lab-sidebar','.lab-workspace'],opacity:['.lab-sidebar','.lab-workspace'],texture:['.lab-sidebar','.lab-workspace']},selectors=layouts[registration.id];if(!selectors)return;
  const bar=document.createElement('div');bar.className='lz-mobile-switch';bar.setAttribute('aria-label','Cambiar vista');bar.innerHTML='<button data-pane="controls">1 · Ajustes</button><button data-pane="view">2 · Vista previa</button>';document.querySelector('.topbar')?.after(bar);
  const show=pane=>{document.body.classList.toggle('lz-mobile-controls',pane==='controls');document.body.classList.toggle('lz-mobile-view',pane==='view');for(const button of bar.querySelectorAll('button')){const active=button.dataset.pane===pane;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))}document.querySelector(pane==='controls'?selectors[0]:selectors[1])?.scrollIntoView({block:'start'})};
  for(const button of bar.querySelectorAll('button'))button.onclick=()=>show(button.dataset.pane);show('controls');
}

function setupPreviewSpace(){
  if(registration.id==='home')return;
  const controls=document.createElement('div');controls.className='lz-preview-actions';
  const workspace=document.querySelector('.workspace,.lab-workspace,.text-workspace,.mockup-workspace');
  if(!workspace)return;
  const toolbar=workspace.querySelector('.canvas-toolbar,.lab-toolbar,.text-toolbar,.mockup-toolbar');
  (toolbar||workspace).append(controls);
  const focus=document.createElement('button');focus.type='button';focus.className='lz-focus-button';focus.textContent='Ampliar vista';focus.setAttribute('aria-pressed','false');controls.append(focus);
  function toggle(active){document.body.classList.toggle('lz-focus',active);if(active){document.body.classList.add('lz-mobile-view');document.body.classList.remove('lz-mobile-controls')}focus.textContent=active?'Mostrar ajustes':'Ampliar vista';focus.setAttribute('aria-pressed',String(active));window.dispatchEvent(new Event('resize'))}
  focus.onclick=()=>toggle(!document.body.classList.contains('lz-focus'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('lz-focus'))toggle(false)});
  setupImageHandoff(registration,controls);
}
