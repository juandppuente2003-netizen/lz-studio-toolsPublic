const MATERIAL_PRESET_KEY='lzbox-material-presets';

export const MATERIAL_PRESETS=Object.freeze([
 {id:'mdf-3-diodo',name:'MDF 3 mm · láser diodo',thickness:3,clearance:.1,kerf:.15,builtIn:true},
 {id:'mdf-3-co2',name:'MDF 3 mm · CO2',thickness:3,clearance:.05,kerf:.12,builtIn:true},
 {id:'mdf-2-5',name:'MDF 2.5 mm',thickness:2.5,clearance:.1,kerf:.15,builtIn:true},
 {id:'mdf-5-5-co2',name:'MDF 5.5 mm · CO2',thickness:5.5,clearance:.1,kerf:.2,builtIn:true},
 {id:'acrilico-3-co2',name:'Acrílico 3 mm · CO2',thickness:3,clearance:.05,kerf:.15,builtIn:true}
].map(Object.freeze));

const finite=value=>Number.isFinite(Number(value));
const rounded=(value,places=2)=>Number(Number(value).toFixed(places));
const sameNumber=(a,b)=>finite(a)&&finite(b)&&Math.abs(Number(a)-Number(b))<1e-9;

export function validateMaterialPreset(preset){
 if(!preset||typeof preset!=='object')return 'El preset no es válido.';
 if(!String(preset.name||'').trim())return 'Escribe un nombre para el preset.';
 if(!finite(preset.thickness)||Number(preset.thickness)<1||Number(preset.thickness)>12)return 'El espesor debe estar entre 1 y 12 mm.';
 if(!finite(preset.clearance)||Number(preset.clearance)<0||Number(preset.clearance)>1)return 'La holgura debe estar entre 0 y 1 mm.';
 if(!finite(preset.kerf)||Number(preset.kerf)<0||Number(preset.kerf)>1)return 'El kerf debe estar entre 0 y 1 mm.';
 return null;
}

export function presetMatches(state,preset){
 return !!state&&!!preset&&sameNumber(state.thickness,preset.thickness)&&sameNumber(state.clearance,preset.clearance)&&sameNumber(state.kerf,preset.kerf);
}

export function findMatchingPreset(state,presets=MATERIAL_PRESETS){
 return presets.find(preset=>presetMatches(state,preset))||null;
}

export function matchingPresetId(state,presets=MATERIAL_PRESETS){
 return findMatchingPreset(state,presets)?.id||'';
}

export const matchPreset=findMatchingPreset;

export function normalizeSearch(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').replace(/\s+/g,' ').trim();
}

function polygonArea(points){
 if(!Array.isArray(points)||points.length<3)return 0;
 return Math.abs(points.reduce((sum,[x,y],index)=>{
  const next=points[(index+1)%points.length];
  return sum+Number(x)*Number(next?.[1])-Number(next?.[0])*Number(y);
 },0)/2);
}

function panelNetArea(panel){
 return Math.max(0,polygonArea(panel?.p)-((panel?.holes||[]).reduce((sum,hole)=>sum+polygonArea(hole),0)));
}

function listNames(ids,panels){
 const names=new Map((panels||[]).map(panel=>[String(panel.id),panel.name||panel.id]));
 return [...new Set((ids||[]).map(id=>names.get(String(id))||String(id)))];
}

function joinedNames(names,limit=4){
 const visible=names.slice(0,limit).join(', ');
 return names.length>limit?`${visible} y ${names.length-limit} más`:visible;
}

