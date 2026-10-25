import {createPeer,gatherDescription,encodePairing,decodePairing,PeerMessageReader} from './peer-transport.js?v=1';
const $=id=>document.getElementById(id);let peer=null,channel=null,session=null,state=null,seq=0,awaiting=false;const pending=new Map();
const status=message=>{$('remoteStatus').textContent=message;};
function controls(){const owner=state?.owner==='phone',idle=owner&&!state?.busy&&!awaiting&&channel?.readyState==='open';for(const id of ['remoteUp','remoteLeft','remoteRight','remoteDown'])$(id).disabled=!idle||!state?.hasPosition;$('remoteHome').disabled=!idle;$('remoteFrame').disabled=!idle||!state?.canRun;$('remoteCut').disabled=!idle||!state?.canRun;$('remoteStop').disabled=!state?.canPause||channel?.readyState!=='open';$('remoteResume').disabled=!owner||!state?.canResume||awaiting;$('remoteCancel').disabled=!state?.busy||channel?.readyState!=='open';$('remotePaused').hidden=!['pausing','paused','resuming','error','unknown'].includes(state?.state);}
function disconnected(){state=null;awaiting=false;$('remoteLinkState').textContent='Enlace perdido';for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Enlace desconectado.'));}pending.clear();controls();status('Vuelve a enlazar desde la computadora. No se repetirá ninguna orden.');}
function receive(message){
 if(message.type==='reply'){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.ok?p.resolve():p.reject(Error(message.error));}return;}
 if(message.type!=='state'||message.session!==session)return;state=message;$('remotePairing').hidden=true;$('remoteMachine').hidden=false;$('remoteLinkState').textContent='Enlace local cifrado';$('remoteJobName').textContent=message.name;$('remoteMachineState').textContent=message.label;$('remoteOwner').textContent=message.owner==='phone'?'Control de movimientos: este celular.':'La computadora tiene el control; puedes consultar y solicitar Stop.';
 $('remotePosition').textContent=Array.isArray(message.position)?`X ${message.position[0].toFixed(2)} · Y ${message.position[1].toFixed(2)} mm · estimada`:'Sin referencia';
 // Only the locally generated SVG subset is accepted; never arbitrary markup.
 const svg=message.preview===undefined?null:new DOMParser().parseFromString(message.preview||'','image/svg+xml').documentElement;
 const tags=new Set(['svg','rect','path','circle']);const attributes=new Set(['xmlns','viewBox','role','aria-label','width','height','fill','stroke','stroke-width','d','cx','cy','r']);
 if(svg?.localName==='svg'&&[svg,...svg.querySelectorAll('*')].every(n=>tags.has(n.localName)&&[...n.attributes].every(a=>attributes.has(a.name)&&!/[<>]/.test(a.value))))$('remotePreview').replaceChildren(document.importNode(svg,true));
 status(message.message);controls();
}
async function command(action,args={}){
 if(channel?.readyState!=='open')return status('Sin enlace con la computadora.');
 const priority=['pause','cancel'].includes(action);if(awaiting&&!priority)return;const id=++seq;
 if(!priority)awaiting=true;controls();
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('No llegó respuesta. Revisa la computadora; no se reenvió la orden.'));},15000);pending.set(id,{resolve,reject,timer});channel.send(JSON.stringify({type:'command',session,id,action,args}));});}
 catch(e){status(e.message);}finally{if(!priority)awaiting=false;controls();}
}
for(const [id,x,y] of [['remoteUp',0,-1],['remoteLeft',-1,0],['remoteRight',1,0],['remoteDown',0,1]])$(id).onclick=()=>command('jog',{dx:x*Number($('remoteStep').value),dy:y*Number($('remoteStep').value)});
for(const [id,action] of [['remoteHome','home'],['remoteFrame','frame'],['remoteCut','cut'],['remoteStop','pause'],['remoteResume','resume'],['remoteCancel','cancel']])$(id).onclick=()=>command(action);
$('remotePair').onclick=async()=>{try{
 $('remotePair').disabled=true;const code=new URLSearchParams(location.hash.slice(1)).get('pair');const offer=await decodePairing(code,'offer');
 session=offer.session;peer=createPeer();const reader=new PeerMessageReader();peer.ondatachannel=event=>{channel=event.channel;if(channel.label!=='lz-box-'+session){channel.close();return;}channel.onopen=()=>{$('remoteLinkState').textContent='Enlazado';status('Esperando el estado de la computadora…');};channel.onclose=disconnected;channel.onmessage=e=>{try{const message=reader.accept(e.data);if(message)receive(message);}catch{status('Estado recibido inválido; vuelve a enlazar si no se recupera.');}};};
 peer.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(peer.connectionState))disconnected();};await peer.setRemoteDescription({type:'offer',sdp:offer.sdp});
 const sdp=await gatherDescription(peer,'answer');$('remoteAnswer').value=await encodePairing({version:1,type:'answer',session,expires:offer.expires,sdp});$('remoteCopy').disabled=false;status('Copia la respuesta a la computadora y pulsa Aceptar respuesta. Después podrás ceder el control.');
 // The pairing payload stays in memory only and is removed from browser history.
 history.replaceState(null,'',location.pathname+location.search);
}catch(e){status(e.message);$('remotePair').disabled=false;}};
$('remoteCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('remoteAnswer').value);status('Respuesta copiada. Pégala en la computadora.');}catch{$('remoteAnswer').focus();$('remoteAnswer').select();status('Selecciona y copia la respuesta.');}};
window.addEventListener('pagehide',()=>{channel?.close();peer?.close();});controls();
