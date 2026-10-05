import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {processDesignEffect} from './web/effects-engine.js';
import {processPixels} from './web/processor.js';
import {exportTiledPng} from './web/exporter.js';

const solid=(w,h,a=255)=>{const out=new Uint8ClampedArray(w*h*4);for(let i=0;i<out.length;i+=4)out.set([120,80,210,a],i);return out};
const sample=solid(4,1);sample[3]=0;sample[7]=60;sample[11]=190;
const threshold=processDesignEffect(sample.slice(),4,1,{effectTool:'opacity',alphaMethod:'threshold',alphaThreshold:50},100);
assert.deepEqual([threshold[3],threshold[7],threshold[11],threshold[15]],[0,0,255,255]);
const opaque=processDesignEffect(sample.slice(),4,1,{effectTool:'opacity',alphaMethod:'solid'},100);
assert.deepEqual([opaque[3],opaque[7],opaque[11],opaque[15]],[0,255,255,255]);
assert.deepEqual([...opaque.slice(8,11)],[120,80,210],'solidifying does not recolor visible pixels');
const screen=processDesignEffect(solid(200,200,128),200,200,{effectTool:'opacity',alphaMethod:'screen',effectSizeMm:1},100);
let covered=0;for(let i=3;i<screen.length;i+=4){assert.ok(screen[i]===0||screen[i]===255);if(screen[i])covered++}
assert.ok(Math.abs(covered/40000-128/255)<.04,'screen preserves average opacity');
for(const alphaMethod of ['screen','threshold','solid']){
  const p={effectTool:'opacity',alphaMethod,effectSizeMm:.5};const unchanged=solid(60,60);assert.deepEqual(processDesignEffect(unchanged.slice(),60,60,p,100),unchanged,'opaque details remain unchanged');
}
// Every effect uses the same absolute coordinates in every export tile.
for(const p of [
  ...['worn','grain','scratches','dots','stripes','grid'].flatMap(textureType=>[false,true].map(effectSolidAlpha=>({effectTool:'texture',textureType,effectSolidAlpha,effectSizeMm:.7,effectAmount:45,effectAngle:33,effectSeed:29}))),
  ...['screen','solid','threshold'].map(alphaMethod=>({effectTool:'opacity',alphaMethod,effectSizeMm:.6,alphaThreshold:40}))
]){
  const w=73,h=89,src=solid(w,h);for(let i=3;i<src.length;i+=4)src[i]=[0,54,132,255][((i-3)/4)%4];
  const expected=processPixels(src.slice(),w,h,p,95),assembled=new Uint8ClampedArray(src.length);
  for(let top=0;top<h;top+=23)for(let left=0;left<w;left+=19){
    const tw=Math.min(19,w-left),th=Math.min(23,h-top),tile=new Uint8ClampedArray(tw*th*4);
    for(let y=0;y<th;y++)tile.set(src.subarray(((top+y)*w+left)*4,((top+y)*w+left+tw)*4),y*tw*4);
    const out=processPixels(tile,tw,th,p,95,left,top);
    for(let y=0;y<th;y++)assembled.set(out.subarray(y*tw*4,(y+1)*tw*4),((top+y)*w+left)*4);
  }
  assert.deepEqual(assembled,expected,`${p.textureType||p.alphaMethod}: no tile seams`);
  for(let i=0;i<expected.length;i+=4){if(p.effectTool==='opacity'||p.effectSolidAlpha)assert.ok(expected[i+3]===0||expected[i+3]===255);if(expected[i+3])assert.deepEqual([...expected.slice(i,i+3)],[120,80,210])}
}
for(const textureType of ['worn','grain','scratches','dots','stripes','grid']){
  const src=solid(100,100),p={effectTool:'texture',textureType,effectSizeMm:1,effectAmount:0,effectSolidAlpha:false};
  assert.deepEqual(processDesignEffect(src.slice(),100,100,p,100),src,'zero wear preserves the original');
  p.effectAmount=50;const a=processDesignEffect(src.slice(),100,100,p,100);
  assert.ok(a.some((v,i)=>i%4===3&&v===0),`${textureType}: creates transparent cutouts`);
  assert.ok(a.some((v,i)=>i%4===3&&v===255),`${textureType}: preserves part of the design`);
}

