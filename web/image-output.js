import {pngBlobDensity} from './png.js';
import {assemblePng} from './exporter.js';
export const OUTPUT_MAX_PIXELS=140_000_000,OUTPUT_MAX_SIDE=24000;
export function outputDimensions(widthCm,dpi,aspect,maxPixels=OUTPUT_MAX_PIXELS,maxSide=OUTPUT_MAX_SIDE){
 if(!Number.isFinite(widthCm)||widthCm<.5||widthCm>500||!Number.isFinite(dpi)||dpi<1||dpi>9600||!Number.isFinite(aspect)||aspect<=0)throw Error('Indica un ancho de 0.5 a 500 cm y una resolución válida.');
 const width=Math.max(1,Math.round(widthCm/2.54*dpi)),height=Math.max(1,Math.round(width/aspect));
 if(width*height>maxPixels||Math.max(width,height)>maxSide)throw Error(`La salida supera ${maxPixels/1e6} MP o ${maxSide.toLocaleString('en-US')} px por lado. Reduce el ancho o los ppp.`);
 return {width,height,widthCm,dpi};
}
export function drawBand(canvas,source,width,height,y,rows,rect){
 canvas.width=width;canvas.height=rows;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const box=rect||{x:0,y:0,width:source.width||source.naturalWidth,height:source.height||source.naturalHeight};
 // One consistent transform across bands preserves interpolation at seams.
 ctx.setTransform(width/box.width,0,0,height/box.height,-box.x*width/box.width,-box.y*height/box.height-y);
 ctx.drawImage(source,0,0);ctx.setTransform(1,0,0,1,0,0);
 const image=ctx.getImageData(0,0,width,rows);if(image.data.length!==width*rows*4)throw Error('No se pudo abrir la imagen en este dispositivo. Prueba en una computadora.');return image;
}
export async function exportBands({source,width,height,dpi,rect,process,onProgress}){
 if(typeof CompressionStream==='undefined')throw Error('Actualiza el navegador para exportar archivos grandes.');
 const compressor=new CompressionStream('deflate'),writer=compressor.writable.getWriter(),read=new Response(compressor.readable).arrayBuffer();read.catch(()=>{});
 const band=document.createElement('canvas');
 try{for(let y=0;y<height;y+=64){const rows=Math.min(64,height-y),image=drawBand(band,source,width,height,y,rows,rect);if(process)await process(image,y);const raw=new Uint8Array(rows*(width*4+1));for(let r=0;r<rows;r++)raw.set(image.data.subarray(r*width*4,(r+1)*width*4),r*(width*4+1)+1);await writer.write(raw);onProgress?.((y+rows)/height);await new Promise(requestAnimationFrame);}await writer.close();return assemblePng(width,height,dpi,new Uint8Array(await read));}
 catch(error){await writer.abort(error).catch(()=>{});throw error;}finally{band.width=band.height=1;}
}
export async function resizedArtifact(artifact,options,onProgress){
 const d=outputDimensions(options.widthCm,options.dpi,artifact.width/artifact.height);
 if(d.width===artifact.width&&d.height===artifact.height&&d.dpi===artifact.dpi)return {...artifact,blob:await pngBlobDensity(artifact.blob,d.dpi)};
 const image=await createImageBitmap(artifact.blob);
 try{return {...artifact,...d,blob:await exportBands({source:image,...d,onProgress})};}finally{image.close?.();}
}
