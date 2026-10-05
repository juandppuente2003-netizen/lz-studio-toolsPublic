import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DotScanner,correctDotBand,dotRadius} from './web/large-dot-engine.js';
import {findSmallDots,adjustSmallDots} from './web/dot-audit-engine.js';
import {processDesignEffect} from './web/effects-engine.js';
import {largePreflight} from './web/large-preflight.js';
import {outputDimensions,exportBands} from './web/image-output.js';
import {validateImageFile,validateImportSize} from './web/upscale-import.js';
const native=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('@napi-rs/canvas');
globalThis.document={createElement:()=>native.createCanvas(1,1)};globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);
globalThis.Worker=class{constructor(){this.dead=false;const self={postMessage:data=>queueMicrotask(()=>{if(!this.dead)this.onmessage?.({data});})};this.scope=self;vm.runInNewContext(readFileSync('./web/large-preflight-worker.js','utf8').replace(/^import .*;\n/gm,''),{self,DotScanner,correctDotBand,dotRadius,processDesignEffect,Uint8ClampedArray,Uint8Array,Map,Math});}postMessage(data){queueMicrotask(()=>this.scope.onmessage({data}));}terminate(){this.dead=true;}};
function rgba(canvas){return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;}
for(let k=0;k<40;k++){
 const w=72,h=140,data=new Uint8ClampedArray(w*h*4);let seed=k+1;for(let p=0;p<w*h;p++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(seed/2**32<.23)data[p*4+3]=255;}
 const a=findSmallDots(data,w,h,{minimumMm:.5,pixelsPerCm:120}),scanner=new DotScanner(w,h,6);for(let y=0;y<h;y+=7)scanner.band(data.subarray(y*w*4,Math.min(h,y+7)*w*4),Math.min(7,h-y),y);const b=scanner.end();assert.equal(a.count,b.count);assert.equal(a.smallPixels,b.smallPixels);
}
// Finalize a 122.9 MP connected shape without retaining the whole file or its pixels.
const huge=new DotScanner(4096,30000,6),band=new Uint8ClampedArray(4096*64*4);for(let i=3;i<band.length;i+=4)band[i]=255;
for(let y=0;y<30000;y+=64){huge.band(band,Math.min(64,30000-y),y);assert.equal(huge.previous[0].component.runs,null);}
assert.equal(huge.end().count,0);
const source=native.createCanvas(160,193),ctx=source.getContext('2d');ctx.fillStyle='#1878dc';ctx.fillRect(5,5,32,40);ctx.fillRect(80,62,2,3);ctx.fillStyle='#d26419';ctx.fillRect(110,127,1,1);ctx.fillRect(112,125,1,1);ctx.fillRect(111,126,1,1);ctx.fillRect(150,191,1,1);
const input=rgba(source),dimensions={width:160,height:193,widthCm:160/300*2.54,dpi:300};
for(const options of [{minimumMm:.5,mode:'auto',delta:0},{minimumMm:.5,mode:'manual',delta:1},{minimumMm:.5,mode:'manual',delta:-1}]){
 const data=await largePreflight({source,dimensions,tool:'thickness',options,action:'correct'}),decoded=await native.loadImage(Buffer.from(await data.blob.arrayBuffer())),out=native.createCanvas(160,193);out.getContext('2d').drawImage(decoded,0,0);
 assert.deepEqual(rgba(out),adjustSmallDots(input,160,193,{...options,pixelsPerCm:300/2.54}).data,'selective correction across band boundaries matches exact full-image reference');
}
for(const alphaMethod of ['screen','solid','threshold']){
 const faded=native.createCanvas(160,193);faded.getContext('2d').fillStyle='rgba(24,120,220,.4)';faded.getContext('2d').fillRect(0,0,160,193);const options={alphaMethod,sizeMm:1,threshold:50};
 const data=await largePreflight({source:faded,dimensions,tool:'opacity',options,action:'correct'}),decoded=await native.loadImage(Buffer.from(await data.blob.arrayBuffer())),out=native.createCanvas(160,193);out.getContext('2d').drawImage(decoded,0,0);
 const expected=processDesignEffect(rgba(faded),160,193,{effectTool:'opacity',alphaMethod,effectSizeMm:1,alphaThreshold:50},300/2.54);assert.deepEqual(rgba(out).filter((v,i)=>i%4===3),expected.filter((v,i)=>i%4===3),'alfa and absolute pattern phase cross bands without seams');
}
// Exercise the true old-limit failure case with 20 MP input, without a full-size canvas in the pipeline.
const big=native.createCanvas(5000,4000);big.getContext('2d').fillStyle='#26b3a1';big.getContext('2d').fillRect(100,100,1000,2000);big.getContext('2d').fillRect(2500,63,1,2);
const report=await largePreflight({source:big,dimensions:{width:5000,height:4000,widthCm:5000/300*2.54,dpi:300},tool:'thickness',options:{minimumMm:.5,mode:'auto',delta:0},action:'analyze'});assert.equal(report.metrics.count,1);
validateImageFile({name:'big.png',type:'image/png',size:149*1024*1024});validateImportSize(10000,12000);assert.throws(()=>validateImportSize(14001,10000));assert.throws(()=>validateImageFile({name:'too-big.png',type:'image/png',size:151*1024*1024}));
const chosen=outputDimensions(25,300,2);assert.equal(chosen.width,2953);assert.equal(chosen.height,1477);assert.throws(()=>outputDimensions(NaN,300,2));assert.throws(()=>outputDimensions(100,9600,1));
const png=new Uint8Array(await (await exportBands({source,...chosen})).arrayBuffer());let ppm=0;for(let offset=8;offset<png.length;){const view=new DataView(png.buffer),n=view.getUint32(offset),type=String.fromCharCode(...png.subarray(offset+4,offset+8));if(type==='pHYs')ppm=view.getUint32(offset+8);offset+=n+12;}assert.equal(ppm,Math.round(300/.0254));const resized=await native.loadImage(Buffer.from(png));assert.equal(resized.width,2953);assert.equal(resized.height,1477);
console.log('PASS: large-file limits, streamed exact components, 122.9 MP bounded scanner, real 20 MP audit, Auto/±1 px/RGB across seams, alfa patterns, custom physical size and PNG density.');
