import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setupViewport} from './web/viewport.js';
import {CORNERS,cornerPosition,resizeFromCorner} from './web/sheet-transform.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} ≈ ${expected}`);
for(const rotation of [0,30,90,-75,180])for(const corner of CORNERS){
  const original={x:29,y:50,widthCm:12,heightCm:8,rotation};
  const anchor=cornerPosition(original,corner.map(n=>-n));
  const radians=rotation*Math.PI/180,[sx,sy]=corner;
  const target={x:anchor.x+sx*18*Math.cos(radians)-sy*12*Math.sin(radians),y:anchor.y+sx*18*Math.sin(radians)+sy*12*Math.cos(radians)};
  const result={...original,...resizeFromCorner(original,corner,target,true,58,100)};
  near(result.widthCm,18);near(result.heightCm,12);
  const fixed=cornerPosition(result,corner.map(n=>-n));near(fixed.x,anchor.x);near(fixed.y,anchor.y);
  near(result.widthCm/result.heightCm,original.widthCm/original.heightCm);
  const oversized={...original,...resizeFromCorner(original,corner,{x:target.x*100,y:target.y*100},true,58,100)};
  for(const c of CORNERS){const p=cornerPosition(oversized,c);assert.ok(p.x>=-1e-7&&p.x<=58+1e-7&&p.y>=-1e-7&&p.y<=100+1e-7)}
}
const original={x:20,y:20,widthCm:10,heightCm:10,rotation:0};
const free=resizeFromCorner(original,[1,1],{x:35,y:23},false,58,100);
near(free.widthCm,20);near(free.heightCm,8);
const minimum=resizeFromCorner(original,[1,1],{x:0,y:0},true,58,100);near(minimum.widthCm,.5);near(minimum.heightCm,.5);

class Element {
  constructor(tagName='DIV'){
    this.tagName=tagName;this.listeners={};this.captured=new Set();this.attrs={};this.style={};this.value='';this.checked=false;this.hidden=false;
    this.scrollLeft=0;this.scrollTop=0;this.clientWidth=800;this.clientHeight=600;
    const classes=new Set();this.classList={add:(...values)=>values.forEach(v=>classes.add(v)),remove:(...values)=>values.forEach(v=>classes.delete(v)),contains:v=>classes.has(v),toggle:(v,on)=>{if(on??!classes.has(v))classes.add(v);else classes.delete(v)}};
  }
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  dispatch(type,event){for(const fn of this.listeners[type]||[])fn(event)}
  closest(){return null}
  setAttribute(name,value){this.attrs[name]=value}
  prepend(child){this.button=child}
  setPointerCapture(id){this.captured.add(id)}
  releasePointerCapture(id){this.captured.delete(id)}
  hasPointerCapture(id){return this.captured.has(id)}
}
const event=(props={})=>({pointerId:1,button:0,isPrimary:true,clientX:200,clientY:200,target:new Element('CANVAS'),preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...props});
const doc=new Element(),win=new Element();doc.body=new Element();doc.createElement=tag=>new Element(tag);
globalThis.document=doc;globalThis.window=win;
const wrap=new Element(),controls=new Element();
setupViewport({wrap,controls,editable:true,canPan:e=>e.background});
assert.equal(controls.button.attrs['aria-pressed'],'false');
const designClick=event();wrap.dispatch('pointerdown',designClick);assert.ok(!designClick.stopped,'editing reaches the design');
controls.button.onclick();wrap.scrollLeft=300;wrap.scrollTop=400;
const down=event();wrap.dispatch('pointerdown',down);assert.ok(down.stopped);
wrap.dispatch('pointermove',event({clientX:140,clientY:120}));assert.equal(wrap.scrollLeft,360);assert.equal(wrap.scrollTop,480);
wrap.dispatch('pointerup',event());assert.ok(!wrap.captured.size);assert.ok(!wrap.classList.contains('viewport-panning'));
const click=event();wrap.dispatch('click',click);assert.ok(click.stopped,'drag does not trigger an editing click');
controls.button.onclick();const background=event({background:true});wrap.dispatch('pointerdown',background);assert.ok(background.stopped);wrap.dispatch('pointercancel',event());
const right=event({button:2,background:true});wrap.dispatch('pointerdown',right);assert.ok(!right.stopped);
const middle=event({button:1});wrap.dispatch('pointerdown',middle);assert.ok(middle.stopped);wrap.dispatch('pointerup',middle);
doc.dispatch('keydown',event({code:'Space'}));const temporary=event();wrap.dispatch('pointerdown',temporary);assert.ok(temporary.stopped);wrap.dispatch('pointerup',temporary);doc.dispatch('keyup',event({code:'Space'}));
controls.button.onclick();doc.body.classList.add('picking');const pick=event();wrap.dispatch('pointerdown',pick);assert.ok(!pick.stopped,'eyedropper keeps its click');doc.body.classList.remove('picking');
const touch=event({pointerType:'touch'});wrap.dispatch('pointerdown',touch);wrap.dispatch('pointermove',event({clientX:100,clientY:100}));win.dispatch('blur',{});assert.ok(!wrap.captured.size);

