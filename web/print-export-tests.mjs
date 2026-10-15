import assert from 'node:assert/strict';
import {deflateSync,inflateSync} from 'node:zlib';
import {assemblePng} from './web/exporter.js';
import {finishPrintExport} from './web/print-export.js';
import {resizedArtifact} from './web/image-output.js';
import {createRequire} from 'node:module';
const native=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('@napi-rs/canvas');
globalThis.document={createElement:()=>native.createCanvas(1,1)};globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);globalThis.createImageBitmap=async blob=>{const image=await native.loadImage(Buffer.from(await blob.arrayBuffer()));image.close=()=>{};return image;};
function decode(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[];let density=0;for(let p=8;p<bytes.length;){const n=v.getUint32(p),type=String.fromCharCode(...bytes.subarray(p+4,p+8));if(type==='IDAT')parts.push(bytes.subarray(p+8,p+8+n));if(type==='pHYs')density=v.getUint32(p+8);p+=n+12;}return {raw:inflateSync(Buffer.concat(parts)),density};}
const w=53,h=75,stride=w*4,pixels=new Uint8Array(w*h*4);let count=0;
for(let i=0;i<pixels.length;i+=4){pixels.set([i%256,(i*7)%256,(i*11)%256,[0,60,127,128,190,255][(i/4)%6]],i);if(pixels[i+3]>0&&pixels[i+3]<255)count++;}
const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
for(const fixed of [0,1,2,3,4,'mixed']){const scan=new Uint8Array(h*(stride+1));for(let y=0;y<h;y++){const filter=fixed==='mixed'?y%5:fixed;scan[y*(stride+1)]=filter;for(let x=0;x<stride;x++){const pos=y*stride+x,a=x>=4?pixels[pos-4]:0,b=y?pixels[pos-stride]:0,c=y&&x>=4?pixels[pos-stride-4]:0,predict=filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0;scan[y*(stride+1)+1+x]=(pixels[pos]-predict)&255;}}
 const input={blob:assemblePng(w,h,300,deflateSync(scan)),width:w,height:h,widthCm:w/300*2.54,dpi:300,name:'fixture.png'};const out=await finishPrintExport(input),{raw,density}=decode(new Uint8Array(await out.blob.arrayBuffer()));assert.equal(out.printCheck.corrected,count);assert.equal(density,11811);assert.equal(out.printCheck.remaining,0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,q=y*(stride+1)+1+x*4,alpha=pixels[p+3],expected=alpha>0&&alpha<128?[0,0,0,0]:[...pixels.subarray(p,p+3),alpha>=128?255:0];assert.deepEqual([...raw.subarray(q,q+4)],expected,`filter ${fixed}, row ${y}`);}
 const checked=await finishPrintExport(out);assert.equal(checked.printCheck.corrected,0);assert.equal(checked.blob,out.blob,'binary file remains byte-identical on subsequent export');
}
const canvas=native.createCanvas(80,40),c=canvas.getContext('2d');c.fillStyle='#22bb66';c.fillRect(8,8,48,24);const original={blob:new Blob([canvas.toBuffer('image/png')],{type:'image/png'}),width:80,height:40,widthCm:28,dpi:80/28*2.54,name:'native.png'};
for(const widthCm of [28,35,58]){const scaled=await resizedArtifact(original,{widthCm,dpi:25.4});const safe=await finishPrintExport(scaled);const bitmap=await native.loadImage(Buffer.from(await safe.blob.arrayBuffer())),out=native.createCanvas(bitmap.width,bitmap.height);out.getContext('2d').drawImage(bitmap,0,0);const data=out.getContext('2d').getImageData(0,0,bitmap.width,bitmap.height).data;assert.ok(data.every((v,i)=>i%4!==3||v===0||v===255),`${widthCm} cm downloaded PNG has no intermediate alpha`);assert.equal(safe.widthCm,widthCm);}
await assert.rejects(()=>finishPrintExport({...original,width:81}),/dimensiones/);const ctrl=new AbortController();ctrl.abort();await assert.rejects(()=>finishPrintExport(original,{signal:ctrl.signal}),/aborted/i);
const small=native.createCanvas(6,3),smallCtx=small.getContext('2d');smallCtx.fillStyle='#123456';smallCtx.fillRect(1,1,1,1);smallCtx.fillStyle='rgba(18,52,86,0.4)';smallCtx.fillRect(2,1,1,1);
const specimen={blob:new Blob([small.toBuffer('image/png')],{type:'image/png'}),width:6,height:3,widthCm:6/300*2.54,dpi:300,name:'dots.png'};
const beforeAudit=await finishPrintExport(specimen,{correctAlpha:false,checkThickness:true,minimumMm:1.5/300*25.4,preview:true});assert.equal(beforeAudit.printCheck.remaining,1);assert.equal(beforeAudit.printCheck.dots,0);
const afterAudit=await finishPrintExport(specimen,{checkThickness:true,minimumMm:1.5/300*25.4,preview:true});assert.equal(afterAudit.printCheck.remaining,0);assert.equal(afterAudit.printCheck.dots,1,'dot audit uses the corrected final pixels, not the pre-correction connected component');assert.equal(afterAudit.printPreview.before[(1*6+2)*4+3],102);assert.equal(afterAudit.printPreview.after[(1*6+2)*4+3],0);assert.ok(afterAudit.printPreview.detail,'real-pixel detail for changed area');
console.log('PASS final-download guard: all PNG filters and mixed scanlines, row-band seams, exact RGB/alpha threshold, native encoder, 28→35→58 cm, DPI metadata, repeat export, dimensions and cancellation.');
