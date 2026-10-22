// Catálogo de Herramientas DTF.
// Los controles del catálogo no dependen de ningún otro módulo: la navegación agrupada y la cuenta
// se cargan después y, si fallan, el buscador, los filtros y el menú siguen funcionando.
const $=id=>document.getElementById(id);
const normalize=value=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

/* Menú «Módulos» ----------------------------------------------------- */
let menuOpener=null;
function menu(open){
 const panel=$('moduleMenu');if(!panel)return;
 panel.hidden=!open;$('menuBackdrop').hidden=!open;$('menuButton').setAttribute('aria-expanded',String(open));
 if(open){menuOpener=document.activeElement;$('menuClose').focus();}else (menuOpener||$('menuButton')).focus();
}
$('menuButton')?.addEventListener('click',()=>menu($('moduleMenu').hidden));
$('menuClose')?.addEventListener('click',()=>menu(false));
$('menuBackdrop')?.addEventListener('click',()=>menu(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('moduleMenu')&&!$('moduleMenu').hidden){event.preventDefault();menu(false);}});

/* Búsqueda y filtros ------------------------------------------------- */
const catalog=$('toolCatalog');
const sections=[...document.querySelectorAll('.tool-section')];
const cards=sections.flatMap(section=>[...section.querySelectorAll('.tool-card')].map(card=>({card,section,text:normalize(card.textContent+' '+(card.dataset.keywords||''))})));
const filters=[...document.querySelectorAll('[data-category]')];
// El servidor quita las tarjetas de herramientas desactivadas y anota cuántas hay configuradas.
const total=Number(catalog?.dataset.toolsTotal)||cards.length;
let category='all';
const plural=(n,one,many)=>`${n} ${n===1?one:many}`;
function filterTools(){
 const query=$('toolSearch').value;const terms=normalize(query).split(/\s+/).filter(Boolean);let count=0;
 for(const item of cards){const visible=(category==='all'||item.section.dataset.group===category)&&terms.every(term=>item.text.includes(term));item.card.hidden=!visible;if(visible)count++;}
 for(const section of sections){const available=cards.filter(item=>item.section===section);const shown=available.filter(item=>!item.card.hidden).length;section.hidden=shown===0;const label=section.querySelector('.section-heading small');if(label)label.textContent=plural(available.length,'herramienta','herramientas');}
 for(const button of filters){const value=button.dataset.category;const n=value==='all'?cards.length:cards.filter(item=>item.section.dataset.group===value).length;const badge=button.querySelector('.filter-count');if(badge)badge.textContent=String(n);button.hidden=value!=='all'&&n===0;}
 $('clearSearch').hidden=!query;
 const filtered=Boolean(terms.length)||category!=='all';
 $('resetFilters').hidden=!filtered;
 $('noTools').hidden=count>0;
 if(count===0){$('noToolsTerm').textContent=terms.length?`No hay herramientas que coincidan con «${query.trim()}»${category==='all'?'':' en esta categoría'}.`:'No hay herramientas disponibles en esta categoría.';}
 const disabled=total-cards.length;
 $('searchStatus').textContent=filtered?`${count} de ${plural(cards.length,'herramienta disponible','herramientas disponibles')}`:`${plural(cards.length,'herramienta disponible','herramientas disponibles')}`+(disabled>0?` · ${total} en total, ${disabled} ${disabled===1?'desactivada':'desactivadas'}`:'');
}
function setCategory(value){category=value;for(const button of filters){const active=button.dataset.category===category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}filterTools();}
function reset(){$('toolSearch').value='';setCategory('all');$('toolSearch').focus();}
if(catalog&&$('toolSearch')){
 $('toolSearch').addEventListener('input',filterTools);
 $('toolSearch').addEventListener('keydown',event=>{if(event.key==='Escape'&&$('toolSearch').value){event.preventDefault();$('toolSearch').value='';filterTools();}});
 $('clearSearch').addEventListener('click',()=>{$('toolSearch').value='';filterTools();$('toolSearch').focus();});
 for(const button of filters)button.addEventListener('click',()=>setCategory(button.dataset.category));
 $('resetFilters').addEventListener('click',reset);
 $('noToolsReset')?.addEventListener('click',reset);
 // Un parámetro ?q= permite enlazar una búsqueda.
 const q=new URLSearchParams(location.search).get('q');if(q)$('toolSearch').value=q.slice(0,80);
 filterTools();
 document.documentElement.dataset.catalogReady='true';
}

/* Recientes ---------------------------------------------------------- */
// Solo guarda la ruta de las últimas herramientas abiertas en este navegador.
const RECENT='lz-recent-tools';
function readRecent(){try{const list=JSON.parse(localStorage.getItem(RECENT)||'[]');return Array.isArray(list)?list.filter(v=>typeof v==='string').slice(0,4):[];}catch{return [];}}
function renderRecent(){
 const box=$('recentTools');if(!box)return;const links=new Map(cards.map(({card})=>{const a=card.querySelector('.open-tool');return [a?.getAttribute('href'),card];}));
 const list=readRecent().filter(href=>links.has(href));box.hidden=list.length===0;const target=box.querySelector('.recent-list');target.replaceChildren();
 for(const href of list){const card=links.get(href);const a=document.createElement('a');a.href=href;a.className='recent-chip';a.textContent=card.querySelector('h3').textContent;target.append(a);}
}
document.addEventListener('click',event=>{const a=event.target.closest('.tool-card .open-tool,.recent-chip');if(!a)return;try{const href=a.getAttribute('href');localStorage.setItem(RECENT,JSON.stringify([href,...readRecent().filter(v=>v!==href)].slice(0,4)));}catch{}});
renderRecent();

/* Módulos secundarios: nunca bloquean lo anterior. ------------------- */
import('./studio-navigation.js').then(m=>m.groupStudioNavigation()).catch(error=>console.warn('Navegación agrupada no disponible:',error.message));
const loadAccount=()=>import('./account/account-nav.js').catch(error=>console.warn('Servicio de cuenta no disponible:',error.message));
if(document.readyState==='complete')loadAccount();else addEventListener('load',loadAccount,{once:true});
