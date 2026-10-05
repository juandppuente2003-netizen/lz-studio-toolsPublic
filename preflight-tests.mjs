import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {findSmallDots,adjustSmallDots} from './web/dot-audit-engine.js';
import {auditDtfPixels,auditPreview} from './web/dtf-audit-engine.js';
import {processDesignEffect} from './web/effects-engine.js';
import {canvasArtifact,requireTransferImage} from './web/transfer-export.js';
import {validateImportSize} from './web/upscale-import.js';
const w=120,h=80,rgba=new Uint8ClampedArray(w*h*4),put=(x,y,c=[24,120,220,255])=>rgba.set(c,(y*w+x)*4);
for(let y=5;y<35;y++)for(let x=5;x<35;x++)put(x,y);
put(80,15,[210,100,25,100]);for(let y=30;y<32;y++)for(let x=100;x<102;x++)put(x,y);
for(let x=55;x<110;x++)put(x,60);
const options={minimumMm:.5,pixelsPerCm:300/2.54},report=findSmallDots(rgba,w,h,options);
assert.equal(report.count,2);assert.equal(report.mask[15*w+80],2);
assert.equal(report.mask[5*w+5],0,'wide body edges are not flagged');assert.equal(report.mask[60*w+55],0,'long one-pixel line is not mistaken for a tiny dot');
const original=rgba.slice(),auto=adjustSmallDots(rgba,w,h,{...options,mode:'auto'});
assert.deepEqual(rgba,original,'original is immutable');assert.equal(findSmallDots(auto.data,w,h,options).count,0,'automatic dots reach minimum at chosen physical size');
for(let y=5;y<35;y++)for(let x=5;x<35;x++)assert.deepEqual(auto.data.slice((y*w+x)*4,(y*w+x)*4+4),rgba.slice((y*w+x)*4,(y*w+x)*4+4),'wide shapes/RGB unchanged');
assert.equal(auto.data[(15*w+80)*4+3],255,'faint selected dot becomes solid');
const plus=adjustSmallDots(rgba,w,h,{...options,mode:'manual',delta:1});assert.equal(plus.data[(15*w+79)*4+3],255);assert.equal(plus.data[(15*w+78)*4+3],0,'exact one output pixel expansion per edge');
const minus=adjustSmallDots(rgba,w,h,{...options,mode:'manual',delta:-1});assert.ok(minus.removed>=1);assert.equal(minus.data[(15*w+80)*4+3],0,'shrinking a one-pixel dot can remove it');
assert.deepEqual(adjustSmallDots(rgba,w,h,{...options,mode:'auto'}).data,auto.data,'repeat Auto starts from original');
assert.ok(findSmallDots(rgba,w,h,{...options,pixelsPerCm:options.pixelsPerCm*2}).minimumPx>report.minimumPx,'physical threshold changes with output density');
const edge=new Uint8ClampedArray(20*20*4);edge.set([90,20,40,255],0);assert.ok(adjustSmallDots(edge,20,20,{...options,mode:'auto'}).clipped>0);
assert.throws(()=>adjustSmallDots(rgba,w,h,{...options,delta:99}),/12/);

