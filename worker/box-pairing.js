import {AUTH_CONFIG} from '../web/auth-config.js';
export async function boxPairing(request,{fetchUpstream,verify,token}){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST')return reply({message:'Metodo no permitido.'},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({message:'Solicitud no permitida.'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({message:'Solicitud invalida.'},415);
 if(Number(request.headers.get('Content-Length')||0)>40000)return reply({message:'Solicitud demasiado grande.'},413);
 const raw=await request.text();if(raw.length>40000)return reply({message:'Solicitud demasiado grande.'},413);
 let data;try{data=JSON.parse(raw);}catch{return reply({message:'Solicitud invalida.'},400);}
 if(!data||!['create','poll','remove','offer','answer'].includes(data.action)||typeof data.session!=='string'||!/^[0-9a-f-]{36}$/i.test(data.session))return reply({message:'Emparejamiento invalido.'},400);
 const owner=['create','poll','remove'].includes(data.action);
 if(owner){const identity=await verify(token);if(!identity||identity.blocked)return reply({message:'Inicia sesion para emparejar.'},401);}
 if((!owner||data.action==='create')&&(typeof data.secret!=='string'||!/^[a-f0-9]{64}$/.test(data.secret)))return reply({message:'QR invalido.'},400);
 if(['create','answer'].includes(data.action)&&(typeof data.sdp!=='string'||!data.sdp.length||new TextEncoder().encode(data.sdp).length>30000))return reply({message:'Enlace invalido.'},400);
 if(!owner&&(typeof data.claim!=='string'||!/^[0-9a-f-]{36}$/i.test(data.claim)))return reply({message:'Celular invalido.'},400);
 const response=await fetchUpstream(AUTH_CONFIG.supabaseUrl+'/rest/v1/rpc/lz_box_pair_exchange',{method:'POST',headers:{apikey:AUTH_CONFIG.publishableKey,...(owner?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify({p_action:data.action,p_id:data.session,p_secret:data.secret||null,p_sdp:data.sdp||null,p_claim:data.claim||null})});
 if(!response.ok){let error;try{error=await response.json();}catch{}return reply({message:error?.message?.match(/^(El QR|Emparejamiento|Este QR|Respuesta de enlace|Espera dos|Inicia sesion)/)?error.message:'No se pudo completar el emparejamiento. Genera otro QR.'},response.status===401||response.status===403?403:409);}
 return reply(await response.json());
}
