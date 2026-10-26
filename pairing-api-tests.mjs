import test from 'node:test';
import assert from 'node:assert/strict';
import {boxPairing} from './worker/box-pairing.js';
const session=crypto.randomUUID(),secret='a'.repeat(64),claim=crypto.randomUUID();
const request=(data,extra={})=>new Request('https://www.lzstudiotools.com/api/box/pair',{method:'POST',headers:{Origin:'https://www.lzstudiotools.com','Content-Type':'application/json',...extra},body:JSON.stringify(data)});
test('pairing API validates session, CSRF, account and bounded signaling; phone never gets account or USB credentials',async()=>{
 const calls=[];let identity={user:{id:'owner'},blocked:false};
 const opts={token:'account-token',verify:async()=>identity,fetchUpstream:async(url,options)=>{calls.push({url,options});return Response.json({session,expires:Date.now()+300000});}};
 assert.equal((await boxPairing(request({action:'create',session,secret,sdp:'offer'}),opts)).status,200);
 assert.equal(calls[0].options.headers.Authorization,'Bearer account-token');
 assert.equal((await boxPairing(request({action:'offer',session,secret,claim}),opts)).status,200);
 assert.equal(calls[1].options.headers.Authorization,undefined);
 assert.equal(JSON.parse(calls[1].options.body).p_claim,claim);
 const before=calls.length;identity=null;
 assert.equal((await boxPairing(request({action:'create',session,secret,sdp:'offer'}),opts)).status,401);
 for(const data of [{action:'offer',session,secret:'weak',claim},{action:'cut',session},{action:'answer',session,secret,claim,sdp:'x'.repeat(30001)}])assert.equal((await boxPairing(request(data),opts)).status,400);
 assert.equal((await boxPairing(request({action:'offer',session,secret,claim},{Origin:'https://attacker.invalid'}),opts)).status,403);assert.equal(calls.length,before);
});
