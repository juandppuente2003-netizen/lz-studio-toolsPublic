import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {fitRegistration,registeredJob,transformPoint} from './web/box/registration.js';
import {makeWorkshopItem,readWorkshop,writeWorkshop,filterWorkshop} from './web/box/workshop-store.js';
import {CommandGate,encodePairing,decodePairing,sendPeerMessage,PeerMessageReader} from './web/box/peer-transport.js';
import {defaults,generate} from './web/box/geometry.js';
import {arrange} from './web/box/layout-plus.js';
import {prepareK40Job} from './web/box/k40-job.js';

test('rigid fit preserves dimensions, validates extra points, rejects degenerate and scaled references',()=>{
 const pairs=[{design:[10,10],machine:[30,20]},{design:[110,10],machine:[30,120]},{design:[110,110],machine:[-70,120]}];
 const fit=fitRegistration(pairs);assert.ok(Math.abs(fit.angle-90)<1e-9);assert.ok(fit.max<1e-9);
 assert.deepEqual(transformPoint([10,10],fit).map(Math.round),[30,20]);
 assert.throws(()=>fitRegistration([pairs[0],pairs[0]]),/10 mm/);
 assert.throws(()=>fitRegistration([{design:[0,0],machine:[0,0]},{design:[100,0],machine:[110,0]}]),/escala/);
 assert.throws(()=>fitRegistration([...pairs.slice(0,2),{design:[10,110],machine:[0,0]}]));
 assert.throws(()=>registeredJob({bed:{width:400,height:400},paths:[{closed:true,points:[[10,10],[110,10],[110,110]]}]},pairs),/fuera/);
 const translation=fitRegistration([{design:[10,10],machine:[20,30]}],'translation');assert.deepEqual(transformPoint([50,50],translation),[60,70]);
});

test('library snapshots retain geometry and settings, exclude credentials and measured coordinates, handle storage quota',()=>{
 const state={...defaults},source=structuredClone(state);const item=makeWorkshopItem({name:'Tanda gorras',state,kind:'template',settings:{speed:12,passes:2,origin:'aligned',token:'secret',sessionId:'old'},references:[[10,20],[100,20]],thumb:'javascript:bad'});
 state.width+=20;assert.deepEqual(item.state,source);assert.equal(item.thumb,null);assert.equal(item.settings.token,undefined);assert.equal(item.settings.sessionId,undefined);assert.equal(item.settings.origin,'home');assert.equal(item.requiresReference,true);
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 writeWorkshop(storage,[item]);assert.equal(readWorkshop(storage)[0].name,'Tanda gorras');assert.equal(filterWorkshop([item],{query:'GORRAS',kind:'template'}).length,1);
 const broken={getItem:storage.getItem,setItem(){throw Error('QuotaExceededError');}};assert.throws(()=>writeWorkshop(broken,[]),/Quota/);assert.equal(readWorkshop(storage).length,1);
});

test('remote command gate deduplicates in-flight requests and permits Stop ahead of occupied operations',async()=>{
 const actions=[];let release;const gate=new CommandGate(async action=>{actions.push(action);if(action==='cut')await new Promise(r=>release=r);});
 const cut={type:'command',id:1,action:'cut'};const first=gate.handle(cut),duplicate=gate.handle(cut);
 assert.equal((await gate.handle({type:'command',id:2,action:'jog'})).ok,false);
 assert.equal((await gate.handle({type:'command',id:3,action:'pause'})).ok,true);
 release();assert.equal((await first).ok,true);assert.equal((await duplicate).ok,true);assert.deepEqual(actions,['cut','pause']);
 await assert.rejects(()=>gate.handle({type:'command',id:0,action:'cut'}));gate.close();await assert.rejects(()=>gate.handle({type:'command',id:4,action:'cut'}),/cerrada/);
});

test('QR payload roundtrip expires and rejects oversized or unexpected signaling',async()=>{
 const offer={version:1,type:'offer',session:crypto.randomUUID(),expires:Date.now()+300000,sdp:'v=0\r\na=application-test\r\n'};
 assert.deepEqual(await decodePairing(await encodePairing(offer),'offer'),offer);
 await assert.rejects(async()=>decodePairing(await encodePairing({...offer,expires:Date.now()-1000}),'offer'),/expirado/);
 await assert.rejects(async()=>decodePairing(await encodePairing(offer),'answer'),/incompatible/);
 await assert.rejects(()=>decodePairing('a'.repeat(16001),'offer'),/inválido/);
});

