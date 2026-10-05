import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {applyPremiumVivid,premiumParams,premiumHalftone} from './web/premium-engine.js';
import {processColorAdjustments,COLOR_DEFAULTS,COLOR_STYLES} from './web/color-engine.js';
import {DotScanner} from './web/large-dot-engine.js';
import {createHandler} from './worker/account-worker.js';
const native=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('@napi-rs/canvas');
globalThis.document={createElement:()=>{const canvas=native.createCanvas(1,1),get=canvas.getContext.bind(canvas);canvas.getContext=(...args)=>{const ctx=get(...args);return new Proxy(ctx,{get:(target,key)=>key==='getImageData'?((...values)=>{const image=target.getImageData(...values);return {data:new Uint8ClampedArray(image.data),width:image.width,height:image.height};}):typeof target[key]==='function'?target[key].bind(target):target[key],set:(target,key,value)=>{target[key]=value;return true;}});};return canvas;}};globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.createImageBitmap=async blob=>native.loadImage(Buffer.from(await blob.arrayBuffer()));
let live=0;
// Execute actual worker modules with real transferable buffer detachment.
class TestWorker{
 constructor(file){this.dead=false;live++;const self={postMessage:(m,t=[])=>{const data=structuredClone(m,{transfer:t});queueMicrotask(()=>{if(!this.dead)this.onmessage?.({data});});}};const ctx=vm.createContext({self,Uint8ClampedArray,Uint8Array,Map,Math,Number,Error});const modules=new Map();const get=async file=>{if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(await readFile(file,'utf8'),{context:ctx,identifier:file});modules.set(file,m);return m;};this.ready=(async()=>{const m=await get(path.resolve('web',file));await m.link((spec,parent)=>get(path.resolve(path.dirname(parent.identifier),spec)));await m.evaluate();return self;})();}
 postMessage(message,transfer=[]){const data=structuredClone(message,{transfer});this.ready.then(self=>{if(!this.dead)self.onmessage({data});}).catch(error=>this.onerror?.(error));}
 terminate(){if(!this.dead){live--;this.dead=true;}}
}
globalThis.Worker=TestWorker;
const {runPremiumPipeline}=await import('./web/premium-pipeline.js');
const make=()=>{const c=native.createCanvas(160,160),ctx=c.getContext('2d');ctx.fillStyle='#121212';ctx.fillRect(0,0,160,160);ctx.fillStyle='#383838';ctx.fillRect(12,12,62,128);ctx.fillStyle='#eb455a';ctx.fillRect(95,20,50,120);ctx.clearRect(0,0,3,3);ctx.fillStyle='rgba(40,170,230,.4)';ctx.clearRect(120,70,15,15);ctx.fillRect(120,70,15,15);return c;};
const source=make(),raw=source.getContext('2d').getImageData(0,0,160,160).data;
assert.deepEqual(applyPremiumVivid(raw.slice(),160,160,4),processColorAdjustments(raw.slice(),160,160,{widthCm:4,colorAspect:1,colorAdjustments:{...COLOR_DEFAULTS,...COLOR_STYLES.vivid}},40),'identical existing Vivid preset');
const p=premiumParams('#121212',4,150);assert.equal(p.lpi,25);assert.equal(p.halftoneRange,30);assert.equal(p.halftoneOn,true);assert.throws(()=>premiumParams('',4,150));
const screened=premiumHalftone(raw.slice(),160,160,0,160,p,{x:0,y:0,width:.5,height:1});for(let y=0;y<160;y++)assert.deepEqual(screened.slice((y*160+80)*4,(y*160+160)*4),raw.slice((y*160+80)*4,(y*160+160)*4),'zone keeps right half unchanged during halftone');
const sourceBefore=source.toBuffer('image/png');
for(const widthCm of [4,2.5,6]){
 const stages=[],progress=[];const result=await runPremiumPipeline({source,color:'#121212',zone:{x:0,y:0,width:.5,height:1},widthCm,dpi:150,onStage:s=>stages.push(s),onProgress:v=>progress.push(v)});
 assert.deepEqual(stages,['halftone','shrink','opacity','thickness','verify']);assert.equal(result.width,Math.round(widthCm/2.54*150));assert.equal(result.report.smallDots,0);assert.equal(result.report.semi,0);assert.ok(result.report.visible>0);assert.equal(progress.at(-1),1);
 const decoded=await createImageBitmap(result.blob),c=native.createCanvas(decoded.width,decoded.height);c.getContext('2d').drawImage(decoded,0,0);const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data,scanner=new DotScanner(c.width,c.height,.5*c.width/widthCm/10);scanner.band(data,c.height,0);assert.equal(scanner.end().count,0,'independent final pixels contain no small dots');assert.ok([...data].filter((_,i)=>i%4===3).every(a=>a===0||a===255),'binary alpha');
}
assert.deepEqual(source.toBuffer('image/png'),sourceBefore,'source preserved across pipeline and exports');
const ac=new AbortController();await assert.rejects(runPremiumPipeline({source,color:'#121212',widthCm:4,dpi:150,signal:ac.signal,onStage:s=>{if(s==='shrink')ac.abort();}}),e=>e.name==='AbortError');assert.equal(live,0,'cancel cleans all workers');
const aborted=new AbortController();aborted.abort();await assert.rejects(runPremiumPipeline({source,color:'#121212',widthCm:4,dpi:150,signal:aborted.signal}),e=>e.name==='AbortError');
const empty=native.createCanvas(16,16);empty.getContext('2d').fillRect(0,0,16,16);await assert.rejects(runPremiumPipeline({source:empty,color:'#000000',widthCm:2,dpi:150}),/vacía/);assert.equal(live,0);
// A one-pixel-wide image cannot grow every compact island to the physical
// minimum; exercise residual removal rather than claiming it passed correction.
const edge=native.createCanvas(59,3);edge.getContext('2d').fillStyle='#ffffff';edge.getContext('2d').fillRect(0,0,3,3);edge.getContext('2d').fillRect(20,0,39,3);
const e=await runPremiumPipeline({source:edge,color:'#000000',widthCm:.5,dpi:300});assert.equal(e.report.smallDots,0);assert.equal(e.report.semi,0);assert.equal(e.report.purged,1,'clipped residual is explicitly removed and reported');
const {premiumContentBounds,enhancePremiumCnn}=await import('./web/premium-cnn.js');
const sparse=native.createCanvas(640,640);sparse.getContext('2d').fillStyle='#ffffff';sparse.getContext('2d').fillRect(300,300,16,16);assert.deepEqual(premiumContentBounds(sparse),{x:284,y:284,w:48,h:48});let cnnBlocks=0;const fast=await enhancePremiumCnn(sparse,async tile=>{assert.equal(tile.width,160);cnnBlocks++;return {width:320,height:320,channels:3,data:new Uint8Array(320*320*3).fill(255)};});assert.equal(cnnBlocks,1,'empty margins skip 24 unnecessary CNN blocks');assert.equal(fast.width,1280);assert.equal(fast.height,1280);assert.equal(fast.getContext('2d').getImageData(0,0,1,1).data[3],0,'restores transparent canvas');assert.equal(fast.getContext('2d').getImageData(610,610,1,1).data[3],255,'restores visible content in its original position');
const assets={'/premium.html':{body:'Premium',type:'text/html',public:false}};let enabled=true;
const handler=createHandler({assets,fetchUpstream:async url=>url.includes('/lz_tools?')?Response.json([{id:'editor',enabled}]):url.includes('/auth/v1/user')?Response.json({id:'u'}):url.includes('/rpc/')?new Response(null,{status:204}):Response.json([{id:'u',blocked:false}])});
const request=()=>handler.fetch(new Request('https://test.local/premium.html',{headers:{Cookie:'__Host-lz_session=valid'}}));assert.equal((await handler.fetch(new Request('https://test.local/premium.html'))).status,303);assert.equal((await request()).status,200);enabled=false;assert.equal((await request()).status,403,'inherits the existing Semitonos permission');
console.log('PASS Premium: exact Vivid, fixed 25/30, zone preservation, real worker transfers, ordered corrections, independent final scan at 3 sizes, binary alpha, cancellation, empty-result rejection and existing access controls. CNN inference is not mocked or executed in this algorithm test.');
