import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {DESTINATIONS,TRANSFER_TTL,saveTransfer,readTransfer,removeTransfer,validateArtifact} from './web/handoff-store.js';
import {canvasArtifact,processedArtifact,requireTransferImage} from './web/transfer-export.js';
import {applyTransferMeasure,setupImageHandoff} from './web/handoff-ui.js';
import {processPixels} from './web/processor.js';

// IndexedDB event/transaction adapter: commits complete before navigation.
const rows=new Map();let failWrite=false,committed=0;
globalThis.indexedDB={open(){const req={};setImmediate(()=>{req.result={close(){},transaction(){const tx={pending:0};const schedule=fn=>{tx.pending++;setImmediate(()=>{fn();if(--tx.pending===0)setImmediate(()=>{committed++;tx.oncomplete?.()})})};tx.objectStore=()=>({
  put(packet){schedule(()=>{if(failWrite){tx.onabort?.();return}rows.set(packet.token,structuredClone(packet))})},
  get(token){const r={};schedule(()=>{r.result=rows.get(token);r.onsuccess?.()});return r},
  delete(token){schedule(()=>rows.delete(token))},
  openCursor(){const r={},keys=[...rows.keys()];let index=0;const next=()=>schedule(()=>{const key=keys[index++];r.result=key?{value:rows.get(key),delete(){rows.delete(key)},continue:next}:null;r.onsuccess?.()});next();return r}
});return tx}};req.onsuccess()});return req}};
const native=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('@napi-rs/canvas');
function newCanvas(){const canvas=native.createCanvas(1,1);canvas.toBlob=fn=>fn(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));return canvas}
globalThis.document={createElement:()=>newCanvas()};
const image=native.createCanvas(2400,1200),ctx=image.getContext('2d');ctx.fillStyle='#26b3a1';ctx.fillRect(100,100,500,400);
const artifact=await canvasArtifact(image,'resultado.png',300);
assert.equal(artifact.width,2400);assert.equal(artifact.height,1200);
const decoded=await native.loadImage(Buffer.from(await artifact.blob.arrayBuffer()));assert.equal(decoded.width,2400,'original full resolution, not 1100 px preview');
const check=native.createCanvas(2400,1200);check.getContext('2d').drawImage(decoded,0,0);assert.equal(check.getContext('2d').getImageData(0,0,1,1).data[3],0,'alpha preserved');
const color=DESTINATIONS.find(d=>d[0]==='color'),halftone=DESTINATIONS.find(d=>d[0]==='halftone');
const token=await saveTransfer(artifact,color,1000);assert.ok(committed>0);
const packet=await readTransfer(token,'color',1001);assert.deepEqual(Buffer.from(await packet.blob.arrayBuffer()),Buffer.from(await artifact.blob.arrayBuffer()),'exact PNG bytes survive handoff');
await assert.rejects(readTransfer(token,'halftone',1001),/otra herramienta/);await assert.rejects(readTransfer(token,'color',1000+TRANSFER_TTL),/caducó/);
const second=await saveTransfer({...artifact,name:'segundo.png'},halftone,1002);await removeTransfer(token);assert.equal((await readTransfer(second,'halftone',1003)).name,'segundo.png','independent handoffs do not overwrite each other');
failWrite=true;await assert.rejects(saveTransfer(artifact,color,1004),/guardar/);failWrite=false;
assert.throws(()=>validateArtifact({...artifact,width:9000},color),/8192/);
assert.throws(()=>validateArtifact({...artifact,width:6000,height:5000},DESTINATIONS.find(d=>d[0]==='analyzer')),/24 MP/);
assert.throws(()=>requireTransferImage(image,true),/termine/);assert.throws(()=>requireTransferImage(null),/Carga/);
assert.ok(new URL(halftone[2],'https://lz.example/tools/').searchParams.get('tool')==='halftone');

