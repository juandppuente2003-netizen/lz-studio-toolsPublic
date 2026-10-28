import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const settle=()=>new Promise(r=>setImmediate(r));
function globals(dom,Peer,fetch){const values={window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,navigator:dom.window.navigator,DOMParser:dom.window.DOMParser,RTCPeerConnection:Peer,fetch};const previous=Object.fromEntries(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});return()=>{for(const [key,value]of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}dom.window.close();};}
test('phone automatically exchanges QR offer and answer without clipboard or machine commands',async()=>{
 const session=crypto.randomUUID(),secret='a'.repeat(64),calls=[],sent=[];let peer;
 const dom=new JSDOM(await readFile('web/box/remote.html','utf8'),{url:`https://www.lzstudiotools.com/box/remote.html#link=${session}.${secret}`});
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';}async setRemoteDescription(v){this.remote=v;}async createAnswer(){return {type:'answer',sdp:'automatic-answer'};}async setLocalDescription(v){this.localDescription=v;}close(){}}
 const restore=globals(dom,Peer,async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json(data.action==='offer'?{session,expires:Date.now()+300000,sdp:'automatic-offer'}:{ok:true});});
 try{
  await import('./web/box/remote-client.js?automatic-phone-test');for(let i=0;i<10&&calls.length<2;i++)await settle();
  assert.deepEqual(calls.map(p=>p.action),['offer','answer']);assert.equal(calls[1].sdp,'automatic-answer');assert.equal(calls[0].claim,calls[1].claim);assert.equal(calls[0].secret,secret);
  assert.equal(dom.window.document.getElementById('remoteCopy').hidden,true);assert.equal(dom.window.document.getElementById('remoteAnswer').closest('label').hidden,true);assert.equal(dom.window.location.hash,'');
  const channel={label:'lz-box-'+session,readyState:'open',send:v=>sent.push(v),close(){}};peer.ondatachannel({channel});channel.onopen();assert.equal(sent.length,0);
 }finally{restore();}
});
test('desktop QR uses automatic answer and automatically transfers control on connection',async()=>{
 const dom=new JSDOM('<body><div id="mount"></div></body>',{url:'https://www.lzstudiotools.com/box/index.html'});dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const calls=[];let peer,owner=false,host;
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';}createDataChannel(label){return this.channel={label,bufferedAmount:0,readyState:'open',send(){},close(){}};}async createOffer(){return {type:'offer',sdp:'automatic-offer'};}async setLocalDescription(v){this.localDescription=v;}async setRemoteDescription(v){this.remote=v;}close(){}}
 const restore=globals(dom,Peer,async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json(data.action==='create'?{session:data.session,expires:Date.now()+300000}:data.action==='poll'?{answer:'automatic-answer'}:{});});
 try{
  const {mountRemoteHost}=await import('./web/box/workshop-remote.js?automatic-desktop-test');
  host=mountRemoteHost({}, {busy:false,setRemoteOwner:value=>{owner=value;},snapshot:()=>({preview:'',owner:owner?'phone':'desktop'})},dom.window.document.getElementById('mount'));
  await dom.window.document.getElementById('peerGenerate').onclick();await settle();await settle();assert.equal(peer.remote.sdp,'automatic-answer');
  const link=dom.window.document.getElementById('peerLink').value;assert.match(link,/#link=[0-9a-f-]{36}\.[a-f0-9]{64}$/);assert.equal(dom.window.document.getElementById('peerAccept').hidden,true);
  peer.channel.onopen();assert.equal(owner,true);assert.equal(dom.window.document.getElementById('peerGrant').hidden,true);
  host.revoke();await settle();assert.equal(owner,false);assert.ok(calls.some(c=>c.action==='remove'));
 }finally{host?.revoke();await settle();restore();}
});
test('v62: emparejamiento persistente — el celular y la computadora se reconectan solos, sin reenviar órdenes',async()=>{
 const session=crypto.randomUUID(),secret='b'.repeat(64),calls=[],sent=[];let peer;
 const dom=new JSDOM(await readFile('web/box/remote.html','utf8'),{url:`https://www.lzstudiotools.com/box/remote.html#link=${session}.${secret}`});
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';this.connectionState='new';}async setRemoteDescription(v){this.remote=v;}async createAnswer(){return {type:'answer',sdp:'a'+calls.length};}async setLocalDescription(v){this.localDescription=v;}close(){this.closed=true;}}
 const restore=globals(dom,Peer,async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json(data.action==='offer'?{session,expires:Date.now()+300000,sdp:'offer'}:{ok:true});});
 const realTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms)=>realTimeout(fn,Math.min(ms,5));
 try{
  await import('./web/box/remote-client.js?persistent-phone-test');for(let i=0;i<10&&calls.length<2;i++)await settle();
  const first=peer,claim=calls[0].claim;
  const channel={label:'lz-box-'+session,readyState:'open',send:v=>sent.push(JSON.parse(v)),close(){}};first.ondatachannel({channel});channel.onopen();
  channel.onmessage({data:JSON.stringify({type:'state',session,state:'idle',owner:'phone',name:'x',position:[0,0],hasPosition:true,canRun:true,busy:false,connected:true})});
  dom.window.document.getElementById('remoteHome').click();assert.equal(sent.length,1);
  channel.readyState='closed';channel.onclose();             // pantalla apagada / red caída
  for(let i=0;i<40&&calls.length<4;i++)await new Promise(r=>realTimeout(r,5));
  assert.deepEqual(calls.slice(2).map(c=>c.action),['offer','answer']);
  assert.equal(calls[2].claim,claim,'mismo celular');assert.equal(calls[2].secret,secret);
  assert.equal(sent.length,1,'la orden pendiente no se reenvía');assert.notEqual(peer,first);
 }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));globalThis.setTimeout=realTimeout;restore();}
});
test('v62: la computadora recuerda el celular, vuelve a publicar la oferta al perder el enlace y lo olvida a pedido',async()=>{
 const dom=new JSDOM('<body><div id="mount"></div></body>',{url:'https://www.lzstudiotools.com/box/index.html'});dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const calls=[];let peer,owner=false,host;
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';}createDataChannel(label){return this.channel={label,bufferedAmount:0,readyState:'open',send(){},close(){}};}async createOffer(){return {type:'offer',sdp:'o'};}async setLocalDescription(v){this.localDescription=v;}async setRemoteDescription(v){this.remote=v;}close(){}}
 const restore=globals(dom,Peer,async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json(data.action==='create'?{session:data.session,expires:Date.now()+300000}:data.action==='poll'?{answer:'ans'}:{});});
 const realTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms)=>realTimeout(fn,Math.min(ms,5));
 try{
  const {mountRemoteHost}=await import('./web/box/workshop-remote.js?persistent-desktop-test');
  const machine={busy:false,machine:{},remoteOwner:false,setRemoteOwner(v){owner=v;this.remoteOwner=v;},snapshot:()=>({preview:''})};
  host=mountRemoteHost({},machine,dom.window.document.getElementById('mount'));
  await dom.window.document.getElementById('peerGenerate').onclick();await settle();
  const created=calls.filter(c=>c.action==='create');assert.equal(created.length,1);
  peer.channel.onopen();assert.equal(owner,true);
  const stored=JSON.parse(dom.window.localStorage.getItem('lzbox-remote-device-v1'));assert.equal(stored.session,created[0].session);
  peer.channel.onclose();assert.equal(owner,false,'la computadora recupera el control');
  for(let i=0;i<40&&calls.filter(c=>c.action==='create').length<2;i++)await new Promise(r=>realTimeout(r,5));
  const again=calls.filter(c=>c.action==='create');assert.equal(again.length,2);assert.equal(again[1].session,stored.session);assert.equal(again[1].secret,stored.secret);
  host.revoke();assert.equal(dom.window.localStorage.getItem('lzbox-remote-device-v1'),null);assert.ok(calls.some(c=>c.action==='remove'));
 }finally{globalThis.setTimeout=realTimeout;host?.revoke();restore();}
});