test('large vector previews are chunked without exceeding SCTP message limits',()=>{
 const frames=[],channel={send:raw=>frames.push(raw)},value={type:'state',preview:'á'.repeat(100000),name:'Lote'};
 sendPeerMessage(channel,value);assert.ok(frames.length>1);assert.ok(frames.every(f=>f.length<17000));
 const reader=new PeerMessageReader();let result;for(const frame of frames){const next=reader.accept(frame);if(next)result=next;}assert.deepEqual(result,value);
 assert.throws(()=>new PeerMessageReader().accept(frames[1]),/incompleta/);
});

test('actual Box boot: all models, four spaces, selection, saved preparations and active-machine navigation',async()=>{
 const html=await readFile('web/box/index.html','utf8'),dom=new JSDOM(html,{url:'https://www.lzstudiotools.com/box/index.html',pretendToBeVisual:true});
 const globals=['window','document','localStorage','ResizeObserver','MutationObserver','requestAnimationFrame','cancelAnimationFrame','Image','ImageData','Path2D','lzApp','fetch','matchMedia','setTimeout','setInterval'];const previous=Object.fromEntries(globals.map(k=>[k,globalThis[k]])),timeouts=new Set(),intervals=new Set();
 globalThis.setTimeout=(fn,ms,...args)=>{const timer=previous.setTimeout(fn,ms,...args);timeouts.add(timer);return timer;};globalThis.setInterval=(fn,ms,...args)=>{const timer=previous.setInterval(fn,ms,...args);intervals.add(timer);return timer;};
 const {createCanvas,Image,ImageData,Path2D}=await import('@napi-rs/canvas');const canvases=new WeakMap();
 dom.window.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;let canvas=canvases.get(this);if(!canvas){canvas=createCanvas(this.width||300,this.height||150);canvases.set(this,canvas);const ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(source,...args)=>draw(canvases.get(source)||source,...args);}return canvas.getContext('2d');};
 dom.window.HTMLCanvasElement.prototype.toDataURL=function(){return canvases.get(this)?.toDataURL()||'';};
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const media=()=>({matches:true,addEventListener(){},removeEventListener(){}});dom.window.matchMedia=media;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,ResizeObserver:class{observe(){}disconnect(){}},MutationObserver:dom.window.MutationObserver,requestAnimationFrame:()=>0,cancelAnimationFrame(){},Image,ImageData,Path2D,matchMedia:media});
 const requests=[];let connected=false,phase='idle',position=null;
 const info=()=>({protocol:'lz-k40-m2/v1',board:'M2',bed:{width:400,height:400},connected,position,sessionId:'workshop-session',state:phase,percent:100,message:'Estado '+phase,features:['persistent-pairing','disconnect','priority-stop','jog','current-origin','automatic-completion','pause-resume','automatic-cancel-recovery','rigid-registration','rapid-command-acceptance','rapid-frame-acceptance','timed-pulse','cancel-keeps-usb']});
 globalThis.fetch=async(url,options={})=>{const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):{};requests.push({path,body});if(path==='/connect')connected=true;if(path==='/motion'){position=body.action==='home'?[0,0]:[position[0]+body.dx,position[1]+body.dy];}if(path==='/prepare')return {ok:true,json:async()=>({id:'frozen-job',...info()})};if(path==='/run'){phase='sent';position=null;}if(path==='/pause')phase='paused';if(path==='/resume')phase='sending';return {ok:true,json:async()=>info()};};
 const settle=()=>new Promise(r=>setImmediate(r));
 try{
  await import('./web/box/app.js?workshop-test');const app=globalThis.lzApp;assert.equal(app.valid,true);await import('./web/box/studio-plus.js?v=3.5');await import('./web/box/workflow-plus.js?v=3.5');
  const {mountWorkshop}=await import('./web/box/workshop.js?workshop-test');const workshop=mountWorkshop(app),$=id=>dom.window.document.getElementById(id);
  dom.window.lzApp=app;await import('./web/studio-redesign.js?workshop-test');assert.ok($('k40BridgePanel').closest('.studio-job-column'));assert.ok($('pieceBar').closest('.studio-piece-inspector'));assert.equal(dom.window.document.querySelectorAll('#modelCatalog [data-model]').length,17);
  assert.ok($('openingRow').closest('.workshop-preview-controls'));assert.equal(dom.window.document.body.classList.contains('box-booting'),false);assert.equal(dom.window.document.querySelector('.lz-nav-link[href="../dtf.html"]').textContent,'Herramientas DTF');
  assert.equal(workshop.space,'design');assert.equal($('k40Dialog').tagName,'SECTION');
  assert.ok($('workshopFuseCuts').closest('.workshop-prepare-dock'));
  $('workshopFuseCuts').click();assert.equal(app.state.layoutMode,'shared');assert.equal(app.state.placements,null);
  assert.match($('workshopFusionSummary').textContent,/Ahorro:/);assert.ok($('workshopFusionPreview').querySelector('svg'));
  const placementBefore=app.packed.panels.map(p=>[p.id,p.x,p.y,p.rotation]);$('workshopRemoveDuplicates').click();
  assert.deepEqual(app.packed.panels.map(p=>[p.id,p.x,p.y,p.rotation]),placementBefore);
  assert.ok($('plan').querySelector('.plan-unique-cuts'));
  const before=JSON.stringify(app.state);workshop.show('prepare');assert.equal(app.view,'2d');assert.equal(JSON.stringify(app.state),before);assert.ok($('plan').querySelector('svg'));
  app.planEdit.selected=app.packed.panels[0].id;app.planEdit.refreshTools();assert.equal($('workshopPieceX').disabled,false);
  const old=app.packed.panels[0].x;$('workshopPieceX').value=old+1;$('workshopPieceY').value=app.packed.panels[0].y;$('workshopApplyPosition').click();assert.equal(app.state.placements[app.planEdit.selected].x,old+1);
  app.saveNamed('Diseño original');workshop.show('library');assert.match($('workshopLibraryGrid').textContent,/Diseño original/);
  workshop.savePreparation('template');$('workshopItemName').value='Plantilla lote';$('workshopItemName').closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(readWorkshop(dom.window.localStorage).length,1);assert.match($('workshopLibraryGrid').textContent,/Plantilla lote/);
  workshop.show('operate');$('k40Token').value='local-only';$('k40Connect').click();await settle();await settle();assert.equal(app.machineControl.machine.connected,true);
  $('k40Home').click();await settle();await settle();assert.equal($('k40Right').disabled,false);
  app.machineControl.setRemoteOwner(true);assert.equal($('k40Right').disabled,true);
  const motions=requests.filter(p=>p.path==='/motion').length;$('k40Right').click();await settle();assert.equal(requests.filter(p=>p.path==='/motion').length,motions);
  await app.machineControl.remoteCommand('jog',{dx:1,dy:0});assert.equal(requests.filter(p=>p.path==='/motion').length,motions+1);
  app.machineControl.setRemoteOwner(false);assert.equal($('k40Right').disabled,false);
  $('k40Run').click();await settle();await settle();assert.equal(app.machineControl.busy,true);
  const connectCount=requests.filter(p=>p.path==='/connect').length;workshop.show('design');workshop.show('library');workshop.show('operate');assert.equal(requests.filter(p=>p.path==='/connect').length,connectCount);assert.equal(requests.filter(p=>p.path==='/disconnect').length,0);assert.equal(requests.filter(p=>p.path==='/run').length,1);
  await app.machineControl.pause();assert.equal(phase,'paused');
  for(const space of ['design','prepare','library']){workshop.show(space);assert.equal(dom.window.document.querySelector('.workshop-machine-strip').hidden,false);}
 }finally{await (await import('./web/box/materials.js?v=3.5')).loadMaterials();for(const timer of timeouts)clearTimeout(timer);for(const timer of intervals)clearInterval(timer);dom.window.close();for(const k of globals){if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];}}
});
