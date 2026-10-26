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
test('desktop QR uses automatic answer and keeps movement control until explicitly granted',async()=>{
 const dom=new JSDOM('<body><div id="mount"></div></body>',{url:'https://www.lzstudiotools.com/box/index.html'});dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const calls=[];let peer,owner=false,host;
 class Peer{constructor(){peer=this;this.iceGatheringState='complete';}createDataChannel(label){return this.channel={label,bufferedAmount:0,readyState:'open',send(){},close(){}};}async createOffer(){return {type:'offer',sdp:'automatic-offer'};}async setLocalDescription(v){this.localDescription=v;}async setRemoteDescription(v){this.remote=v;}close(){}}
 const restore=globals(dom,Peer,async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json(data.action==='create'?{session:data.session,expires:Date.now()+300000}:data.action==='poll'?{answer:'automatic-answer'}:{});});
 try{
  const {mountRemoteHost}=await import('./web/box/workshop-remote.js?automatic-desktop-test');
  host=mountRemoteHost({}, {busy:false,setRemoteOwner:value=>{owner=value;},snapshot:()=>({preview:'',owner:owner?'phone':'desktop'})},dom.window.document.getElementById('mount'));
  await dom.window.document.getElementById('peerGenerate').onclick();await settle();await settle();assert.equal(peer.remote.sdp,'automatic-answer');
  const link=dom.window.document.getElementById('peerLink').value;assert.match(link,/#link=[0-9a-f-]{36}\.[a-f0-9]{64}$/);assert.equal(dom.window.document.getElementById('peerAccept').hidden,true);
  peer.channel.onopen();assert.equal(owner,false);dom.window.document.getElementById('peerGrant').click();assert.equal(owner,true);
  host.revoke();await settle();assert.equal(owner,false);assert.ok(calls.some(c=>c.action==='remove'));
 }finally{host?.revoke();await settle();restore();}
});
