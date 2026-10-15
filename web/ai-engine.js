import {createIndexedDbCache} from './idb-cache.js';

const CACHE_NAME='lz-print-lab-super-resolution-cnn-v2';
const MODEL_URL='./models/realesr-general-x4v3-cnn/model.onnx';
const RUNTIME_ROOT='./vendor/onnxruntime/';
export const CNN_TILE_SIZE=160;
const modelCache=createIndexedDbCache(CACHE_NAME);
let ortPromise=null;

async function cachedResponse(){try{return await modelCache.match(MODEL_URL);}catch{return undefined;}}

async function cacheModel(onProgress){
  const cached=await cachedResponse();
  if(cached){onProgress?.(100,'cached');return true;}
  const response=await fetch(MODEL_URL,{cache:'force-cache'});
  if(!response.ok)throw Error(`No se pudo cargar el modelo CNN (${response.status}).`);
  const total=Number(response.headers.get('content-length'))||0;
  if(!response.body||!total){try{await modelCache.put(MODEL_URL,response);}catch{}onProgress?.(100,'download');return true;}
  const reader=response.body.getReader(),parts=[];let received=0;
  for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);received+=value.byteLength;onProgress?.(Math.min(99,received/total*100),'download');}
  const blob=new Blob(parts,{type:'application/octet-stream'});
  try{await modelCache.put(MODEL_URL,new Response(blob));}catch{}
  onProgress?.(100,'download');
  return true;
}

export async function prefetchSuperResolution(_backend,onProgress){
  const runtimeUrls=[
    RUNTIME_ROOT+'ort.webgpu.bundle.min.mjs',
    RUNTIME_ROOT+'ort-wasm-simd-threaded.jsep.mjs',
    RUNTIME_ROOT+'ort-wasm-simd-threaded.jsep.wasm'
  ];
  const results=await Promise.allSettled([
    cacheModel(onProgress),
    ...runtimeUrls.map(url=>fetch(url,{cache:'force-cache'}).then(response=>{if(!response.ok)throw Error(String(response.status));return response.arrayBuffer();}))
  ]);
  return results.every(result=>result.status==='fulfilled');
}

async function loadOrt(){
  if(!ortPromise)ortPromise=import('./vendor/onnxruntime/ort.webgpu.bundle.min.mjs').then(ort=>{
    ort.env.wasm.wasmPaths=new URL(RUNTIME_ROOT,location.href).href;
    ort.env.wasm.numThreads=window.crossOriginIsolated?Math.max(1,Math.min(4,navigator.hardwareConcurrency||1)):1;
    ort.env.wasm.proxy=false;
    if(ort.env.webgpu)ort.env.webgpu.powerPreference='high-performance';
    return ort;
  });
  return ortPromise;
}

async function modelBytes(onProgress){
  let response=await cachedResponse();
  if(!response){await cacheModel(onProgress);response=await cachedResponse();}
  if(!response){response=await fetch(MODEL_URL,{cache:'force-cache'});if(!response.ok)throw Error('El modelo CNN no quedó disponible.');}
  return response.arrayBuffer();
}

function canvasTensor(ort,canvas){
  const width=canvas.width,height=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true});
  const rgba=ctx.getImageData(0,0,width,height).data,plane=width*height,data=new Float32Array(plane*3);
  for(let i=0,j=0;i<plane;i++,j+=4){data[i]=rgba[j]/255;data[plane+i]=rgba[j+1]/255;data[plane*2+i]=rgba[j+2]/255;}
  return new ort.Tensor('float32',data,[1,3,height,width]);
}

async function outputImage(tensor,inputWidth,inputHeight){
  const values=await tensor.getData(),dims=tensor.dims,modelHeight=Number(dims.at(-2)),modelWidth=Number(dims.at(-1));
  const width=inputWidth*2,height=inputHeight*2,plane=modelWidth*modelHeight,data=new Uint8ClampedArray(width*height*3);
  const stepX=Math.max(1,Math.round(modelWidth/width)),stepY=Math.max(1,Math.round(modelHeight/height)),samples=stepX*stepY;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const base=(y*width+x)*3,startX=x*stepX,startY=y*stepY;
    for(let channel=0;channel<3;channel++){
      let sum=0,offset=channel*plane;
      for(let yy=0;yy<stepY;yy++)for(let xx=0;xx<stepX;xx++)sum+=values[offset+(startY+yy)*modelWidth+startX+xx];
      data[base+channel]=Math.max(0,Math.min(255,Math.round(sum/samples*255)));
    }
  }
  return {data,width,height,channels:3};
}

export async function createOnnxSuperResolution(backend,onProgress){
  const ort=await loadOrt(),bytes=await modelBytes(onProgress);
  onProgress?.(100,'optimizing');
  const session=await ort.InferenceSession.create(bytes,{executionProviders:[backend],graphOptimizationLevel:'all',enableCpuMemArena:true,enableMemPattern:true});
  const inputName=session.inputNames[0],outputName=session.outputNames[0];
  const warmup=new ort.Tensor('float32',new Float32Array(3*CNN_TILE_SIZE*CNN_TILE_SIZE),[1,3,CNN_TILE_SIZE,CNN_TILE_SIZE]);
  try{const outputs=await session.run({[inputName]:warmup});outputs[outputName]?.dispose?.();}finally{warmup.dispose?.();}
  onProgress?.(100,'ready');
  const run=async canvas=>{
    if(canvas.width!==CNN_TILE_SIZE||canvas.height!==CNN_TILE_SIZE)throw Error(`El bloque CNN debe medir ${CNN_TILE_SIZE} × ${CNN_TILE_SIZE} px.`);
    const input=canvasTensor(ort,canvas);
    try{const outputs=await session.run({[inputName]:input}),output=outputs[outputName];try{return await outputImage(output,canvas.width,canvas.height);}finally{output?.dispose?.();}}
    finally{input.dispose?.();}
  };
  run.dispose=()=>session.release();
  return run;
}
