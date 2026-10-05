import assert from 'node:assert/strict';
import {COLOR_DEFAULTS,COLOR_STYLES,processColorAdjustments,autoColorAdjustments,clarityRadius} from './web/color-engine.js';
import {upscaleTiles,validateUpscaleSize,enhanceImage,upscaleWorkingSize} from './web/upscale-runner.js';
import {decodeImageFile,validateImageFile,validateImportSize} from './web/upscale-import.js';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
const w=73,h=89,src=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++)src.set([x*3,y*2,(x+y)%255,[0,64,192,255][x%4]],(y*w+x)*4);
const p={effectTool:'color',widthCm:2,colorAspect:w/h,colorAdjustments:{...COLOR_DEFAULTS,exposure:.3,contrast:20,shadows:30,temperature:18,vibrance:25,clarity:50,grain:15,vignette:40}};
assert.deepEqual(processColorAdjustments(src.slice(),w,h,{...p,colorAdjustments:COLOR_DEFAULTS},36.5),src,'neutral is exact');
const expected=processColorAdjustments(src.slice(),w,h,p,36.5),combined=new Uint8ClampedArray(src.length),margin=clarityRadius(36.5);
for(let top=0;top<h;top+=23)for(let left=0;left<w;left+=19){
  const cw=Math.min(19,w-left),ch=Math.min(23,h-top),x0=Math.max(0,left-margin),y0=Math.max(0,top-margin),x1=Math.min(w,left+cw+margin),y1=Math.min(h,top+ch+margin),tw=x1-x0,th=y1-y0,tile=new Uint8ClampedArray(tw*th*4);
  for(let y=0;y<th;y++)tile.set(src.subarray(((y+y0)*w+x0)*4,((y+y0)*w+x1)*4),y*tw*4);
  processColorAdjustments(tile,tw,th,p,36.5,x0,y0);
  for(let y=0;y<ch;y++){const start=((top-y0+y)*tw+left-x0)*4;combined.set(tile.subarray(start,start+cw*4),((top+y)*w+left)*4)}
}
assert.deepEqual(combined,expected,'clarity halos and global effects have no seams');
for(let i=3;i<src.length;i+=4)assert.equal(expected[i],src[i],'alpha preserved');
for(const style of Object.values(COLOR_STYLES))processColorAdjustments(src.slice(),w,h,{...p,colorAdjustments:{...COLOR_DEFAULTS,...style}},36.5);
const bw=processColorAdjustments(src.slice(),w,h,{...p,colorAdjustments:{...COLOR_DEFAULTS,...COLOR_STYLES.bw}},36.5);
for(let i=0;i<bw.length;i+=4)if(bw[i+3])assert.equal(bw[i],bw[i+1]);
const dark=new Uint8ClampedArray([24,24,24,255]),auto=autoColorAdjustments(dark);assert.ok(auto.exposure>0);assert.deepEqual(autoColorAdjustments(new Uint8ClampedArray(4)),COLOR_DEFAULTS);
assert.throws(()=>validateUpscaleSize(5000,5000));validateUpscaleSize(1200,1000);
const tiles=upscaleTiles(141,11);assert.equal(tiles.length,2);assert.deepEqual(tiles.map(t=>[t.x,t.w]),[[0,140],[140,1]]);

