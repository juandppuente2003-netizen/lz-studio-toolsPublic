// Actual SCTP/DTLS link using node-webrtc. No browser automation and no USB.
// WRTC_MODULE may point to a separately installed @roamhq/wrtc entry point.
import assert from 'node:assert/strict';
import {createPeer,gatherDescription,encodePairing,decodePairing,CommandGate} from './web/box/peer-transport.js';
const {default:wrtc}=await import(process.env.WRTC_MODULE||'@roamhq/wrtc');
globalThis.RTCPeerConnection=wrtc.RTCPeerConnection;
const desktop=createPeer(),phone=createPeer(),session=crypto.randomUUID(),expires=Date.now()+300000,actions=[];
let remote;
const gate=new CommandGate(async(action,args)=>actions.push({action,args}));
const outgoing=desktop.createDataChannel('lz-box-'+session,{ordered:true});
const incoming=new Promise(resolve=>{phone.ondatachannel=e=>{remote=e.channel;resolve(remote);};});
outgoing.onmessage=async e=>{const message=JSON.parse(e.data);outgoing.send(JSON.stringify(await gate.handle(message)));};
const timeout=setTimeout(()=>{console.error('Timed out waiting for actual local DTLS transport');process.exit(1);},20000);
try{
 const offer=await decodePairing(await encodePairing({version:1,type:'offer',session,expires,sdp:await gatherDescription(desktop,'offer')}),'offer');
 await phone.setRemoteDescription({type:'offer',sdp:offer.sdp});
 const answer=await decodePairing(await encodePairing({version:1,type:'answer',session,expires,sdp:await gatherDescription(phone,'answer')}),'answer');
 await desktop.setRemoteDescription({type:'answer',sdp:answer.sdp});
 const channel=await incoming;if(channel.readyState!=='open')await new Promise(resolve=>channel.onopen=resolve);
 const replies=[];channel.onmessage=e=>replies.push(JSON.parse(e.data));
 const duplicate=JSON.stringify({type:'command',id:1,action:'jog',args:{dx:.5,dy:0}});channel.send(duplicate);channel.send(duplicate);
 await new Promise((resolve,reject)=>{const began=Date.now(),tick=setInterval(()=>{if(replies.length===2){clearInterval(tick);resolve();}else if(Date.now()-began>3000){clearInterval(tick);reject(Error('Missing replies'));}},10);});
 assert.equal(actions.length,1);assert.equal(replies.length,2);assert.equal(replies[0].ok,true);
 console.log('Actual local SCTP/DTLS offer → QR codec → answer → command/reply and duplicate suppression OK; no USB.');
}finally{clearTimeout(timeout);gate.close();outgoing.close();remote?.close();desktop.close();phone.close();}
// Some native node-webrtc builds retain worker handles after close().
setTimeout(()=>process.exit(0),50);
