import {assemblePng} from './exporter.js';
import {exportBands} from './image-output.js';
import {DotScanner} from './large-dot-engine.js';

// Check the actual PNG bytes AFTER every resampling/effect. Reconstruct PNG
// filters one row at a time; even a 410 MP sheet needs only bounded row memory.
export async function finishPrintExport(artifact,{onProgress,signal,correctAlpha=true,checkThickness=false,minimumMm=.5,preview=false}={}){
 const blob=artifact.blob,header=new Uint8Array(await blob.slice(0,33).arrayBuffer()),view=new DataView(header.buffer);
 if(header.length<33||header[0]!==137||String.fromCharCode(...header.subarray(1,4))!=='PNG')throw Error('La descarga no contiene un PNG válido.');
 const width=view.getUint32(16),height=view.getUint32(20);
 if(width!==artifact.width||height!==artifact.height)throw Error('Las dimensiones del PNG final no coinciden. Vuelve a exportar.');
 if(header[24]!==8||header[25]!==6||header[28]!==0){
  const bitmap=await createImageBitmap(blob);
  try{const converted=await exportBands({source:bitmap,width,height,dpi:artifact.dpi});return await finishPrintExport({...artifact,blob:converted},{onProgress,signal,correctAlpha,checkThickness,minimumMm,preview});}finally{bitmap.close?.();}
 }
 const parts=[];
 for(let p=8;p+12<=blob.size;){signal?.throwIfAborted();const bytes=new Uint8Array(await blob.slice(p,p+8).arrayBuffer()),length=new DataView(bytes.buffer).getUint32(0),type=String.fromCharCode(...bytes.subarray(4));if(p+length+12>blob.size)throw Error('El PNG final está incompleto.');if(type==='IDAT')parts.push(blob.slice(p+8,p+8+length));if(type==='IEND')break;p+=length+12;}
 if(!parts.length)throw Error('El PNG final no contiene píxeles.');
 const reader=new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),compressor=new CompressionStream('deflate'),writer=compressor.writable.getWriter(),compressed=new Response(compressor.readable).arrayBuffer();compressed.catch(()=>{});
 const stride=width*4,row=new Uint8Array(stride+1);let previous=new Uint8Array(stride),offset=0,y=0,corrected=0,kept=0,removed=0;
 let remaining=0,detail=null;
 const scanner=checkThickness?new DotScanner(width,height,minimumMm*width/artifact.widthCm/10):null;
 const scale=Math.min(1,640/width,640/height),pw=Math.max(1,Math.round(width*scale)),ph=Math.max(1,Math.round(height*scale));
 const before=preview?new Uint8ClampedArray(pw*ph*4):null,after=preview?new Uint8ClampedArray(pw*ph*4):null;let previewY=0;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 let output=new Uint8Array((stride+1)*Math.min(32,height)),outputRows=0;
 try{
  while(true){signal?.throwIfAborted();const {value,done}=await reader.read();if(done)break;
   for(let p=0;p<value.length;){const n=Math.min(row.length-offset,value.length-p);row.set(value.subarray(p,p+n),offset);offset+=n;p+=n;if(offset!==row.length)continue;
    if(y>=height||row[0]>4)throw Error('El PNG final tiene datos de filas inválidos.');
    const filter=row[0],raw=row.subarray(1);
    if(filter)for(let x=0;x<stride;x++){const a=x>=4?raw[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0;raw[x]=(raw[x]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
    // Keep the unmodified row for the NEXT PNG predictor, not the corrected row.
    previous.set(raw);const start=outputRows*(stride+1);output[start]=0;output.set(raw,start+1);
    for(let x=start+4;x<start+1+stride;x+=4){const alpha=output[x];if(alpha>0&&alpha<255){if(!correctAlpha){remaining++;continue;}if(preview&&!detail){const dx=Math.max(0,Math.floor((x-start-4)/4)-48),dw=Math.min(96,width-dx),dh=Math.min(96,height-y);detail={x:dx,y,width:dw,height:dh,before:new Uint8ClampedArray(dw*dh*4),after:new Uint8ClampedArray(dw*dh*4)};}corrected++;if(alpha>=128){output[x]=255;kept++;}else{output.fill(0,x-3,x+1);removed++;}}}
    const finalRow=output.subarray(start+1,start+1+stride);
    if(detail&&y>=detail.y&&y<detail.y+detail.height){const at=(y-detail.y)*detail.width*4;detail.before.set(raw.subarray(detail.x*4,(detail.x+detail.width)*4),at);detail.after.set(finalRow.subarray(detail.x*4,(detail.x+detail.width)*4),at);}
    while(preview&&previewY<ph&&Math.floor(previewY*height/ph)===y){for(let px=0;px<pw;px++){const source=Math.floor(px*width/pw)*4,target=(previewY*pw+px)*4;before.set(raw.subarray(source,source+4),target);after.set(finalRow.subarray(source,source+4),target);}previewY++;}
    scanner?.band(finalRow,1,y);
    outputRows++;y++;offset=0;
    if(outputRows===32||y===height){await writer.write(output.subarray(0,outputRows*(stride+1)));output=new Uint8Array((stride+1)*Math.min(32,height-y));outputRows=0;onProgress?.(y/height);if(y%256===0)await new Promise(requestAnimationFrame);}
   }
  }
  if(y!==height||offset)throw Error('El PNG final no contiene todas sus filas.');
  await writer.close();const result=assemblePng(width,height,artifact.dpi,new Uint8Array(await compressed));
  const dots=scanner?scanner.end().count:null;
  return {...artifact,blob:corrected?result:blob,printCheck:{corrected,kept,removed,remaining,dots,minimumMm,alphaCorrected:correctAlpha,width,height,widthCm:artifact.widthCm,dpi:artifact.dpi},printPreview:preview?{width:pw,height:ph,before,after,detail}:null};
 }catch(error){await reader.cancel(error).catch(()=>{});await writer.abort(error).catch(()=>{});throw error;}finally{reader.releaseLock();writer.releaseLock();}
}
