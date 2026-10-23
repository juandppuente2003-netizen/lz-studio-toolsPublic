import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,generate} from './web/box/geometry.js';
import {modelInfo,modelPresets} from './web/box/models.js';
import {arrange,freeze} from './web/box/layout-plus.js';
import {prepareK40Job,k40Preview} from './web/box/k40-job.js';
import {mountK40} from './web/box/k40-control.js';

function example(extra={}){
 const state={...defaults,...extra},panels=generate(state),packed=arrange(panels,state);
 return {state,panels,packed,valid:true};
}
test('17 models × 3 layouts produce M2 snapshots for every sheet',()=>{
 let combinations=0;
 for(const model of Object.keys(modelInfo))for(const layoutMode of ['rows','compact','shared']){
  const app=example({...modelPresets[model],model,layoutMode});
  for(let sheet=0;sheet<app.packed.count;sheet++){
   const job=prepareK40Job(app,{sheet});assert.equal(job.board,'M2');assert.ok(job.paths.length);
   assert.ok(job.paths.every(p=>p.points.every(([x,y])=>x>=0&&y>=0&&x<=400&&y<=400)));
   let outer=false;for(const p of job.paths){if(p.role==='outer')outer=true;else assert.equal(outer,false);}
  }combinations++;
 }assert.equal(combinations,51);
});
test('overlap, outside, unplaced and invalid model block sending',()=>{
 const app=example(),positions=freeze(app.packed),[a,b]=app.panels;
 positions[b.id]={...positions[a.id]};
 const state={...app.state,placements:positions};assert.throws(()=>prepareK40Job({...app,state,packed:arrange(app.panels,state)}),/superpuestas/);
 positions[b.id]={...positions[a.id],x:-40};assert.throws(()=>prepareK40Job({...app,state,packed:arrange(app.panels,state)}),/fuera|superpuestas/);
 assert.throws(()=>prepareK40Job({...app,valid:false}),/válido/);
 assert.throws(()=>prepareK40Job({...app,packed:{...app.packed,unplaced:['x']}}),/sin acomodar/);
});
test('machine limits, empty sheets, numeric input and integer passes are enforced',()=>{
 const app=example();
 for(const options of [{bedWidth:300},{offsetX:1},{speed:Infinity},{speed:0},{passes:1.5},{sheet:0.5}])assert.throws(()=>prepareK40Job(app,options));
 assert.throws(()=>prepareK40Job({...app,packed:{...app.packed,count:2}},{sheet:1}),/vacía/);
});
test('kerf is preserved once, offsets transform coordinates without altering the source',()=>{
 const app=example({sheetW:300,sheetH:300}),before=JSON.stringify(app);
 const zero=prepareK40Job(app),shift=prepareK40Job(app,{offsetX:10,offsetY:20,passes:2});
 assert.equal(shift.paths[0].points[0][0],zero.paths[0].points[0][0]+10);
 assert.equal(shift.paths[0].points[0][1],zero.paths[0].points[0][1]+20);
 assert.equal(shift.summary.cutLengthMm,zero.summary.cutLengthMm*2);
 assert.equal(JSON.stringify(app),before);assert.match(k40Preview(shift),/viewBox="0 0 400 400"/);
});
test('UI: pairing, explicit confirmation, one send, physical completion acknowledgement and token cleanup',async()=>{
 const {JSDOM}=await import('jsdom');
 const dom=new JSDOM('<div class="export-actions"></div>',{url:'https://www.lzstudiotools.com/box/index.html'});
 const previous={document:globalThis.document,fetch:globalThis.fetch};globalThis.document=dom.window.document;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const app={...example(),onUpdate(){},setView(){}};const requests=[];
 let phase='idle',dropRunResponse=false,oldBridge=false,delayRunResponse=false,releaseRun;
 globalThis.fetch=async(url,options)=>{
  const path=new URL(url).pathname;requests.push({path,options});
  const info={protocol:'lz-k40-m2/v1',board:'M2',bed:{width:400,height:400},simulation:true,features:['persistent-pairing','disconnect','priority-stop']};
  if(oldBridge)info.features=[];
  const body=path==='/prepare'?{id:'test-job'}:path==='/status'?{state:phase,message:'Simulación sin USB.',...info}:info;
  if(path==='/run'){phase='simulated';body.state=phase;if(dropRunResponse){dropRunResponse=false;throw Error('Response lost after acceptance');}}
  if(path==='/run'&&delayRunResponse){delayRunResponse=false;await new Promise(resolve=>{releaseRun=resolve;});}
  if(path==='/cancel')phase='cancelled';
  if(path==='/acknowledge')phase='idle';
  if(path==='/disconnect')phase='idle';
  return {ok:true,json:async()=>body};
 };
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const {dialog}=mountK40(app),$=id=>dialog.querySelector('#'+id);
  dom.window.document.querySelector('#k40Open').click();assert.equal(dialog.open,true);assert.equal($('k40Run').disabled,true);
  $('k40Token').value='test-pairing-code';$('k40Connect').click();await settle();assert.equal($('k40Run').disabled,true);
  $('k40Confirm').checked=true;$('k40Confirm').dispatchEvent(new dom.window.Event('change'));
  assert.equal($('k40Run').disabled,false);$('k40Run').click();$('k40Run').click();await settle();await settle();assert.equal($('k40Token').disabled,true);
  assert.equal(requests.filter(r=>r.path==='/run').length,1);assert.equal($('k40Run').disabled,true);
  assert.equal($('k40Cancel').disabled,false);assert.equal($('k40Acknowledge').hidden,false);
  $('k40Close').click();assert.equal(dialog.open,true);
  $('k40Cancel').click();await settle();await settle();assert.equal(requests.at(-2).path,'/cancel');assert.equal($('k40Acknowledge').hidden,false);$('k40Acknowledge').click();await settle();assert.equal($('k40Run').disabled,true);
  $('k40Connect').click();await settle();$('k40Confirm').checked=true;$('k40Confirm').dispatchEvent(new dom.window.Event('change'));
  dropRunResponse=true;$('k40Run').click();await settle();await settle();assert.equal($('k40Cancel').disabled,false);
  $('k40Cancel').click();await settle();await settle();assert.equal($('k40Cancel').disabled,false);assert.equal($('k40Acknowledge').hidden,false);
  $('k40Acknowledge').click();await settle();
  $('k40Close').click();assert.equal(dialog.open,false);assert.equal($('k40Token').value,'');
  dom.window.document.querySelector('#k40Open').click();$('k40Token').value='test-code';$('k40Connect').click();await settle();
  $('k40Confirm').checked=true;$('k40Confirm').dispatchEvent(new dom.window.Event('change'));delayRunResponse=true;
  $('k40Run').click();await settle();assert.equal($('k40Cancel').disabled,false);assert.equal(typeof releaseRun,'function');
  $('k40Cancel').click();await settle();await settle();assert.equal(phase,'cancelled');
  releaseRun();await settle();await settle();assert.equal($('k40Acknowledge').hidden,false);assert.equal($('k40Acknowledge').disabled,false);
  assert.doesNotMatch($('k40Status').textContent,/Enviando el trabajo/);$('k40Acknowledge').click();await settle();$('k40Close').click();
  dom.window.document.querySelector('#k40Open').click();$('k40Token').value='remembered-test-code';$('k40Remember').checked=true;
  $('k40Connect').click();await settle();assert.equal(dom.window.localStorage.getItem('lzbox-k40-pairing-v1'),'remembered-test-code');
  const beforeClose=requests.filter(r=>r.path==='/disconnect').length;
  $('k40Close').click();await settle();assert.equal(dialog.open,false);assert.equal(requests.filter(r=>r.path==='/disconnect').length,beforeClose+1);
  const beforeOpen=requests.filter(r=>r.path==='/connect').length;
  dom.window.document.querySelector('#k40Open').click();assert.equal($('k40Token').value,'remembered-test-code');assert.equal($('k40Remember').checked,true);
  assert.equal(requests.filter(r=>r.path==='/connect').length,beforeOpen);assert.equal($('k40Run').disabled,true);
  $('k40Connect').click();await settle();$('k40Disconnect').click();await settle();assert.equal($('k40Run').disabled,true);
  $('k40Forget').click();await settle();assert.equal(dom.window.localStorage.getItem('lzbox-k40-pairing-v1'),null);assert.equal($('k40Token').value,'');
  $('k40Close').click();
  oldBridge=true;const attempts=requests.filter(r=>r.path==='/connect').length;
  dom.window.document.querySelector('#k40Open').click();$('k40Token').value='old-bridge-code';$('k40Connect').click();await settle();
  assert.equal(requests.filter(r=>r.path==='/connect').length,attempts);assert.match($('k40Status').textContent,/Actualiza/);$('k40Close').click();
 }finally{globalThis.document=previous.document;globalThis.fetch=previous.fetch;dom.window.close();}
});

