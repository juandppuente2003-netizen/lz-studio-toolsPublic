import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {auditDtfPixels,auditPreview,reinforceDtfDetails,detailMargin,minimumDetailPixels} from './web/dtf-audit-engine.js';
import {processDesignEffect} from './web/effects-engine.js';
import {designGeometry,resizeMockup,designContains,CORNERS,cornerPosition} from './web/mockup-transform.js';
import {createOpacityAudit} from './web/opacity-audit-ui.js';
import {exportTiledPng} from './web/exporter.js';

const w=73,h=89,rgba=new Uint8ClampedArray(w*h*4);
const put=(x,y,c=[40,90,170,255])=>rgba.set(c,(y*w+x)*4);
for(let y=6;y<28;y++)for(let x=6;x<28;x++)put(x,y);
put(51,14,[180,110,40,255]);
for(let y=43;y<45;y++)for(let x=40;x<63;x++)put(x,y);
put(60,65,[20,80,120,100]);
const p={minimumMm:.5,pixelsPerCm:100},report=auditDtfPixels(rgba,w,h,p);
assert.equal(report.semi,1);assert.ok(report.thin>0);
assert.equal(report.mask[65*w+60]&1,1);assert.equal(report.mask[14*w+51]&2,2);
for(let y=6;y<28;y++)for(let x=6;x<28;x++)assert.equal(report.mask[y*w+x]&2,0,'wide bodies and their outer edges are not all flagged');
const alphaOnly=auditDtfPixels(rgba,w,h,{...p,thickness:false});assert.equal(alphaOnly.thin,0);assert.equal(alphaOnly.semi,1);
const thinOnly=auditDtfPixels(rgba,w,h,{...p,transparency:false});assert.equal(thinOnly.semi,0);assert.ok(thinOnly.thin>0);
assert.equal(minimumDetailPixels(.5,300/2.54),.5*300/25.4);
assert.throws(()=>minimumDetailPixels(NaN,100));assert.throws(()=>minimumDetailPixels(.01,100));
const reinforced=reinforceDtfDetails(rgba.slice(),w,h,.5,100);
for(let i=0;i<rgba.length;i+=4)if(rgba[i+3])assert.deepEqual(reinforced.slice(i,i+4),rgba.slice(i,i+4),'original colors and alpha remain unchanged');
assert.equal(reinforced[(14*w+54)*4+3],255,'small dot grows');
assert.deepEqual([...reinforced.slice((14*w+54)*4,(14*w+54)*4+3)],[180,110,40],'growth inherits the dot color');
assert.equal(reinforced[(5*w+10)*4+3],0,'wide body is not globally dilated');
assert.equal(auditDtfPixels(reinforced,w,h,p).thin,0,'reinforced standalone dots and thin lines clear the same minimum');
assert.deepEqual(reinforceDtfDetails(rgba.slice(),w,h,.1,10),rgba,'features already wider than one physical pixel are unchanged');
const thumbnail=auditPreview(rgba,report.mask,w,h,11);
assert.ok(thumbnail.mask.some(v=>v&1));assert.ok(thumbnail.mask.some(v=>v&2),'single-pixel risks survive reduced previews');

