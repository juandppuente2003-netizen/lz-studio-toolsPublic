import {prepareK40Job,k40Preview,placeK40Job,K40_PROTOCOL} from './k40-job.js?v=2';
const ADDRESS='http://127.0.0.1:17840',PAIRING_KEY='lzbox-k40-pairing-v1';
const TERMINAL=['sent','simulated','cancelled','error'];
export function mountK40(app){
 const launch=document.createElement('button');launch.type='button';launch.className='btn outline';launch.id='k40Open';launch.textContent='Controlar mi K40';document.querySelector('.export-actions')?.append(launch);
 const dialog=document.createElement('dialog');dialog.className='k40-dialog';dialog.id='k40Dialog';
 dialog.innerHTML=`<header class="k40-header"><div><span class="eyebrow">LZ BOX · CONTROL DE MÁQUINA</span><h2>Mi K40</h2><p>M2 Nano · potencia en el panel físico</p></div><div class="k40-header-actions"><span class="k40-badge" id="k40Mode">Sin conectar</span><button type="button" class="icon-btn" id="k40Close" aria-label="Cerrar panel">×</button></div></header>
 <div class="k40-layout"><section class="k40-canvas-panel" aria-label="Vista del trabajo"><div class="k40-section-heading"><h3>Área de trabajo</h3><label>Hoja<select id="k40Sheet"></select></label></div><div id="k40Preview" class="k40-preview"></div><p id="k40Summary" class="k40-summary"></p><p class="k40-note">Azul: interiores · verde: contornos. Se conserva el kerf y se eliminan tramos repetidos. La vista muestra el origen elegido.</p><button type="button" class="btn outline" id="k40Arrange">Volver a acomodar piezas</button>
 <details class="k40-bed"><summary>Medidas de cama y desplazamiento</summary><div class="k40-fields"><label>Ancho · mm<input id="k40Width" type="number" min="50" max="2500" value="400"></label><label>Alto · mm<input id="k40Height" type="number" min="50" max="2500" value="400"></label><label>Desplazar X · mm<input id="k40X" type="number" min="0" step="0.1" value="0"></label><label>Desplazar Y · mm<input id="k40Y" type="number" min="0" step="0.1" value="0"></label></div><p class="k40-note">Las medidas deben coincidir con las del conector. En origen actual, el contorno del diseño se alinea al cabezal.</p></details></section>
 <section class="k40-controls" aria-label="Controles de máquina"><details class="k40-pairing" id="k40BridgePanel" open><summary>Conexión con esta computadora</summary><p class="k40-note">El conector puede iniciar con Windows sin consola. Pega su código una vez y marca Recordar. Conectar no mueve la máquina. <a href="https://raw.githubusercontent.com/juandppuente2003-netizen/lz-studio-toolsPublic/codex/box-k40-m2/connectors/k40/LZ-K40-Windows.zip?v=0.4.1" target="_blank" rel="noopener">Descargar conector 0.4.1 para Windows</a>.</p><label for="k40Token">Código del conector</label><div class="k40-connect-row"><input id="k40Token" type="password" autocomplete="off" spellcheck="false"><button type="button" id="k40Connect" class="btn outline">Conectar</button></div><label class="k40-confirm"><input id="k40Remember" type="checkbox" checked>Recordar esta computadora</label><div class="k40-actions"><button type="button" id="k40Disconnect" class="btn quiet" disabled>Liberar USB para Sagaon</button><button type="button" id="k40Forget" class="btn quiet">Olvidar código</button></div></details>
 <section class="k40-jog-panel"><div class="k40-section-heading"><h3>Mover cabezal</h3><span id="k40Position" class="k40-position">Sin referencia</span></div><div class="k40-motion-layout"><div class="k40-jog-pad"><button type="button" id="k40Up" class="k40-jog" aria-label="Mover hacia arriba">↑</button><button type="button" id="k40Left" class="k40-jog" aria-label="Mover hacia la izquierda">←</button><button type="button" id="k40Home" class="k40-home" title="Ir a la esquina superior izquierda">Home</button><button type="button" id="k40Right" class="k40-jog" aria-label="Mover hacia la derecha">→</button><button type="button" id="k40Down" class="k40-jog" aria-label="Mover hacia abajo">↓</button></div><div><label for="k40Step">Paso · mm</label><select id="k40Step"><option>0.1</option><option>1</option><option selected>5</option><option>10</option><option>25</option><option>50</option></select><button type="button" id="k40UsePosition" class="btn outline wide">Usar esta posición como origen</button></div></div><p class="k40-note">Un clic = un movimiento. Haz Home una vez al conectar. Posición estimada; si mueves el cabezal a mano, libera USB y vuelve a establecer Home.</p></section>
 <section class="k40-job-settings"><h3>Preparar hoja</h3><label for="k40Origin">Origen del trabajo</label><select id="k40Origin"><option value="home">Desde Home · esquina superior izquierda</option><option value="current">Desde la posición actual · sin volver a Home</option></select><p id="k40OriginNote" class="k40-note"></p><div class="k40-fields"><label>Velocidad · mm/s<input id="k40Speed" type="number" min="1" max="100" step="0.1" value="10"></label><label>Pasadas<input id="k40Passes" type="number" min="1" max="10" step="1" value="1"></label></div></section>

 <div id="k40Status" class="k40-status" role="status" aria-live="polite">Conecta el conector local para continuar.</div><progress id="k40Progress" class="k40-progress" max="100" value="0" aria-label="Datos enviados a la controladora" hidden></progress>
 <div class="k40-run-actions"><button type="button" id="k40Frame" class="btn outline" disabled>Recorrer marco sin láser</button><button type="button" id="k40Run" class="btn primary" disabled>Enviar hoja a cortar</button></div><button type="button" id="k40Cancel" class="btn k40-stop wide" disabled>Cancelar y solicitar parada</button><button type="button" id="k40Acknowledge" class="btn outline wide" hidden disabled>Confirmar máquina detenida</button><p class="k40-note">Cancelar solicita parada por USB y descarta la cola; no sustituye al paro físico. El porcentaje mide datos enviados. La parada modificada requiere prueba con emisión físicamente deshabilitada.</p></section></div>`;
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id);
 let machine=null,job=null,previewOK=false,requesting=false,active=false,cancelling=false,timer=null,lastState=null,verifiedToken='',epoch=0;
 const inputs=['k40Sheet','k40Speed','k40Passes','k40Width','k40Height','k40X','k40Y','k40Origin'];
 const motionIds=['k40Up','k40Left','k40Right','k40Down'];
 const status=(message,error=false)=>{$('k40Status').textContent=message;$('k40Status').dataset.error=String(error);};
 const hasPosition=()=>Array.isArray(machine?.position)&&machine.position.length===2&&machine.position.every(Number.isFinite);
 function buttons(){
  const idle=!!machine&&!requesting&&!active,ready=idle&&!!job&&previewOK;
  $('k40Run').disabled=!ready;$('k40Frame').disabled=!ready;$('k40Cancel').disabled=!active||cancelling;
  $('k40Acknowledge').hidden=!active||!['cancelled','error','unknown'].includes(lastState);$('k40Acknowledge').disabled=requesting||cancelling;
  inputs.forEach(id=>$(id).disabled=active||requesting);$('k40Step').disabled=active||requesting;
  $('k40Token').disabled=active||requesting;$('k40Connect').disabled=active||requesting||!!machine;
  $('k40Arrange').disabled=active||requesting;$('k40Disconnect').disabled=!idle;$('k40Remember').disabled=active||requesting;$('k40Forget').disabled=active||requesting;
  $('k40Home').disabled=!idle;motionIds.forEach(id=>$(id).disabled=!idle||!hasPosition());
  $('k40UsePosition').disabled=!idle||!hasPosition();
  $('k40Position').textContent=hasPosition()?`X ${machine.position[0].toFixed(2)} · Y ${machine.position[1].toFixed(2)} mm · estimada`:'Sin referencia';
 }
 function refresh(announce=true){
  job=null;previewOK=false;
  try{
   job=prepareK40Job(app,{sheet:+$('k40Sheet').value,speed:$('k40Speed').value,passes:$('k40Passes').value,bedWidth:$('k40Width').value,bedHeight:$('k40Height').value,offsetX:$('k40X').value,offsetY:$('k40Y').value});
   if(machine&&(job.bed.width!==machine.bed.width||job.bed.height!==machine.bed.height))throw Error('Las medidas deben coincidir con la cama configurada en el conector.');
   const current=$('k40Origin').value==='current',view=current?placeK40Job(job,machine?.position):job;
   $('k40Preview').innerHTML=k40Preview(view);
   if(hasPosition()){
    const svg=$('k40Preview').querySelector('svg'),marker=document.createElementNS('http://www.w3.org/2000/svg','circle');
    marker.setAttribute('cx',machine.position[0]);marker.setAttribute('cy',machine.position[1]);marker.setAttribute('r','2');marker.setAttribute('fill','#f3c983');marker.setAttribute('stroke','#151c18');marker.setAttribute('stroke-width','0.8');svg.append(marker);
   }
   $('k40OriginNote').textContent=current?'El contorno superior izquierdo se alinea al cabezal. Al terminar vuelve a este origen; no ejecuta Home.':'El envío ejecuta Home y vuelve a esa esquina al terminar.';
   const s=job.summary;$('k40Summary').textContent=`Hoja ${job.sheet} · ${s.pieces} piezas · ${s.paths} trayectorias · ${(s.cutLengthMm/1000).toFixed(2)} m. Tiempo mínimo de corte: ${Math.ceil(s.minimumCutSeconds)} s, más movimientos y aceleraciones.`;
   previewOK=true;if(announce&&!active)status(machine?'Lista. Usa las flechas, recorre el marco o envía la hoja.':'Plano listo. Conecta el conector local para continuar.');
  }catch(e){$('k40Preview').textContent=e.message;$('k40Summary').textContent='';if(announce&&!active)status(e.message,true);}
  buttons();
 }
 async function api(path,body){
  const token=$('k40Token').value.trim();if(!token)throw Error('Pega el código del conector una vez y marca Recordar esta computadora.');
  let response;try{response=await fetch(ADDRESS+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='/prepare'?60000:12000),cache:'no-store'});}catch{throw Error('No se pudo comunicar con el conector. Comprueba que esté iniciado y permite el acceso a la red local si Chrome lo solicita.');}
  const result=await response.json();if(!response.ok)throw Error(response.status===401?'El código no es válido. Copia el código permanente desde Abrir conector.':result.error||'El conector rechazó la solicitud.');return result;
 }
 function savedCode(){try{return document.defaultView.localStorage.getItem(PAIRING_KEY)||'';}catch{return '';}}
 function forgetCode(){try{document.defaultView.localStorage.removeItem(PAIRING_KEY);}catch{}}
 function rememberCode(){
  if(!$('k40Remember').checked){forgetCode();return true;}
  if(!verifiedToken||verifiedToken!==$('k40Token').value.trim())return false;
  try{document.defaultView.localStorage.setItem(PAIRING_KEY,verifiedToken);return true;}catch{return false;}
 }
 function setMachine(info){machine=info;$('k40Mode').textContent=info.simulation?'SIMULACIÓN · sin USB':'M2 USB · conectada';$('k40Width').value=info.bed.width;$('k40Height').value=info.bed.height;buttons();}
 function stopPolling(){clearInterval(timer);timer=null;}
 function startPolling(){stopPolling();timer=setInterval(poll,700);}
 async function connect(){
  if(requesting||active||machine)return;requesting=true;buttons();status('Conectando con la M2…');
  try{
   const info=await api('/status');if(!['persistent-pairing','disconnect','priority-stop','jog','current-origin','automatic-completion'].every(feature=>info.features?.includes(feature)))throw Error('Actualiza y reinicia el conector local a la versión 0.4.1 para usar movimientos y origen actual.');
   if(info.protocol!==K40_PROTOCOL||info.board!=='M2')throw Error('El conector no es compatible con M2.');
   if(['sending',...TERMINAL].includes(info.state)){setMachine(info);active=true;lastState=info.state;startPolling();status(info.message+' Se recuperó la operación pendiente; no se reenvió.');}
   else{setMachine(await api('/connect',{}));status(machine.simulation?'Conectado en simulación. No se abre USB.':'M2 conectada. Haz Home una vez para habilitar las flechas.');}
   verifiedToken=$('k40Token').value.trim();if(!rememberCode())status('Conectado, pero este navegador no permitió guardar el código.',true);
   $('k40BridgePanel').open=false;refresh(false);
  }catch(e){machine=null;$('k40BridgePanel').open=true;status(e.message,true);}finally{requesting=false;buttons();}
 }
 async function disconnect(){
  if(active||requesting)return false;requesting=true;buttons();
  try{await api('/disconnect',{});machine=null;verifiedToken='';$('k40Mode').textContent='Sin conectar';refresh(false);status('USB liberado. Ya puedes abrir Sagaon. La posición se restablecerá con Home al reconectar.');return true;}
  catch(e){status(e.message,true);return false;}finally{requesting=false;buttons();}
 }
 function consume(s){
  if(machine)machine={...machine,...s};lastState=s.state;
  if(s.state==='idle'&&active){active=false;stopPolling();$('k40Progress').hidden=true;refresh(false);status(s.message);}
  else if(s.state==='sending'){$('k40Progress').hidden=false;$('k40Progress').value=s.percent;status(s.operation==='home'||s.operation==='jog'?'Moviendo cabezal. Esperando fin de la controladora…':`Enviando ${s.percent}% de datos. No mide el avance físico del corte.`);}
  else if(TERMINAL.includes(s.state)){if(s.state!=='sent')stopPolling();status(s.message,s.state==='error');}
  buttons();
 }
 async function poll(){
  const generation=epoch;try{const s=await api('/status');if(generation===epoch)consume(s);}catch(e){if(generation!==epoch)return;stopPolling();lastState='unknown';if(machine)machine.position=null;status(e.message+' No reenvíes. Comprueba la máquina y usa su paro físico si continúa.',true);buttons();}
 }
 async function run(mode){
  if(!job||!machine||requesting||active||!previewOK)return;
  let generation;requesting=true;buttons();status('Preparando instrucciones M2…');
  try{
   const prepared=await api('/prepare',{job,mode,origin:$('k40Origin').value});if(!prepared.id)throw Error('El conector no preparó un trabajo válido.');
   active=true;lastState=null;generation=++epoch;buttons();let result=await api('/run',{id:prepared.id,confirmed:true});if(generation!==epoch)return;
   if(result.state==='simulated'){result=await api('/acknowledge',{confirmed:true});if(generation!==epoch)return;}
   consume(result);if(result.state==='sending'||result.state==='sent')startPolling();await poll();
  }catch(e){if(generation!==undefined&&generation!==epoch)return;status(e.message,true);if(active)lastState='unknown';}finally{requesting=false;buttons();}
 }
 async function motion(action,dx=0,dy=0){
  if(!machine||requesting||active)return;
  requesting=true;active=true;lastState=null;const generation=++epoch;buttons();status(action==='home'?'Solicitando Home…':'Solicitando movimiento…');
  try{const result=await api('/motion',{action,dx,dy,confirmed:true});if(generation!==epoch)return;consume(result);if(active)startPolling();}
  catch(e){if(generation!==epoch)return;await poll();if(!active)status(e.message,true);else{lastState='unknown';status(e.message+' Verifica la máquina antes de continuar.',true);}}
  finally{requesting=false;buttons();}
 }
 $('k40Connect').onclick=connect;$('k40Disconnect').onclick=disconnect;$('k40Run').onclick=()=>run('cut');$('k40Frame').onclick=()=>run('frame');
 $('k40Home').onclick=()=>motion('home');
 for(const [id,x,y] of [['k40Up',0,-1],['k40Left',-1,0],['k40Right',1,0],['k40Down',0,1]])$(id).onclick=()=>motion('jog',x*Number($('k40Step').value),y*Number($('k40Step').value));
 $('k40UsePosition').onclick=()=>{if(active||requesting||!hasPosition())return;$('k40Origin').value='current';refresh();};
 $('k40Cancel').onclick=async()=>{
  if(!active||cancelling)return;cancelling=true;++epoch;stopPolling();buttons();status('Solicitando parada de la M2…');
  try{consume(await api('/cancel',{confirmed:true}));}catch(e){lastState='unknown';if(machine)machine.position=null;status(e.message+' Usa el paro físico si continúa.',true);}finally{cancelling=false;buttons();}
 };
 $('k40Acknowledge').onclick=async()=>{
  if(requesting||cancelling)return;requesting=true;buttons();
  try{const result=await api('/acknowledge',{confirmed:true});active=false;lastState=null;stopPolling();$('k40Progress').hidden=true;if(result.connected)setMachine(result);else{machine=null;$('k40Mode').textContent='Sin conectar';}refresh(false);status(result.message);}
  catch(e){status(e.message,true);}finally{requesting=false;buttons();}
 };
 $('k40Remember').onchange=()=>{if(!$('k40Remember').checked)forgetCode();else rememberCode();};
 $('k40Forget').onclick=async()=>{if(machine&&!await disconnect())return;forgetCode();$('k40Remember').checked=false;$('k40Token').value='';verifiedToken='';status('Código olvidado en este navegador.');};
 inputs.forEach(id=>$(id).addEventListener('input',()=>{refresh();}));
 async function close(){if(active||requesting){status('Espera o cancela la operación y confirma que la máquina se detuvo.',true);return false;}if(machine&&!await disconnect())return false;stopPolling();$('k40Token').value='';verifiedToken='';dialog.close();return true;}
 $('k40Close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});$('k40Arrange').onclick=async()=>{if(await close())app.setView('2d');};
 launch.onclick=()=>{
  lastState=null;const saved=savedCode();$('k40Token').value=saved;$('k40Remember').checked=true;$('k40BridgePanel').open=!saved;
  $('k40Sheet').replaceChildren(...Array.from({length:app.packed?.count||1},(_,i)=>{const option=document.createElement('option');option.value=i;option.textContent='Hoja '+(i+1);return option;}));
  dialog.showModal();refresh();if(saved)connect();
 };
 app.onUpdate(()=>{if(dialog.open&&!active&&!requesting)refresh();});return {dialog,refresh};
}
if(typeof document!=='undefined'){
 if(globalThis.lzApp)mountK40(globalThis.lzApp);else{let count=0;const wait=setInterval(()=>{if(globalThis.lzApp||++count>200){clearInterval(wait);if(globalThis.lzApp)mountK40(globalThis.lzApp);}},25);}
}
