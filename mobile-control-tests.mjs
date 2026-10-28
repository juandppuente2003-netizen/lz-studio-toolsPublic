import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {encodePairing} from './web/box/peer-transport.js';

test('actual mobile controller: pairing, owner, single jog, priority Stop, disconnect and no automatic start',async()=>{
 const session=crypto.randomUUID(),expires=Date.now()+300000;
 const code=await encodePairing({version:1,type:'offer',session,expires,sdp:'test-offer'});
 const dom=new JSDOM(await readFile('web/box/remote.html','utf8'),{url:'https://www.lzstudiotools.com/box/remote.html#pair='+code});
 const keys=['window','document','location','history','navigator','DOMParser','RTCPeerConnection'];
 const original=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let peer;const sent=[];
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';}async setRemoteDescription(v){this.remote=v;}async createAnswer(){return {type:'answer',sdp:'test-answer'};}async setLocalDescription(v){this.localDescription=v;}close(){}}
 const values={window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,navigator:dom.window.navigator,DOMParser:dom.window.DOMParser,RTCPeerConnection:Peer};
 for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const $=id=>dom.window.document.getElementById(id),settle=()=>new Promise(r=>setImmediate(r));
 try{
  await import('./web/box/remote-client.js?mobile-controller-test');
  assert.equal($('remoteHome').disabled,true);assert.equal(sent.length,0);
  await $('remotePair').onclick();assert.ok($('remoteAnswer').value);assert.equal(dom.window.location.hash,'');
  const channel={label:'lz-box-'+session,readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){}};
  peer.ondatachannel({channel});channel.onopen();assert.equal(sent.length,0,'Pairing must not initiate motion');
  const state={type:'state',session,state:'idle',label:'Lista',message:'Conectada',owner:'phone',name:'Lote',position:[5,5],hasPosition:true,canRun:true,canPause:false,canResume:false,busy:false,preview:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L5 5"/></svg>'};
  channel.onmessage({data:JSON.stringify(state)});assert.equal($('remoteDown').disabled,false);assert.ok($('remotePreview').querySelector('svg'));
  $('remoteDown').click();$('remoteDown').click();assert.equal(sent.length,1);assert.equal(sent[0].action,'jog');assert.deepEqual(sent[0].args,{dx:0,dy:5});
  channel.onmessage({data:JSON.stringify({...state,state:'sending',busy:true,canPause:true})});$('remoteStop').click();assert.equal(sent.length,2);assert.equal(sent[1].action,'pause');
  for(const message of sent)channel.onmessage({data:JSON.stringify({type:'reply',id:message.id,ok:true})});await settle();
  channel.onmessage({data:JSON.stringify({...state,canPulse:true})});$('remotePulse').click();$('remotePulse').click();
  assert.equal(sent.at(-1).action,'pulse');assert.equal(sent.filter(v=>v.action==='pulse').length,1);
  channel.onmessage({data:JSON.stringify({type:'reply',id:sent.at(-1).id,ok:true})});await settle();
  channel.onmessage({data:JSON.stringify(state)});$('remoteSpeed').value='15';$('remotePasses').value='3';$('remoteSettings').click();
  assert.equal(sent.at(-1).action,'settings');assert.deepEqual(sent.at(-1).args,{speed:15,passes:3});
  channel.onmessage({data:JSON.stringify({type:'reply',id:sent.at(-1).id,ok:true})});await settle();
  channel.onmessage({data:JSON.stringify({...state,owner:'desktop',canPause:true})});assert.equal($('remoteDown').disabled,true);assert.equal($('remoteStop').disabled,false);
  const before=sent.length;channel.onclose();assert.equal($('remoteHome').disabled,true);assert.equal($('remoteStop').disabled,true);assert.equal(sent.length,before,'Disconnect must not retry commands');
 }finally{dom.window.close();for(const key of keys){if(original[key])Object.defineProperty(globalThis,key,original[key]);else delete globalThis[key];}}
});
test('v62 celular: pestañas, biblioteca y trabajos sin órdenes automáticas; subir archivo por fragmentos; abrir no ejecuta',async()=>{
 const session=crypto.randomUUID(),expires=Date.now()+300000;
 const code=await encodePairing({version:1,type:'offer',session,expires,sdp:'test-offer'});
 const dom=new JSDOM(await readFile('web/box/remote.html','utf8'),{url:'https://www.lzstudiotools.com/box/remote.html#pair='+code});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.scrollTo=()=>{};
 const keys=['window','document','location','history','navigator','DOMParser','RTCPeerConnection','FileReader'];
 const original=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let peer;const sent=[];
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';}async setRemoteDescription(v){this.remote=v;}async createAnswer(){return {type:'answer',sdp:'a'};}async setLocalDescription(v){this.localDescription=v;}close(){}}
 const values={window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,navigator:dom.window.navigator,DOMParser:dom.window.DOMParser,RTCPeerConnection:Peer,FileReader:dom.window.FileReader};
 for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const $=id=>dom.window.document.getElementById(id),settle=()=>new Promise(r=>setImmediate(r));
 try{
  await import('./web/box/remote-client.js?v62-tabs-test');
  await $('remotePair').onclick();
  const channel={label:'lz-box-'+session,readyState:'open',bufferedAmount:0,send:v=>sent.push(JSON.parse(v)),close(){}};
  peer.ondatachannel({channel});channel.onopen();
  const job={source:'import',file:{name:'placa.svg',type:'svg'},objects:3,dims:{width:100,height:50},placement:{x:0,y:0,scale:1,rotation:0},bounds:{x:0,y:0,width:100,height:50},review:true,ops:[{id:'r1',type:'raster',name:'Grabado imagen',enabled:true,speed:200,passes:1,empty:false,seconds:30,range:[10,400]},{id:'c1',type:'cut',name:'Corte',enabled:true,speed:10,passes:1,empty:false,seconds:20,range:[1,100]}],problems:[],warnings:[],seconds:50,sendScope:'all',issues:[]};
  const state={type:'state',session,state:'idle',label:'Lista',message:'ok',owner:'phone',name:'placa',position:[0,0],hasPosition:true,canRun:true,canFrame:true,canPause:false,busy:false,connected:true,origin:'home',job,preview:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,iVBORw0KGgo=" x="0" y="0" width="5" height="5"/><script>x</script></svg>'};
  channel.onmessage({data:JSON.stringify(state)});
  assert.equal($('remotePreview').querySelector('svg'),null,'vista con script rechazada');
  channel.onmessage({data:JSON.stringify({...state,preview:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,iVBORw0KGgo=" x="0" y="0" width="5" height="5"/></svg>'})});
  assert.ok($('remotePreview').querySelector('image'));
  assert.equal(sent.length,0,'recibir estado no envía órdenes');
  $('navJobs').click();assert.equal($('tabJobs').hidden,false);assert.equal($('tabControl').hidden,true);
  assert.equal($('remoteOps').querySelectorAll('.rm-op').length,2);assert.equal($('remoteScope').options.length,3);
  const speed=$('remoteOps').querySelector('.rm-op-speed');speed.value='150';speed.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual(sent.at(-1).args,{id:'r1',speed:150});assert.equal(sent.at(-1).action,'op');
  channel.onmessage({data:JSON.stringify({type:'reply',id:sent.at(-1).id,ok:true})});await settle();
  $('remoteReviewOpen').click();assert.equal($('remoteReview').hidden,false);assert.match($('remoteReviewList').textContent,/Grabado imagen/);
  $('navLibrary').click();await settle();assert.equal(sent.at(-1).action,'lib-list');channel.onmessage({data:JSON.stringify({type:'reply',id:sent.at(-1).id,ok:true})});await settle();
  channel.onmessage({data:JSON.stringify({type:'library',session,cloud:'on',items:[{scope:'file',id:'f1',kind:'svg',name:'Placas',dims:'100 × 50 mm',ops:['Corte'],where:'both',synced:true,deleted:false,updated:'2026-10-01',thumb:null},{scope:'box',id:'b1',kind:'prepared',name:'Caja',dims:'',ops:['Corte'],where:'browser',deleted:true,updated:'2026-10-02',thumb:null}]})});
  assert.equal($('remoteLibList').children.length,1);assert.match($('remoteLibList').textContent,/sincronizado/);
  const before=sent.length;[...$('remoteLibList').querySelectorAll('button')].find(b=>b.textContent==='Abrir').click();
  assert.equal(sent.length,before+1);assert.equal(sent.at(-1).action,'lib-open');assert.ok(!sent.some(m=>m.action==='cut'||m.action==='frame'),'abrir no ejecuta');
  channel.onmessage({data:JSON.stringify({type:'reply',id:sent.at(-1).id,ok:true})});await settle();
  [...$('remoteLibList').parentElement.querySelectorAll('[data-lib]')].find(b=>b.dataset.lib==='trash').click();assert.match($('remoteLibList').textContent,/Caja/);
  // Subida: archivo grande en fragmentos, en orden.
  const big='<svg xmlns="http://www.w3.org/2000/svg">'+'<path d="M0 0L1 1"/>'.repeat(3000)+'</svg>';
  const file=new dom.window.File([big],'logo.svg',{type:'image/svg+xml'});file.text=async()=>big;
  Object.defineProperty($('remoteImport'),'files',{value:[file],configurable:true});
  const start=sent.length;const done=$('remoteImport').onchange();await settle();await settle();
  const chunks=sent.slice(start).filter(m=>m.type==='upload');assert.ok(chunks.length>1);assert.deepEqual(chunks.map(c=>c.index),[...chunks.keys()]);assert.equal(chunks[0].mime,'image/svg+xml');assert.equal(chunks.map(c=>c.data).join(''),big);
  channel.onmessage({data:JSON.stringify({type:'upload-reply',upload:chunks[0].upload,ok:true})});await done;
  assert.match($('remoteUpload').textContent,/importado/);
 }finally{dom.window.close();for(const key of keys){if(original[key])Object.defineProperty(globalThis,key,original[key]);else delete globalThis[key];}}
});
