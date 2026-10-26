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
  channel.onmessage({data:JSON.stringify({...state,owner:'desktop',canPause:true})});assert.equal($('remoteDown').disabled,true);assert.equal($('remoteStop').disabled,false);
  const before=sent.length;channel.onclose();assert.equal($('remoteHome').disabled,true);assert.equal($('remoteStop').disabled,true);assert.equal(sent.length,before,'Disconnect must not retry commands');
 }finally{dom.window.close();for(const key of keys){if(original[key])Object.defineProperty(globalThis,key,original[key]);else delete globalThis[key];}}
});