test('WebUSB probe filters CH341, claims/releases it and sends no device commands',async()=>{
 const {probeM2USB}=await import('./web/box/k40-usb.js');
 const calls=[];
 const device={vendorId:0x1a86,productId:0x5512,productName:'CH341',opened:false,
  configuration:{interfaces:[{interfaceNumber:0,alternates:[{endpoints:[{type:'bulk',direction:'out'},{type:'bulk',direction:'in'}]}]}]},
  async open(){calls.push('open');this.opened=true;},async claimInterface(n){calls.push('claim:'+n);},async releaseInterface(n){calls.push('release:'+n);},async close(){calls.push('close');this.opened=false;}
 };
 const usb={async requestDevice(options){assert.deepEqual(options.filters,[{vendorId:0x1a86,productId:0x5512}]);return device;}};
 const result=await probeM2USB(usb);assert.equal(result.vendorId,0x1a86);assert.deepEqual(calls,['open','claim:0','release:0','close']);
 calls.length=0;device.claimInterface=async()=>{throw Object.assign(Error('busy'),{name:'NetworkError'});};
 await assert.rejects(()=>probeM2USB(usb),/WinUSB/);assert.deepEqual(calls,['open','close']);
 await assert.rejects(()=>probeM2USB(undefined),/WebUSB/);
 await assert.rejects(()=>probeM2USB({requestDevice:async()=>{throw Object.assign(Error(),{name:'NotFoundError'});}}),/No seleccionaste/);
});
