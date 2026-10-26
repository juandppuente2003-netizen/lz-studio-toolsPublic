// Presentation only. Existing tools retain their nodes, events, data and access checks.
const $=s=>document.querySelector(s),make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
const path=document.location.pathname,remote=path.endsWith('/box/remote.html');document.body.classList.add('studio-v2');
const icon=(name)=>{const paths={tools:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',box:'m12 2 10 5v10l-10 5L2 17V7zm0 10 10-5M12 12 2 7m10 5v10',home:'m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10',help:'M9 8a3 3 0 1 1 5 3c-2 1-2 2-2 3m0 3h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0'};return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]||paths.tools}"/></svg>`;};
if(!remote){
 const header=make('header','studio-global-header');header.innerHTML=`<a class="studio-logo" href="/index.html"><b>LZ</b><span>STUDIO TOOLS</span></a><nav aria-label="Navegación principal"><a href="/index.html">${icon('home')}Inicio</a><a href="/dtf.html">${icon('tools')}Herramientas DTF</a><a href="/box/index.html">${icon('box')}LZ Box Studio</a></nav><div class="studio-global-user"><a href="/account.html" class="studio-account-fallback">Mi cuenta</a></div>`;
 for(const a of header.querySelectorAll('nav a')){const active=a.pathname==='/box/index.html'?path.startsWith('/box/'):a.pathname==='/index.html'?path==='/'||path==='/index.html':!path.startsWith('/box/')&&!['/','/index.html','/account.html'].includes(path);if(active)a.setAttribute('aria-current','page');}
 document.body.prepend(header);
 for(const n of document.querySelectorAll('.lz-top-nav,.lz-suite-nav'))n.hidden=true;
 const slot=header.querySelector('.studio-global-user');
 function account(){const b=$('.topbar .account-link');if(b){slot.querySelector('.studio-account-fallback')?.remove();slot.append(b);}}
 account();const accountObserver=new MutationObserver(account);accountObserver.observe(document.body,{subtree:true,childList:true});
 const originalTop=$('.topbar');if(originalTop){const brand=originalTop.querySelector('.brand');if(brand){brand.classList.add('studio-workspace-brand');brand.setAttribute('aria-label','Volver al inicio');}originalTop.classList.add('studio-workspace-toolbar');}
}
// Vector miniatures are illustrative labels, never simulated processing results.
function thumbnail(kind,index){
 const colors=['#45ddf2','#aa94ff','#6dddb2'];const color=colors[index%3];
 const pattern=`<defs><pattern id="dots-${index}" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.8" fill="${color}"/></pattern></defs>`;
 const art=kind.includes('mockup')?'<path d="m36 29 31-15 14 10 14-10 31 15 17 31-25 13-7-17v62H51V56l-7 17-25-13z" fill="#252e41" stroke="#7e8ba3"/><text x="81" y="75" text-anchor="middle" fill="#45ddf2" font-size="24" font-weight="900">LZ</text>':kind.includes('sheet')||kind.includes('gang')?`<rect x="30" y="12" width="106" height="112" rx="4" fill="#131b28" stroke="#8091a7"/><text x="41" y="51" fill="${color}" font-size="29" font-weight="900">LZ</text><path d="m97 29 17 18-17 18-17-18z" fill="#aa94ff"/><circle cx="61" cy="85" r="18" fill="url(#dots-${index})"/><text x="88" y="106" fill="#aa94ff" font-size="20" font-weight="900">LZ</text>`:kind.includes('text')?`<text x="80" y="90" text-anchor="middle" font-size="80" font-weight="900" font-style="italic" stroke="${color}" stroke-width="3" fill="#eaf1fb">LZ</text>`:kind.includes('texture')?`<rect x="20" y="20" width="120" height="100" rx="7" fill="url(#dots-${index})"/><path d="m28 96 83-73M40 117l90-80M27 62l42-41" stroke="#f2f4fa" stroke-width="2"/>`:`<path d="m80 12 52 30v56l-52 30-52-30V42z" fill="#242c40" stroke="${color}"/><path d="M80 12v116M28 42l104 56M132 42 28 98" stroke="${color}" stroke-opacity=".5"/><circle cx="80" cy="70" r="42" fill="url(#dots-${index})"/>`;
 return `<svg viewBox="0 0 160 140" role="img" aria-label="Ilustración de la herramienta">${pattern}${art}</svg>`;
}
function catalog(){const cards=[...document.querySelectorAll('.tool-card')];if(!cards.length)return;document.body.classList.add('studio-catalog');cards.forEach((card,i)=>{if(card.querySelector('.studio-tool-preview'))return;const href=card.querySelector('.open-tool')?.getAttribute('href')||'';const preview=make('div','studio-tool-preview');preview.innerHTML=thumbnail(href,i);preview.setAttribute('aria-hidden','true');card.querySelector('.card-top')?.after(preview);});
 const heading=$('.home-intro h1');if(heading)heading.innerHTML='Tus herramientas,<br><em>en un solo lugar.</em>';
 const intro=$('.home-intro');if(intro&&!intro.querySelector('.studio-halftone-art')){const art=make('div','studio-halftone-art');art.setAttribute('aria-hidden','true');art.innerHTML=thumbnail('text',27);intro.append(art);}
}
catalog();
function box(){const app=window.lzApp;if(!app?.workshop)return false;document.body.classList.add('studio-box-ready');
 const operator=$('#workshopOperator .k40-layout');if(operator&&!operator.querySelector('.studio-job-column')){
  const left=make('aside','studio-job-column'),title=make('h3','','Trabajo y parámetros');left.setAttribute('aria-label','Trabajo y parámetros');left.append(title);
  for(const sel of ['#k40BridgePanel','.k40-job-settings','.k40-registration']){const n=operator.querySelector(sel);if(n)left.append(n);}
  operator.prepend(left);
 }
 const body=$('.viewer-body');if(body&&!$('.studio-piece-inspector')){
  const inspector=make('aside','studio-piece-inspector');inspector.setAttribute('aria-label','Pieza seleccionada');inspector.innerHTML='<div class="studio-inspector-heading">Pieza seleccionada</div><div id="studioPieceContent"></div><p class="hint">Selecciona una pieza en el modelo para consultar sus datos. Usa Formas o Compartimentos para editarla.</p>';
  body.append(inspector);const pieceBar=$('#pieceBar');if(pieceBar)inspector.append(pieceBar);
  const update=()=>{const id=app.editor.selected,part=app.panels.find(p=>p.id===id),content=$('#studioPieceContent');content.replaceChildren();if(part){content.append(make('strong','',part.name),make('p','',`${part.w.toFixed(1)} × ${part.h.toFixed(1)} mm`),make('p','',`MDF ${app.state.thickness} mm`));}else{content.append(make('strong','',app.state.name),make('p','',`${app.state.width} × ${app.state.depth} × ${app.state.height} mm`),make('span','studio-tag',`${app.panels.length} piezas · MDF ${app.state.thickness} mm`));}};
  const select=app.editor.select.bind(app.editor);app.editor.select=(...args)=>{const result=select(...args);update();return result;};app.onUpdate(update);update();
 }
 const library=$('#workshopLibraryGrid');if(library){library.classList.add('studio-library-cards');}
 return true;
}
if(path.startsWith('/box/')&&!remote){if(!box()){const observer=new MutationObserver(()=>{if(box())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}}
