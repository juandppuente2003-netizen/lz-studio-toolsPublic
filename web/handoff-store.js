// One-shot, origin-local transfers. No image history or permanent projects.
export const TRANSFER_TTL=2*60*60*1000;
export const DESTINATIONS=[
  ['crop','Recortar imagen','crop.html','crop'],
  ['halftone','Semitonos','editor.html?tool=halftone','editor'],
  ['color','Mejorar colores','color-enhance.html','color'],
  ['editor','Quitar fondo color','editor.html?tool=remove','editor'],
  ['recolor','Reemplazar color','editor.html?tool=recolor','editor'],
  ['thickness','Auditor de grosor','thickness.html','thickness'],
  ['opacity','Semitransparencias','opacity.html','opacity'],
  ['texture','Texturas','textures.html','texture'],
  ['upscale','Mejorar imágenes IA','upscale.html','upscale'],
  ['mockups','Mockups','mockups.html','mockups'],
  ['sheet','Pliego DTF','gang-sheet.html','sheet'],
  ['vectorize','Vectorizar','vectorize.html','vectorize'],
  ['analyzer','Revisar DTF','analyzer.html','analyzer']
];
export function validateArtifact(artifact,destination){
  if(!artifact?.blob||artifact.blob.type!=='image/png'||!artifact.blob.size)throw Error('Carga una imagen y prepara el resultado antes de continuar.');
  const {width,height}=artifact,maxPixels=140e6;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('No se pudo comprobar el tamaño de la imagen.');
  if(width*height>maxPixels||Math.max(width,height)>24000||artifact.blob.size>150*1024*1024)throw Error(`Esta herramienta admite hasta ${maxPixels/1e6} MP, 24,000 px por lado y 150 MB. Reduce la medida o resolución de salida para enviarla.`);
  if(!Number.isFinite(artifact.widthCm)||artifact.widthCm<=0||!Number.isFinite(artifact.dpi)||artifact.dpi<=0)throw Error('No se pudo comprobar la medida de la imagen.');
  if(['editor','halftone','recolor','color','opacity','texture','thickness'].includes(destination?.[0])&&(artifact.widthCm<.5||artifact.widthCm>100||artifact.dpi>9600))throw Error('Esta herramienta admite un ancho de 0.5 a 100 cm. Ajusta la medida de salida antes de enviarla.');
  return artifact;
}
function openDatabase(){return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('Este navegador no permite pasar la imagen. Habilita el almacenamiento del sitio e intenta de nuevo.'));return}
  const request=indexedDB.open('lz-image-transfer',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('transfers',{keyPath:'token'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error('No se pudo abrir el paso de imágenes. Revisa el almacenamiento del navegador.'));
  request.onblocked=()=>reject(Error('Cierra las otras pestañas de LZ y vuelve a intentar.'));
})}
async function transaction(mode,action){const db=await openDatabase();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('transfers',mode),store=tx.objectStore('transfers');let result;
  action(store,value=>{result=value});tx.oncomplete=()=>resolve(result);
  tx.onerror=tx.onabort=()=>reject(Error('No se pudo guardar o recuperar la imagen. Tu resultado sigue en la herramienta original.'));
})}finally{db.close()}}
export async function saveTransfer(artifact,destination,now=Date.now()){
  if(!DESTINATIONS.some(d=>d[0]===destination?.[0]))throw Error('Selecciona una herramienta válida.');
  validateArtifact(artifact,destination);
  const packet={...artifact,name:String(artifact.name||'diseno.png').slice(0,180),token:crypto.randomUUID(),target:destination[0],expires:now+TRANSFER_TTL};
  await transaction('readwrite',store=>{store.put(packet);const cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){if(row.value.expires<=now)row.delete();row.continue()}}});
  return packet.token;
}
export async function readTransfer(token,target,now=Date.now()){
  if(!/^[a-f0-9-]{36}$/i.test(token||''))throw Error('El enlace de la imagen no es válido.');
  const packet=await transaction('readonly',(store,set)=>{const req=store.get(token);req.onsuccess=()=>set(req.result)});
  if(!packet||packet.expires<=now)throw Error('Este paso de imagen caducó. Vuelve a la herramienta original y pulsa Continuar en…');
  if(packet.target!==target)throw Error('Esta imagen está destinada a otra herramienta.');
  validateArtifact(packet,DESTINATIONS.find(d=>d[0]===target));return packet;
}
export async function removeTransfer(token){await transaction('readwrite',store=>store.delete(token))}