// The real tiled export uses the full source and bakes current adjustments.
globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);
globalThis.Worker=class{constructor(){this.listeners={}}addEventListener(t,fn){(this.listeners[t]??=new Set()).add(fn)}removeEventListener(t,fn){this.listeners[t]?.delete(fn)}terminate(){}postMessage(m){const data=processPixels(new Uint8ClampedArray(m.buffer),m.width,m.height,m.params,m.pixelsPerCm,m.offsetX,m.offsetY);queueMicrotask(()=>{for(const fn of this.listeners.message||[])fn({data:{buffer:data.buffer}})})}};
const full=native.createCanvas(1400,40);full.getContext('2d').fillStyle='#ffffff';full.getContext('2d').fillRect(0,0,1400,40);
const p={widthCm:1400/300*2.54,removeColor:'#000000',removeTolerance:0,softness:0,lpi:25,angle:45,recolorOn:true,fromColor:'#ffffff',toColor:'#ff0000',recolorTolerance:2,keepShading:false};
const processed=await processedArtifact({source:full,width:1400,height:40,dpi:300,params:p,name:'color.png'});
const output=await native.loadImage(Buffer.from(await processed.blob.arrayBuffer())),out=native.createCanvas(output.width,output.height);out.getContext('2d').drawImage(output,0,0);assert.equal(output.width,1400);assert.deepEqual([...out.getContext('2d').getImageData(1300,10,1,1).data],[255,0,0,255],'processed result, not original or decorated preview');

// Receiving a failed import must leave the token usable for a retry.
class Element{constructor(){this.children=[];this.textContent='';this.listeners={};this.classList={add(){},remove(){},toggle(){}}}append(...nodes){this.children.push(...nodes)}before(node){this.notice=node}setAttribute(){}addEventListener(t,f){this.listeners[t]=f}querySelector(selector){return this.nodes?.[selector]}showModal(){}set innerHTML(value){this.nodes={select:new Element(),'.lz-transfer-status':new Element(),'.lz-transfer-send':new Element(),'.lz-transfer-close':new Element()}}}
const body=new Element(),controls=new Element();controls.parentElement=new Element();const fields={effectWidth:{value:0,min:.5,max:100,tagName:'INPUT'},effectDpi:{value:300,tagName:'SELECT',options:[{value:'300'}],append(o){this.options.push(o)}}};
globalThis.document={body,createElement:()=>new Element(),getElementById:id=>fields[id],querySelector:()=>null};
applyTransferMeasure('color',{...artifact,dpi:450});assert.equal(fields.effectDpi.value,'450');assert.equal(fields.effectWidth.value,String(artifact.widthCm));
const receiveToken=await saveTransfer(artifact,color);globalThis.location={href:'https://lz.example/color-enhance.html?transfer='+receiveToken};let cleaned=false,accepted=false;
globalThis.history={replaceState(_s,_t,url){cleaned=!url.includes('transfer=')}};
globalThis.createImageBitmap=async()=>({width:2400,height:1200,close(){}});
setupImageHandoff({id:'color',importCurrent:async()=>accepted},controls);
await new Promise(r=>setTimeout(r,30));const notice=controls.parentElement.notice;assert.match(notice.textContent,/No se pudo cargar/);assert.ok(await readTransfer(receiveToken,'color'));assert.equal(cleaned,false);
accepted=true;await notice.children.at(-1).onclick();assert.equal(cleaned,true);await assert.rejects(readTransfer(receiveToken,'color'),/caducó/);assert.match(notice.textContent,/2,400/);

// Execute the actual upscale module and export its enhanced canvas, even while
// its Original comparison is shown. Native canvas verifies output size.
const nodes=new Map(),get=id=>{if(!nodes.has(id)){const n=new Element();n.value=id==='upscaleDpi'?300:'';n.getContext=()=>newCanvas().getContext('2d');nodes.set(id,n)}return nodes.get(id)};
const doc={getElementById:get,querySelector:()=>new Element(),querySelectorAll:()=>[],addEventListener(){}};let registration;
let code=readFileSync('./web/upscale-app.js','utf8').replace(/^import .*;\n/gm,'');code+='\nglobalThis.setResult=(original,improved)=>{source=original;result=improved;originalView=true};';
const sandbox={document:doc,registerStudioModule:c=>{registration=c},requireTransferImage,canvasArtifact,window:{addEventListener(){}},ResizeObserver:class{observe(){}},Number,File:class{},setTimeout};vm.runInNewContext(code,sandbox);sandbox.setResult(native.createCanvas(1200,600),image);
globalThis.document={createElement:()=>newCanvas()};
const enhanced=await registration.exportCurrent();assert.equal(enhanced.width,2400);assert.equal(enhanced.height,1200);
assert.ok(!existsSync('./web/patches.html'));for(const page of ['index','editor','text-creator','mockups','vectorize','analyzer','gang-sheet','opacity','textures','color-enhance','upscale','thickness']){const html=readFileSync('./web/'+page+'.html','utf8');assert.ok(!html.includes('patches.html'));assert.match(html,/preview-space.css/)}
console.log('PASS: full-resolution processed/IA PNG, alpha, exact blob handoff, destination/expiry limits, independent tokens, failed storage/import and successful retry; TPU removed.');
