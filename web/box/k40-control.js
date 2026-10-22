import {prepareK40Job,k40Preview,K40_PROTOCOL} from './k40-job.js?v=1';

const ADDRESS='http://127.0.0.1:17840';
export function mountK40(app){
 const launch=document.createElement('button');launch.type='button';launch.className='btn outline';launch.id='k40Open';launch.textContent='Cortar en mi K40';
 document.querySelector('.export-actions')?.append(launch);
 const dialog=document.createElement('dialog');dialog.className='k40-dialog';dialog.id='k40Dialog';
 dialog.innerHTML=`<div class="dialog-header"><div><span class="eyebrow">BOX → TU MÁQUINA</span><h2>Cortar en mi K40</h2></div><button type="button" class="icon-btn" id="k40Close" aria-label="Cerrar panel de corte">×</button></div>
 <div class="k40-machine"><strong>M2 Nano · potencia manual</strong><span class="k40-badge" id="k40Mode">Sin conectar</span></div>
 <div class="k40-layout"><div><div id="k40Preview" class="k40-preview"></div><p id="k40Summary" class="k40-summary"></p><p class="k40-note">Verde: contornos · azul: interiores. Se conserva el kerf del plano y se eliminan tramos repetidos. El recorrido parte de Home, en la esquina superior izquierda.</p><button type="button" class="btn outline" id="k40Arrange">Volver a acomodar piezas</button></div>
 <div><div class="k40-fields"><label>Hoja<select id="k40Sheet"></select></label><label>Velocidad · mm/s<input id="k40Speed" type="number" min="1" max="100" step="0.1" value="10"></label><label>Pasadas<input id="k40Passes" type="number" min="1" max="10" step="1" value="1"></label><label>Ancho cama · mm<input id="k40Width" type="number" min="50" max="2500" value="400"></label><label>Alto cama · mm<input id="k40Height" type="number" min="50" max="2500" value="400"></label><label>Desplazar X · mm<input id="k40X" type="number" min="0" step="0.1" value="0"></label><label>Desplazar Y · mm<input id="k40Y" type="number" min="0" step="0.1" value="0"></label></div>
 <details class="k40-pairing" open><summary>Conectar con esta computadora</summary><p class="k40-note">Ejecuta el conector LZ K40 en la computadora conectada por USB. Pega aquí su código; solo se conserva mientras este panel está abierto.</p><label for="k40Token">Código del conector</label><input id="k40Token" type="password" autocomplete="off" spellcheck="false"><button type="button" id="k40Connect" class="btn outline">Conectar</button></details>
 <div id="k40Status" class="k40-status" role="status" aria-live="polite">Conecta el puente local para preparar el envío. No se iniciará ningún movimiento al conectar.</div><progress id="k40Progress" class="k40-progress" max="100" value="0" aria-label="Datos enviados a la controladora" hidden></progress>
 <label class="k40-confirm"><input id="k40Confirm" type="checkbox">He revisado la hoja, la potencia en el panel y el área libre para volver a Home. Estoy junto a la máquina para iniciar.</label>
 <button type="button" id="k40Run" class="btn primary wide" disabled>Enviar hoja a cortar</button><div class="k40-actions"><button type="button" id="k40Frame" class="btn outline" disabled>Recorrer marco sin láser</button><button type="button" id="k40Cancel" class="btn outline" disabled>Cancelar envío</button></div><p class="k40-note">Cancelar deja de enviar datos; no es un paro de emergencia. La controladora puede ejecutar datos ya recibidos. Las hojas siguientes se inician manualmente.</p></div></div>`;
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id);let machine=null,job=null,prepared=null,requesting=false,active=false,timer=null,lastState=null;
 const inputs=['k40Sheet','k40Speed','k40Passes','k40Width','k40Height','k40X','k40Y'];
 const status=(message,error=false)=>{ $('k40Status').textContent=message;$('k40Status').dataset.error=String(error);};
 function buttons(){const ready=!!machine&&!!job&&!requesting&&!active;$('k40Run').disabled=!ready||!$('k40Confirm').checked;$('k40Frame').disabled=!ready||!$('k40Confirm').checked;$('k40Cancel').disabled=!active||requesting;inputs.forEach(id=>$(id).disabled=active||requesting);$('k40Token').disabled=active||requesting;$('k40Connect').disabled=active||requesting;$('k40Arrange').disabled=active||requesting;}
 function refresh(){
  prepared=null;$('k40Confirm').checked=false;
  try{job=prepareK40Job(app,{sheet:+$('k40Sheet').value,speed:$('k40Speed').value,passes:$('k40Passes').value,bedWidth:$('k40Width').value,bedHeight:$('k40Height').value,offsetX:$('k40X').value,offsetY:$('k40Y').value});
   if(machine&&(job.bed.width!==machine.bed.width||job.bed.height!==machine.bed.height))throw Error('Las medidas deben coincidir con la cama configurada en el conector.');
   $('k40Preview').innerHTML=k40Preview(job);const s=job.summary;$('k40Summary').textContent=`Hoja ${job.sheet} · ${s.pieces} piezas · ${s.paths} trayectorias · ${(s.cutLengthMm/1000).toFixed(2)} m de corte. Mínimo de corte: ${Math.ceil(s.minimumCutSeconds)} s, más desplazamientos y aceleraciones.`;
   if(!active)status(machine?'Hoja revisada. Confirma la preparación para habilitar el envío.':'Plano listo. Conecta el puente local para continuar.');
  }catch(e){job=null;$('k40Preview').textContent=e.message;$('k40Summary').textContent='';if(!active)status(e.message,true);}buttons();
 }
 async function api(path,body){
  const token=$('k40Token').value.trim();if(!token)throw Error('Pega el código que muestra el conector local.');
  let response;try{response=await fetch(ADDRESS+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='/prepare'?60000:12000),cache:'no-store'});}catch{throw Error('No se pudo comunicar con el conector. Comprueba que esté abierto en esta computadora y permite el acceso a la red local si el navegador lo solicita.');}
  const result=await response.json();if(!response.ok)throw Error(result.error||'El conector rechazó la solicitud.');return result;
 }
 async function connect(){requesting=true;buttons();status('Comprobando el conector y la máquina…');try{machine=await api('/connect',{});if(machine.protocol!==K40_PROTOCOL||machine.board!=='M2')throw Error('El conector no es compatible con M2.');$('k40Width').value=machine.bed.width;$('k40Height').value=machine.bed.height;$('k40Mode').textContent=machine.simulation?'SIMULACIÓN · sin USB':'USB · experimental';refresh();status(machine.simulation?'Conectado en simulación: no se moverá ni disparará el láser.':'M2 conectada por USB. Revisa las medidas y prepara el marco antes de cortar.');}catch(e){machine=null;status(e.message,true);}finally{requesting=false;buttons();}}
 async function poll(){
  try{const s=await api('/status');if(s.state==='sending'){$('k40Progress').hidden=false;$('k40Progress').value=s.percent;status(`Enviando a la M2: ${s.percent}% de datos. Esto no mide el avance físico del corte.`);}else if(s.state==='sent'||s.state==='simulated'||s.state==='cancelled'||s.state==='error'){
   // Keep the machine locked until the operator verifies it has physically stopped.
   clearInterval(timer);timer=null;status(s.message,s.state==='error');$('k40Cancel').textContent='Confirmar máquina detenida';lastState=s.state;
  }}catch(e){clearInterval(timer);timer=null;status(e.message+' No reenvíes el trabajo. Verifica la máquina y usa su paro físico si es necesario.',true);lastState='unknown';$('k40Cancel').textContent='Cancelar envío';}
 }
 async function run(mode){
  if(!job||!machine||requesting||active||!$('k40Confirm').checked)return;
  requesting=true;buttons();status('Preparando las instrucciones para M2…');
  try{prepared=await api('/prepare',{job,mode});if(!prepared.id)throw Error('El conector no devolvió un trabajo válido.');
   active=true;lastState=null;await api('/run',{id:prepared.id,confirmed:true});$('k40Confirm').checked=false;$('k40Progress').value=0;status(machine.simulation?'Comprobando el trabajo en simulación…':'Enviando el trabajo. Mantente junto a la máquina.');timer=setInterval(poll,1000);await poll();
  }catch(e){status(e.message,true);if(active){lastState='unknown';$('k40Cancel').textContent='Cancelar envío';}}finally{requesting=false;buttons();}
 }
 $('k40Connect').onclick=connect;$('k40Run').onclick=()=>run('cut');$('k40Frame').onclick=()=>run('frame');$('k40Confirm').onchange=buttons;
 $('k40Cancel').onclick=async()=>{if(requesting)return;requesting=true;buttons();try{
  if(lastState&&lastState!=='unknown'){await api('/acknowledge',{confirmed:true});active=false;prepared=null;lastState=null;machine=null;$('k40Mode').textContent='Sin conectar';$('k40Cancel').textContent='Cancelar envío';$('k40Progress').hidden=true;refresh();}
  else{await api('/cancel',{confirmed:true});await poll();}
 }catch(e){status(e.message,true);}finally{requesting=false;buttons();}};
 inputs.forEach(id=>$(id).addEventListener('input',refresh));
 function close(){if(active||requesting){status('Confirma primero que la máquina se detuvo. El conector conserva el trabajo aunque cierres esta página.',true);return;}clearInterval(timer);timer=null;$('k40Token').value='';machine=null;dialog.close();}
 $('k40Close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});$('k40Arrange').onclick=()=>{close();app.setView('2d');};
 launch.onclick=()=>{lastState=null;$('k40Sheet').replaceChildren(...Array.from({length:app.packed?.count||1},(_,i)=>{const o=document.createElement('option');o.value=i;o.textContent='Hoja '+(i+1);return o;}));dialog.showModal();refresh();};
 app.onUpdate(()=>{if(dialog.open&&!active&&!requesting)refresh();});
 return {dialog,refresh};
}
if(typeof document!=='undefined'){
 if(globalThis.lzApp)mountK40(globalThis.lzApp);else{let count=0;const wait=setInterval(()=>{if(globalThis.lzApp||++count>200){clearInterval(wait);if(globalThis.lzApp)mountK40(globalThis.lzApp);}},25);}
}
