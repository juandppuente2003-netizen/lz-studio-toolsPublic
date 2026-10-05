import {outputDimensions,exportBands} from './image-output.js';
import {largePreflight} from './large-preflight.js';
import {premiumParams,validatePremiumZone} from './premium-engine.js';
export function workerRequest(worker,message,transfer=[],signal){
 return new Promise((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return;}
  const finish=(fn,value)=>{signal?.removeEventListener('abort',abort);worker.onmessage=worker.onerror=null;fn(value);};
  const abort=()=>{worker.terminate();finish(reject,signal.reason||new DOMException('Proceso cancelado.','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});worker.onmessage=({data})=>data.error?finish(reject,Error(data.error)):finish(resolve,data);worker.onerror=()=>finish(reject,Error('No se pudo completar este paso en el dispositivo.'));
  try{worker.postMessage(message,transfer);}catch(error){finish(reject,error);}
 });
}
export async function runPremiumPipeline({source,color,zone=null,widthCm,dpi,signal,onStage,onProgress}){
 const dimensions=outputDimensions(widthCm,dpi,source.width/source.height),params=premiumParams(color,widthCm,dpi);validatePremiumZone(zone);signal?.throwIfAborted();
 let image=null,blob=null,purged=0;const worker=new Worker('premium-worker.js',{type:'module'});
 const stage=(name,index)=>{signal?.throwIfAborted();onStage?.(name);return value=>onProgress?.((index+value)/6);};
 const replace=async next=>{signal?.throwIfAborted();const decoded=await createImageBitmap(next);if(signal?.aborted){decoded.close?.();signal.throwIfAborted();}image?.close?.();image=decoded;blob=next;};
 const audit=async(tool,options,action,progress)=>largePreflight({source:image,dimensions,tool,options,action,signal,onProgress:progress});
 try{
  const progress=stage('halftone',0);
  await replace(await exportBands({source,...dimensions,process:async(data,y)=>{signal?.throwIfAborted();const buffer=data.data.slice().buffer;const result=await workerRequest(worker,{type:'halftone',buffer,width:dimensions.width,rows:data.height,y,height:dimensions.height,params,zone},[buffer],signal);data.data.set(new Uint8ClampedArray(result.buffer));},onProgress:progress}));
  worker.terminate();
  let report=await audit('thickness',{minimumMm:.5,mode:'manual',delta:-1},'correct',stage('shrink',1));const shrunk=report.metrics.count;await replace(report.blob);
  const semi=await audit('opacity',{alphaMethod:'screen',sizeMm:1,threshold:50},'correct',stage('opacity',2));await replace(semi.blob);
  report=await audit('thickness',{minimumMm:.5,mode:'auto',delta:0},'correct',stage('thickness',3));await replace(report.blob);
  let dots=await audit('thickness',{minimumMm:.5,mode:'auto',delta:0},'analyze',stage('verify',4));
  // Edge clipping or merging can leave islands below the threshold. Remove
  // only those residual islands and scan again; never trust the correction.
  if(dots.metrics.count){purged=dots.metrics.count;const cleanup=await audit('thickness',{minimumMm:.5,mode:'purge',delta:0},'correct',()=>{});await replace(cleanup.blob);dots=await audit('thickness',{minimumMm:.5,mode:'auto',delta:0},'analyze',()=>{});}
  const alpha=await audit('opacity',{alphaMethod:'screen',sizeMm:1,threshold:50},'analyze',value=>onProgress?.((5+value)/6));signal?.throwIfAborted();
  if(dots.metrics.count||alpha.metrics.semi)throw Error('El archivo todavía tiene detalles pendientes. No se marcó como listo.');
  if(!alpha.metrics.visible)throw Error('El proceso dejó una imagen vacía. Elige otro color o una zona más pequeña.');
  return {blob,...dimensions,name:'LZ_semitonos_Premium.png',report:{smallDots:dots.metrics.count,semi:alpha.metrics.semi,visible:alpha.metrics.visible,purged,shrunk,minimumMm:.5}};
 }finally{worker.terminate();image?.close?.();}
}
