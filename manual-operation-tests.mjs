import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {processPixels} from './web/processor.js';
import {COLOR_DEFAULTS,COLOR_STYLES,autoColorAdjustments} from './web/color-engine.js';
import {validateImportSize} from './web/upscale-import.js';
import {upscaleWorkingSize} from './web/upscale-runner.js';
import {outputDimensions} from './web/image-output.js';
import {canvasArtifact,processedArtifact,requireTransferImage} from './web/transfer-export.js';
import {exportTiledPng,assemblePng} from './web/exporter.js';
import {CORNERS,cornerPosition,resizeFromCorner} from './web/sheet-transform.js';
import {rectify,removeColor,edgeColor,alphaBounds,validateQuad} from './web/extract-engine.js';
const native=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('@napi-rs/canvas');
class Element {
 constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.value='';this.files=[];this.style={setProperty(){}};this.dataset={};this.listeners={};this.checked=false;this.hidden=false;this.disabled=false;this.clientWidth=900;this.clientHeight=700;this.attrs={};this.previousElementSibling={append(){}};const classes=new Set();this.classList={add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:c=>classes.has(c),toggle:(c,on)=>{on??=!classes.has(c);if(on)classes.add(c);else classes.delete(c)}};}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f)}
 async dispatch(t,props={}){const e={target:this,preventDefault(){},...props};for(const f of this.listeners[t]||[])await f(e);await this['on'+t]?.(e)}
 setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}scrollTo(){}append(){}remove(){}focus(){}showModal(){this.open=true}close(){this.open=false}click(){return this.onclick?.({preventDefault(){}})}
 closest(){return new Element()}getBoundingClientRect(){return {left:0,top:0,width:this.width||64,height:this.height||64}}
}
class Canvas extends Element {
 constructor(){super('canvas');this.bitmap=native.createCanvas(1,1)}get width(){return this.bitmap.width}set width(v){this.bitmap.width=v}get height(){return this.bitmap.height}set height(v){this.bitmap.height=v}
 getContext(){const ctx=this.bitmap.getContext('2d');return new Proxy(ctx,{get:(x,k)=>k==='drawImage'?((image,...args)=>x.drawImage(image.bitmap||image,...args)):typeof x[k]==='function'?x[k].bind(x):x[k],set:(x,k,v)=>{x[k]=v;return true}})}
 toBlob(fn){fn(new Blob([this.bitmap.toBuffer('image/png')],{type:'image/png'}))}
}
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){const c=native.createCanvas(64,64),x=c.getContext('2d');x.fillStyle='#147ac8';x.fillRect(0,0,32,64);x.fillStyle='#e42832';x.fillRect(32,0,32,64);x.clearRect(0,56,8,8);x.globalAlpha=.4;x.clearRect(48,48,16,16);x.fillStyle='#f4dd64';x.fillRect(48,48,16,16);return c}
const pixels=c=>{if(!c.getContext){const image=c;c=native.createCanvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);}return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
async function imagePixels(blob){const image=await native.loadImage(Buffer.from(await blob.arrayBuffer())),c=native.createCanvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);return {image,data:pixels(c)}}
async function harness(page,script,search=''){
 const html=readFileSync('web/'+page+'.html','utf8'),nodes=new Map(),other=new Map(),workers=[],messages=[],timers=new Map();let nextTimer=1,config;
 for(const [,tag,id,rest] of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"([^>]*)>/g)){const e=tag==='canvas'?new Canvas():new Element(tag);e.value=rest.match(/value="([^"]*)"/)?.[1]||'';e.checked=/\bchecked\b/.test(rest);e.hidden=/\bhidden\b/.test(rest);e.disabled=/\bdisabled\b/.test(rest);nodes.set(id,e)}
 for(const [,id,body] of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const options=[...body.matchAll(/<option\b([^>]*)>/g)],selected=options.find(m=>/\bselected\b/.test(m[1]))||options[0];nodes.get(id).value=selected?.[1].match(/value="([^"]+)"/)?.[1]||''}
 const get=id=>{assert.ok(nodes.has(id),'missing control '+id);return nodes.get(id)};
 const doc=new Element();doc.body=new Element('body');doc.body.dataset={effectTool:page==='textures'?'texture':undefined};doc.activeElement=new Element('body');doc.getElementById=id=>nodes.get(id)||null;doc.createElement=t=>t==='canvas'?new Canvas():new Element(t);doc.dispatchEvent=()=>{};
 const panels=['file','remove','recolor','halftone'].map(name=>{const e=new Element();e.dataset.toolPanel=name;return e});
 doc.querySelector=q=>{if(!other.has(q))other.set(q,new Element());return other.get(q)};doc.querySelectorAll=q=>q==='[data-tool-panel]'?panels:[];
 class Worker {
  constructor(url){this.url=url;this.dead=false;this.events={};workers.push(this);if(url==='extract-worker.js'){this.self={postMessage:data=>this.onmessage?.({data})};vm.runInNewContext(readFileSync('web/extract-worker.js','utf8').replace(/^import .*;\n/gm,''),{self:this.self,rectify,removeColor,edgeColor,Uint8ClampedArray})}}
  addEventListener(t,f){(this.events[t]??=[]).push(f)}removeEventListener(t,f){this.events[t]=(this.events[t]||[]).filter(x=>x!==f)}
  postMessage(m){messages.push(m);queueMicrotask(()=>{if(this.dead)return;if(this.self){this.self.onmessage({data:m});return}try{const bytes=new Uint8ClampedArray(m.buffer);processPixels(bytes,m.width,m.height,m.params,m.pixelsPerCm,m.offsetX||0,m.offsetY||0);this.onmessage?.({data:{buffer:bytes.buffer}});for(const fn of [...(this.events.message||[])])fn({data:{buffer:bytes.buffer}})}catch(e){this.onmessage?.({data:{error:e.message}})}})}terminate(){this.dead=true}
 }
 const scope={document:doc,window:{addEventListener(){},matchMedia:()=>({matches:false})},navigator:{},location:{search},URLSearchParams,registerStudioModule:c=>{config=c},decodeImageFile:async f=>{const image=await native.loadImage(Buffer.from(await f.arrayBuffer()));return image;},validateImportSize,outputDimensions,upscaleWorkingSize,canvasArtifact,processedArtifact,requireTransferImage,exportTiledPng,assemblePng,CNN_TILE_SIZE:160,prefetchSuperResolution:async()=>false,COLOR_DEFAULTS,COLOR_STYLES,autoColorAdjustments,Worker,ResizeObserver:class{observe(){}},ImageData:native.ImageData,File,Blob,URL,Uint8ClampedArray,AbortController,console,innerWidth:1000,CORNERS,cornerPosition,resizeFromCorner,alphaBounds,validateQuad,setupViewport(){},CompressionStream,Response,requestAnimationFrame:fn=>queueMicrotask(fn),setTimeout:(fn)=>{const id=nextTimer++;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)};
 const extra=script==='app'?'globalThis.inspect=()=>({source,previewSource,result,settings:params(),picking});':script==='effects-app'||script==='color-app'?'globalThis.inspect=()=>({source,previewSource,result,settings:params()});':script==='gang-sheet'?'globalThis.inspect=()=>({items,selected});globalThis.processSheet=processBand;globalThis.sheetArtwork=()=>sheetArtwork;':'globalThis.inspect=()=>({source,raw,pixels,settings:options()});';
 vm.runInNewContext(readFileSync('web/'+script+'.js','utf8').replace(/^import .*;\n/gm,'')+'\n'+extra,scope);
 const activate=()=>{globalThis.document=doc;globalThis.Worker=Worker;globalThis.ImageData=native.ImageData;globalThis.requestAnimationFrame=scope.requestAnimationFrame;};activate();
 const flush=async()=>{const jobs=[...timers.values()];timers.clear();for(const job of jobs)await job();await tick()};
 const upload=async(id='file')=>{activate();get(id).files=[new File([fixture().toBuffer('image/png')],'image.png',{type:'image/png'})];await get(id).dispatch('change');await flush()};
 return {get,doc,scope,config,workers,messages,panels,flush,upload,activate};
}
const original=pixels(fixture());
for(const [route,flag,picker,colorField,apply] of [['halftone','halftoneOn','pickHalftone','halftoneColor','applyHalftone'],['remove','removeOn','pickRemove','removeColor','applyRemove'],['recolor','recolorOn','pickRecolor','fromColor','applyRecolor']]){
 const h=await harness('editor','app','?tool='+route);
 assert.ok(h.get(apply).disabled);await h.upload();assert.ok(!h.get(apply).disabled);
 assert.deepEqual(pixels(h.get('preview')),original,route+': new upload stays original');assert.equal(h.workers.length,0,'no processing before activation');
 assert.ok(h.panels.find(p=>p.dataset.toolPanel==='file').hidden===false);assert.ok(h.panels.filter(p=>!p.hidden).every(p=>['file',route].includes(p.dataset.toolPanel)));
 // Dimensions, frequency and color entry do not enable the operation.
 h.get('widthCm').value=64/300*2.54;await h.get('widthCm').dispatch('input');h.get(colorField).value='#147ac8';await h.get(colorField).dispatch('change');await h.flush();assert.equal(h.get(flag).checked,false);assert.deepEqual(pixels(h.get('preview')),original);
 if(route==='recolor'){h.get('toColor').value='#28dc50';await h.get('toColor').dispatch('change')}
 // A neutral export stays original before choosing a color on the image.
 let artifact=await h.config.exportAtSize({widthCm:64/300*2.54,dpi:300});let exported=await imagePixels(artifact.blob);assert.deepEqual(exported.data,original);
 // Picking a visible color is an explicit instruction to apply this operation.
 h.get(picker).onclick();await h.get('preview').dispatch('click',{clientX:3,clientY:60});assert.equal(h.get(flag).checked,false,'transparent pixel does not enable the effect');assert.ok(h.scope.inspect().picking,'picker stays armed for a visible pixel');await h.get('preview').dispatch('click',{clientX:10,clientY:10});await h.flush();assert.equal(h.get(colorField).value,'#147ac8');assert.equal(h.get(flag).checked,true);
 h.get(apply).onclick();await h.flush();const state=h.scope.inspect(),processed=pixels(h.get('preview'));
 assert.ok(state.settings[flag]);assert.equal(Object.keys(state.settings).filter(k=>['removeOn','halftoneOn','recolorOn'].includes(k)&&state.settings[k]).length,1,'operations isolated by route');
 if(route==='recolor')assert.deepEqual([...processed.slice((10*64+10)*4,(10*64+10)*4+4)],[40,220,80,255]);else assert.equal(processed[(10*64+10)*4+3],0,'chosen blue disappears');
 assert.deepEqual([...processed.slice((10*64+40)*4,(10*64+40)*4+4)],[228,40,50,255],'far red remains unchanged');assert.deepEqual(pixels(state.source),original,'source immutable');
 artifact=await h.config.exportAtSize({widthCm:64/300*2.54,dpi:300});exported=await imagePixels(artifact.blob);assert.deepEqual(exported.data,processed,'preview matches selected operation in PNG');
 h.get('undo').onclick();await h.flush();assert.equal(h.get(flag).checked,false);assert.deepEqual(pixels(h.get('preview')),original);
 h.get(apply).onclick();await h.flush();h.get('reset').onclick();await h.flush();assert.deepEqual(pixels(h.get('preview')),original);
 h.get(apply).onclick();await h.flush();await h.upload();assert.equal(h.get(flag).checked,false);assert.deepEqual(pixels(h.get('preview')),original,'next image starts clean');
 // Hidden controls from older favorites cannot affect another route.
 for(const id of ['removeOn','cleanupOn','recolorOn','halftoneOn'])h.get(id).checked=true;const isolated=h.scope.inspect().settings;assert.equal(isolated.removeOn,route==='remove');assert.equal(isolated.recolorOn,route==='recolor');assert.equal(isolated.halftoneOn,route==='halftone');
}
const texture=await harness('textures','effects-app');await texture.upload('effectFile');assert.deepEqual(pixels(texture.get('effectCanvas')),original);assert.equal(texture.workers.length,0);texture.get('effectAmount').value=60;await texture.get('effectAmount').dispatch('input');await texture.flush();assert.deepEqual(pixels(texture.get('effectCanvas')),original);
let artifact=await texture.config.exportAtSize({widthCm:64/300*2.54,dpi:300});assert.deepEqual((await imagePixels(artifact.blob)).data,original,'disabled texture export does not change alpha');
texture.get('applyTexture').onclick();await texture.flush();assert.ok(texture.scope.inspect().settings.effectOn);assert.notDeepEqual(pixels(texture.get('effectCanvas')),original);assert.deepEqual(pixels(texture.scope.inspect().source),original);
texture.get('resetTexture').onclick();await texture.flush();assert.deepEqual(pixels(texture.get('effectCanvas')),original);texture.get('applyTexture').onclick();await texture.flush();await texture.upload('effectFile');assert.equal(texture.get('effectOn').checked,false);
// Explicit recovery retains the effect, unlike loading a new file.
texture.get('effectOn').checked=true;await texture.config.restoreDraft({images:{source:new File([fixture().toBuffer('image/png')],'draft.png',{type:'image/png'})},data:{fileName:'draft.png',seed:17}});await texture.config.afterRestore();await texture.flush();assert.equal(texture.get('effectOn').checked,true);
const color=await harness('color-enhance','color-app');await color.upload('effectFile');assert.deepEqual(pixels(color.get('effectCanvas')),original);color.get('color_saturation').value=-100;await color.get('color_saturation').dispatch('input');await color.flush();assert.notDeepEqual(pixels(color.get('effectCanvas')),original);await color.upload('effectFile');assert.equal(Number(color.get('color_saturation').value),0);assert.deepEqual(pixels(color.get('effectCanvas')),original,'color of previous image never reapplied');
color.get('color_saturation').value=-100;await color.config.restoreDraft({images:{source:new File([fixture().toBuffer('image/png')],'draft.png',{type:'image/png'})},data:{fileName:'draft.png'}});await color.config.afterRestore();await color.flush();assert.equal(Number(color.get('color_saturation').value),-100,'recovery preserves chosen settings');
const sheet=await harness('gang-sheet','gang-sheet');for(const id of ['sheetVibrance','cmykSafe','sheetSolidAlpha'])assert.equal(sheet.get(id).checked,false);
const bytes=new Uint8ClampedArray([20,120,210,60,230,80,35,190,10,20,30,0]),copy=bytes.slice();sheet.scope.processSheet(bytes);assert.deepEqual(bytes,copy,'sheet default export preserves RGB/alpha');
sheet.get('sheetVibrance').checked=true;sheet.scope.processSheet(bytes);assert.notDeepEqual(bytes,copy);assert.deepEqual([bytes[3],bytes[7],bytes[11]],[60,190,0],'color correction does not implicitly threshold alpha');
sheet.get('sheetVibrance').checked=false;sheet.get('sheetSolidAlpha').checked=true;const alpha=copy.slice();sheet.scope.processSheet(alpha);assert.deepEqual([alpha[3],alpha[7],alpha[11]],[0,255,0]);assert.deepEqual([...alpha.slice(4,7)],[230,80,35]);
await sheet.config.importCurrent(new File([fixture().toBuffer('image/png')],'sheet.png',{type:'image/png'}),'sheet.png');sheet.get('duplicateItem').onclick();const placed=sheet.scope.inspect();Object.assign(placed.selected,{x:placed.items[0].x,y:placed.items[0].y});await sheet.get('sheetSolidAlpha').dispatch('change');const preview=sheet.scope.sheetArtwork();assert.ok([...pixels(preview)].every((v,i)=>i%4!==3||v===0||v===255),'chosen alpha correction shown after composing overlapping artwork');
const sheetArtifact=await sheet.config.exportAtSize({widthCm:58,dpi:25.4});assert.deepEqual((await imagePixels(sheetArtifact.blob)).data,pixels(preview),'actual sheet PNG matches corrected artwork, excluding guides/handles');
const extract=await harness('extract','extract-app');await extract.upload('extractFile');assert.equal(extract.scope.inspect().raw,null,'upload does not extract');assert.equal(extract.get('removeMode').value,'none');extract.get('extractButton').onclick();await tick();assert.ok(extract.scope.inspect().raw);assert.equal(extract.messages.at(-1).autoColor,false,'extract does not automatically choose a fabric color');assert.equal(extract.messages.at(-1).options.mode,'none','first extraction preserves all colors');
extract.get('autoFabric').onclick();await tick();assert.equal(extract.messages.at(-1).autoColor,true,'color detection only from explicit button');
extract.get('fabricColor').value='#147ac8';await extract.get('fabricColor').dispatch('change');extract.get('removeMode').value='all';await extract.get('removeMode').dispatch('change');await tick();assert.equal(extract.messages.at(-1).autoColor,false);assert.deepEqual([...extract.messages.at(-1).options.color],[20,122,200]);await extract.upload('extractFile');assert.equal(extract.get('removeMode').value,'none');
console.log('PASS: real controllers with native canvas: untouched loads/exports, chosen colors, eyedropper applies chosen color, explicit apply, route isolation, undo/reset, new images, recovered settings, textures, color reset, extraction and opt-in sheet output.');