// Two touch pointers zoom only the preview, keep the image anchor, then release captures.
const pinchWrap=new Element(),pinchControls=new Element();let scale=1;
const image=new Element('CANVAS');image.getBoundingClientRect=()=>({left:0,top:0,width:400*scale,height:400*scale});pinchWrap.querySelector=()=>image;
setupViewport({wrap:pinchWrap,controls:pinchControls,editable:true,onZoom:factor=>{scale*=factor;}});
assert.equal(pinchWrap.style.touchAction,'none');
pinchWrap.dispatch('pointerdown',event({pointerType:'touch',pointerId:11,clientX:100,clientY:100,target:image}));
const second=event({pointerType:'touch',pointerId:12,isPrimary:false,clientX:200,clientY:100,target:image});pinchWrap.dispatch('pointerdown',second);assert.ok(second.prevented);
const spread=event({pointerType:'touch',pointerId:12,clientX:300,clientY:100});pinchWrap.dispatch('pointermove',spread);near(scale,2);assert.ok(spread.prevented);near(pinchWrap.scrollLeft,100);
pinchWrap.dispatch('pointerup',event({pointerId:12}));const remaining=event({pointerId:11,pointerType:'touch',clientX:130});pinchWrap.dispatch('pointermove',remaining);assert.ok(remaining.stopped,'remaining finger does not edit after pinch');pinchWrap.dispatch('pointerup',event({pointerId:11}));assert.equal(pinchWrap.captured.size,0);

// Execute the real gang-sheet listeners using a small DOM/canvas adapter.
const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
const canvas=get('sheetCanvas');canvas.width=580;canvas.height=1000;
const context=new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>{target[key]=value;return true}});
canvas.getContext=()=>context;canvas.getBoundingClientRect=()=>({left:0,top:0,width:parseFloat(canvas.style.width)||580,height:parseFloat(canvas.style.height)||1000});
get('sheetLength').value=100;get('sheetDpi').value=300;get('lockRatio').checked=true;
const sheetWrap=new Element();sheetWrap.clientWidth=600; // Image plus 20 px inset: fit at exactly 100%.
const sheetDoc=new Element();sheetDoc.activeElement=new Element('BODY');sheetDoc.getElementById=get;sheetDoc.querySelector=()=>sheetWrap;sheetDoc.querySelectorAll=()=>[];
let registration;
const sandbox={document:sheetDoc,innerWidth:1000,CORNERS,cornerPosition,resizeFromCorner,registerStudioModule:config=>{registration=config},assemblePng:()=>{},decodeImageFile:async()=>({width:300,height:200}),validateImportSize:()=>{},createImageBitmap:async()=>({width:300,height:200}),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},requestAnimationFrame:fn=>fn(),ResizeObserver:class{observe(){}},File:class{constructor(parts,name,props){this.name=name;this.type=props.type}},setTimeout,CompressionStream};
let code=readFileSync('./web/gang-sheet.js','utf8').replace(/^import .*;\n/gm,'');
code+='\nglobalThis.readSheet=()=>({items,selected,drag,zoom});';vm.runInNewContext(code,sandbox);
await registration.importCurrent({type:'image/png'},'test.png');
const before={...sandbox.readSheet().selected};near(before.widthCm,15);near(before.heightCm,10);
const corner=cornerPosition(before,[1,1]);
canvas.dispatch('pointerdown',event({clientX:corner.x*10,clientY:corner.y*10}));assert.equal(sandbox.readSheet().drag.kind,'resize');
canvas.dispatch('pointermove',event({clientX:(corner.x+6)*10,clientY:(corner.y+4)*10}));
near(sandbox.readSheet().selected.widthCm,21);near(sandbox.readSheet().selected.heightCm,14);
assert.equal(get('itemWidth').value,'21.0');assert.equal(get('itemHeight').value,'14.0');assert.equal(get('sheetSizeBadge').textContent,'21.0 × 14.0 cm');
canvas.dispatch('pointerup',event());assert.equal(sandbox.readSheet().drag,null);
const resized={...sandbox.readSheet().selected};
assert.ok(!registration.canPan(event({clientX:resized.x*10,clientY:resized.y*10})),'design drag stays editable');
assert.ok(registration.canPan(event({clientX:10,clientY:10})),'empty sheet supports panning');
canvas.dispatch('pointerdown',event({clientX:resized.x*10,clientY:resized.y*10}));
canvas.dispatch('pointermove',event({clientX:(resized.x+2)*10,clientY:(resized.y+2)*10}));canvas.dispatch('pointerup',event());
near(sandbox.readSheet().selected.x,resized.x+2);near(sandbox.readSheet().selected.y,resized.y+2);near(sandbox.readSheet().selected.widthCm,21);
console.log('PASS: anchored rotated resize, sheet boundaries, aspect ratio, live cm controls, viewport pan, touch, cancellation and editing/eyedropper preservation.');