const native=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('@napi-rs/canvas');
class Element{
  constructor(){this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.style={};this.listeners={};this.classList={toggle(){},add(){},remove(){}}}
  addEventListener(t,fn){(this.listeners[t]??=[]).push(fn)}dispatch(t){for(const fn of this.listeners[t]||[])fn({target:this})}setAttribute(){}removeAttribute(){}scrollTo(){}
}
class Canvas extends Element{
  constructor(){super();this.bitmap=native.createCanvas(1,1)}get width(){return this.bitmap.width}set width(n){this.bitmap.width=n}get height(){return this.bitmap.height}set height(n){this.bitmap.height=n}
  getContext(){const ctx=this.bitmap.getContext('2d');return new Proxy(ctx,{get:(target,key)=>key==='drawImage'?((image,...rest)=>target.drawImage(image.bitmap||image,...rest)):typeof target[key]==='function'?target[key].bind(target):target[key],set:(target,key,value)=>{target[key]=value;return true}})}
  toBlob(fn){fn(new Blob([this.bitmap.toBuffer('image/png')],{type:'image/png'}))}
}
function workerClass(){return class{
  constructor(){this.dead=false;this.scope={postMessage:data=>{if(!this.dead)this.onmessage?.({data})}};vm.runInNewContext(readFileSync('./web/preflight-worker.js','utf8').replace(/^import .*;\n/gm,''),{self:this.scope,findSmallDots,adjustSmallDots,auditDtfPixels,auditPreview,processDesignEffect,Uint8ClampedArray})}
  postMessage(data){queueMicrotask(()=>{if(!this.dead)this.scope.onmessage({data})})}terminate(){this.dead=true}
}}
async function app(tool){
  const html=readFileSync('./web/'+(tool==='thickness'?'thickness':'opacity')+'.html','utf8'),nodes=new Map();
  for(const [,tag,id,rest] of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"([^>]*)>/g)){const e=id==='effectCanvas'?new Canvas():new Element();e.value=rest.match(/value="([^"]*)"/)?.[1]||'';e.hidden=rest.includes('hidden');e.checked=rest.includes('checked');nodes.set(id,e)}
  const get=id=>nodes.get(id),wrap=new Element();wrap.clientWidth=1200;wrap.clientHeight=700;
  get('effectDpi').value=300;get('effectWidth').value=w/300*2.54;if(get('alphaMethod'))get('alphaMethod').value='screen';
  const doc={body:{dataset:{preflightTool:tool}},getElementById:get,createElement:t=>t==='canvas'?new Canvas():new Element(),querySelector:q=>q==='.lab-canvas-wrap'?wrap:null,addEventListener(){}};
  globalThis.document=doc;
  let registration;const scope={document:doc,window:{addEventListener(){},matchMedia:()=>({matches:false})},registerStudioModule:c=>{registration=c},decodeImageFile:async file=>native.loadImage(Buffer.from(await file.arrayBuffer())),validateImportSize,canvasArtifact,requireTransferImage,Worker:workerClass(),ResizeObserver:class{observe(){}},ImageData:native.ImageData,File,URL,setTimeout,requestAnimationFrame:fn=>queueMicrotask(fn),console};
  let code=readFileSync('./web/preflight-app.js','utf8').replace(/^import .*;\n/gm,'');code+='\nglobalThis.inspect=()=>({source,result,selection,mode,delta,busy,originalView,overlay,preview});';vm.runInNewContext(code,scope);
  const image=native.createCanvas(w,h);image.getContext('2d').putImageData(new native.ImageData(rgba,w,h),0,0);
  const file=new File([image.toBuffer('image/png')],'test.png',{type:'image/png'});
  assert.equal(await registration.importCurrent(file,'test.png'),true);
  return {scope,get,registration,doc};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const thickness=await app('thickness');await thickness.get('runPreflight').onclick();await tick();assert.match(thickness.get('preflightSummary').textContent,/2 puntos/);assert.ok(thickness.scope.inspect().overlay);assert.equal(thickness.scope.inspect().result,null,'Analyze never mutates source');
await thickness.get('autoPreflight').onclick();await tick();assert.equal(thickness.get('downloadEffect').disabled,false);assert.match(thickness.get('preflightSummary').textContent,/0 puntos/);assert.equal(thickness.scope.inspect().mode,'auto');
const artifact=await thickness.registration.exportCurrent(),decoded=await native.loadImage(Buffer.from(await artifact.blob.arrayBuffer()));assert.equal(decoded.width,w);assert.equal(decoded.height,h);
const exported=native.createCanvas(w,h);exported.getContext('2d').drawImage(decoded,0,0);const bytes=exported.getContext('2d').getImageData(0,0,w,h).data;
assert.deepEqual([...bytes.slice((10*w+10)*4,(10*w+10)*4+4)],[24,120,220,255],'no red annotation exported');assert.equal(bytes[(15*w+79)*4+3],255,'corrected pixels exported');
thickness.get('resetPreflight').onclick();assert.equal(thickness.scope.inspect().result,null);assert.equal(thickness.get('downloadEffect').disabled,true);
thickness.get('effectWidth').value=100;thickness.get('effectDpi').value=9600;await thickness.get('autoPreflight').onclick();assert.match(thickness.get('effectStatus').textContent,/140 MP/);assert.equal(thickness.scope.inspect().busy,false,'large work rejected instead of silently shrinking');
const opacity=await app('opacity');await opacity.get('runPreflight').onclick();await tick();assert.match(opacity.get('preflightSummary').textContent,/1 píxeles/);assert.equal(opacity.scope.inspect().selection,0);
await opacity.get('autoPreflight').onclick();await tick();assert.match(opacity.get('preflightSummary').textContent,/0 píxeles/);assert.ok(opacity.scope.inspect().result);
const solidOpacity=await opacity.registration.exportCurrent();const opacityImage=await native.loadImage(Buffer.from(await solidOpacity.blob.arrayBuffer())),out=native.createCanvas(w,h);out.getContext('2d').drawImage(opacityImage,0,0);const alpha=out.getContext('2d').getImageData(0,0,w,h).data;for(let i=3;i<alpha.length;i+=4)assert.ok(alpha[i]===0||alpha[i]===255);
for(const page of ['opacity','thickness']){const html=readFileSync('./web/'+page+'.html','utf8');assert.match(html,/Corregir automáticamente/);assert.ok(!html.includes('auditThickness'));assert.ok(!/<details[^>]*open/.test(html))}
console.log('PASS: isolated-dot audit without outline/line false positives; selective ±1 px, Auto, original preservation, real Worker/UI analysis and corrections, full PNG without red, physical sizing, reset and limits.');