// Validate every local navigation target and module import.
const pages=['index','editor','text-creator','mockups','vectorize','analyzer','gang-sheet','opacity','textures','color-enhance','upscale','thickness'];
for(const page of pages){
  const html=readFileSync(`./web/${page}.html`,'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,`${page}: unique control ids`);
  for(const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g))if(!/^(?:https?:|data:|#)/.test(url))assert.ok(existsSync('./web/'+url.split(/[?#]/)[0]),`${page}: ${url}`);
}
const home=readFileSync('./web/index.html','utf8');assert.equal((home.match(/class="tool-card"/g)||[]).length,13);assert.match(home,/editor\.html\?tool=recolor/);assert.ok(!home.includes('app.js'));
const app=readFileSync('./web/app.js','utf8');assert.match(app,/setTool\(initialTool\)/);assert.match(app,/recolorOn:initialTool==='recolor'/);

// Exercise the real tiled PNG exporter and its effect dispatch. This adapter
// supplies pixel/canvas operations; no UI decoration is in the source bitmap.
class Canvas {
  getContext(){return {
    drawImage:(source,sx,sy,sw,sh,dx,dy,dw,dh)=>{this.data=new Uint8ClampedArray(this.width*this.height*4);for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const ix=Math.min(source.width-1,Math.floor(sx+(x+.5)/dw*sw)),iy=Math.min(source.height-1,Math.floor(sy+(y+.5)/dh*sh));this.data.set(source.data.subarray((iy*source.width+ix)*4,(iy*source.width+ix+1)*4),((y+dy)*this.width+x+dx)*4)}},
    getImageData:()=>({data:this.data.slice()})
  }}
}
globalThis.document={createElement:()=>new Canvas()};
globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);
globalThis.Worker=class {
  constructor(){this.listeners={}}
  addEventListener(type,fn){(this.listeners[type]??=new Set()).add(fn)}
  removeEventListener(type,fn){this.listeners[type]?.delete(fn)}
  postMessage(m){const data=processPixels(new Uint8ClampedArray(m.buffer),m.width,m.height,m.params,m.pixelsPerCm,m.offsetX,m.offsetY);queueMicrotask(()=>{for(const fn of this.listeners.message||[])fn({data:{buffer:data.buffer}})})}
  terminate(){}
};
const source={width:64,height:96,data:solid(64,96,150)};
for(const p of [{effectTool:'opacity',alphaMethod:'screen',widthCm:2,effectSizeMm:.5},{effectTool:'texture',textureType:'dots',effectAmount:50,effectSolidAlpha:true,widthCm:2,effectSizeMm:.5}]){
  let progress=0;const blob=await exportTiledPng({source,sourceWidth:64,sourceHeight:96,width:64,height:96,dpi:300,params:p,onProgress:v=>{progress=v}});assert.equal(progress,1);
  const png=new Uint8Array(await blob.arrayBuffer()),chunks=[];let density=0;
  for(let o=8;o<png.length;){const view=new DataView(png.buffer),len=view.getUint32(o),name=String.fromCharCode(...png.slice(o+4,o+8));if(name==='IDAT')chunks.push(png.slice(o+8,o+8+len));if(name==='pHYs')density=view.getUint32(o+8);o+=len+12}
  assert.equal(density,11811,'PNG stores the selected 300 ppp');
  const bytes=new Uint8Array(await new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const expected=processPixels(source.data.slice(),64,96,p,32);
  for(let y=0;y<96;y++){assert.equal(bytes[y*257],0);assert.deepEqual(bytes.slice(y*257+1,(y+1)*257),new Uint8Array(expected.buffer,y*256,256),'export matches full-frame effects, including tile edges')}
}
console.log('PASS: all twelve tools, local routes, opacity coverage, six texture masks, RGB preservation, tile continuity and PNG export with DPI.');
