import {createPeer,gatherDescription,encodePairing,decodePairing,PeerMessageReader,UPLOAD_CHUNK,UPLOAD_MAX} from './peer-transport.js?v=4';
import {pairingRequest,parsePairingLink} from './peer-signaling.js?v=1';
// Celular: Control / Trabajos / Biblioteca. La computadora conserva el USB y ejecuta cada orden;
// este celular solo envía órdenes explícitas (una por pulsación) y nunca reintenta en silencio.
const $=id=>document.getElementById(id);let peer=null,channel=null,session=null,state=null,seq=0,awaiting=false,library=null,libFilter='all',reviewOpen=false;const pending=new Map(),uploads=new Map();let parametersDirty=false,lastAwaitAlert=null;
const status=message=>{$('remoteStatus').textContent=message;};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const fmt=(n,d=1)=>Number.isFinite(n)?(Math.round(n*10**d)/10**d).toLocaleString('es-MX',{maximumFractionDigits:d}):'—';
const fmtTime=s=>{if(!Number.isFinite(s)||s<=0)return '—';s=Math.round(s);const m=Math.floor(s/60),r=s%60;return m?`${m} min ${String(r).padStart(2,'0')} s`:`${r} s`;};
const open=()=>channel?.readyState==='open';
const job=()=>state?.job||null;
function controls(){
 const owner=state?.owner==='phone',idle=owner&&!state?.busy&&!awaiting&&open();
 for(const id of ['remoteUp','remoteLeft','remoteRight','remoteDown'])$(id).disabled=!idle||!state?.hasPosition;
 for(const id of ['remoteSettings','remoteSpeed','remotePasses'])$(id).disabled=!idle;
 $('remoteHome').disabled=!idle;$('remoteUnlock').disabled=!idle||!state?.canUnlock;$('remotePulse').disabled=!idle||!state?.canPulse;
 $('remoteFrame').disabled=!idle||!(state?.canFrame??state?.canRun);$('remoteCut').disabled=!idle||!state?.canRun;
 $('remoteStop').disabled=!state?.canPause||!open();$('remoteResume').disabled=!owner||!state?.canResume||awaiting;$('remoteCancel').disabled=!state?.busy||!open();
 $('remotePaused').hidden=!['pausing','paused','resuming','error','unknown'].includes(state?.state);
 $('remoteAwait').hidden=state?.state!=='awaiting';$('remoteContinue').disabled=!owner||!state?.canContinue||awaiting||!open();
 for(const b of document.querySelectorAll('[data-origin]')){b.disabled=!idle||(b.dataset.origin==='current'&&!state?.hasPosition);b.setAttribute('aria-pressed',String(state?.origin===b.dataset.origin));}
 for(const b of document.querySelectorAll('[data-source]')){b.disabled=!idle;b.setAttribute('aria-pressed',String((job()?.source||state?.source)===b.dataset.source));}
 for(const n of document.querySelectorAll('#tabJobs input,#tabJobs select,#tabJobs button:not([data-source]):not([data-origin]),#tabLibrary .rm-lib button'))n.disabled=!idle;
 $('remoteImport').disabled=$('remoteAdd').disabled=!idle;$('remoteImportLabel').classList.toggle('is-disabled',!idle);$('remoteAddLabel').classList.toggle('is-disabled',!idle);
 $('remoteLibRefresh').disabled=!open();
}
function disconnected(){if(!session&&!state)return;const was=!!state;state=null;awaiting=false;$('remoteLinkState').textContent='Reconectando…';for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Enlace desconectado. La orden no se reenvió.'));}pending.clear();for(const u of uploads.values())u.reject(Error('Enlace desconectado.'));uploads.clear();releaseWake();const c=channel,pr=peer;channel=null;peer=null;if(c){c.onclose=null;try{c.close();}catch{}}if(pr){pr.onconnectionstatechange=null;try{pr.close();}catch{}}controls();
 if(saved()){status((was?'Se perdió el enlace. ':'')+'Reconectando con la computadora… No se repetirá ninguna orden.');scheduleReconnect(1500);}else status('Vuelve a enlazar desde la computadora. No se repetirá ninguna orden.');}