export function fabricationChecks(state={},panels=[],packed=null){
 const checks=[];
 const t=Number(state.thickness),clearance=Number(state.clearance),kerf=Number(state.kerf),finger=Number(state.finger);
 const sheetW=Number(state.sheetW),sheetH=Number(state.sheetH),minWeb=Number(state.minWeb);
 const unplaced=listNames(packed?.unplaced,panels);
 if(unplaced.length)checks.push({level:'error',text:`No caben en las hojas configuradas: ${joinedNames(unplaced)}.`});
 else if(!packed&&panels.length)checks.push({level:'error',text:'No se pudo completar el acomodo en las hojas configuradas.'});

 if(finite(sheetW)&&finite(sheetH)&&sheetW>0&&sheetH>0){
  const oversized=panels.filter(panel=>{
   const w=Number(panel.w),h=Number(panel.h);
   return finite(w)&&finite(h)&&((w>sheetW||h>sheetH)&&(h>sheetW||w>sheetH));
  }).map(panel=>panel.name||panel.id);
  if(oversized.length)checks.push({level:'error',text:`Exceden el tamaño de hoja incluso al girarlas: ${joinedNames(oversized)}.`});
 }

 if(!finite(clearance)||clearance<0||clearance>.5)checks.push({level:'error',text:'La holgura debe mantenerse entre 0 y 0.5 mm para generar uniones válidas.'});
 if(finite(kerf)&&kerf===0)checks.push({level:'warn',text:'Kerf en 0 mm: calibra el ancho real del corte antes de fabricar.'});
 else if(finite(kerf)&&finite(clearance)&&finite(t)&&kerf>clearance+t*.2)checks.push({level:'warn',text:'El kerf es alto respecto al espesor y la holgura; verifica la probeta de encaje.'});
 if(finite(finger)&&finite(t)&&finger<2*t)checks.push({level:'warn',text:`El diente mide menos de dos espesores (${rounded(2*t)} mm).`});

 if(finite(t)&&t>0){
  // Rieles y chavetas pueden ser angostos por diseño; se avisa solo por debajo del puente mínimo.
  const limit=Math.max(2*t,finite(minWeb)?minWeb:0);
  const narrow=panels.filter(panel=>Math.min(Number(panel.w),Number(panel.h))<limit).map(panel=>panel.name||panel.id);
  if(narrow.length)checks.push({level:'warn',text:`Piezas más angostas que el puente mínimo (${rounded(limit)} mm): ${joinedNames(narrow)}. Sujétalas o verifica que no se deformen con el calor.`});
 }

 const sheets=Math.max(0,Number(packed?.count)||0);
 const netArea=panels.reduce((sum,panel)=>sum+panelNetArea(panel),0);
 if(sheets&&finite(sheetW)&&finite(sheetH)&&sheetW>0&&sheetH>0){
  const use=100*netArea/(sheets*sheetW*sheetH);
  checks.push({level:'ok',text:`Uso neto estimado: ${rounded(use,1)}% de ${sheets} hoja${sheets===1?'':'s'}.`});
 }
 checks.push({level:'ok',text:`${panels.length} pieza${panels.length===1?'':'s'} · ${sheets||'sin'} hoja${sheets===1?'':'s'} acomodada${sheets===1?'':'s'}.`});
 return checks;
}

function dimensionsExactlyMatch(a,b){
 return sameNumber(a?.w,b?.w)&&sameNumber(a?.h,b?.h);
}

