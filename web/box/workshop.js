import {optimizeSheet} from './cut-optimizer.js?v=3.5';
import {k40Preview} from './k40-job.js?v=2';
import {modelInfo} from './models.js?v=3.5';
import {mountK40} from './k40-control.js?v=13';
import {readWorkshop,writeWorkshop,makeWorkshopItem,filterWorkshop} from './workshop-store.js?v=1';
import {mountRemoteHost} from './workshop-remote.js?v=4';

const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn,cls='btn outline')=>{const n=el('button',cls,text);n.type='button';n.onclick=fn;return n;};
export function mountWorkshop(app){
 if(app.workshop)return app.workshop;
 const $=id=>document.getElementById(id),root=document.querySelector('.workspace'),main=document.querySelector('.main-area'),config=document.querySelector('.config');
 if(!root||!main||!config)return;
 const storage=document.defaultView.localStorage;
 const preferences=app.readStorage('lzbox-workshop-layout',{})||{};
 document.body.classList.add('workshop');
 const nav=el('nav','workshop-nav');nav.setAttribute('aria-label','Espacios de Box Studio');
 const spaces=[['design','Diseñar','01'],['prepare','Preparar corte','02'],['operate','Operar máquina','03'],['library','Biblioteca','04']];
 const tabs=new Map();
 for(const [id,name,number] of spaces){const b=button('',()=>show(id),'workshop-tab');b.dataset.space=id;b.append(el('span','workshop-number',number),el('span','',name));nav.append(b);tabs.set(id,b);}
 const live=button('Máquina desconectada',()=>show('operate'),'workshop-live');nav.append(live);document.querySelector('.topbar').after(nav);
 const operator=el('section','workshop-operator');operator.id='workshopOperator';operator.hidden=true;root.after(operator);
 const library=el('section','workshop-library');library.id='workshopLibrary';library.hidden=true;operator.after(library);
 const dock=el('aside','workshop-prepare-dock');dock.hidden=true;config.after(dock);
 dock.innerHTML='<div class="panel-head"><h2>Material y distribución</h2></div><p class="hint">Las coordenadas de piezas pertenecen a la hoja. El origen físico se elige en Operar máquina.</p><div id="workshopCutSettings"></div><div class="workshop-piece-properties"><h3>Pieza seleccionada</h3><p id="workshopPieceName">Selecciona una pieza en el plano.</p><label>X · mm<input id="workshopPieceX" type="number" step="0.1"></label><label>Y · mm<input id="workshopPieceY" type="number" step="0.1"></label><p id="workshopPieceSize" class="hint"></p><button id="workshopApplyPosition" class="btn outline" type="button">Aplicar posición</button><button id="workshopRotatePiece" class="btn outline" type="button">Girar 90°</button></div><div id="workshopPrepareExport"></div>';
 const cutting=document.querySelector('#configForm .cutting');if(cutting){$('workshopCutSettings').append(cutting);cutting.open=true;}
 const bedLabel=el('p','workshop-bed-label','Cama: se obtiene al conectar la máquina. Material: tamaño de hoja configurado.');$('workshopCutSettings').prepend(bedLabel);
 const presetLabel=document.querySelector('label[for=sheetPreset]');if(presetLabel)presetLabel.textContent='Tamaño del material / hoja';
 const exportCopy=document.querySelector('.export-copy');if(exportCopy)exportCopy.hidden=true;
 const exportPanel=document.querySelector('.export-panel');if(exportPanel)$('workshopPrepareExport').append(exportPanel);
 const catalog=el('dialog','workshop-catalog');catalog.setAttribute('aria-labelledby','workshopCatalogTitle');
 catalog.innerHTML='<div class="dialog-header"><div><span class="eyebrow">CATÁLOGO DEL TALLER</span><h2 id="workshopCatalogTitle">Elige un modelo</h2></div></div>';
 catalog.querySelector('.dialog-header').append(button('Cerrar',()=>catalog.close(),'btn quiet'));
 const catalogSection=$('modelCatalog').closest('.form-section');catalogSection.classList.remove('catalog-collapsed','is-collapsed');catalog.append(catalogSection);document.body.append(catalog);
 const modelLauncher=button('',()=>{catalogSection.classList.remove('catalog-collapsed');$('catalogToggle').setAttribute('aria-expanded','true');catalog.showModal();$('catalogSearch').focus();},'workshop-model-button');config.querySelector('.panel-head').after(modelLauncher);
 catalog.querySelectorAll('[data-model]').forEach(b=>b.addEventListener('click',()=>{catalog.close();update();}));
 const variantSection=el('section','form-section');variantSection.append(el('h3','','Tapa y variante'),$('boxVariant'));$('configForm').prepend(variantSection);
 const assemblyDetails=el('details','workshop-assembly-details');assemblyDetails.append(el('summary','','Armado, instrucciones y lista de piezas'));for(const node of [document.querySelector('.assembly-note'),document.querySelector('.notes-line'),$('pieceList')])if(node)assemblyDetails.append(node);main.append(assemblyDetails);
 for(const section of document.querySelectorAll('#configForm > section')){const heading=section.querySelector('h3');if(heading)section.dataset.propertyGroup=heading.textContent;}
 const tools=el('div','workshop-layout-tools');
 const collapse=button('Ocultar propiedades',()=>{preferences.collapsed=!preferences.collapsed;saveLayout();applyLayout();},'btn quiet');
 const widthLabel=el('label','','Panel');const width=el('input');width.type='range';width.min='260';width.max='420';width.step='10';width.value=String(preferences.width||300);width.setAttribute('aria-label','Ancho del panel de propiedades');width.oninput=()=>{preferences.width=Number(width.value);saveLayout();applyLayout();};widthLabel.append(width);
 tools.append(collapse,widthLabel,button('Restaurar distribución',()=>{preferences.width=300;preferences.collapsed=false;width.value='300';saveLayout();applyLayout();},'btn quiet'));nav.after(tools);
 const globalMachine=el('div','workshop-machine-strip');globalMachine.hidden=true;globalMachine.innerHTML='<span id="workshopMachineMessage"></span>';
 const globalStop=button('Ⅱ STOP / PAUSA',()=>app.machineControl?.pause(),'btn workshop-stop');globalMachine.append(globalStop,button('Ver trabajo',()=>show('operate'),'btn outline'));tools.after(globalMachine);
 let saveKind='prepared',renaming=null,current='design',filter={query:'',kind:'all',model:'all'},lastSelected=null,remote=null;
 const machine=mountK40(app,{host:operator,onArrange:()=>show('prepare'),onChange:()=>updateMachine(),onSave:(kind)=>savePreparation(kind)});
 app.machineControl=machine;
 const prepareActions=el('div','workshop-prepare-actions');prepareActions.append(button('Guardar preparación',()=>savePreparation('prepared')),button('Guardar plantilla',()=>savePreparation('template')),button('Posicionar y cortar',()=>show('operate'),'btn primary'));$('workshopPrepareExport').append(prepareActions);
 const operatorTools=el('div','workshop-operator-tools');operatorTools.append(button('Guardar preparación',()=>savePreparation('prepared')),button('Guardar plantilla',()=>savePreparation('template')));operator.prepend(operatorTools);
 remote=mountRemoteHost(app,machine,operatorTools);
 const nameDialog=el('dialog','workshop-name-dialog');nameDialog.innerHTML='<form><h2 id="workshopNameTitle">Guardar preparación</h2><label>Nombre<input id="workshopItemName" maxlength="80" required></label><p class="hint" id="workshopNameHint"></p><div class="workshop-inline-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn outline" type="button" id="workshopNameCancel">Cancelar</button></div></form>';document.body.append(nameDialog);
 nameDialog.querySelector('form').onsubmit=e=>{e.preventDefault();try{
  const name=$('workshopItemName').value.trim();if(!name)throw Error('Escribe un nombre.');
  if(renaming){if(renaming.kind==='design'){const all=app.designs().map(p=>p.id===renaming.id?{...p,updated:new Date().toISOString(),state:{...p.state,name}}:p);if(!app.putStorage('lzbox-projects',all))return;if(app.activeId===renaming.id)app.loadDesign(all.find(p=>p.id===renaming.id).state,renaming.id);}else writeWorkshop(storage,readWorkshop(storage).map(p=>p.id===renaming.id?{...p,name,updated:new Date().toISOString()}:p));}
  else{if(machine.busy)throw Error('Espera a que termine la operación para guardar una preparación.');const item=makeWorkshopItem({name,kind:saveKind,state:app.state,settings:machine.settings,thumb:app.thumbnail(),references:machine.referenceDesignPoints});writeWorkshop(storage,[item,...readWorkshop(storage)]);}
  nameDialog.close();renderLibrary();app.toast('Guardado en la biblioteca de este navegador.');
 }catch(e){$('workshopNameHint').textContent=e.message;}};
 $('workshopNameCancel').onclick=()=>nameDialog.close();
 function savePreparation(kind){if(!app.valid||!app.packed)return app.toast('Completa un diseño válido y su distribución.');if(machine.busy)return app.toast('Espera a que termine la operación.');saveKind=kind;renaming=null;$('workshopNameTitle').textContent=kind==='template'?'Guardar plantilla de posicionamiento':'Guardar preparación';$('workshopItemName').value=app.state.name;$('workshopNameHint').textContent='Se guardan diseño, distribución y parámetros. Las referencias físicas se vuelven a establecer en cada sesión.';nameDialog.showModal();$('workshopItemName').focus();}
 function saveLayout(){app.putStorage('lzbox-workshop-layout',preferences);}
 function applyLayout(){document.body.style.setProperty('--workshop-panel-width',Math.max(260,Math.min(420,preferences.width||300))+'px');document.body.classList.toggle('workshop-panel-collapsed',!!preferences.collapsed);collapse.textContent=preferences.collapsed?'Mostrar propiedades':'Ocultar propiedades';collapse.setAttribute('aria-expanded',String(!preferences.collapsed));}
 function show(space){if(!tabs.has(space))return;current=space;document.body.dataset.workshopSpace=space;root.hidden=!['design','prepare'].includes(space);operator.hidden=space!=='operate';library.hidden=space!=='library';config.hidden=space!=='design';dock.hidden=space!=='prepare';tools.hidden=!['design','prepare'].includes(space);for(const [id,b] of tabs){b.classList.toggle('active',id===space);b.setAttribute('aria-current',id===space?'page':'false');}
  if(space==='design')baseSetView('3d');if(space==='prepare'){app.planEdit.editing=true;baseSetView('2d');app.planViewer.fit();}if(space==='operate')machine.open();if(space==='library')renderLibrary();updateMachine();preferences.space=space;saveLayout();
 }
 const fusion=el('section','workshop-fusion');fusion.id='workshopFusion';fusion.innerHTML='<h3>Fusionar líneas de corte</h3><p>Junta bordes compatibles y corta cada tramo coincidente una sola vez por pasada. No modifica los encastres ni el kerf.</p><p id="workshopFusionSummary" role="status"></p><details id="workshopFusionDetails"><summary>Ver trayectorias únicas · hoja 1</summary><div id="workshopFusionPreview"></div></details>';
 const shared=button('Juntar piezas y fusionar cortes',()=>{if(machine.busy)return app.toast('Espera a que termine la operación.');const error=app.commit({...app.state,layoutMode:'shared',placements:null});if(error)app.toast(error);else{$('workshopFusionDetails').open=true;updateFusion();app.toast('Acomodo compartido aplicado. Revisa los tramos ahorrados antes de cortar.');}},'btn primary');shared.id='workshopFuseCuts';fusion.querySelector('p').after(shared);$('workshopCutSettings').after(fusion);
 function updateFusion(){shared.disabled=machine.busy;try{
  if(!app.valid||!app.packed)throw Error('Completa un diseño válido para preparar las trayectorias.');
  let before=0,after=0,first=null;
  for(let sheet=0;sheet<app.packed.count;sheet++){const items=app.packed.panels.filter(p=>p.sheet===sheet);if(!items.length)continue;const result=optimizeSheet(items,.01);before+=result.stats.before;after+=result.stats.after;if(sheet===0)first=result;}
  const saved=Math.max(0,before-after);$('workshopFusionSummary').textContent=`${app.state.layoutMode==='shared'?'Acomodo compartido activo. ':''}Recorrido: ${before.toFixed(1)} → ${after.toFixed(1)} mm por pasada. Ahorro: ${saved.toFixed(1)} mm (${before?(saved/before*100).toFixed(1):0}%). `+(saved>.01?'Los tramos coincidentes se envían una sola vez a la máquina.':'No hay tramos coincidentes en este acomodo; no se eliminarán líneas distintas.');
  $('workshopFusionPreview').innerHTML=first?k40Preview({bed:{width:app.state.sheetW,height:app.state.sheetH},paths:first.paths}):'';
 }catch(e){$('workshopFusionSummary').textContent=e.message;$('workshopFusionPreview').replaceChildren();}}

 const baseSetView=app.setView.bind(app);app.setView=v=>{if(current!==(v==='2d'?'prepare':'design'))show(v==='2d'?'prepare':'design');else baseSetView(v);};
 $('view3d').addEventListener('click',()=>show('design'));$('view2d').addEventListener('click',()=>show('prepare'));
 const modelTitle=()=>modelInfo[app.state.model]?.name||'Caja';
 function update(){variantSection.hidden=$('boxVariant').hidden;modelLauncher.textContent=modelTitle()+' · Cambiar modelo';const selected=app.packed?.panels.find(p=>p.id===app.planEdit.selected);if(selected){$('workshopPieceName').textContent=selected.name;$('workshopPieceSize').textContent=`${selected.bw.toFixed(2)} × ${selected.bh.toFixed(2)} mm · giro ${selected.rotation||0}°`;}else{$('workshopPieceName').textContent='Selecciona una pieza en el plano.';$('workshopPieceSize').textContent='';}
  if(selected?.id!==lastSelected||document.activeElement!==$('workshopPieceX')&&document.activeElement!==$('workshopPieceY')){if(selected){$('workshopPieceX').value=selected.x;$('workshopPieceY').value=selected.y;}lastSelected=selected?.id;}
  for(const id of ['workshopPieceX','workshopPieceY','workshopApplyPosition','workshopRotatePiece'])$(id).disabled=!selected;
  updateFusion();if(current==='library')renderLibrary();updateMachine();
 }
 const refreshPlanTools=app.planEdit.refreshTools.bind(app.planEdit);app.planEdit.refreshTools=(...args)=>{refreshPlanTools(...args);update();};
 $('workshopApplyPosition').onclick=()=>{const x=Number($('workshopPieceX').value),y=Number($('workshopPieceY').value);if(!Number.isFinite(x)||!Number.isFinite(y))return app.toast('Coordenadas inválidas.');app.planEdit.setPlacement(app.planEdit.selected,q=>({...q,x,y}));};$('workshopRotatePiece').onclick=()=>app.planEdit.rotate();
 function updateMachine(){if(!app.machineControl)return;const m=app.machineControl;const bed=m.machine?.connected?m.machine.bed:null;if(JSON.stringify(app.displayBed)!==JSON.stringify(bed)){app.displayBed=bed;if(app.view==='2d')app.redrawPlan();}bedLabel.textContent=bed?`Cama de máquina: ${bed.width} × ${bed.height} mm. El rectángulo interior es el material.`:'Cama: se obtiene al conectar la máquina. Material: tamaño de hoja configurado.';live.textContent=m.stateLabel;live.dataset.busy=String(m.busy);globalMachine.hidden=!m.busy||current==='operate';$('workshopMachineMessage').textContent=m.stateLabel+' · '+m.message;globalStop.disabled=!m.canPause;remote?.publish();}
 function allItems(){return [...app.designs().map(p=>({...p,kind:'design',name:p.state.name})),...readWorkshop(storage)].sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));}
 library.innerHTML='<header class="workshop-library-head"><div><span class="eyebrow">BIBLIOTECA DEL TALLER</span><h1>Diseños y trabajos</h1><p>Guardados en este navegador. Las plantillas requieren volver a referenciar la máquina.</p></div><div id="workshopLibraryActions"></div></header><div class="workshop-library-filters"><input id="workshopSearch" type="search" placeholder="Buscar por nombre, modelo o material…" aria-label="Buscar en biblioteca"><select id="workshopKind" aria-label="Tipo de elemento"><option value="all">Todos los tipos</option><option value="design">Diseños editables</option><option value="prepared">Trabajos preparados</option><option value="template">Plantillas de posicionamiento</option></select><select id="workshopModelFilter" aria-label="Filtrar por modelo"><option value="all">Todos los modelos</option></select><span id="workshopLibraryCount"></span></div><div id="workshopLibraryGrid" class="workshop-library-grid"></div><div id="workshopLibraryUndo" class="workshop-library-undo" hidden></div>';
 for(const [id,info] of Object.entries(modelInfo)){const o=el('option','',info.name);o.value=id;$('workshopModelFilter').append(o);}
 for(const [id,key] of [['workshopSearch','query'],['workshopKind','kind'],['workshopModelFilter','model']])$(id).addEventListener('input',()=>{filter[key]=$(id).value;renderLibrary();});
 $('workshopLibraryActions').append(button('Guardar diseño actual',()=>app.quickSave(),'btn primary'),button('Respaldo de diseños',()=>{$('projectsBtn').dataset.legacy='1';app.showProjects();$('projectsDialog').showModal();}),button('Exportar biblioteca',()=>exportLibrary()));
 $('projectsBtn').onclick=()=>show('library');
 function renderLibrary(){const list=filterWorkshop(allItems(),filter),grid=$('workshopLibraryGrid');if(!grid)return;grid.replaceChildren();$('workshopLibraryCount').textContent=`${list.length} elementos`;
  if(!list.length){grid.append(el('p','workshop-empty','No hay elementos que mostrar. Guarda un diseño o una preparación para volver a utilizarlo.'));return;}
  for(const item of list){const card=el('article','workshop-library-card'),preview=el('div','workshop-library-thumb');if(typeof item.thumb==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(item.thumb)){const img=el('img');img.src=item.thumb;img.alt='Vista de '+item.name;preview.append(img);}else preview.append(el('span','',modelInfo[item.state.model]?.name||'Diseño'));
   const info=el('div','workshop-library-info');info.append(el('span','workshop-item-kind',({design:'Diseño editable',prepared:'Trabajo preparado',template:'Plantilla de posicionamiento'})[item.kind]),el('h2','',item.name),el('p','',`${modelInfo[item.state.model]?.name||item.state.model} · ${item.state.width} × ${item.state.depth} × ${item.state.height} mm`),el('p','',`${item.state.thickness} mm · ${item.state.texture||'MDF'} · ${new Date(item.updated).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})}`));
   if(item.requiresReference)info.append(el('p','workshop-reference-note','Requiere establecer referencias físicas.'));
   const actions=el('div','workshop-library-card-actions');actions.append(button('Abrir',()=>openItem(item),'btn primary'),button('Duplicar',()=>duplicate(item)),button('Renombrar',()=>{renaming=item;$('workshopNameTitle').textContent='Renombrar';$('workshopItemName').value=item.name;$('workshopNameHint').textContent='';nameDialog.showModal();$('workshopItemName').focus();}),button('Eliminar',()=>remove(item),'btn quiet'));card.append(preview,info,actions);grid.append(card);
  }
 }
 function openItem(item){if(machine.busy)return app.toast('Hay una operación de máquina activa. Espera para cargar otro trabajo.');try{app.loadDesign(item.state,item.kind==='design'?item.id:null);if(item.kind!=='design'){machine.restoreSettings(item.settings);machine.restoreReferencePoints(item.references||[]);}show(item.kind==='design'?'design':'prepare');app.toast(item.kind==='template'?'Plantilla cargada. Establece sus referencias en Operar máquina.':'Trabajo cargado.');}catch(e){app.toast(e.message);}}
 function duplicate(item){try{if(item.kind==='design'){const copy={...structuredClone(item),id:crypto.randomUUID(),updated:new Date().toISOString()};copy.state.name=(item.name+' (copia)').slice(0,80);delete copy.kind;delete copy.name;if(!app.putStorage('lzbox-projects',[copy,...app.designs()]))return;}else{const copy={...structuredClone(item),id:crypto.randomUUID(),name:(item.name+' (copia)').slice(0,80),updated:new Date().toISOString()};writeWorkshop(storage,[copy,...readWorkshop(storage)]);}renderLibrary();app.toast('Copia guardada.');}catch(e){app.toast(e.message);}}
 function remove(item){try{const before=item.kind==='design'?app.designs():readWorkshop(storage),after=before.filter(p=>p.id!==item.id);if(item.kind==='design'){if(!app.putStorage('lzbox-projects',after))return;}else writeWorkshop(storage,after);renderLibrary();const undo=$('workshopLibraryUndo');undo.hidden=false;undo.replaceChildren(el('span','',`«${item.name}» eliminado. `),button('Deshacer',()=>{try{const now=item.kind==='design'?app.designs():readWorkshop(storage);if(!now.some(p=>p.id===item.id)){if(item.kind==='design')app.putStorage('lzbox-projects',[item,...now]);else writeWorkshop(storage,[item,...now]);}undo.hidden=true;renderLibrary();}catch(e){app.toast(e.message);}}));}catch(e){app.toast(e.message);}}
 function exportLibrary(){const blob=new Blob([JSON.stringify({app:'LZ Box Workshop',version:1,designs:app.designs(),workshop:readWorkshop(storage)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='LZ-Box-biblioteca.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 app.onUpdate(update);document.addEventListener('storage',()=>{if(current==='library')renderLibrary();});
 // Saved designs can change without a geometry update (save and rename).
 for(const id of ['confirmSave','saveCopy'])$(id)?.addEventListener('click',()=>{if(current==='library')renderLibrary();});
 app.workshop={show,get space(){return current;},savePreparation};applyLayout();show(spaces.some(s=>s[0]===preferences.space)?preferences.space:'design');update();if(new URLSearchParams(document.location.search).get('celular')==='1'){show('operate');remote.open();}return app.workshop;
}
if(typeof document!=='undefined'){
 if(globalThis.lzApp)mountWorkshop(globalThis.lzApp);else{let count=0;const timer=setInterval(()=>{if(globalThis.lzApp||++count>200){clearInterval(timer);if(globalThis.lzApp)mountWorkshop(globalThis.lzApp);}},25);}
}