// Pixel/canvas adapter exercises the actual standalone tile runner with a
// deterministic test engine (not a substitute for the shipped CNN).
class Canvas {
  constructor(){this._width=0;this._height=0;this.data=new Uint8ClampedArray();this.context=new Context(this)}
  set width(v){this._width=v;this.data=new Uint8ClampedArray(this._width*this._height*4)}get width(){return this._width}
  set height(v){this._height=v;this.data=new Uint8ClampedArray(this._width*this._height*4)}get height(){return this._height}
  getContext(){return this.context}
}
class Context {
  constructor(canvas){this.canvas=canvas;this.globalCompositeOperation='source-over'}
  createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}}
  putImageData(image){this.canvas.data.set(image.data)}
  fillRect(){for(let i=0;i<this.canvas.data.length;i+=4)this.canvas.data.set([255,255,255,255],i)}
  drawImage(source,...args){
    let sx=0,sy=0,sw=source.width,sh=source.height,dx=0,dy=0,dw=sw,dh=sh;
    if(args.length===2)[dx,dy]=args;else if(args.length===4)[dx,dy,dw,dh]=args;else [sx,sy,sw,sh,dx,dy,dw,dh]=args;
    for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
      const xx=Math.floor(dx+x),yy=Math.floor(dy+y);if(xx<0||yy<0||xx>=this.canvas.width||yy>=this.canvas.height)continue;
      const ix=Math.min(source.width-1,Math.max(0,Math.floor(sx+(x+.5)/dw*sw))),iy=Math.min(source.height-1,Math.max(0,Math.floor(sy+(y+.5)/dh*sh))),i=(yy*this.canvas.width+xx)*4,j=(iy*source.width+ix)*4,sa=source.data[j+3]/255;
      if(this.globalCompositeOperation==='destination-in'){this.canvas.data[i+3]=Math.round(this.canvas.data[i+3]*sa);continue}
      const da=this.canvas.data[i+3]/255,alpha=sa+da*(1-sa);
      for(let k=0;k<3;k++)this.canvas.data[i+k]=alpha?(source.data[j+k]*sa+this.canvas.data[i+k]*da*(1-sa))/alpha:0;
      this.canvas.data[i+3]=Math.round(alpha*255);
    }
  }
}
globalThis.document={createElement:()=>new Canvas()};globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);
const image=new Canvas();image.width=141;image.height=11;
for(let y=0;y<11;y++)for(let x=0;x<141;x++)image.data.set([x,y,80,x===0?0:255],(y*141+x)*4);
let calls=0,lastProgress;
const testEngine=async input=>{calls++;assert.equal(input.width,160);const data=new Uint8ClampedArray(320*320*3);for(let y=0;y<320;y++)for(let x=0;x<320;x++){const j=(Math.floor(y/2)*160+Math.floor(x/2))*4;data.set(input.data.subarray(j,j+3),(y*320+x)*3)}return {data,width:320,height:320,channels:3}};
const out=await enhanceImage(image,testEngine,{onProgress:p=>lastProgress=p});assert.equal(out.width,282);assert.equal(out.height,22);assert.equal(calls,2);assert.equal(lastProgress.percent,100);
for(let y=0;y<22;y++)for(let x=0;x<282;x++){const i=(y*282+x)*4;assert.equal(out.data[i+3],x<2?0:255);if(x>=2)assert.deepEqual([...out.data.slice(i,i+3)],[Math.floor(x/2),Math.floor(y/2),80])}
const cancel=new AbortController();cancel.abort();await assert.rejects(enhanceImage(image,testEngine,{signal:cancel.signal}),{name:'AbortError'});
const colorHtml=readFileSync('./web/color-enhance.html','utf8');for(const key of Object.keys(COLOR_DEFAULTS))assert.ok(colorHtml.includes(`id="color_${key}"`));
const upscaleHtml=readFileSync('./web/upscale.html','utf8');assert.ok(!upscaleHtml.includes('id="halftoneOn"'));assert.ok(!upscaleHtml.includes('id="recolorOn"'));
const ui=readFileSync('./web/color-app.js','utf8');assert.match(ui,/autoColorAdjustments/);assert.match(ui,/writeAdjustments\(COLOR_DEFAULTS\)/);
console.log('PASS: 13 color controls, 6 presets, Auto, alpha preservation, clarity tile seams, standalone 2× tile assembly and cancellation.');

