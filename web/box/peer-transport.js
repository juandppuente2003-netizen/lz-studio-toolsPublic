// Encrypted peer-to-peer transport. No relay, signaling service or USB token.
export const REMOTE_ACTIONS=new Set(['settings','pulse','home','jog','frame','cut','pause','resume','cancel','origin','source','op','op-move','op-order','scope','place','place-center','review-ok','save','lib-list','lib-open','lib-duplicate','lib-rename','lib-delete','lib-restore']);
// Archivos del celular: fragmentos de 12 000 caracteres, hasta 11 MB codificados (8 MB de archivo).
export const UPLOAD_CHUNK=12000,UPLOAD_MAX=11200000;
export async function encodePairing(value){
 const bytes=new TextEncoder().encode(JSON.stringify(value));
 const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 return btoa(String.fromCharCode(...compressed)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function decodePairing(code,expectedType){
 if(typeof code!=='string'||code.length>16000||!/^[A-Za-z0-9_-]+$/.test(code))throw Error('Código de emparejamiento inválido.');
 const bytes=Uint8Array.from(atob(code.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)),reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 const chunks=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>40000){await reader.cancel();throw Error('Código demasiado grande.');}chunks.push(value);}}catch{throw Error('No se pudo leer el emparejamiento.');}
 const decoded=new Uint8Array(size);let offset=0;for(const chunk of chunks){decoded.set(chunk,offset);offset+=chunk.length;}
 const value=JSON.parse(new TextDecoder().decode(decoded));
 if(value.version!==1||value.type!==expectedType||typeof value.session!=='string'||!/^[-\w]{20,80}$/.test(value.session)||typeof value.sdp!=='string'||value.sdp.length>30000||!Number.isFinite(value.expires)||value.expires<Date.now()||value.expires>Date.now()+360000)throw Error('Emparejamiento expirado o incompatible. Genera uno nuevo.');
 return value;
}
export async function gatherDescription(peer,type){
 await peer.setLocalDescription(await (type==='offer'?peer.createOffer():peer.createAnswer()));
 if(peer.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{peer.removeEventListener('icegatheringstatechange',changed);reject(Error('No se completó el enlace local. Revisa la red Wi-Fi.'));},12000);
  const changed=()=>{if(peer.iceGatheringState==='complete'){clearTimeout(timeout);peer.removeEventListener('icegatheringstatechange',changed);resolve();}};peer.addEventListener('icegatheringstatechange',changed);changed();
 });
 return peer.localDescription.sdp;
}
export function createPeer(){
 if(typeof RTCPeerConnection==='undefined')throw Error('Este navegador no admite el enlace entre dispositivos.');
 return new RTCPeerConnection({iceServers:[]});
}
export class CommandGate{
 constructor(execute){this.execute=execute;this.responses=new Map();this.sequence=0;this.running=false;this.closed=false;}
 close(){this.closed=true;}
 async handle(message){
  if(this.closed)throw Error('Sesión remota cerrada.');
  if(!message||message.type!=='command'||!Number.isSafeInteger(message.id)||message.id<1||!REMOTE_ACTIONS.has(message.action))throw Error('Comando remoto inválido.');
  if(this.responses.has(message.id))return this.responses.get(message.id);
  if(message.id<=this.sequence)throw Error('Comando repetido o fuera de orden.');
  this.sequence=message.id;
  const task=(async()=>{
   if(this.running&&!['pause','cancel'].includes(message.action))return {type:'reply',id:message.id,ok:false,error:'Ya hay una solicitud pendiente.'};
   const priority=['pause','cancel'].includes(message.action);if(!priority)this.running=true;
   try{await this.execute(message.action,message.args||{});return {type:'reply',id:message.id,ok:true};}
   catch(e){return {type:'reply',id:message.id,ok:false,error:e.message};}
   finally{if(!priority)this.running=false;}
  })();
  this.responses.set(message.id,task);while(this.responses.size>100)this.responses.delete(this.responses.keys().next().value);return task;
 }
}
export function sendPeerMessage(channel,value){
 const raw=JSON.stringify(value);if(raw.length>4000000)throw Error('La vista del trabajo es demasiado grande para sincronizar.');
 if(raw.length<=12000){channel.send(raw);return;}
 const transfer=crypto.randomUUID(),count=Math.ceil(raw.length/8000);
 for(let index=0;index<count;index++)channel.send(JSON.stringify({type:'chunk',transfer,index,count,data:raw.slice(index*8000,(index+1)*8000)}));
}
export class PeerMessageReader{
 constructor(){this.pending=null;}
 accept(raw){
  if(typeof raw!=='string'||raw.length>20000)throw Error('Mensaje remoto demasiado grande.');
  const message=JSON.parse(raw);if(message.type!=='chunk')return message;
  if(typeof message.transfer!=='string'||message.transfer.length>80||!Number.isInteger(message.count)||message.count<1||message.count>500||!Number.isInteger(message.index)||typeof message.data!=='string'||message.data.length>8000)throw Error('Fragmento remoto inválido.');
  if(message.index===0)this.pending={transfer:message.transfer,count:message.count,parts:[],created:Date.now()};
  const p=this.pending;if(!p||p.transfer!==message.transfer||p.count!==message.count||p.parts.length!==message.index||Date.now()-p.created>10000){this.pending=null;throw Error('Vista incompleta; espera la siguiente sincronización.');}
  p.parts.push(message.data);if(p.parts.length!==p.count)return null;this.pending=null;return JSON.parse(p.parts.join(''));
 }
}
