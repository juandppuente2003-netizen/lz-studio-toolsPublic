import {exportBands,OUTPUT_MAX_PIXELS,OUTPUT_MAX_SIDE} from './image-output.js';
import {exportTiledPng} from './exporter.js';
import {pngDensity} from './png.js';
export function requireTransferImage(source,busy=false){if(busy)throw Error('Espera a que termine el proceso actual.');if(!source)throw Error('Carga una imagen antes de continuar.');}
export async function canvasArtifact(image,name,dpi=300,widthCm=image?.width/dpi*2.54){
  requireTransferImage(image);if(image.width*image.height>OUTPUT_MAX_PIXELS||Math.max(image.width,image.height)>OUTPUT_MAX_SIDE)throw Error('Para pasar entre herramientas, reduce la salida a 140 MP y 24,000 px por lado.');if(image.width*image.height>16e6){return {blob:await exportBands({source:image,width:image.width,height:image.height,dpi}),name,width:image.width,height:image.height,dpi,widthCm};}const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);
  const raw=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!raw)throw Error('No se pudo preparar la imagen.');
  const blob=new Blob([pngDensity(new Uint8Array(await raw.arrayBuffer()),dpi)],{type:'image/png'});
  return {blob,name,width:canvas.width,height:canvas.height,dpi,widthCm};
}
export async function processedArtifact({source,width,height,dpi,params,name,onProgress}){
  requireTransferImage(source);if(width*height>OUTPUT_MAX_PIXELS||Math.max(width,height)>OUTPUT_MAX_SIDE)throw Error('Para pasar entre herramientas, reduce la salida a 140 MP y 24,000 px por lado.');
  const blob=await exportTiledPng({source,sourceWidth:source.width,sourceHeight:source.height,width,height,dpi,params,onProgress});
  return {blob,name,width,height,dpi,widthCm:params.widthCm};
}
