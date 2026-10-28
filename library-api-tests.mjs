// Ruta /api/box/library: dueño verificado, límites, errores claros y nada de sincronización falsa.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boxLibrary} from './worker/box-library.js';
const url='https://www.lzstudiotools.com/api/box/library';
const req=(body,headers={})=>new Request(url,{method:'POST',headers:{Origin:'https://www.lzstudiotools.com','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const id='3f2b8c1e-1111-4222-8333-444455556666';
test('verifica origen, sesión y forma del pedido antes de llamar a la base',async()=>{
 const calls=[];const fetchUpstream=async(u,o)=>{calls.push({u,o});return Response.json({items:[]});};
 assert.equal((await boxLibrary(req({action:'list'},{Origin:'https://evil.example'}),{fetchUpstream,verify:async()=>({id:'u'}),token:'t'})).status,403);
 assert.equal((await boxLibrary(req({action:'list'}),{fetchUpstream,verify:async()=>null,token:null})).status,401);
 assert.equal((await boxLibrary(req({action:'drop'}),{fetchUpstream,verify:async()=>({id:'u'}),token:'t'})).status,400);
 assert.equal((await boxLibrary(req({action:'get',id:'x'}),{fetchUpstream,verify:async()=>({id:'u'}),token:'t'})).status,400);
 assert.equal((await boxLibrary(req({action:'put',id,item:{kind:'evil',name:'a',format:2}}),{fetchUpstream,verify:async()=>({id:'u'}),token:'t'})).status,400);
 assert.equal(calls.length,0);
 const ok=await boxLibrary(req({action:'put',id,item:{kind:'file',name:'Placa',format:2,meta:{},payload:{}}}),{fetchUpstream,verify:async()=>({id:'u'}),token:'tok'});
 assert.equal(ok.status,200);assert.equal(calls.length,1);assert.match(calls[0].u,/rpc\/lz_box_library$/);
 assert.equal(calls[0].o.headers.Authorization,'Bearer tok');const sent=JSON.parse(calls[0].o.body);assert.equal(sent.p_action,'put');assert.equal(sent.p_id,id);assert.equal(sent.p_item.name,'Placa');
});
test('tamaño máximo y función no activada se informan sin fingir sincronización',async()=>{
 const big=JSON.stringify({action:'put',id,item:{kind:'file',name:'x',format:2,payload:{data:'a'.repeat(3_900_000)}}});
 assert.equal((await boxLibrary(req(big),{fetchUpstream:async()=>Response.json({}),verify:async()=>({id:'u'}),token:'t'})).status,413);
 const r=await boxLibrary(req({action:'list'}),{fetchUpstream:async()=>Response.json({code:'PGRST202',message:'not found'},{status:404}),verify:async()=>({id:'u'}),token:'t'});
 assert.equal(r.status,503);const body=await r.json();assert.equal(body.code,'not-enabled');assert.match(body.message,/esta computadora/);
 const conflict=await boxLibrary(req({action:'put',id,item:{kind:'file',name:'x',format:2}}),{fetchUpstream:async()=>Response.json({message:'Este trabajo cambio en otro dispositivo. Abre la version mas reciente antes de guardar.'},{status:400}),verify:async()=>({id:'u'}),token:'t'});
 assert.equal(conflict.status,409);assert.match((await conflict.json()).message,/otro dispositivo/);
});
