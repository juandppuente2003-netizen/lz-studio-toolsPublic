const imageFiles=new WeakMap();
export const originalImageBlob=image=>imageFiles.get(image);
// Importing an original is independent of the smaller working size used by IA.
export const IMPORT_MAX_BYTES=150*1024*1024;
export function validateImageFile(file){
  const type=(file.type||'').toLowerCase();
  const supported=['image/png','image/jpeg','image/jpg','image/pjpeg','image/webp'].includes(type);
  const unnamedType=!type||type==='application/octet-stream';
  if(!supported&&!(unnamedType&&/\.(png|jpe?g|webp)$/i.test(file.name||'')))throw Error('Usa una imagen PNG, JPG o WebP. Si es HEIC, conviértela a JPG o PNG.');
  if(file.size>IMPORT_MAX_BYTES)throw Error('La imagen supera 150 MB. Guarda una copia más ligera para importarla.');
}
export async function decodeImageFile(file){
  validateImageFile(file);
  // Some browsers cannot decode a valid file with createImageBitmap, or do not
  // implement it. The native image decoder is an independent fallback.
  if(typeof createImageBitmap==='function'){
    try{const image=await createImageBitmap(file,{imageOrientation:'from-image'});imageFiles.set(image,file);return image;}catch{}
  }
  const url=URL.createObjectURL(file);
  try{return await new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{imageFiles.set(image,file);image.width=image.naturalWidth;image.height=image.naturalHeight;resolve(image)};
    image.onerror=()=>reject(Error('No se pudo abrir la imagen. Prueba guardarla de nuevo como PNG o JPG.'));
    image.src=url;
  })}finally{URL.revokeObjectURL(url)}
}
export function validateImportSize(width,height){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw Error('La imagen no tiene dimensiones válidas.');
  if(width*height>140_000_000||Math.max(width,height)>24000)throw Error('Para cargar esta imagen, guarda una copia de hasta 140 MP y 24,000 px por lado.');
}
