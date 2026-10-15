// Physical print size is metadata, not a pixel-count guess. Unitless density
// (PNG aspect ratio / JPEG unit 0) must never be treated as centimetres.
const ascii=(b,start,length)=>String.fromCharCode(...b.subarray(start,start+length));
function exifDensity(bytes){
 try{
  const start=ascii(bytes,0,6)==='Exif\0\0'?6:0,v=new DataView(bytes.buffer,bytes.byteOffset+start,bytes.length-start),le=v.getUint16(0)===0x4949;
  if(!le&&v.getUint16(0)!==0x4d4d||v.getUint16(2,le)!==42)return null;
  const offset=v.getUint32(4,le),count=v.getUint16(offset,le);let x,y,unit=2,orientation=1;
  for(let i=0;i<count;i++){const p=offset+2+i*12,tag=v.getUint16(p,le),type=v.getUint16(p+2,le),n=v.getUint32(p+4,le);
   if(n!==1)continue;
   if((tag===0x011a||tag===0x011b)&&type===5){const q=v.getUint32(p+8,le),d=v.getUint32(q+4,le),value=d?v.getUint32(q,le)/d:0;if(tag===0x011a)x=value;else y=value;}
   if(tag===0x0128&&type===3)unit=v.getUint16(p+8,le);
   if(tag===0x0112&&type===3)orientation=v.getUint16(p+8,le);
  }
  if(!(x>0&&y>0)||(unit!==2&&unit!==3))return null;
  if(orientation>=5&&orientation<=8)[x,y]=[y,x];
  return {x:unit===2?x:x*2.54,y:unit===2?y:y*2.54,source:'EXIF'};
 }catch{return null;}
}
export async function imagePrintSize(file,width,height){
 if(typeof file?.slice!=='function')return null;
 const read=async(start,length)=>new Uint8Array(await file.slice(start,start+length).arrayBuffer());
 const header=await read(0,16);let density=null;
 if(header[0]===137&&ascii(header,1,3)==='PNG'){
  for(let p=8;p+12<=file.size;){const b=await read(p,8),length=new DataView(b.buffer).getUint32(0),type=ascii(b,4,4);if(p+length+12>file.size)break;
   if(type==='pHYs'&&length===9){const d=await read(p+8,9),v=new DataView(d.buffer);if(d[8]===1)density={x:v.getUint32(0)*.0254,y:v.getUint32(4)*.0254,source:'PNG · pHYs'};break;}
   if(type==='IDAT'||type==='IEND')break;p+=length+12;
  }
 }else if(header[0]===255&&header[1]===216){
  let jfif=null;
  for(let p=2;p+4<=file.size;){const b=await read(p,4);if(b[0]!==255)break;if(b[1]===255){p++;continue;}if(b[1]===0xda||b[1]===0xd9)break;
   const length=(b[2]<<8)|b[3];if(length<2||p+length+2>file.size)break;
   if(b[1]===0xe0||b[1]===0xe1){const d=await read(p+4,length-2);
    if(b[1]===0xe1){density=exifDensity(d);if(density)break;}
    if(b[1]===0xe0&&ascii(d,0,5)==='JFIF\0'&&d.length>=12){const unit=d[7],x=(d[8]<<8)|d[9],y=(d[10]<<8)|d[11];if(unit===1||unit===2)jfif={x:unit===1?x:x*2.54,y:unit===1?y:y*2.54,source:'JPEG · JFIF'};}
   }p+=length+2;
  }density??=jfif;
 }else if(ascii(header,0,4)==='RIFF'&&ascii(header,8,4)==='WEBP'){
  for(let p=12;p+8<=file.size;){const b=await read(p,8),length=new DataView(b.buffer).getUint32(4,true);if(p+8+length>file.size)break;
   if(ascii(b,0,4)==='EXIF'){if(length<=1024*1024)density=exifDensity(await read(p+8,length));break;}p+=8+length+(length%2);
  }
 }
 if(!density||!Number.isFinite(density.x)||!Number.isFinite(density.y)||density.x<=0||density.y<=0)return null;
 return {widthCm:width/density.x*2.54,heightCm:height/density.y*2.54,dpiX:density.x,dpiY:density.y,source:density.source};
}
export async function applyFilePrintMeasure(file,image,widthId,dpiId){
 const size=await imagePrintSize(file,image.width,image.height);if(!size)return null;
 const width=document.getElementById(widthId),dpi=document.getElementById(dpiId);
 if(width){if(size.widthCm<Number(width.min||0)||size.widthCm>Number(width.max||Infinity))throw Error('La medida guardada en el archivo supera el rango de esta herramienta. Ajusta explícitamente su medida en el módulo de origen.');width.value=String(size.widthCm);}
 if(dpi){const value=size.dpiX;if(dpi.tagName==='SELECT'&&![...dpi.options].some(o=>Math.abs(Number(o.value)-value)<1e-8)){const option=document.createElement('option');option.value=String(value);option.textContent=`${Math.round(value*100)/100} ppp · archivo`;dpi.append(option);}dpi.value=String(value);}
 return size;
}