function escapeRegExp(value){
 return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function pairedNameStem(panel,panels){
 const name=String(panel?.name||panel?.id||'Pieza').trim();
 const match=name.match(/^(.*)\s+(izquierdo|izquierda|derecho|derecha)$/i);
 if(!match)return name;
 const side=normalizeSearch(match[2]);
 const wantsLeft=side.startsWith('derech');
 const counterpart=new RegExp(`^${escapeRegExp(match[1])}\\s+${wantsLeft?'izquierd[oa]':'derech[oa]'}$`,'i');
 return panels.some(other=>other!==panel&&counterpart.test(String(other?.name||''))&&dimensionsExactlyMatch(panel,other))?match[1].trim():name;
}

export function cutList(panels=[],thickness=0){
 const groups=new Map();
 for(const panel of panels){
  const w=rounded(panel?.w),h=rounded(panel?.h),name=pairedNameStem(panel,panels);
  const key=`${normalizeSearch(name)}\u0000${w.toFixed(2)}\u0000${h.toFixed(2)}`;
  const current=groups.get(key);
  if(current){
   current.qty++;
   current.area=rounded(current.w*current.h*current.qty,4);
  }else groups.set(key,{name,qty:1,w,h,thickness:Number(thickness),area:rounded(w*h,4)});
 }
 return [...groups.values()];
}

function csvCell(value){
 const text=String(value??'');
 return /[;"\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

function csvNumber(value){
 const number=Number(value);
 return Number.isFinite(number)?String(number):'';
}

export function cutListCsv(rows=[]){
 const lines=['Pieza;Cantidad;Ancho mm;Alto mm;Espesor mm'];
 for(const row of rows)lines.push([csvCell(row.name),csvNumber(row.qty),csvNumber(row.w),csvNumber(row.h),csvNumber(row.thickness)].join(';'));
 return '\uFEFF'+lines.join('\r\n')+'\r\n';
}

export const cutListCSV=cutListCsv;

function element(tag,className,text){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=text;
 return node;
}

function readUserPresets(app){
 const stored=app.readStorage(MATERIAL_PRESET_KEY,[]);
 if(!Array.isArray(stored))return [];
 return stored.filter(preset=>!validateMaterialPreset(preset)).slice(0,50).map((preset,index)=>({
  id:String(preset.id||`usuario-${index}`).slice(0,80),
  name:String(preset.name).trim().slice(0,60),
  thickness:Number(preset.thickness),clearance:Number(preset.clearance),kerf:Number(preset.kerf)
 }));
}

function mountMaterialPresets(app){
 const mount=document.getElementById('materialPresetsMount');
 if(!mount)return()=>{};
 const label=element('label','workflow-label','Preset de material');
 const select=element('select','workflow-select');
 select.setAttribute('aria-label','Preset de material');
 const save=element('button','btn outline workflow-button','Guardar preset');save.type='button';
 const remove=element('button','btn quiet workflow-button','Eliminar');remove.type='button';
 const controls=element('div','preset-controls');controls.append(select,save,remove);
 const editor=element('form','preset-editor');editor.hidden=true;
 const input=element('input','preset-name');input.type='text';input.maxLength=60;input.placeholder='Nombre del preset';input.setAttribute('aria-label','Nombre del preset');
 const confirm=element('button','btn primary workflow-button','Confirmar');confirm.type='submit';
 const cancel=element('button','btn quiet workflow-button','Cancelar');cancel.type='button';
 editor.append(input,confirm,cancel);mount.replaceChildren(label,controls,editor);
 let userPresets=readUserPresets(app);
 const all=()=>[...MATERIAL_PRESETS,...userPresets];

 function render(){
  const matched=matchingPresetId(app.state,all());
  const custom=element('option','','Personalizado');custom.value='';
  const builtGroup=element('optgroup');builtGroup.label='Incluidos';
  const userGroup=element('optgroup');userGroup.label='Mis presets';
  for(const preset of all()){
   const option=element('option','',preset.name);option.value=preset.id;
   (preset.builtIn?builtGroup:userGroup).append(option);
  }
  select.replaceChildren(custom,builtGroup,...(userPresets.length?[userGroup]:[]));
  select.value=matched;
  remove.disabled=!userPresets.some(preset=>preset.id===select.value);
 }

 select.addEventListener('change',()=>{
  const preset=all().find(item=>item.id===select.value);
  remove.disabled=!preset||!!preset.builtIn;
  if(!preset)return;
  const next={...app.state,thickness:preset.thickness,clearance:preset.clearance,kerf:preset.kerf};
  if(Number(next.finger)<2*preset.thickness)next.finger=Math.ceil(2*preset.thickness);
  const error=app.commit(next);
  if(error){render();app.toast(error);}else app.toast(`Preset aplicado: ${preset.name}.`);
 });
 save.addEventListener('click',()=>{editor.hidden=false;input.value='';input.focus();});
 cancel.addEventListener('click',()=>{editor.hidden=true;input.value='';});
 editor.addEventListener('submit',event=>{
  event.preventDefault();
  const preset={id:`usuario-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:input.value.trim(),thickness:Number(app.state.thickness),clearance:Number(app.state.clearance),kerf:Number(app.state.kerf)};
  const error=validateMaterialPreset(preset);
  if(error){app.toast(error);input.focus();return;}
  userPresets.push(preset);
  if(!app.putStorage(MATERIAL_PRESET_KEY,userPresets)){userPresets.pop();return;}
  editor.hidden=true;render();select.value=preset.id;remove.disabled=false;app.toast('Preset guardado.');
 });
 remove.addEventListener('click',()=>{
  const index=userPresets.findIndex(preset=>preset.id===select.value);
  if(index<0)return;
  userPresets.splice(index,1);
  if(!app.putStorage(MATERIAL_PRESET_KEY,userPresets)){userPresets=readUserPresets(app);render();return;}
  render();app.toast('Preset eliminado.');
 });
 render();
 return render;
}

function renderFabricationChecks(app){
 const mount=document.getElementById('fabricationChecks');
 if(!mount)return;
 const checks=fabricationChecks(app.state,app.panels,app.packed);
 const details=element('details','fabrication-details'),hasError=checks.some(check=>check.level==='error');
 // conserva lo que eligió el usuario; solo se abre solo cuando aparece un error nuevo
 const prev=mount.querySelector('details');details.open=hasError&&!mount.dataset.error?true:prev?prev.open:hasError;mount.dataset.error=hasError?'1':'';
 const summary=element('summary');
 const title=element('strong','','Comprobaciones de fabricación');
 const errors=checks.filter(check=>check.level==='error').length;
 const badge=element('span','fabrication-count',errors?`${errors} pendiente${errors===1?'':'s'}`:'Sin bloqueos');
 summary.append(title,badge);
 const list=element('ul','fabrication-list');
 const symbols={error:'×',warn:'!',ok:'✓'};
 for(const check of checks){
  const item=element('li',`fabrication-${check.level}`);
  const icon=element('span','fabrication-icon',symbols[check.level]);icon.setAttribute('aria-hidden','true');
  item.append(icon,element('span','',check.text));list.append(item);
 }
 details.append(summary,list);mount.replaceChildren(details);
}

function formatUiNumber(value,places=2){
 return Number(value).toLocaleString('es-MX',{maximumFractionDigits:places});
}

function downloadCsv(rows,state){
 const csv=cutListCsv(rows),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 const base=normalizeSearch(state?.name||'lista-de-corte').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'lista-de-corte';
 link.href=url;link.download=`${base}-lista-de-corte.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

function renderCutList(app){
 const mount=document.getElementById('cutListMount');
 if(!mount)return;
 const rows=cutList(app.panels,app.state.thickness);
 const head=element('div','cut-list-head');head.append(element('h3','','Lista de corte'));
 const download=element('button','btn outline workflow-button','Descargar CSV');download.type='button';download.disabled=!rows.length;download.addEventListener('click',()=>downloadCsv(rows,app.state));head.append(download);
 const table=element('table','cut-list-table');
 const thead=document.createElement('thead'),header=document.createElement('tr');
 for(const text of ['Pieza','Cant.','Ancho','Alto','Espesor'])header.append(element('th','',text));
 thead.append(header);const tbody=document.createElement('tbody');
 for(const row of rows){
  const tr=document.createElement('tr');
  for(const value of [row.name,row.qty,`${formatUiNumber(row.w)} mm`,`${formatUiNumber(row.h)} mm`,`${formatUiNumber(row.thickness)} mm`])tr.append(element('td','',value));
  tbody.append(tr);
 }
 table.append(thead,tbody);
 const pieces=rows.reduce((sum,row)=>sum+row.qty,0),area=rows.reduce((sum,row)=>sum+row.area,0)/100;
 const totals=element('p','cut-list-totals',`${pieces} pieza${pieces===1?'':'s'} · área envolvente ${formatUiNumber(area)} cm²`);
 mount.replaceChildren(head,table,totals);
}

function mountProjectSearch(){
 const mount=document.getElementById('projectSearchMount'),list=document.getElementById('projectsList');
 if(!mount||!list)return;
 const input=element('input','project-search');input.type='search';input.placeholder='Buscar diseños…';input.setAttribute('aria-label','Buscar diseños');
 const count=element('span','project-search-count','0 de 0');
 const row=element('div','project-search-row');row.append(input,count);
 const empty=element('p','project-search-empty','No hay diseños que coincidan con la búsqueda.');empty.hidden=true;
 mount.replaceChildren(row,empty);
 let applying=false;
 function apply(){
  if(applying)return;applying=true;
  const query=normalizeSearch(input.value),items=[...list.querySelectorAll('.saved-item')];let shown=0;
  for(const item of items){
   const name=item.querySelector('h3')?.textContent||'';
   const model=item.querySelector('p:not(.saved-date)')?.textContent||'';
   const matches=!query||normalizeSearch(`${name} ${model}`).includes(query);
   item.hidden=!matches;if(matches)shown++;
  }
  count.textContent=`${shown} de ${items.length}`;
  empty.hidden=shown!==0||!query;
  const nativeEmpty=list.querySelector(':scope > .empty');if(nativeEmpty)nativeEmpty.hidden=!!query;
  applying=false;
 }
 input.addEventListener('input',apply);
 const observer=new MutationObserver(apply);observer.observe(list,{childList:true});
 const dialog=document.getElementById('projectsDialog');
 if(dialog){observer.observe(dialog,{attributes:true,attributeFilter:['open']});dialog.addEventListener('toggle',apply);}
 apply();
}

function init(app){
 const refreshPresets=mountMaterialPresets(app);
 const refresh=()=>{refreshPresets();renderFabricationChecks(app);renderCutList(app);};
 refresh();app.onUpdate(refresh);mountProjectSearch();
}

function ready(fn){
 if(globalThis.lzApp){fn(globalThis.lzApp);return;}
 let attempts=0;const timer=setInterval(()=>{if(globalThis.lzApp||++attempts>200){clearInterval(timer);if(globalThis.lzApp)fn(globalThis.lzApp);}},25);
}

if(typeof document!=='undefined')ready(init);