// Solo se acepta el subconjunto de SVG que genera Box; nunca marcado arbitrario.
function safePreview(markup){
 const svg=markup?new DOMParser().parseFromString(markup,'image/svg+xml').documentElement:null;
 const tags=new Set(['svg','rect','path','circle','image']);const attributes=new Set(['xmlns','viewBox','role','aria-label','width','height','fill','stroke','stroke-width','d','cx','cy','r','x','y','href','preserveAspectRatio','opacity','fill-opacity','stroke-dasharray']);
 const ok=n=>tags.has(n.localName)&&[...n.attributes].every(a=>attributes.has(a.name)&&!/[<>]/.test(a.value)&&(a.name!=='href'||(n.localName==='image'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.value))));
 return svg?.localName==='svg'&&[svg,...svg.querySelectorAll('*')].every(ok)?svg:null;
}
const stateLabel=s=>{const map={awaiting:'Esperando que continúes',continuing:'Continuando',pulsing:'Pulso láser',sending:'Ejecutando',sent:'Datos enviados · esperando fin',pausing:'Solicitando pausa',paused:'En pausa',resuming:'Reanudando',cancelling:'Cancelando',recovering:'Liberando USB',error:'Revisar USB',unknown:'Sin respuesta'};if(s.preparing)return 'Preparando';if(map[s.state])return map[s.state];if(!s.connected)return 'Máquina desconectada';if(s.finished==='finished')return 'Terminado';if(s.finished==='cancelled')return 'Cancelado';return 'Lista';};
function receive(message){
 if(message.type==='reply'){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.ok?p.resolve():p.reject(Error(message.error));}return;}
 if(message.type==='upload-reply'){const u=uploads.get(message.upload);if(u){uploads.delete(message.upload);message.ok?u.resolve():u.reject(Error(message.error||'No se pudo importar.'));}return;}
 if(message.session!==session)return;
 if(message.type==='library'){library=message;renderLibrary();return;}
 if(message.type!=='state')return;
 state=message;$('remotePairing').hidden=true;$('remoteMachine').hidden=false;$('remotePersist').hidden=!saved();$('remoteLinkState').textContent='Enlace local cifrado';
 const label=stateLabel(message);$('remoteMachineState').textContent=(message.connected?'Puente conectado · K40 · ':'')+label;$('remoteLed').dataset.state=message.connected?(['error','unknown'].includes(message.state)?'error':message.busy?'busy':'ok'):'off';
 $('remoteOwner').textContent=message.owner==='phone'?'Control de movimientos: este celular.':'La computadora tiene el control; puedes consultar y pedir Stop.';
 $('remoteJobName').textContent=message.name;
 const j=job();$('remoteJobMeta').textContent=j?.source==='import'&&j.file?`${j.objects} objetos · ${fmt(j.bounds?.width)} × ${fmt(j.bounds?.height)} mm`:'Diseño Box · corte';
 $('remotePosition').innerHTML=Array.isArray(message.position)?`<span>X <b>${message.position[0].toFixed(2)}</b></span><span>Y <b>${message.position[1].toFixed(2)}</b></span>`:message.railUnlocked?'Riel libre · mueve a mano y luego haz Home':'Sin referencia · haz Home';
 if(message.preview!==undefined){const svg=safePreview(message.preview);$('remotePreview').replaceChildren(...(svg?[document.importNode(svg,true)]:[]));const copy=svg?document.importNode(svg,true):null;$('remoteJobPreview').replaceChildren(...(copy?[copy]:[]));}
 // Estado listo / problema
 const ready=!message.busy&&message.canRun,title=message.busy?label:ready?'Lista para enviar':message.connected?'Revisa el trabajo':'Conecta la máquina en la computadora';
 $('remoteReadyTitle').textContent=title;$('remoteReadyText').textContent=message.busy?message.message:ready?'Recorre el marco para comprobar la colocación antes de iniciar.':(message.problem||message.message||'');$('remoteReady').dataset.state=message.busy?'busy':ready?'ok':'warn';
 if(!parametersDirty&&document.activeElement!==$('remoteSpeed'))$('remoteSpeed').value=message.settings?.speed||10;if(!parametersDirty&&document.activeElement!==$('remotePasses'))$('remotePasses').value=message.settings?.passes||1;
 $('remoteTime').textContent=message.estimatedSeconds?`Transcurrido ${fmtTime(message.elapsedSeconds||0)} · restante estimado ${fmtTime(Math.max(0,message.estimatedSeconds-(message.elapsedSeconds||0)))}${message.elapsedSeconds>=message.estimatedSeconds?' · esperando confirmación de la placa':''}`:j?.source==='import'&&j.seconds?`Tiempo estimado: ${fmtTime(j.seconds)} (aproximado)`:'';
 $('remoteOriginNote').textContent=message.origin==='current'?'El diseño empieza en la posición actual del cabezal.':'El envío hace Home y coloca el diseño según la cama.';
 if(message.state==='awaiting'){const n=message.parts?.names?.[message.parts.index+1];$('remoteAwaitText').textContent=message.message;$('remoteContinue').textContent=n?`Continuar con «${n}»`:'Continuar';if(lastAwaitAlert!==message.parts?.index){lastAwaitAlert=message.parts?.index;try{navigator.vibrate?.([200,100,200]);}catch{}}}else lastAwaitAlert=null;
 renderJob();status(message.message);controls();
}
function renderJob(){
 const j=job(),imported=(j?.source||state?.source)==='import';
 $('remoteImportBlock').hidden=!imported;$('remoteBoxBlock').hidden=imported;
 $('remoteFileName').textContent=j?.file?.name||'Sin archivo';
 $('remoteFileMeta').textContent=j?.file?`${j.objects} objetos · archivo ${fmt(j.dims?.width)} × ${fmt(j.dims?.height)} mm · ${j.savedWhere==='both'?'en tu cuenta':j.savedWhere==='local'?'en la computadora':'sin guardar'}`:'Importa un SVG desde este celular o desde la computadora.';
 const list=$('remoteIssues');list.replaceChildren(...(j?.issues||[]).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 for(const [id,key,k] of [['remotePlaceX','x',1],['remotePlaceY','y',1],['remotePlaceScale','scale',100],['remotePlaceRot','rotation',1]])if(document.activeElement!==$(id)&&j?.placement)$(id).value=+(j.placement[key]*k).toFixed(2);
 const ops=$('remoteOps');
 if(!ops.contains(document.activeElement)){
  ops.replaceChildren();$('remoteOpCount').textContent=j?.ops?`(${j.ops.length})`:'';
  for(const op of j?.ops||[]){
   const card=document.createElement('article');card.className='rm-op'+(op.enabled?'':' is-off')+(op.empty?' is-empty':'');card.dataset.type=op.type;
   card.innerHTML=`<label class="rm-op-head"><input type="checkbox" ${op.enabled?'checked':''} aria-label="Activar ${esc(op.name)}"><span class="rm-op-icon" aria-hidden="true"></span><strong>${esc(op.name)}</strong></label><div class="rm-fields"><label>Velocidad · mm/s<input type="number" class="rm-op-speed" min="${op.range[0]}" max="${op.range[1]}" value="${op.speed}" inputmode="decimal"></label><label>Pasadas<input type="number" class="rm-op-passes" min="1" max="10" step="1" value="${op.passes}" inputmode="numeric"></label></div>${j.board==='M3'?`<div class="rm-fields"><label>Potencia · %<input type="number" class="rm-op-power" min="1" max="100" value="${op.power??''}" inputmode="numeric"></label></div>`:''}${op.index>0?`<label class="rm-check"><input type="checkbox" class="rm-op-pause" ${op.pause?'checked':''}> Pausar antes y preguntar</label>`:''}<small>${op.empty?'Sin elementos asignados':'≈ '+fmtTime(op.seconds)} · ${j.board==='M3'?'Potencia por USB (M3).':'Potencia: perilla del panel (M2).'}</small>`;
   card.querySelector('input[type=checkbox]').onchange=e=>command('op',{id:op.id,enabled:e.target.checked});
   card.querySelector('.rm-op-speed').onchange=e=>command('op',{id:op.id,speed:Number(e.target.value)});
   card.querySelector('.rm-op-passes').onchange=e=>command('op',{id:op.id,passes:Number(e.target.value)});
   card.querySelector('.rm-op-power')?.addEventListener('change',e=>command('op',{id:op.id,power:Number(e.target.value)}));
   card.querySelector('.rm-op-pause')?.addEventListener('change',e=>command('op',{id:op.id,pauseBefore:e.target.checked}));
   ops.append(card);
  }
 }
 const scope=$('remoteScope');if(document.activeElement!==scope){const opts=[['all','Todas las operaciones activas'],...(j?.ops||[]).filter(o=>o.enabled&&!o.empty).map(o=>[o.id,'Solo '+o.name])];scope.replaceChildren(...opts.map(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;}));scope.value=j?.sendScope||'all';}
 const warn=[...(j?.problems||[]),...(j?.warnings||[])];$('remoteJobWarn').hidden=!warn.length;$('remoteJobWarn').textContent=warn.join(' ');
 if(reviewOpen)renderReview();
}
function renderReview(){
 const j=job(),dl=$('remoteReviewList');dl.replaceChildren();
 const row=(k,v)=>{const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;dl.append(dt,dd);};
 row('Trabajo',state?.name||'—');
 if((j?.source||state?.source)==='import'&&j){row('Colocación',j.bounds?`X ${fmt(j.bounds.x)} · Y ${fmt(j.bounds.y)} · ${fmt(j.bounds.width)} × ${fmt(j.bounds.height)} mm`:'—');(j.ops||[]).filter(o=>o.enabled&&!o.empty).forEach((o,i)=>row(`${i+1}. ${o.name}`,`${o.speed} mm/s × ${o.passes} pasada${o.passes===1?'':'s'} · ≈ ${fmtTime(o.seconds)}`));row('Tiempo estimado',fmtTime(j.seconds));}
 else row('Corte',`${state?.settings?.speed||'—'} mm/s × ${state?.settings?.passes||'—'} pasadas`);
 row('Origen',state?.origin==='current'?'Posición actual del cabezal':'Home (esquina superior izquierda)');
 row('Estado',state?.canRun?'Listo para enviar':(state?.problem||state?.message||'No listo'));
 const problems=[...(j?.problems||[]),...(j?.warnings||[])];if(problems.length)row('Atención',problems.join(' '));
}
async function command(action,args={}){
 if(!open())return status('Sin enlace con la computadora.');
 const priority=['pause','cancel'].includes(action);if(awaiting&&!priority)return;const id=++seq;
 if(!priority)awaiting=true;controls();
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('No llegó respuesta. Revisa la computadora; no se reenvió la orden.'));},action==='save'||action.startsWith('lib-')?45000:15000);pending.set(id,{resolve,reject,timer});channel.send(JSON.stringify({type:'command',session,id,action,args}));});return true;}
 catch(e){status(e.message);return false;}finally{if(!priority)awaiting=false;controls();}
}
/* ---------- Control ---------- */
for(const [id,x,y] of [['remoteUp',0,-1],['remoteLeft',-1,0],['remoteRight',1,0],['remoteDown',0,1]])$(id).onclick=()=>command('jog',{dx:x*Number($('remoteStep').value),dy:y*Number($('remoteStep').value)});
for(const [id,action] of [['remoteContinue','continue'],['remotePulse','pulse'],['remoteHome','home'],['remoteUnlock','unlock'],['remoteFrame','frame'],['remoteCut','cut'],['remoteStop','pause'],['remoteResume','resume'],['remoteCancel','cancel']])$(id).onclick=()=>command(action);
const steps=$('remoteSteps');for(const o of $('remoteStep').options){const b=document.createElement('button');b.type='button';b.textContent=o.value;b.onclick=()=>{$('remoteStep').value=o.value;paintSteps();};steps.append(b);}
function paintSteps(){for(const b of steps.children)b.setAttribute('aria-pressed',String(b.textContent===$('remoteStep').value));}paintSteps();
for(const b of document.querySelectorAll('[data-origin]'))b.onclick=()=>command('origin',{value:b.dataset.origin});
$('remoteFileCard').onclick=()=>showTab('tabJobs');$('remoteBridge').onclick=()=>status(state?.message||'Sin estado.');
/* ---------- Trabajos ---------- */
$('remoteSpeed').oninput=$('remotePasses').oninput=()=>{parametersDirty=true;};
$('remoteSettings').onclick=async()=>{if(await command('settings',{speed:Number($('remoteSpeed').value),passes:Number($('remotePasses').value)}))parametersDirty=false;};
for(const b of document.querySelectorAll('[data-source]'))b.onclick=()=>command('source',{value:b.dataset.source});
$('remotePlaceApply').onclick=()=>command('place',{x:Number($('remotePlaceX').value),y:Number($('remotePlaceY').value),scale:Number($('remotePlaceScale').value)/100,rotation:Number($('remotePlaceRot').value)});
$('remotePlaceCenter').onclick=()=>command('place-center');
$('remoteScope').onchange=e=>command('scope',{value:e.target.value});
$('remoteReviewOpen').onclick=()=>{reviewOpen=true;$('remoteReview').hidden=false;renderReview();$('remoteReview').scrollIntoView?.({block:'start'});};
$('remoteReviewOk').onclick=async()=>{if(job()?.review&&!(await command('review-ok')))return;reviewOpen=false;$('remoteReview').hidden=true;showTab('tabControl');};
$('remoteSave').onclick=async()=>{const r=await ask('Guardar en biblioteca',state?.name||'Trabajo',true);if(r)await command('save',{name:r.value,cloud:r.cloud});};
// Varios archivos: «Importar» reemplaza con el primero y suma los demás; «+ Agregar» los suma todos.
async function sendFiles(list,append){for(const [i,file] of list.entries()){const ok=await sendFile(file,append||i>0);if(!ok)break;}}
$('remoteImport').onchange=async()=>{const files=[...($('remoteImport').files||[])];$('remoteImport').value='';if(files.length)await sendFiles(files,false);};
$('remoteAdd').onchange=async()=>{const files=[...($('remoteAdd').files||[])];$('remoteAdd').value='';if(files.length)await sendFiles(files,true);};
async function sendFile(file,append=false){
 const mime=/\.svg$/i.test(file.name)?'image/svg+xml':/\.png$/i.test(file.name)?'image/png':/\.jpe?g$/i.test(file.name)?'image/jpeg':file.type;
 if(!['image/svg+xml','image/png','image/jpeg'].includes(mime))return status('Formato no compatible. Usa SVG, PNG o JPG.');
 if(file.size>8*1024*1024)return status('El archivo supera 8 MB.');
 if(!open()||state?.owner!=='phone'||state?.busy)return status('Espera a tener el control y a que la máquina esté libre.');
 let data;try{data=mime==='image/svg+xml'?await file.text():await new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>ko(Error('No se pudo leer el archivo.'));r.readAsDataURL(file);});}catch(e){return status(e.message);}
 if(data.length>UPLOAD_MAX)return status('El archivo es demasiado grande para enviarlo por el enlace.');
 const upload=crypto.randomUUID(),count=Math.ceil(data.length/UPLOAD_CHUNK);awaiting=true;controls();
 try{
  let timer;const done=new Promise((resolve,reject)=>{uploads.set(upload,{resolve,reject});timer=setTimeout(()=>{if(uploads.delete(upload))reject(Error('La computadora no confirmó el archivo.'));},120000);}).finally(()=>clearTimeout(timer));
  for(let index=0;index<count;index++){
   while(channel.bufferedAmount>512000)await new Promise(r=>setTimeout(r,40));
   channel.send(JSON.stringify({type:'upload',session,upload,index,count,...(index===0?{name:file.name.slice(0,120),mime,append:!!append}:{}),data:data.slice(index*UPLOAD_CHUNK,(index+1)*UPLOAD_CHUNK)}));
   $('remoteUpload').textContent=`Enviando ${file.name} a la computadora… ${Math.round((index+1)/count*100)} %`;
  }
  await done;$('remoteUpload').textContent=`${file.name} ${append?'agregado':'importado'} en la computadora. Revisa colocación y operaciones.`;return true;
 }catch(e){$('remoteUpload').textContent=e.message;return false;}
 finally{awaiting=false;controls();}
}
/* ---------- Biblioteca ---------- */
for(const b of document.querySelectorAll('[data-lib]'))b.onclick=()=>{libFilter=b.dataset.lib;renderLibrary();};
$('remoteLibSearch').oninput=()=>renderLibrary();$('remoteLibRefresh').onclick=()=>command('lib-list');
function renderLibrary(){
 for(const b of document.querySelectorAll('[data-lib]'))b.setAttribute('aria-pressed',String(b.dataset.lib===libFilter));
 const host=$('remoteLibList');host.replaceChildren();
 const where={on:'Biblioteca de tu cuenta activa: los archivos guardados ahí también están en otras computadoras.','signed-out':'La computadora no tiene sesión iniciada: se muestran los trabajos de esa computadora.','not-enabled':'La biblioteca de cuenta aún no está activada: se muestran los trabajos de la computadora.',offline:'Sin conexión con la cuenta: se muestran los trabajos de la computadora.'};
 $('remoteLibWhere').textContent=library?(where[library.cloud]||'Trabajos de la computadora enlazada.'):'Cargando la biblioteca de la computadora…';
 if(!library)return;
 const q=$('remoteLibSearch').value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 const items=library.items.filter(i=>(libFilter==='trash'?i.deleted:!i.deleted)&&(libFilter==='all'||libFilter==='trash'||i.scope===libFilter)&&String(i.name).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().includes(q));
 if(!items.length){const p=document.createElement('p');p.className='rm-note';p.textContent=libFilter==='trash'?'La papelera está vacía.':'No hay trabajos que coincidan.';host.append(p);return;}
 for(const i of items){
  const card=document.createElement('article');card.className='rm-lib-card';
  const thumb=document.createElement('div');thumb.className='rm-thumb';if(i.thumb&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.thumb)){const img=document.createElement('img');img.src=i.thumb;img.alt='';thumb.append(img);}else thumb.textContent=i.scope==='box'?'Caja':i.kind==='image'?'Imagen':'SVG';
  const info=document.createElement('div');info.className='rm-lib-info';
  const whereText=i.scope==='box'?'En la computadora (navegador)':i.where==='both'?(i.synced?'En tu cuenta · sincronizado':'En tu cuenta · versión más reciente'):i.where==='cloud'?'Solo en tu cuenta':'Solo en la computadora';
  info.innerHTML=`<strong>${esc(i.name)}</strong><small>${i.scope==='box'?'Diseño Box':i.kind==='image'?'Imagen':'SVG'} · ${esc((i.ops||[]).length?i.ops.join(' · '):'')}</small><small>${esc(i.dims||'')}</small><small class="rm-where">${esc(whereText)}</small>`;
  const actions=document.createElement('div');actions.className='rm-lib-actions';
  const b=(t,fn,cls='')=>{const x=document.createElement('button');x.type='button';x.textContent=t;x.className=cls;x.onclick=fn;actions.append(x);return x;};
  if(i.deleted)b('Restaurar',()=>command('lib-restore',{scope:i.scope,id:i.id}),'rm-primary');
  else{b('Abrir',async()=>{if(await command('lib-open',{scope:i.scope,id:i.id})){showTab('tabJobs');status('Trabajo abierto en la computadora. Revisa colocación y origen antes de enviarlo.');}},'rm-primary');b('Duplicar',()=>command('lib-duplicate',{scope:i.scope,id:i.id}));b('Renombrar',async()=>{const r=await ask('Renombrar',i.name);if(r)command('lib-rename',{scope:i.scope,id:i.id,name:r.value});});b('Eliminar',()=>command('lib-delete',{scope:i.scope,id:i.id}),'rm-danger-outline');}
  card.append(thumb,info,actions);host.append(card);
 }
 controls();
}
function ask(title,value,cloud=false){return new Promise(resolve=>{const d=$('remoteDialog');$('remoteDialogTitle').textContent=title;$('remoteDialogInput').value=value;$('remoteDialogCloudRow').hidden=!cloud;d.returnValue='';d.onclose=()=>resolve(d.returnValue==='ok'&&$('remoteDialogInput').value.trim()?{value:$('remoteDialogInput').value.trim(),cloud:$('remoteDialogCloud').checked}:null);if(d.showModal)d.showModal();else resolve(null);});}
/* ---------- Pestañas ---------- */
function showTab(id){for(const t of ['tabControl','tabJobs','tabLibrary'])$(t).hidden=t!==id;for(const b of document.querySelectorAll('.rm-nav button')){b.classList.toggle('active',b.dataset.tab===id);b.setAttribute('aria-current',b.dataset.tab===id?'page':'false');}if(id==='tabLibrary'&&!library&&open())command('lib-list');window.scrollTo?.(0,0);}
for(const b of document.querySelectorAll('.rm-nav button'))b.onclick=()=>showTab(b.dataset.tab);
/* ---------- Emparejamiento persistente ---------- */
// El celular guarda la credencial del QR (solo en este navegador) y se reconecta solo cuando la
// computadora vuelve a publicar su oferta: al encender la pantalla, volver a la app o recargar.
const LINK_KEY='lzbox-remote-link-v1';
let memoryLink=null;// si el navegador no permite guardar, el enlace dura mientras la página siga abierta
function saved(){try{const v=memoryLink||JSON.parse(globalThis.localStorage?.getItem(LINK_KEY)||'null');return v&&/^[0-9a-f-]{36}$/i.test(v.session)&&/^[a-f0-9]{64}$/.test(v.secret)&&/^[0-9a-f-]{36}$/i.test(v.claim)?v:null;}catch{return null;}}
function save(v){memoryLink=v||null;try{if(v)globalThis.localStorage?.setItem(LINK_KEY,JSON.stringify(v));else globalThis.localStorage?.removeItem(LINK_KEY);}catch{}}
let reconnectTimer=null,connecting=false,wake=null;
let pageClosed=false;
function scheduleReconnect(ms=2500){clearTimeout(reconnectTimer);if(pageClosed)return;reconnectTimer=setTimeout(()=>{if(!pageClosed&&!open()&&document.visibilityState!=='hidden')connectSaved();},ms);}
async function requestWake(){try{if(!wake&&navigator.wakeLock&&document.visibilityState==='visible'){wake=await navigator.wakeLock.request('screen');wake.addEventListener?.('release',()=>{wake=null;});}}catch{wake=null;}}
function releaseWake(){try{wake?.release();}catch{}wake=null;}
function attach(offer){
 session=offer.session;peer=createPeer();const reader=new PeerMessageReader(),mine=peer;
 peer.ondatachannel=event=>{const ch=event.channel;if(ch.label!=='lz-box-'+session){ch.close();return;}channel=ch;ch.onopen=()=>{$('remoteLinkState').textContent='Enlazado';status('Esperando el estado de la computadora…');requestWake();};ch.onclose=()=>{if(channel===ch)disconnected();};ch.onmessage=e=>{try{const message=reader.accept(e.data);if(message)receive(message);}catch{status('Estado recibido inválido; vuelve a enlazar si no se recupera.');}};};
 // «disconnected» puede ser pasajero: se espera antes de reconectar.
 let lostTimer=null;peer.onconnectionstatechange=()=>{if(peer!==mine)return;const st=mine.connectionState;if(st==='failed')disconnected();else if(st==='disconnected'){clearTimeout(lostTimer);lostTimer=setTimeout(()=>{if(peer===mine&&mine.connectionState!=='connected')disconnected();},8000);}else if(st==='connected')clearTimeout(lostTimer);};
 return peer;
}
async function connectSaved(){
 const link=saved();if(!link||connecting||open())return;connecting=true;
 try{
  const offer=await pairingRequest('offer',{session:link.session,secret:link.secret,claim:link.claim});
  const p=attach(offer);await p.setRemoteDescription({type:'offer',sdp:offer.sdp});
  const sdp=await gatherDescription(p,'answer');
  await pairingRequest('answer',{session:link.session,secret:link.secret,claim:link.claim,sdp});
  status('Enlazando con la computadora…');
  // Si no abre en 20 s, se vuelve a intentar con una oferta nueva.
  setTimeout(()=>{if(!pageClosed&&peer===p&&!open()){try{p.close();}catch{}peer=null;scheduleReconnect(500);}},20000);
 }catch(e){
  if(!state)status(/expir|revoc/i.test(e.message)?'Esperando a la computadora… Deja Box abierto en Operar máquina y ambos equipos en la misma red.':e.message);
  scheduleReconnect(3000);
 }finally{connecting=false;}
}
$('remotePair').onclick=async()=>{try{
 $('remotePair').disabled=true;const params=new URLSearchParams(location.hash.slice(1)),automatic=params.has('link');
 if(automatic){
  const reference=parsePairingLink(params.get('link')),previous=saved();
  save({...reference,claim:previous?.session===reference.session?previous.claim:crypto.randomUUID()});
  // El código queda guardado solo en este celular y se quita del historial.
  history.replaceState(null,'',location.pathname+location.search);
  status('Enlazando automáticamente con tu computadora…');await connectSaved();return;
 }
 const offer=await decodePairing(params.get('pair'),'offer');
 const p=attach(offer);await p.setRemoteDescription({type:'offer',sdp:offer.sdp});
 const sdp=await gatherDescription(p,'answer');
 $('remoteAnswer').closest('label').hidden=false;$('remoteCopy').hidden=false;$('remoteAnswer').value=await encodePairing({version:1,type:'answer',session,expires:offer.expires,sdp});$('remoteCopy').disabled=false;status('Este QR anterior requiere pegar la respuesta en la computadora. Genera un QR nuevo para enlazar automáticamente.');
 history.replaceState(null,'',location.pathname+location.search);
}catch(e){status(e.message);$('remotePair').disabled=false;}};
$('remoteForget').onclick=()=>{save(null);clearTimeout(reconnectTimer);const c=channel;channel=null;state=null;try{c?.close();peer?.close();}catch{}peer=null;session=null;releaseWake();$('remoteMachine').hidden=true;$('remotePairing').hidden=false;$('remotePair').hidden=false;$('remotePair').disabled=false;$('remoteForgetRow').hidden=true;$('remoteLinkState').textContent='Sin enlace';status('Esta computadora se olvidó en este celular. Escanea un QR nuevo para volver a enlazar.');};
$('remoteForget2').onclick=()=>$('remoteForget').onclick();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(open())requestWake();else if(saved())scheduleReconnect(200);}});
window.addEventListener('online',()=>{if(saved()&&!open())scheduleReconnect(300);});
$('remoteCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('remoteAnswer').value);status('Respuesta copiada. Pégala en la computadora.');}catch{$('remoteAnswer').focus();$('remoteAnswer').select();status('Selecciona y copia la respuesta.');}};
window.addEventListener('pagehide',()=>{pageClosed=true;clearTimeout(reconnectTimer);releaseWake();channel?.close();peer?.close();});controls();
if(new URLSearchParams(location.hash.slice(1)).has('link')){$('remotePair').hidden=true;$('remoteAnswer').closest('label').hidden=true;$('remoteCopy').hidden=true;status('Conectando con tu computadora…');$('remotePair').onclick();}
else if(saved()){$('remotePair').hidden=true;$('remoteForgetRow').hidden=false;status('Celular emparejado. Conectando con la computadora…');connectSaved();}
