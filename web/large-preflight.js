import {drawBand,exportBands} from './image-output.js';
export async function largePreflight({source,dimensions,tool,options,action,onProgress,setWorker,signal}){
 signal?.throwIfAborted();
 const worker=new Worker('large-preflight-worker.js',{type:'module'});setWorker?.(worker);
 const request=(m,transfer=[])=>new Promise((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return;}const abort=()=>{worker.terminate();finish(reject,signal.reason||new DOMException('Proceso cancelado.','AbortError'));};const finish=(fn,value)=>{signal?.removeEventListener('abort',abort);fn(value);};signal?.addEventListener('abort',abort,{once:true});worker.onmessage=({data})=>data.error?finish(reject,Error(data.error)):finish(resolve,data);worker.onerror=()=>finish(reject,Error('No se pudo procesar la imagen. Cierra otras pestañas o prueba en una computadora.'));worker.postMessage(m,transfer);});
 const scale=Math.min(1,1100/Math.max(dimensions.width,dimensions.height)),previewWidth=Math.max(1,Math.round(dimensions.width*scale)),previewHeight=Math.max(1,Math.round(dimensions.height*scale)),band=document.createElement('canvas');
 try{
  await request({type:'init',dimensions,tool,options,previewWidth,previewHeight});
  for(let y=0;y<dimensions.height;y+=64){signal?.throwIfAborted();const rows=Math.min(64,dimensions.height-y),image=drawBand(band,source,dimensions.width,dimensions.height,y,rows);await request({type:'scan',buffer:image.data.buffer,rows,y},[image.data.buffer]);onProgress?.((y+rows)/dimensions.height*(action==='correct'?.5:1));await new Promise(requestAnimationFrame);}
  signal?.throwIfAborted();const report=await request({type:'finish'});let blob=null;
  if(action==='correct'){
   const minimumPx=Number(options.minimumMm)*dimensions.width/dimensions.widthCm/10,margin=tool==='thickness'?Math.ceil(minimumPx*3)+Math.abs(Number(options.delta||0))+4:0;
   blob=await exportBands({source,...dimensions,process:async(image,y)=>{
    signal?.throwIfAborted();const top=Math.max(0,y-margin),bottom=Math.min(dimensions.height,y+image.height+margin),expanded=drawBand(band,source,dimensions.width,dimensions.height,top,bottom-top);
    const response=await request({type:'correct',buffer:expanded.data.buffer,rows:expanded.height,y,top},[expanded.data.buffer]);const pixels=new Uint8ClampedArray(response.buffer);image.data.set(pixels.subarray((y-top)*dimensions.width*4,(y-top+image.height)*dimensions.width*4));
   },onProgress:value=>onProgress?.(.5+value*.5)});
  }
  signal?.throwIfAborted();return {...report,blob,previewWidth,previewHeight};
 }finally{worker.terminate();band.width=band.height=1;setWorker?.(null);}
}
