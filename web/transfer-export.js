import {exportTiledPng} from './exporter.js';
import {pngDensity} from './png.js';
export function requireTransferImage(source,busy=false){if(busy)throw Error('Espera a que termine el proceso actual.');if(!source)throw Error('Carga una imagen antes de continuar.');}
export async function canvasArtifact(image,name,dpi=300,widthCm=image?.width/dpi*2.54){
  requireTransferImage(image);if(image.width*image.height>32e6||Math.max(image.width,image.height)>8192)throw Error('Para pasar entre herramientas, reduce la salida a 32 MP y 8192 px por lado.');const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);
  const raw=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!raw)throw Error('No se pudo preparar la imagen.');
  const blob=new Blob([pngDensity(new Uint8Array(await raw.arrayBuffer()),dpi)],{type:'image/png'});
  return {blob,name,width:canvas.width,height:canvas.height,dpi,widthCm};
}
export async function processedArtifact({source,width,height,dpi,params,name,onProgress}){
  requireTransferImage(source);if(width*height>32e6||Math.max(width,height)>8192)throw Error('Para pasar entre herramientas, reduce la salida a 32 MP y 8192 px por lado.');
  const blob=await exportTiledPng({source,sourceWidth:source.width,sourceHeight:source.height,width,height,dpi,params,onProgress});
  return {blob,name,width,height,dpi,widthCm:params.widthCm};
}
