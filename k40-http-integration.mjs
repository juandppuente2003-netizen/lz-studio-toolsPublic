// Real frontend geometry -> authenticated HTTP -> pinned MeerK40t compiler.
// This test never enables USB.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {defaults,generate} from './web/box/geometry.js';
import {arrange} from './web/box/layout-plus.js';
import {prepareK40Job} from './web/box/k40-job.js';

const child=spawn(process.env.PYTHON||'python',['-u','-c',`
import sys,json
sys.path.insert(0,'connectors/k40')
from bridge import Bridge,make_server
b=Bridge({'width':400,'height':400})
s=make_server(b,'integration-only',{'https://www.lzstudiotools.com'},port=0)
print('READY '+str(s.server_port),flush=True)
try:s.serve_forever()
except KeyboardInterrupt:pass
finally:s.server_close();b.close()
`],{stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>stderr+=b);
try{
 const port=await new Promise((resolve,reject)=>{
  let out='';const timeout=setTimeout(()=>reject(Error('No inició el conector: '+stderr)),10000);
  child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);reject(Error('El conector terminó: '+code+' '+stderr));});
  child.stdout.on('data',b=>{out+=b;const m=out.match(/READY (\d+)/);if(m){clearTimeout(timeout);resolve(+m[1]);}});
 });
 const api=async(path,body)=>{
  const response=await fetch(`http://127.0.0.1:${port}`+path,{method:body?'POST':'GET',headers:{Origin:'https://www.lzstudiotools.com',Authorization:'Bearer integration-only',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
 };
 const info=await api('/connect',{});assert.equal(info.simulation,true);assert.equal(info.powerControl,'manual');
 const state={...defaults},panels=generate(state),packed=arrange(panels,state);
 const job=prepareK40Job({state,panels,packed,valid:true},{speed:10});
 for(const mode of ['frame','cut']){
  const prepared=await api('/prepare',{job,mode});assert.ok(prepared.bytes>0);
  const sent=await api('/run',{id:prepared.id,confirmed:true});assert.equal(sent.state,'simulated');
  assert.equal((await api('/status')).state,'simulated');await api('/acknowledge',{confirmed:true});
  console.log(`${mode}: ${job.summary.pieces} piezas, ${prepared.bytes} bytes M2, simulación sin USB OK`);
 }
 console.log('Integración Box → HTTP local → motor M2 verificada.');
}finally{
 if(child.exitCode===null){child.kill('SIGINT');await once(child,'exit');}
}
