import {AUTH_CONFIG} from '../web/auth-config.js';
const COOKIE='__Host-lz_session';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json',...extra}});
function cookie(token,maxAge){return `${COOKIE}=${token||''}; Path=/; HttpOnly; Secure; SameSite=Lax; ${maxAge===null?'':'Max-Age='+maxAge}`;}
function tokenFrom(request){return request.headers.get('Cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||null;}
const toolRoutes={crop:'/crop.html',editor:'/editor.html',recolor:'/editor.html?tool=recolor',opacity:'/opacity.html',thickness:'/thickness.html',texture:'/textures.html',text:'/text-creator.html',mockups:'/mockups.html',vectorize:'/vectorize.html',analyzer:'/analyzer.html',sheet:'/gang-sheet.html',color:'/color-enhance.html',upscale:'/upscale.html',extract:'/extract.html'};
function routeTool(url){if(url.pathname==='/premium.html')return 'editor';if(url.pathname==='/editor.html')return url.searchParams.get('tool')==='recolor'?'recolor':'editor';return Object.keys(toolRoutes).find(id=>toolRoutes[id]===url.pathname);}
function pruneTools(html,tools){
 const enabled=new Set(tools.filter(t=>t.enabled).map(t=>t.id));
 const visible=href=>{const id=routeTool(new URL(href,'https://local.test'));return !id||enabled.has(id);};
 return html.replace(/<article\b[^>]*class="tool-card"[^>]*>[\s\S]*?<\/article>/g,card=>{const href=card.match(/class="open-tool" href="([^"]+)"/);return href&&!visible(href[1])?'':card;}).replace(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g,(link,href)=>visible(href)?link:'');
}
export function createHandler({assets,fetchUpstream=fetch}={}){
 async function tools(){const response=await fetchUpstream(AUTH_CONFIG.supabaseUrl+'/rest/v1/lz_tools?select=id,name,enabled',{headers:{apikey:AUTH_CONFIG.publishableKey,Authorization:'Bearer '+AUTH_CONFIG.publishableKey}});if(!response.ok)throw new Error('No se pudo consultar las herramientas.');return response.json();}
 async function verify(token,ensure=false){
  if(!token||token.length>8192||!/^[A-Za-z0-9_.-]+$/.test(token))return null;
  const base=AUTH_CONFIG.supabaseUrl;const authHeaders={apikey:AUTH_CONFIG.publishableKey,Authorization:'Bearer '+token};
  const userResponse=await fetchUpstream(base+'/auth/v1/user',{headers:authHeaders});
  if(userResponse.status===401||userResponse.status===403)return null;if(!userResponse.ok)throw new Error('No se pudo verificar la sesión.');const user=await userResponse.json();if(!user.id)return null;
  if(ensure){const profile=await fetchUpstream(base+'/rest/v1/rpc/lz_ensure_profile',{method:'POST',headers:{...authHeaders,'Content-Type':'application/json'},body:'{}'});if(!profile.ok)throw new Error('No se pudo crear tu perfil.');}
  const response=await fetchUpstream(base+'/rest/v1/lz_profiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,blocked',{headers:authHeaders});if(!response.ok)throw new Error('No se pudo verificar tu cuenta.');const profiles=await response.json();if(!profiles[0])return null;return {user,blocked:profiles[0].blocked};
 }
 return {async fetch(request){
  const url=new URL(request.url);let path;try{path=decodeURIComponent(url.pathname);}catch{return json({message:'Ruta inválida.'},400);}if(path.includes('\\')||path.includes('\0')||path.split('/').some(s=>s==='..'))return json({message:'Ruta inválida.'},400);if(path==='/')path='/index.html';
  try{
   if(path==='/api/account/session'){
    if(request.method!=='POST')return json({message:'Método no permitido.'},405);
    if(request.headers.get('Origin')!==url.origin)return json({message:'Solicitud no permitida.'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({message:'Solicitud inválida.'},415);
    if(Number(request.headers.get('Content-Length')||0)>10000)return json({message:'Solicitud demasiado grande.'},413);
    const body=await request.text();if(body.length>10000)return json({message:'Solicitud demasiado grande.'},413);let data;try{data=JSON.parse(body);}catch{return json({message:'Solicitud inválida.'},400);}
    if(data.access_token===null)return json({ok:true},200,{'Set-Cookie':cookie(null,0)});
    const token=typeof data.access_token==='string'?data.access_token:null;const identity=await verify(token,true);
    if(!identity)return json({message:'Inicia sesión para continuar.'},401,{'Set-Cookie':cookie(null,0)});
    if(identity.blocked)return json({message:'Tu cuenta está suspendida. Comunícate con el administrador.'},403,{'Set-Cookie':cookie(null,0)});
    // The token's validity is verified by Supabase; expiry only controls cookie persistence.
    return json({ok:true},200,{'Set-Cookie':cookie(token,data.remember===false?null:3600)});
   }
   const asset=assets[path];if(!asset)return new Response('No encontrado',{status:404,headers});
   if(!['GET','HEAD'].includes(request.method))return json({message:'Método no permitido.'},405);
   if(!asset.public){const identity=await verify(tokenFrom(request));if(!identity||identity.blocked){if(asset.type.startsWith('text/html')){const target=path.slice(1)+url.search;return new Response(null,{status:303,headers:{...headers,Location:'/account.html?return='+encodeURIComponent(target),'Set-Cookie':cookie(null,0)}});}return json({message:identity?.blocked?'Cuenta suspendida.':'Inicia sesión para usar las herramientas.'},identity?.blocked?403:401);}}
   let body=asset.body;
   if(asset.type.startsWith('text/html')&&path!=='/account.html'){
    const catalog=await tools(),id=routeTool(url);
    if(id&&!catalog.some(t=>t.id===id&&t.enabled))return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Herramienta desactivada</title><link rel="stylesheet" href="account.css"><body class="account-body"><main class="account-main"><h1>Herramienta desactivada</h1><p>El administrador ha desactivado esta herramienta.</p><a class="account-primary" href="/index.html">Ver herramientas disponibles</a></main></body></html>',{status:403,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    body=pruneTools(body,catalog);
    if(path==='/editor.html'&&!catalog.some(t=>t.id==='recolor'&&t.enabled))body=body.replace('<body','<body data-recolor-disabled="true"');
   }
   return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':asset.type}});
  }catch{return json({message:'No pudimos verificar el acceso. Intenta de nuevo en unos momentos.'},503);}
 }};
}
