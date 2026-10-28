import qrcode from './vendor/qrcode.mjs';
import {createPeer,gatherDescription,decodePairing,CommandGate,sendPeerMessage,UPLOAD_CHUNK,UPLOAD_MAX} from './peer-transport.js?v=3';
import {pairingRequest,pairingSecret} from './peer-signaling.js?v=1';

/* Enlace con el celular (v62): el celular queda emparejado.
   Tras escanear el QR una vez, la computadora recuerda ese celular. Si el enlace se cae
   (pantalla apagada, cambio de app, Wi‑Fi, recarga de cualquiera de los dos), la computadora
   vuelve a publicar una oferta con la misma credencial y el celular se reconecta solo.
   Nunca se reenvía una orden. «Olvidar celular» borra la credencial en ambos lados. */
const DEVICE_KEY='lzbox-remote-device-v1';
export function mountRemoteHost(app,machine,mount){
 const open=document.createElement('button');open.type='button';open.className='btn outline';open.textContent='Control desde celular';mount.append(open);
 const dialog=document.createElement('dialog');dialog.className='workshop-remote-dialog';dialog.setAttribute('aria-labelledby','peerTitle');
 dialog.innerHTML='<header class="dialog-header"><h2 id="peerTitle">Operar junto a la máquina</h2><button type="button" id="peerClose" class="btn quiet">Cerrar ventana</button></header><p>La computadora conserva el USB. Deja Box abierto y ambos dispositivos en la misma red local. No se abre ningún puerto ni se comparte el código USB.</p><ol><li>Genera el QR y escanéalo con el celular (solo la primera vez).</li><li>El celular queda emparejado: si se apaga la pantalla o cambias de app, se reconecta solo.</li><li>Para dejar de usarlo pulsa «Olvidar celular».</li></ol><button type="button" id="peerGenerate" class="btn primary">Emparejar celular con QR</button><div id="peerQR" class="workshop-peer-qr"></div><label>Enlace para el celular<input id="peerLink" readonly></label><label>Respuesta del celular<textarea id="peerAnswer" rows="3" spellcheck="false" autocomplete="off"></textarea></label><div class="workshop-inline-actions"><button type="button" id="peerAccept" class="btn outline">Aceptar respuesta</button><button type="button" id="peerGrant" class="btn primary" disabled>Ceder control al celular</button><button type="button" id="peerRevoke" class="btn outline" disabled>Olvidar celular y recuperar control</button></div><p id="peerStatus" role="status">Sin celular emparejado. La computadora tiene el control.</p>';
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
 const storage=(()=>{try{return document.defaultView.localStorage;}catch{return null;}})();
 const readDevice=()=>{try{const v=JSON.parse(storage?.getItem(DEVICE_KEY)||'null');return v&&/^[0-9a-f-]{36}$/i.test(v.session)&&/^[a-f0-9]{64}$/.test(v.secret)?v:null;}catch{return null;}};
 const writeDevice=v=>{try{if(v)storage?.setItem(DEVICE_KEY,JSON.stringify(v));else storage?.removeItem(DEVICE_KEY);}catch{}};
 let device=readDevice(),peer=null,channel=null,gate=null,publishTimer=null,lastPublish=0,lastPreview='',answerTimer=null,listenTimer=null,lostTimer=null,generation=0,upload=null,stopped=false;
 const session=()=>device?.session||null;
 $('peerGrant').hidden=true;$('peerAnswer').closest('label').hidden=true;$('peerAccept').hidden=true;
 const status=message=>{$('peerStatus').textContent=message;open.dataset.link=channel?.readyState==='open'?'on':device?'wait':'off';open.textContent=channel?.readyState==='open'?'Celular conectado':device?'Celular · reconectando…':'Control desde celular';};
 /** Cierra el enlace actual sin olvidar el celular. */
 function teardown(){
  ++generation;clearTimeout(answerTimer);clearTimeout(listenTimer);clearTimeout(lostTimer);answerTimer=listenTimer=lostTimer=null;
  gate?.close();gate=null;clearInterval(publishTimer);publishTimer=null;
  const old=channel;channel=null;if(old){old.onclose=null;old.close();}const p=peer;peer=null;if(p){p.onconnectionstatechange=null;p.close();}lastPreview='';
  try{machine.setRemoteOwner(false);}catch{}
 }
 /** Enlace perdido: la computadora recupera el control y espera al mismo celular. */
 function lost(message){
  if(stopped)return;teardown();$('peerQR').replaceChildren();
  if(!device){status(message||'Enlace cerrado. La computadora tiene el control.');return;}
  status((message||'Enlace con el celular interrumpido.')+' La computadora recuperó el control y espera que el celular se reconecte solo; no se reenvió ninguna orden.');
  listenTimer=setTimeout(listen,1500);
 }
 /** Olvidar el celular: se borra la credencial y la oferta pendiente. */
 function revoke(message='Celular olvidado. La computadora tiene el control.'){
  const previous=session();teardown();device=null;writeDevice(null);
  if(previous)pairingRequest('remove',{session:previous}).catch(()=>{});
  $('peerRevoke').disabled=true;$('peerQR').replaceChildren();$('peerLink').value='';$('peerAnswer').value='';status(message);
 }
 function publish(force=false){
  if(channel?.readyState!=='open'||!session()||channel.bufferedAmount>256000)return;
  // Cuando la máquina queda libre, el celular enlazado vuelve a tener el control de movimientos.
  if(!machine.remoteOwner&&!machine.busy&&machine.machine)try{machine.setRemoteOwner(true);}catch{}
  if(!force&&Date.now()-lastPublish<350)return;lastPublish=Date.now();
  try{const snapshot=machine.snapshot(),preview=snapshot.preview;try{snapshot.job=app.jobStudio?.snapshot();}catch{}snapshot.preview=preview===lastPreview?undefined:preview;sendPeerMessage(channel,{type:'state',session:session(),...snapshot});lastPreview=preview;}catch(e){status('No se pudo sincronizar: '+e.message);}
 }
 /** Publica una oferta con la credencial del celular emparejado y espera su respuesta. */
 async function listen(){
  if(!device||stopped)return;teardown();const mine=generation;
  try{
   peer=createPeer();channel=peer.createDataChannel('lz-box-'+device.session,{ordered:true});
   gate=new CommandGate(async(action,args)=>{if(channel?.readyState!=='open')throw Error('Enlace desconectado.');await machine.remoteCommand(action,args);});
   channel.onopen=()=>{if(mine!==generation)return;clearTimeout(answerTimer);clearTimeout(listenTimer);
    try{machine.setRemoteOwner(true);}catch{}
    $('peerRevoke').disabled=false;$('peerQR').replaceChildren();
    status(machine.remoteOwner?'Celular conectado con control de movimientos. Stop sigue disponible en la computadora.':'Celular conectado. Recibirá el control de movimientos cuando la máquina quede libre.');
    publish(true);publishLibrary();publishTimer=setInterval(()=>publish(),700);};
   channel.onmessage=async event=>{if(typeof event.data!=='string'||event.data.length>UPLOAD_CHUNK+2000)return;try{const message=JSON.parse(event.data);if(message.session!==session())return;if(message.type==='upload'){await receiveUpload(message);return;}if(message.type==='ping'){channel.send(JSON.stringify({type:'pong',session:session()}));return;}if(event.data.length>4096)return;const reply=await gate.handle(message);if(channel?.readyState==='open')channel.send(JSON.stringify(reply));publish(true);}catch(e){status(e.message);}};
   channel.onclose=()=>{if(mine===generation)lost('El celular se desconectó.');};
   // «disconnected» suele ser pasajero (pantalla que se atenúa): se espera antes de darlo por perdido.
   peer.onconnectionstatechange=()=>{if(mine!==generation||!peer)return;const s=peer.connectionState;if(s==='failed')lost('Enlace perdido.');else if(s==='disconnected'){clearTimeout(lostTimer);lostTimer=setTimeout(()=>{if(mine===generation&&peer?.connectionState!=='connected')lost('Enlace perdido.');},8000);}else if(s==='connected')clearTimeout(lostTimer);};
   const sdp=await gatherDescription(peer,'offer');if(mine!==generation)return;
   let created;for(let attempt=0;;attempt++){try{created=await pairingRequest('create',{session:device.session,secret:device.secret,sdp});break;}catch(e){if(attempt>=3||!/Espera dos/.test(e.message))throw e;await new Promise(r=>setTimeout(r,2100));if(mine!==generation)return;}}
   if(mine!==generation)return;
   if(channel?.readyState!=='open')status(open.dataset.link==='on'?'':'Esperando al celular emparejado… Abre la página del control en el celular; se conecta solo.');
   const expires=created.expires||Date.now()+300000;
   const waitAnswer=async()=>{if(mine!==generation||!peer)return;if(Date.now()>expires-15000){listen();return;}try{const result=await pairingRequest('poll',{session:device.session});if(mine!==generation)return;if(result.answer){await peer.setRemoteDescription({type:'answer',sdp:result.answer});status('Celular detectado. Completando enlace local…');return;}}catch(e){if(mine!==generation)return;if(/expir|revoc/i.test(e.message)){listen();return;}status(e.message);}answerTimer=setTimeout(waitAnswer,1200);};
   waitAnswer();
  }catch(e){if(mine!==generation)return;status(e.message+' Se reintentará en unos segundos.');listenTimer=setTimeout(listen,8000);}
 }
 /** El celular consulta la biblioteca de esta computadora (y de la cuenta, si hay sesión). */
 function libraryItems(){
  const studio=app.jobStudio,out=[];
  const thumb=t=>typeof t==='string'&&t.length<60000&&/^data:image\/(png|jpeg|webp);base64,/.test(t)?t:null;
  for(const i of studio?.library.items||[])out.push({scope:'file',id:i.id,kind:i.source?.type==='image'?'image':'svg',name:i.name,dims:i.dims?`${i.dims.width} × ${i.dims.height} mm`:'',ops:(i.opsSummary||[]).filter(o=>o.enabled!==false).map(o=>o.name),where:i.where,synced:!!i.synced,deleted:!!i.deletedAt,updated:i.updated,thumb:thumb(i.thumb)});
  for(const i of app.workshop?.libraryApi?.items()||[])out.push({scope:'box',id:i.id,kind:i.kind,name:i.name||i.state?.name,dims:i.state?`${i.state.width} × ${i.state.depth} × ${i.state.height} mm`:'',ops:['Corte'],where:'browser',synced:false,deleted:false,updated:i.updated,thumb:thumb(i.thumb)});
  for(const t of app.workshop?.boxTrash?.()||[])out.push({scope:'box',id:t.item.id,kind:t.item.kind,name:t.item.name||t.item.state?.name,dims:'',ops:[],where:'browser',synced:false,deleted:true,updated:t.deletedAt,thumb:null});
  return {cloud:studio?.library.cloudState||'unknown',cloudMessage:studio?.library.cloudMessage||'',items:out.sort((a,b)=>String(b.updated).localeCompare(String(a.updated))).slice(0,200)};
 }
 function publishLibrary(){if(channel?.readyState!=='open'||!session())return;try{sendPeerMessage(channel,{type:'library',session:session(),...libraryItems()});}catch(e){status('No se pudo enviar la biblioteca: '+e.message);}}
 async function receiveUpload(m){
  const reply=(ok,error='')=>{if(channel?.readyState==='open')channel.send(JSON.stringify({type:'upload-reply',upload:m.upload,ok,error}));};
  if(typeof m.upload!=='string'||m.upload.length>80||!Number.isInteger(m.index)||!Number.isInteger(m.count)||m.count<1||m.count>Math.ceil(UPLOAD_MAX/UPLOAD_CHUNK)||typeof m.data!=='string'||m.data.length>UPLOAD_CHUNK)return reply(false,'Fragmento inválido.');
  if(m.index===0){if(typeof m.name!=='string'||!['image/svg+xml','image/png','image/jpeg'].includes(m.mime))return reply(false,'Formato no compatible. Usa SVG, PNG o JPG.');upload={id:m.upload,count:m.count,parts:[],name:m.name.slice(0,120),mime:m.mime,started:Date.now()};}
  if(!upload||upload.id!==m.upload||upload.parts.length!==m.index||Date.now()-upload.started>120000){upload=null;return reply(false,'Transferencia incompleta. Vuelve a enviar el archivo.');}
  upload.parts.push(m.data);if(upload.parts.length<upload.count)return;
  const done=upload;upload=null;
  try{if(machine.busy)throw Error('Hay una operación activa. Espera para importar.');await app.jobStudio.receiveFile({name:done.name,type:done.mime,data:done.parts.join('')});reply(true);publish(true);}
  catch(e){reply(false,e.message);}
 }
 open.onclick=()=>dialog.showModal();$('peerClose').onclick=()=>dialog.close();
 /** Primer emparejamiento: el QR lleva la credencial que el celular guardará. */
 $('peerGenerate').onclick=async()=>{
  $('peerGenerate').disabled=true;
  try{
   const previous=session();teardown();if(previous)await pairingRequest('remove',{session:previous}).catch(()=>{});
   device={session:crypto.randomUUID(),secret:pairingSecret()};writeDevice(device);
   const link=new URL('./remote.html',document.location.href);link.hash='link='+device.session+'.'+device.secret;$('peerLink').value=link.href;
   const qr=qrcode(0,'L');qr.addData(link.href);qr.make();$('peerQR').innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true});
   $('peerRevoke').disabled=false;await listen();
   status('Escanea el QR. El celular queda emparejado y se reconectará solo; el QR solo hace falta la primera vez.');
  }catch(e){status(e.message);}finally{$('peerGenerate').disabled=false;}
 };
 $('peerAccept').onclick=async()=>{try{if(!peer)throw Error('Genera un emparejamiento nuevo.');const answer=await decodePairing($('peerAnswer').value.trim(),'answer');if(answer.session!==session())throw Error('La respuesta pertenece a otro emparejamiento.');await peer.setRemoteDescription({type:'answer',sdp:answer.sdp});status('Respuesta aceptada. Esperando conexión local…');}catch(e){status(e.message);}};
 $('peerGrant').onclick=()=>{try{if(channel?.readyState!=='open')throw Error('No hay un celular conectado.');machine.setRemoteOwner(true);publish(true);}catch(e){status(e.message);}};
 $('peerRevoke').onclick=()=>revoke();
 // Al cerrar o recargar Box no se olvida el celular: solo se cierra este enlace.
 document.defaultView.addEventListener('pagehide',()=>{stopped=true;teardown();});
 if(device){$('peerRevoke').disabled=false;status('Celular emparejado. Esperando que se conecte…');listen();}else status('Sin celular emparejado. La computadora tiene el control.');
 return {publish,publishLibrary,revoke,forget:revoke,open:()=>dialog.showModal(),get connected(){return channel?.readyState==='open';}};
}