// Actual upload and button handlers, with a DOM adapter and native decoders
// stubbed. This tests the import lifecycle, not real-browser image decoding.
validateImageFile({name:'diseno.PNG',type:'',size:1024});
validateImageFile({name:'foto.jpeg',type:'application/octet-stream',size:1024});
assert.throws(()=>validateImageFile({name:'foto.heic',type:'image/heic',size:1024}),/HEIC/);
assert.throws(()=>validateImageFile({name:'huge.png',type:'image/png',size:151*1024*1024}),/150 MB/);
validateImportSize(4000,3000);assert.throws(()=>validateImportSize(24001,1));
for(const [width,height] of [[4000,3000],[1400,1400],[1200,1000],[8192,1]]){
  const size=upscaleWorkingSize(width,height);validateUpscaleSize(size.width,size.height);
  assert.ok(size.width<=width&&size.height<=height);
}
const native={bitmap:globalThis.createImageBitmap,image:globalThis.Image,url:globalThis.URL};
let revoked=0;
try{
  globalThis.URL={createObjectURL:()=> 'blob:test',revokeObjectURL:()=>revoked++};
  globalThis.Image=class{constructor(){this.naturalWidth=20;this.naturalHeight=30}set src(v){queueMicrotask(()=>this.onload())}};
  globalThis.createImageBitmap=async()=>{throw Error('Decoder unavailable')};
  assert.equal((await decodeImageFile({name:'x.png',type:'image/png',size:10})).width,20);assert.equal(revoked,1);
  globalThis.createImageBitmap=undefined;
  assert.equal((await decodeImageFile({name:'x.jpg',type:'image/jpeg',size:10})).height,30);assert.equal(revoked,2);
  globalThis.Image=class{set src(v){queueMicrotask(()=>this.onerror())}};
  await assert.rejects(decodeImageFile({name:'bad.png',type:'image/png',size:10}),/No se pudo abrir/);assert.equal(revoked,3);

  const ids=[...upscaleHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const nodes=new Map(ids.map(id=>[id,{hidden:false,disabled:false,value:'',style:{},files:[],classList:{toggle(){}},setAttribute(){},getContext:()=>({drawImage(){}})}]));
  const wrap={clientWidth:1000,clientHeight:800,addEventListener(){},scrollTo(){}};
  const label={classList:{toggle(){}}};let registration,engineCalls=0,lastWorking;
  const context={document:{getElementById:id=>{assert.ok(nodes.has(id),id);return nodes.get(id)},querySelector:s=>s.startsWith('label')?label:wrap,addEventListener(){},createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})},
    registerStudioModule:r=>registration=r,decodeImageFile,validateImportSize,upscaleWorkingSize,pngDensity(){},
    createOnnxSuperResolution:async()=>{engineCalls++;return ()=>{}},
    enhanceImage:async s=>{lastWorking=s;return {width:s.width*2,height:s.height*2}},
    ResizeObserver:class{observe(){}},window:{addEventListener(){}},navigator:{},AbortController,DOMException,File,setTimeout};
  runInNewContext(readFileSync('./web/upscale-app.js','utf8').replace(/^import .*;\n/gm,''),context);
  assert.equal(registration.id,'upscale');
  const file=(name='art.png',type='image/png')=>({name,type,size:100});
  let closed=0;
  globalThis.createImageBitmap=async()=>({width:4000,height:3000,close(){closed++}});
  const input=nodes.get('upscaleFile');input.files=[file('art.PNG','')];input.value='chosen';
  await input.onchange();assert.equal(input.value,'');assert.equal(input.disabled,false);
  assert.equal(nodes.get('upscaleCanvas').hidden,false);assert.equal(nodes.get('upscaleSourceSize').textContent,'4,000 × 3,000 px · original');
  assert.equal(nodes.get('runUpscale').disabled,false);assert.equal(nodes.get('prepareUpscale').hidden,true);assert.match(nodes.get('upscalePreparationText').textContent,/se usa una copia/);
  assert.equal(engineCalls,0,'import does not load IA');assert.equal(closed,0,'large original stays open');
  assert.equal(nodes.get('runUpscale').disabled,false,'a regular large photo is immediately ready for IA');
  await nodes.get('runUpscale').onclick();assert.equal(engineCalls,1);validateUpscaleSize(lastWorking.width,lastWorking.height);
  assert.notEqual(lastWorking.width,4000);assert.match(nodes.get('upscaleImportStatus').textContent,/desde la copia/);
  const priorName=nodes.get('upscaleName').textContent;input.files=[file('bad.heic','image/heic')];input.value='chosen';
  await input.onchange();assert.equal(input.value,'');assert.equal(input.disabled,false);assert.equal(nodes.get('upscaleName').textContent,priorName);
  assert.match(nodes.get('upscaleImportStatus').textContent,/HEIC/);
  globalThis.createImageBitmap=async()=>({width:1200,height:1000,close(){}});
  input.files=[file('small.jpg','image/jpeg')];await input.onchange();
  assert.equal(nodes.get('upscalePreparation').hidden,true);assert.equal(nodes.get('runUpscale').disabled,false);
  assert.equal(nodes.get('downloadUpscale').disabled,true,'new import clears old result');assert.equal(closed,1);
  await nodes.get('runUpscale').onclick();assert.equal(lastWorking.width,1200);assert.equal(nodes.get('downloadUpscale').disabled,false);
}finally{globalThis.createImageBitmap=native.bitmap;globalThis.Image=native.image;globalThis.URL=native.url}
console.log('PASS: large-image imports, missing MIME, native decoder fallback, visible errors, retry, automatic IA copy, original preservation and small-image enhancement handlers.');
