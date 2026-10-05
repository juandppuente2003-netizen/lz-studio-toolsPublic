const u32=(a,o,v)=>new DataView(a.buffer,a.byteOffset,a.byteLength).setUint32(o,v);
export function crc32(a){let c=0xffffffff;for(const b of a){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function pngDensity(bytes,dpi){
 if(bytes.length<33||bytes[0]!==137||bytes[1]!==80)throw Error('PNG inválido.');
 const ppm=Math.round(dpi/0.0254),chunk=new Uint8Array(21);u32(chunk,0,9);chunk.set([112,72,89,115],4);u32(chunk,8,ppm);u32(chunk,12,ppm);chunk[16]=1;u32(chunk,17,crc32(chunk.subarray(4,17)));
 const parts=[bytes.subarray(0,8)];let o=8,added=false;
 while(o<bytes.length){if(o+12>bytes.length)throw Error('PNG incompleto.');const len=new DataView(bytes.buffer,bytes.byteOffset+o,4).getUint32(0),end=o+len+12;if(end>bytes.length)throw Error('PNG incompleto.');const type=String.fromCharCode(...bytes.subarray(o+4,o+8));if(type!=='pHYs')parts.push(bytes.subarray(o,end));if(type==='IHDR'){parts.push(chunk);added=true;}o=end;if(type==='IEND')break;}
 if(!added)throw Error('PNG sin cabecera.');const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;
}
// Patch density without copying the compressed pixel data into a new array.
export async function pngBlobDensity(blob,dpi){
 const start=new Uint8Array(await blob.slice(0,33).arrayBuffer());if(start.length<33||start[0]!==137||start[1]!==80)throw Error('PNG inválido.');
 const density=pngDensity(start,dpi).subarray(33,54),parts=[blob.slice(0,33),density];let offset=33;
 while(offset<blob.size){const header=new Uint8Array(await blob.slice(offset,offset+8).arrayBuffer());if(header.length!==8)throw Error('PNG incompleto.');const length=new DataView(header.buffer).getUint32(0),end=offset+length+12;if(end>blob.size)throw Error('PNG incompleto.');const type=String.fromCharCode(...header.subarray(4));if(type!=='pHYs')parts.push(blob.slice(offset,end));offset=end;if(type==='IEND')break;}
 return new Blob(parts,{type:'image/png'});
}
