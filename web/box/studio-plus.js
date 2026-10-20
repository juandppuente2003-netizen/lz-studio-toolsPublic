/* LZ Studio · controles añadidos en v3.4: atajos de teclado, vistas extra
   y visibilidad de piezas en el visor. Solo afectan la vista: nunca
   cambian la geometría ni los archivos de corte. */
const $=id=>document.getElementById(id);
function ready(fn){if(globalThis.lzApp)fn(globalThis.lzApp);else{let n=0;const t=setInterval(()=>{if(globalThis.lzApp||++n>200){clearInterval(t);if(globalThis.lzApp)fn(globalThis.lzApp);}},25);}}

ready(app=>{
 const {renderer,editor}=app;let hidden=new Set(),isolate=null;
 const typing=e=>e.target.closest?.('input,select,textarea,[contenteditable]')||document.querySelector('dialog[open]');
 const valid=()=>{const ids=new Set(app.panels.map(p=>p.id));hidden=new Set([...hidden].filter(id=>ids.has(id)));if(isolate&&!ids.has(isolate))isolate=null;};
 const apply=()=>{valid();renderer.setHidden(hidden,isolate);sync();};
 function sync(){valid();const sel=editor.selected,n=hidden.size+(isolate?1:0);
  if($('hidePiece')){$('hidePiece').disabled=!sel;$('hidePiece').textContent=sel&&hidden.has(sel)?'Mostrar':'Ocultar';}
  if($('isolatePiece')){$('isolatePiece').disabled=!sel;$('isolatePiece').textContent=isolate&&isolate===sel?'Quitar aislado':'Aislar';}
  if($('showAllPieces'))$('showAllPieces').disabled=!n;
  if($('pieceBar')){const show=(sel||n)&&app.view==='3d';$('pieceBar').hidden=!show;const name=app.panels.find(p=>p.id===sel)?.name;$('pieceBarName').textContent=isolate?`Aislada: ${app.panels.find(p=>p.id===isolate)?.name||'pieza'}`:name?(hidden.size?`${name} · ${hidden.size} oculta${hidden.size>1?'s':''}`:name):`${hidden.size} pieza${hidden.size>1?'s':''} oculta${hidden.size>1?'s':''}`;}
 }
 const toggleHide=()=>{const sel=editor.selected;if(!sel)return app.toast('Selecciona una pieza en el 3D o en la lista para ocultarla.');if(hidden.has(sel))hidden.delete(sel);else{hidden.add(sel);if(isolate===sel)isolate=null;}apply();app.toast(hidden.has(sel)?'Pieza oculta solo en el visor; los planos no cambian.':'Pieza visible.');};
 const toggleIsolate=()=>{const sel=editor.selected;if(!sel)return app.toast('Selecciona una pieza para aislarla.');isolate=isolate===sel?null:sel;hidden.delete(sel);apply();};
 const showAll=()=>{hidden.clear();isolate=null;apply();};
 $('hidePiece')&&($('hidePiece').onclick=toggleHide);$('isolatePiece')&&($('isolatePiece').onclick=toggleIsolate);$('showAllPieces')&&($('showAllPieces').onclick=showAll);
 const refresh=editor.refresh.bind(editor);editor.refresh=(...a)=>{refresh(...a);sync();};
 const setView=app.setView;app.setView=v=>{setView(v);sync();};

 const views=['iso','front','back','left','right','top','bottom'];
 const camera=mode=>{if(mode==='fit'){renderer.fit();return;}renderer.camera(mode);document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===mode||(mode==='right'&&b.dataset.camera==='side')));};
 $('moreViews')&&($('moreViews').onchange=()=>{const v=$('moreViews').value;if(v)camera(v);$('moreViews').value='';});

 document.addEventListener('keydown',e=>{
  if(e.defaultPrevented)return;const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='s'){e.preventDefault();if(e.shiftKey)app.saveAs();else app.quickSave();return;}
  if(typing(e))return;
  if(mod&&k==='z'){e.preventDefault();$(e.shiftKey?'redoEdit':'undoEdit')?.click();return;}
  if(mod&&k==='y'){e.preventDefault();$('redoEdit')?.click();return;}
  if(mod||e.altKey)return;
  if(k==='p'){app.setView(app.view==='3d'?'2d':'3d');return;}
  if(app.view!=='3d')return;
  if(k==='f'){camera('fit');return;}
  if(/^[1-7]$/.test(e.key)){camera(views[+e.key-1]);return;}
  if(k==='h'&&e.shiftKey){showAll();return;}
  if(k==='h'){toggleHide();return;}
  if(k==='i'){toggleIsolate();return;}
  if(k==='m'){$('measureToolsBtn')?.click();return;}
  if(k==='c'&&!$('compartmentBtn')?.hidden){$('compartmentBtn')?.click();return;}
  if(k==='e'){$('shapeToolsBtn')?.click();return;}
  if(k==='escape'&&!$('editInspector')?.hidden){$('closeInspector')?.click();}
 });
 for(const id of['view3d','view2d'])$(id)?.addEventListener('click',()=>setTimeout(sync,0));
 sync();

 /* v3.5 · historial global, autoguardado, catálogo, secciones plegables y lista de piezas sincronizada */
 const store={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}}};
 const mirror=(src,dst)=>{const a=$(src),b=$(dst);if(!a||!b)return;const copy=()=>{b.disabled=a.disabled;};copy();new MutationObserver(copy).observe(a,{attributes:true,attributeFilter:['disabled']});b.onclick=()=>{if(!a.disabled)a.click();};};
 mirror('undoEdit','topUndo');mirror('redoEdit','topRedo');
 const auto=$('autosaveState');
 const stamp=()=>{if(!auto)return;let ok=true;try{const raw=localStorage.getItem('lzbox-current');ok=!!raw&&JSON.parse(raw).model===app.state.model;}catch{ok=false;}auto.dataset.state=ok?'saved':'error';auto.textContent=ok?`Autoguardado ${new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`:'Autoguardado no disponible';auto.title=ok?'El trabajo en curso se guarda automáticamente en este navegador y se recupera al volver a abrir la página.':'El navegador no permite guardar (modo privado o almacenamiento lleno). Exporta un respaldo JSON desde Mis diseños.';};
 app.onUpdate?.(stamp);stamp();
 // catálogo: búsqueda sin acentos y modo contraído persistente
 const norm=t=>String(t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 const catalogSection=$('modelCatalog')?.closest('.form-section'),cards=[...document.querySelectorAll('#modelCatalog [data-model]')];
 cards.forEach(c=>{const sub=c.querySelector('span')?.textContent;if(sub&&!c.title)c.title=`${c.querySelector('strong')?.textContent||''} · ${sub}`;});
 const filter=()=>{const q=norm($('catalogSearch')?.value||'');let n=0;cards.forEach(c=>{const hit=!q||norm(c.textContent+' '+c.dataset.model).includes(q);c.hidden=!hit;if(hit)n++;});if($('catalogEmpty'))$('catalogEmpty').hidden=n>0;if(q&&catalogSection?.classList.contains('catalog-collapsed'))setCollapsed(false);};
 const setCollapsed=v=>{catalogSection?.classList.toggle('catalog-collapsed',v);const t=$('catalogToggle');if(t){t.textContent=v?'Cambiar modelo':'Contraer';t.setAttribute('aria-expanded',String(!v));}store.set('lzbox-catalog-collapsed',v);};
 $('catalogSearch')?.addEventListener('input',filter);
 $('catalogToggle')&&($('catalogToggle').onclick=()=>setCollapsed(!catalogSection.classList.contains('catalog-collapsed')));
 setCollapsed(store.get('lzbox-catalog-collapsed',false)===true);
 cards.forEach(c=>c.addEventListener('click',()=>{if($('catalogSearch')?.value){$('catalogSearch').value='';filter();}}));
 // secciones plegables del panel de configuración (solo visual)
 const folded=new Set(store.get('lzbox-folded-sections',[]));
 document.querySelectorAll('#configForm > .form-section').forEach((sec,i)=>{const label=sec.querySelector(':scope > .section-label');if(!label)return;const key=label.querySelector('h3')?.textContent.trim()||String(i);
  label.setAttribute('role','button');label.tabIndex=0;const apply=v=>{sec.classList.toggle('is-collapsed',v);label.setAttribute('aria-expanded',String(!v));};apply(folded.has(key)&&i>0);
  const toggle=e=>{if(e.target.closest('input,select,button:not(.section-label)'))return;const v=!sec.classList.contains('is-collapsed');apply(v);v?folded.add(key):folded.delete(key);store.set('lzbox-folded-sections',[...folded]);};
  label.addEventListener('click',toggle);label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(e);}});});
 // lista de piezas ↔ selección 3D
 const markRows=()=>{const sel=editor.selected,rows=[...document.querySelectorAll('#piecesBody tr')];rows.forEach((tr,i)=>{const id=app.panels[i]?.id;tr.dataset.piece=id||'';tr.classList.toggle('is-selected',!!id&&id===sel);tr.tabIndex=0;tr.title='Seleccionar en el 3D';});};
 $('piecesBody')?.addEventListener('click',e=>{const tr=e.target.closest('tr');if(!tr?.dataset.piece)return;if(app.view!=='3d')app.setView('3d');editor.select?.(tr.dataset.piece);renderer.draw?.();markRows();});
 $('piecesBody')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.target.closest('tr')?.click();}});
 const refresh2=editor.refresh.bind(editor);editor.refresh=(...a)=>{refresh2(...a);markRows();};app.onUpdate?.(markRows);markRows();
 // atajo de ayuda
 document.addEventListener('keydown',e=>{if(e.key==='?'&&!typing(e)){e.preventDefault();$('helpDialog')?.showModal();}});
});
