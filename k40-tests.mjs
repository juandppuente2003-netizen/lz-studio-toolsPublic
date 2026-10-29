import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,generate} from './web/box/geometry.js';
import {modelInfo,modelPresets} from './web/box/models.js';
import {arrange,freeze} from './web/box/layout-plus.js';
import {prepareK40Job,k40Preview,placeK40Job} from './web/box/k40-job.js';
import {mountK40} from './web/box/k40-control.js';

function example(extra={}){
 const state={...defaults,...extra},panels=generate(state),packed=arrange(panels,state);
 return {state,panels,packed,valid:true};
}
test('18 models × 3 layouts produce M2 snapshots for every sheet',()=>{
 let combinations=0;
 for(const model of Object.keys(modelInfo))for(const layoutMode of ['rows','compact','shared']){
  const app=example({...modelPresets[model],model,layoutMode});
  for(let sheet=0;sheet<app.packed.count;sheet++){
   const job=prepareK40Job(app,{sheet});assert.equal(job.board,'M2');assert.ok(job.paths.length);
   assert.ok(job.paths.every(p=>p.points.every(([x,y])=>x>=0&&y>=0&&x<=400&&y<=400)));
   let outer=false;for(const p of job.paths){if(p.role==='outer')outer=true;else assert.equal(outer,false);}
  }combinations++;
 }assert.equal(combinations,54);
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
test('UI: home, one jog per click, current origin, priority cancellation and remembered auto-connection',async()=>{
 const {JSDOM}=await import('jsdom');
 const dom=new JSDOM('<div class="export-actions"></div>',{url:'https://www.lzstudiotools.com/box/index.html'});
 const previous={document:globalThis.document,fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};globalThis.document=dom.window.document;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let pollTick;globalThis.setInterval=fn=>{pollTick=fn;return 12345678;};globalThis.clearInterval=()=>{};
 const requests=[];let phase='idle',position=null,connected=false,operation=null,pending=null,oldBridge=false,delayRun=false,releaseRun;
 const info=()=>({protocol:'lz-k40-m2/v1',board:'M2',bed:{width:400,height:400},simulation:false,position,connected,operation,operationAccepted:phase==='idle'&&['home','jog'].includes(operation),sessionId:'test-session',features:oldBridge?[]:['persistent-pairing','disconnect','priority-stop','jog','current-origin','automatic-completion','pause-resume','automatic-cancel-recovery','rigid-registration','rapid-command-acceptance','rapid-frame-acceptance','timed-pulse','cancel-keeps-usb']});
 globalThis.fetch=async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;requests.push({path,body});
  if(path==='/connect')connected=true;
  if(path==='/prepare'){pending=body.origin==='current'?[...position]:[0,0];return {ok:true,json:async()=>({id:'test-job',...info()})};}
  if(path==='/motion'){operation=body.action;position=body.action==='home'?[0,0]:[position[0]+body.dx,position[1]+body.dy];phase='idle';}
  if(path==='/run'){phase='sent';position=null;operation='cut';if(delayRun){delayRun=false;await new Promise(resolve=>{releaseRun=resolve;});}}
  if(path==='/pause')phase='pausing';
  if(path==='/resume')phase='resuming';
  if(path==='/cancel'){phase='cancelling';position=null;pending=null;}
  if(path==='/acknowledge'){if(phase==='cancelled')connected=false;position=pending;phase='idle';}
  if(path==='/disconnect'){phase='idle';position=null;connected=false;}
  return {ok:true,json:async()=>({state:phase,message:'Estado '+phase,percent:100,...info()})};
 };
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const app={...example(),onUpdate(){},setView(){}};const {dialog}=mountK40(app),$=id=>dialog.querySelector('#'+id),open=()=>dom.window.document.querySelector('#k40Open').click();
  open();$('k40Remember').checked=false;$('k40Token').value='test-code';$('k40Connect').click();await settle();
  assert.equal($('k40Confirm'),null);assert.equal($('k40Home').disabled,false);assert.equal($('k40Right').disabled,true);
  $('k40Home').click();$('k40Home').click();await settle();await settle();
  assert.equal(requests.filter(r=>r.path==='/motion').length,1);assert.equal($('k40Right').disabled,false);assert.match($('k40Position').textContent,/0.00/);
  assert.equal($('k40State').textContent,'ORDEN ACEPTADA');assert.equal($('k40Frame').disabled,false);
  $('k40TargetX').value='20';$('k40TargetY').value='30';$('k40Goto').click();await settle();await settle();
  assert.deepEqual(requests.filter(r=>r.path==='/motion').at(-1).body,{action:'goto',dx:20,dy:30,confirmed:true});
  $('k40Home').click();await settle();await settle();
  $('k40Down').click();await settle();await settle();assert.deepEqual(position,[0,5]);
  $('k40Up').click();await settle();await settle();assert.deepEqual(position,[0,0]);
  $('k40Right').click();$('k40Right').click();await settle();await settle();assert.deepEqual(position,[5,0]);
  $('k40UsePosition').click();assert.equal($('k40Origin').value,'current');assert.equal($('k40Run').disabled,false);
  $('k40Run').click();$('k40Run').click();await settle();await settle();
  assert.equal(requests.filter(r=>r.path==='/run').length,1);assert.equal(requests.find(r=>r.path==='/prepare').body.origin,'current');
  assert.equal($('k40Stop').disabled,false);assert.equal($('k40Acknowledge'),null);$('k40Close').click();assert.equal(dialog.open,true);
  $('k40Stop').click();$('k40Stop').click();await settle();
  assert.equal(requests.filter(r=>r.path==='/pause').length,1);assert.equal($('k40PausePanel').hidden,false);assert.equal($('k40Resume').disabled,true);
  phase='paused';await pollTick();await settle();assert.equal($('k40Resume').disabled,false);assert.equal($('k40Run').disabled,true);
  $('k40Resume').click();$('k40Resume').click();await settle();assert.equal(requests.filter(r=>r.path==='/resume').length,1);assert.equal(requests.filter(r=>r.path==='/run').length,1);
  phase='sent';await pollTick();await settle();assert.equal($('k40Stop').disabled,false);
  phase='idle';position=pending;await pollTick();await settle();assert.equal($('k40Right').disabled,false);assert.equal(requests.filter(r=>r.path==='/acknowledge').length,0);assert.equal($('k40Connect').disabled,true);assert.match($('k40Position').textContent,/5.00/);
  $('k40Origin').value='home';app.machineControl.setRemoteOwner(true);
  // v62: el celular elige el origen; el recorrido respeta exactamente el elegido.
  await app.machineControl.remoteCommand('jog',{dx:5,dy:5});
  await app.machineControl.remoteCommand('frame');
  assert.equal(requests.filter(r=>r.path==='/prepare').at(-1).body.origin,'home');
  phase='idle';position=pending;await pollTick();await settle();
  await app.machineControl.remoteCommand('origin',{value:'current'});assert.equal($('k40Origin').value,'current');
  await app.machineControl.remoteCommand('frame');
  assert.equal(requests.filter(r=>r.path==='/prepare').at(-1).body.origin,'current');
  phase='idle';position=pending;await pollTick();await settle();
  await app.machineControl.remoteCommand('cut');
  assert.equal(requests.filter(r=>r.path==='/prepare').at(-1).body.origin,'current');
  phase='idle';position=pending;await pollTick();await settle();app.machineControl.setRemoteOwner(false);
  delayRun=true;$('k40Run').click();await settle();
  assert.equal(typeof releaseRun,'function');assert.equal($('k40Stop').disabled,false);$('k40Stop').click();await settle();$('k40Cancel').click();await settle();assert.equal(phase,'cancelling');
  releaseRun();await settle();await settle();assert.equal($('k40Acknowledge'),null);assert.match($('k40Status').textContent,/cancelling/);
  phase='recovering';await pollTick();await settle();assert.equal($('k40Run').disabled,true);
  phase='idle';connected=false;await pollTick();await settle();assert.equal($('k40Reconnect').hidden,false);assert.equal(requests.filter(r=>r.path==='/acknowledge').length,0);
  $('k40Reconnect').click();await settle();assert.equal(connected,true);assert.equal($('k40Right').disabled,true);
  $('k40Close').click();await settle();assert.equal(dialog.open,false);
  open();$('k40Origin').value='home';$('k40Origin').dispatchEvent(new dom.window.Event('input'));$('k40Token').value='remembered-code';$('k40Remember').checked=true;$('k40Connect').click();await settle();
  assert.equal(dom.window.localStorage.getItem('lzbox-k40-pairing-v1'),'remembered-code');$('k40Close').click();await settle();assert.equal(dialog.open,false);
  const sends=requests.filter(r=>r.path==='/run'||r.path==='/motion').length,connections=requests.filter(r=>r.path==='/connect').length;
  open();await settle();await settle();assert.equal(requests.filter(r=>r.path==='/connect').length,connections+1);assert.equal(requests.filter(r=>r.path==='/run'||r.path==='/motion').length,sends);assert.equal($('k40Confirm'),null);
  $('k40Forget').click();await settle();await settle();assert.equal(dom.window.localStorage.getItem('lzbox-k40-pairing-v1'),null);$('k40Close').click();
  oldBridge=true;open();$('k40Token').value='old-code';const attempts=requests.filter(r=>r.path==='/connect').length;$('k40Connect').click();await settle();assert.equal(requests.filter(r=>r.path==='/connect').length,attempts);assert.match($('k40Status').textContent,/Actualiza/);$('k40Close').click();
 }finally{globalThis.document=previous.document;globalThis.fetch=previous.fetch;globalThis.setInterval=previous.setInterval;globalThis.clearInterval=previous.clearInterval;dom.window.close();}
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

test('Current-origin preview aligns actual design bounds and rejects overflow',()=>{
 const original=prepareK40Job(example()),placed=placeK40Job(original,[10,20]);
 for(const axis of [0,1])assert.equal(Math.min(...placed.paths.flatMap(path=>path.points.map(p=>p[axis]))),[10,20][axis]);
 assert.throws(()=>placeK40Job(original,null),/Home/);assert.throws(()=>placeK40Job(original,[399,399]),/excede/);
 assert.notEqual(placed.paths,original.paths);
});
test('v62: archivo importado — sin envíos automáticos, trabajo armado solo al pulsar, problemas bloquean y conector 0.6.4 limita',async()=>{
 const {JSDOM}=await import('jsdom');
 const dom=new JSDOM('<div class="export-actions"></div>',{url:'https://www.lzstudiotools.com/box/index.html'});
 const previous={document:globalThis.document,fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};globalThis.document=dom.window.document;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 const requests=[];let features=['persistent-pairing','disconnect','priority-stop','jog','current-origin','automatic-completion','pause-resume','automatic-cancel-recovery','rigid-registration','rapid-command-acceptance','rapid-frame-acceptance','timed-pulse','cancel-keeps-usb','operations-v2','raster-1bit','job-outcome'];
 const info=()=>({protocol:'lz-k40-m2/v1',board:'M2',bed:{width:400,height:400},simulation:true,position:[0,0],connected:true,sessionId:'s',features});
 globalThis.fetch=async(url,options)=>{const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;requests.push({path,body});
  if(path==='/prepare')return {ok:true,json:async()=>({id:'job',...info()})};
  if(path==='/run')return {ok:true,json:async()=>({state:'simulated',message:'sim',...info()})};
  if(path==='/acknowledge')return {ok:true,json:async()=>({state:'idle',message:'ok',outcome:{operation:'cut',result:'simulated'},...info()})};
  return {ok:true,json:async()=>({state:'idle',message:'ok',...info()})};};
 const settle=()=>new Promise(r=>setImmediate(r));
 let problem='',built=0;
 const source={isActive:()=>true,name:()=>'Placa',describe:()=>({preview:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"></svg>',compact:'<svg xmlns="http://www.w3.org/2000/svg"></svg>',summary:'Placa · Tiempo estimado: 10 s.',seconds:10,problem}),
  support:f=>f.includes('operations-v2')?{ok:true}:{ok:false,message:'Actualiza a 0.7.0'},buildJob:async()=>{built++;return {protocol:'lz-k40-m2/v2',board:'M2',bed:{width:400,height:400},name:'Placa',operations:[{type:'vector',name:'Corte',speed:10,passes:1,paths:[{points:[[0,0],[10,0]],closed:false}]}]};}};
 try{
  const app={...example(),onUpdate(){},setView(){}};const {dialog}=mountK40(app,{jobSource:source}),$=id=>dialog.querySelector('#'+id);
  dom.window.document.querySelector('#k40Open').click();$('k40Remember').checked=false;$('k40Token').value='x';$('k40Connect').click();await settle();await settle();
  app.machineControl.refresh(true);
  assert.equal(built,0,'abrir y previsualizar no arma ni envía el trabajo');assert.equal(requests.filter(r=>r.path==='/prepare').length,0);
  assert.equal($('k40Run').disabled,false);assert.match($('k40Summary').textContent,/Placa/);
  $('k40Run').click();$('k40Run').click();for(let i=0;i<6;i++)await settle();
  assert.equal(built,1);assert.equal(requests.filter(r=>r.path==='/prepare').length,1,'sin envíos duplicados');
  assert.equal(requests.find(r=>r.path==='/prepare').body.job.protocol,'lz-k40-m2/v2');
  assert.equal($('k40State').textContent,'SIMULACIÓN TERMINADA');
  problem='El diseño sale de la cama.';app.machineControl.refresh(true);assert.equal($('k40Run').disabled,true);assert.equal($('k40Frame').disabled,true);
  problem='';features=features.filter(f=>f!=='operations-v2');$('k40Disconnect').click();await settle();$('k40Connect').click();await settle();await settle();app.machineControl.refresh(true);
  assert.equal($('k40Run').disabled,true);assert.match($('k40Status').textContent,/0\.7\.\d/);
 }finally{dom.window.close();Object.assign(globalThis,previous);}
});
test('altar de muertos: 2–7 niveles, ranuras cerradas por pieza, retablo opcional y validación',()=>{
 const base={...defaults,...modelPresets.altar,model:'altar'};
 for(const extra of [{},{levels:2},{levels:4,height:260,depth:240,archRise:90},{archRise:0},{decoration:false,altarPhoto:false},{levels:7,height:385,depth:330,width:330,archRise:0,sheetW:600,sheetH:600}]){
  const s={...base,...extra},parts=generate(s),N=s.levels,left=parts.find(p=>p.id==='left'),members=parts.filter(p=>!['left','right'].includes(p.id));
  assert.equal(members.length,2*N+1);
  const tabCount=members.reduce((n,p)=>n+(p.p.filter(([x,y])=>Math.abs(x)<1e-9&&y<s.height-1e-6).length/2),0);
  assert.equal(left.jointHoles.length,tabCount,'una ranura por pestaña');
  assert.ok(members.every(p=>p.connections.includes('left')&&p.connections.includes('right')));
  const back=parts.find(p=>p.id==='back');assert.equal(back.h>s.height,s.archRise>0);
  if(extra.decoration===false&&extra.altarPhoto===false)assert.equal(back.holes.length,0);
  if(!extra.sheetW){const app=example(s);assert.ok(prepareK40Job(app,{sheet:0}).paths.length);}
 }
 assert.throws(()=>generate({...base,levels:8}),/2 a 7 niveles/);
 assert.throws(()=>generate({...base,measure:'inner'}),/exteriores/);
 assert.throws(()=>generate({...base,levels:7}),/fondo|alto/);
});