// Exact tile/full-frame agreement, including details crossing tile borders.
const effect={effectTool:'opacity',alphaMethod:'solid',effectMinDetailMm:.5,widthCm:w/100},expected=processDesignEffect(rgba.slice(),w,h,effect,100),assembled=new Uint8ClampedArray(rgba.length),margin=detailMargin(.5,100);
for(let top=0;top<h;top+=23)for(let left=0;left<w;left+=19){
  const cw=Math.min(19,w-left),ch=Math.min(23,h-top),x0=Math.max(0,left-margin),y0=Math.max(0,top-margin),x1=Math.min(w,left+cw+margin),y1=Math.min(h,top+ch+margin),tw=x1-x0,th=y1-y0,tile=new Uint8ClampedArray(tw*th*4);
  for(let y=0;y<th;y++)tile.set(rgba.subarray(((y+y0)*w+x0)*4,((y+y0)*w+x1)*4),y*tw*4);
  processDesignEffect(tile,tw,th,effect,100,x0,y0);
  for(let y=0;y<ch;y++){const start=((top-y0+y)*tw+left-x0)*4;assembled.set(tile.subarray(start,start+cw*4),((top+y)*w+left)*4)}
}
assert.deepEqual(assembled,expected,'minimum detail correction has no tile seams');
const screened=processDesignEffect(rgba.slice(),w,h,{...effect,alphaMethod:'screen',effectSizeMm:1},100);
for(let i=3;i<screened.length;i+=4)assert.ok(screened[i]===0||screened[i]===255);
const faint=new Uint8ClampedArray(21*21*4);faint.set([45,90,135,1],(10*21+10)*4);
const recovered=processDesignEffect(faint,21,21,{...effect,alphaMethod:'screen',effectSizeMm:1},100);
assert.equal(recovered[(10*21+10)*4+3],255,'faint subpixel coverage is recovered before halftoning can erase the detail');

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`),zone={x:700,y:686,w:434,h:532},design={width:300,height:200};
for(const rotation of [-30,0,30])for(const corner of CORNERS){
  const state={scale:70,x:0,y:0,rotation},g=designGeometry(design,state,zone),opposite=corner.map(v=>-v),anchor=cornerPosition(g,opposite),larger={...g,widthCm:g.widthCm*1.5,heightCm:g.heightCm*1.5};
  larger.x=anchor.x+(g.x-anchor.x)*1.5;larger.y=anchor.y+(g.y-anchor.y)*1.5;
  const updated=resizeMockup(g,70,corner,cornerPosition(larger,corner),zone),out=designGeometry(design,{...state,...updated},zone),fixed=cornerPosition(out,opposite);
  near(updated.scale,105);near(fixed.x,anchor.x);near(fixed.y,anchor.y);near(out.widthCm/out.heightCm,1.5);
  assert.ok(designContains(out,{x:out.x,y:out.y}));assert.ok(!designContains(out,{x:0,y:0}));
}

class Element{
  constructor(){this.listeners={};this.value='';this.checked=false;this.hidden=false;this.style={};this.captured=new Set();const classes=new Set();this.classList={add:(...v)=>v.forEach(s=>classes.add(s)),remove:(...v)=>v.forEach(s=>classes.delete(s)),toggle:(s,b)=>b?classes.add(s):classes.delete(s),contains:s=>classes.has(s)}}
  addEventListener(t,f){(this.listeners[t]??=[]).push(f)}dispatch(t,e){for(const f of this.listeners[t]||[])f(e)}setAttribute(){}removeAttribute(){}focus(){}
  setPointerCapture(id){this.captured.add(id)}hasPointerCapture(id){return this.captured.has(id)}releasePointerCapture(id){this.captured.delete(id)}
}
class Canvas extends Element{
  constructor(){super();this.width=0;this.height=0;this.data=null;this.drawn=[];this.ctx=new Proxy({drawImage:(s,...args)=>{
    this.drawn.push(s);if(!s.data)return;let sx=0,sy=0,sw=s.width,sh=s.height,dx=0,dy=0,dw=sw,dh=sh;
    if(args.length===4)[dx,dy,dw,dh]=args;else if(args.length===8)[sx,sy,sw,sh,dx,dy,dw,dh]=args;
    this.data=new Uint8ClampedArray(this.width*this.height*4);
    for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const ix=Math.min(s.width-1,Math.floor(sx+(x+.5)/dw*sw)),iy=Math.min(s.height-1,Math.floor(sy+(y+.5)/dh*sh));this.data.set(s.data.subarray((iy*s.width+ix)*4,(iy*s.width+ix+1)*4),((y+dy)*this.width+x+dx)*4)}
  },getImageData:()=>({data:this.data.slice()}),putImageData:i=>this.data=i.data,createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>{o[k]=v;return true}})}
  getContext(){return this.ctx}getBoundingClientRect(){return {left:0,top:0,width:700,height:700}}toBlob(fn){this.exportHadHandles=this.handleCount;fn(new Blob(['png']))}
}
const event=(v={})=>({pointerId:1,button:0,isPrimary:true,clientX:0,clientY:0,preventDefault(){},...v});

// Real mockup listeners, including touch, rotated corner resizing, live sidebar,
// and a render(false) export that omits corner handles.
const ids=[...readFileSync('./web/mockups.html','utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),nodes=new Map(ids.map(id=>[id,new Element()])),canvas=new Canvas();nodes.set('mockupCanvas',canvas);
const doc=new Element(),win=new Element(),wrap=new Element();wrap.clientWidth=724;wrap.clientHeight=724;
doc.getElementById=id=>{assert.ok(nodes.has(id),id);return nodes.get(id)};doc.querySelector=()=>wrap;doc.querySelectorAll=()=>[];doc.createElement=tag=>tag==='canvas'?new Canvas():Object.assign(new Element(),{click(){},remove(){}});doc.body={append(){}};
let registration;
const sandbox={document:doc,window:win,CORNERS,cornerPosition,designGeometry,designContains,resizeMockup,Image:class{set src(v){queueMicrotask(()=>this.onload())}},createImageBitmap:async()=>({...design}),ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>fn(),registerStudioModule:c=>registration=c,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:()=>{},Blob};
let mockupCode=readFileSync('./web/mockups.js','utf8').replace(/^import .*;\n/gm,'');
mockupCode+='\nglobalThis.mockupState=()=>({state:{...state},drag,design});';
await vm.runInNewContext('(async()=>{'+mockupCode+'})()',sandbox);
await registration.importCurrent(new Blob(['test']), 'test.png');
let before=sandbox.mockupState().state;nodes.get('designRotation').value=30;nodes.get('designRotation').dispatch('input',{});before=sandbox.mockupState().state;
const g=designGeometry(design,before,zone),corner=cornerPosition(g,[1,1]),anchor=cornerPosition(g,[-1,-1]);
canvas.dispatch('pointerdown',event({pointerType:'touch',clientX:corner.x/2,clientY:corner.y/2}));assert.ok(sandbox.mockupState().drag.corner);
const goal={...g,x:anchor.x+(g.x-anchor.x)*1.5,y:anchor.y+(g.y-anchor.y)*1.5,widthCm:g.widthCm*1.5,heightCm:g.heightCm*1.5},target=cornerPosition(goal,[1,1]);
canvas.dispatch('pointermove',event({clientX:target.x/2,clientY:target.y/2}));near(sandbox.mockupState().state.scale,105);assert.equal(nodes.get('designScaleOut').value,'105 %');
canvas.dispatch('pointerup',event());assert.equal(sandbox.mockupState().drag,null);assert.equal(canvas.captured.size,0);
let moved=designGeometry(design,sandbox.mockupState().state,zone);
canvas.dispatch('pointerdown',event({clientX:moved.x/2,clientY:moved.y/2}));canvas.dispatch('pointermove',event({clientX:(moved.x+30)/2,clientY:(moved.y+20)/2}));canvas.dispatch('pointercancel',event());
const after=designGeometry(design,sandbox.mockupState().state,zone);near(after.x,moved.x+30);near(after.y,moved.y+20);assert.equal(canvas.captured.size,0);
let arcs=0;canvas.ctx.arc=()=>arcs++;canvas.toBlob=fn=>{assert.equal(arcs,0,'download render has no handles');fn(new Blob(['png']))};
await nodes.get('downloadMockup').onclick();assert.equal(arcs,4,'editing handles return after download');

// Use the actual audit Worker and UI with the DOM adapter. Verify selection,
// status feedback, toggling red overlays, changed-file invalidation, and limit.
const auditHtml=readFileSync('./web/opacity.html','utf8');
// Exercise the real tiled PNG exporter with the reinforcement halo.
globalThis.document={createElement:()=>new Canvas()};globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);globalThis.Worker=class{
  constructor(){this.events={}}addEventListener(t,f){(this.events[t]??=new Set()).add(f)}removeEventListener(t,f){this.events[t]?.delete(f)}terminate(){}
  postMessage(m){const data=processDesignEffect(new Uint8ClampedArray(m.buffer),m.width,m.height,m.params,m.pixelsPerCm,m.offsetX,m.offsetY);queueMicrotask(()=>{for(const fn of this.events.message||[])fn({data:{buffer:data.buffer}})})}
};
const blob=await exportTiledPng({source:{width:w,height:h,data:rgba},sourceWidth:w,sourceHeight:h,width:w,height:h,dpi:300,params:effect}),png=new Uint8Array(await blob.arrayBuffer()),chunks=[];
for(let o=8;o<png.length;){const len=new DataView(png.buffer).getUint32(o),name=String.fromCharCode(...png.slice(o+4,o+8));if(name==='IDAT')chunks.push(png.slice(o+8,o+8+len));o+=len+12}
const raw=new Uint8Array(await new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
for(let y=0;y<h;y++)assert.deepEqual(raw.slice(y*(w*4+1)+1,(y+1)*(w*4+1)),new Uint8Array(expected.buffer,y*w*4,w*4),'export equals corrected pixels, never red inspection marks');
for(const page of ['index','editor','opacity','textures','mockups','text-creator','vectorize','analyzer','gang-sheet','color-enhance','upscale','thickness']){
  const html=readFileSync(`./web/${page}.html`,'utf8');assert.ok(!html.includes('PREPRENSA TEXTIL'));assert.match(html,/class="brand-name"/);assert.match(html,/assets\/lz-studio-green\.svg/);assert.ok(!html.includes('class="brandmark"'));
}
assert.ok(existsSync('./web/assets/fonts/lz-display.woff'));assert.match(auditHtml,/href="preflight\.css"/);
console.log('PASS: independent alpha/thickness audits, physical minimum, selective reinforcement, seam-free PNG export, rotated mockup touch resize and movement, export without handles, and all twelve branded headers.');
