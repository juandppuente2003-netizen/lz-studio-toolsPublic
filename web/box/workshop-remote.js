import qrcode from './vendor/qrcode.mjs';
import {createPeer,gatherDescription,encodePairing,decodePairing,CommandGate,sendPeerMessage} from './peer-transport.js?v=1';
import {pairingRequest,pairingSecret} from './peer-signaling.js?v=1';

export function mountRemoteHost(app,machine,mount){
 const open=document.createElement('button');open.type='button';open.className='btn outline';open.textContent='Control desde celular';mount.append(open);
 const dialog=document.createElement('dialog');dialog.className='workshop-remote-dialog';dialog.setAttribute('aria-labelledby','peerTitle');
 dialog.innerHTML='<header class="dialog-header"><h2 id="peerTitle">Operar junto a la máquina</h2><button type="button" id="peerClose" class="btn quiet">Cerrar ventana</button></header><p>La computadora conserva el USB. Deja Box abierto y ambos dispositivos en la misma red local. No se abre ningún puerto ni se comparte el código USB.</p><ol><li>Genera el enlace y escanea el QR con el celular.</li><li>El celular mostrará una respuesta: cópiala y pégala aquí una vez.</li><li>Cuando el enlace esté conectado, pulsa Ceder control.</li></ol><button type="button" id="peerGenerate" class="btn primary">Generar emparejamiento</button><div id="peerQR" class="workshop-peer-qr"></div><label>Enlace para el celular<input id="peerLink" readonly></label><label>Respuesta del celular<textarea id="peerAnswer" rows="3" spellcheck="false" autocomplete="off"></textarea></label><div class="workshop-inline-actions"><button type="button" id="peerAccept" class="btn outline">Aceptar respuesta</button><button type="button" id="peerGrant" class="btn primary" disabled>Ceder control al celular</button><button type="button" id="peerRevoke" class="btn outline" disabled>Recuperar control y cerrar enlace</button></div><p id="peerStatus" role="status">Sin enlace. La computadora tiene el control.</p>';
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
 let peer=null,channel=null,session=null,expires=0,gate=null,deadline=null,publishTimer=null,lastPublish=0,lastPreview='',answerTimer=null,pairGeneration=0;
 const instructions=dialog.querySelector('ol');instructions.innerHTML='<li>Genera el QR y escanéalo con el celular.</li><li>Espera: las pantallas completan el enlace automáticamente.</li><li>Al conectar, este celular recibe el control de movimientos automáticamente.</li>';
 $('peerGrant').hidden=true;$('peerAnswer').closest('label').hidden=true;$('peerAccept').hidden=true;
 const status=message=>{$('peerStatus').textContent=message;};
 function revoke(message='Enlace cerrado. La computadora tiene el control.'){
  const previous=session;++pairGeneration;clearTimeout(answerTimer);answerTimer=null;
  if(previous)pairingRequest('remove',{session:previous}).catch(()=>{});
  gate?.close();machine.setRemoteOwner(false);clearTimeout(deadline);clearInterval(publishTimer);publishTimer=null;
  const oldChannel=channel;channel=null;oldChannel?.close();peer?.close();peer=null;session=null;lastPreview='';
  $('peerGrant').disabled=true;$('peerRevoke').disabled=true;$('peerQR').replaceChildren();$('peerLink').value='';$('peerAnswer').value='';status(message);
 }
 function publish(force=false){
  if(channel?.readyState!=='open'||!session||channel.bufferedAmount>256000)return;
  if(!force&&Date.now()-lastPublish<350)return;lastPublish=Date.now();
  try{const snapshot=machine.snapshot(),preview=snapshot.preview;snapshot.preview=preview===lastPreview?undefined:preview;sendPeerMessage(channel,{type:'state',session,...snapshot});lastPreview=preview;}catch(e){status('No se pudo sincronizar: '+e.message);}
 }
 open.onclick=()=>dialog.showModal();$('peerClose').onclick=()=>dialog.close();
 $('peerGenerate').onclick=async()=>{
  if(machine.busy)return status('Espera a que termine la operación antes de emparejar.');
  $('peerGenerate').disabled=true;
  try{revoke();const generation=pairGeneration;peer=createPeer();session=crypto.randomUUID();expires=Date.now()+300000;channel=peer.createDataChannel('lz-box-'+session,{ordered:true});
   gate=new CommandGate(async(action,args)=>{if(channel?.readyState!=='open')throw Error('Enlace desconectado.');await machine.remoteCommand(action,args);});
   channel.onopen=()=>{try{machine.setRemoteOwner(true);clearTimeout(deadline);$('peerRevoke').disabled=false;status('Celular enlazado con control de movimientos. Puedes recuperar el control aquí.');publish(true);publishTimer=setInterval(()=>publish(),700);}catch(e){revoke(e.message);}};
   channel.onmessage=async event=>{if(typeof event.data!=='string'||event.data.length>4096)return;try{const message=JSON.parse(event.data);if(message.session!==session)return;const reply=await gate.handle(message);if(channel?.readyState==='open')channel.send(JSON.stringify(reply));publish(true);}catch(e){status(e.message);}};
   channel.onclose=()=>{if(channel)revoke('El celular se desconectó. La computadora recuperó el control; no se reenvió ninguna orden.');};
   peer.onconnectionstatechange=()=>{if(peer&&['failed','disconnected'].includes(peer.connectionState))revoke('Enlace perdido. La computadora recuperó el control.');};
   status('Preparando enlace cifrado en la red local…');const sdp=await gatherDescription(peer,'offer');if(generation!==pairGeneration)return;
   const secret=pairingSecret(),created=await pairingRequest('create',{session,secret,sdp});if(generation!==pairGeneration){pairingRequest('remove',{session:created.session}).catch(()=>{});return;}expires=created.expires;
   const link=new URL('./remote.html',document.location.href);link.hash='link='+session+'.'+secret;$('peerLink').value=link.href;
   const qr=qrcode(0,'L');qr.addData(link.href);qr.make();$('peerQR').innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true});
   status('Escanea el QR. La conexión se completará automáticamente; el celular recibirá el control al conectar.');deadline=setTimeout(()=>revoke('El QR expiró. Genera otro para enlazar.'),Math.max(0,expires-Date.now()));
   async function waitAnswer(){if(generation!==pairGeneration||!peer||Date.now()>expires)return;try{const result=await pairingRequest('poll',{session});if(generation!==pairGeneration)return;if(result.answer){await peer.setRemoteDescription({type:'answer',sdp:result.answer});status('Celular detectado. Completando enlace local…');return;}}catch(e){if(generation===pairGeneration)status(e.message);}if(generation===pairGeneration)answerTimer=setTimeout(waitAnswer,1000);}
   waitAnswer();
  }catch(e){revoke(e.message);}finally{$('peerGenerate').disabled=false;}
 };
 $('peerAccept').onclick=async()=>{try{if(!peer||Date.now()>expires)throw Error('Genera un emparejamiento nuevo.');const answer=await decodePairing($('peerAnswer').value.trim(),'answer');if(answer.session!==session||answer.expires!==expires)throw Error('La respuesta pertenece a otro emparejamiento.');await peer.setRemoteDescription({type:'answer',sdp:answer.sdp});status('Respuesta aceptada. Esperando conexión local…');}catch(e){status(e.message);}};
 $('peerGrant').onclick=()=>{try{if(channel?.readyState!=='open')throw Error('No hay un celular conectado.');machine.setRemoteOwner(true);$('peerGrant').disabled=true;status('Control de movimientos: celular. Stop sigue disponible en la computadora.');publish(true);}catch(e){status(e.message);}};
 $('peerRevoke').onclick=()=>revoke();
 document.defaultView.addEventListener('pagehide',()=>revoke());
 return {publish,revoke,open:()=>dialog.showModal()};
}
