import {createClient} from '@supabase/supabase-js';
import {AUTH_CONFIG} from '../web/auth-config.js';
export const configured = Boolean(AUTH_CONFIG.supabaseUrl && AUTH_CONFIG.publishableKey);
const preferenceKey='lz-remember-session';
export function rememberSession(){return localStorage.getItem(preferenceKey)!=='false';}
export const sessionStorageAdapter={
 getItem:key=>rememberSession()?localStorage.getItem(key):sessionStorage.getItem(key),
 setItem:(key,value)=>{const target=rememberSession()?localStorage:sessionStorage;const other=rememberSession()?sessionStorage:localStorage;target.setItem(key,value);other.removeItem(key);},
 removeItem:key=>{localStorage.removeItem(key);sessionStorage.removeItem(key);}
};
export function setRememberSession(value){
 const previous=rememberSession();if(previous===value)return;
 const from=previous?localStorage:sessionStorage,to=value?localStorage:sessionStorage;
 const keys=[];for(let i=0;i<from.length;i++){const key=from.key(i);if(/^sb-.*-auth-token/.test(key))keys.push(key);}
 for(const key of keys){to.setItem(key,from.getItem(key));from.removeItem(key);}
 localStorage.setItem(preferenceKey,String(value));
}
export const client = configured ? createClient(AUTH_CONFIG.supabaseUrl,AUTH_CONFIG.publishableKey,{auth:{storage:sessionStorageAdapter,flowType:'pkce',autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}) : null;
export const routes={crop:'crop.html',editor:'editor.html',recolor:'editor.html?tool=recolor',opacity:'opacity.html',thickness:'thickness.html',texture:'textures.html',text:'text-creator.html',mockups:'mockups.html',vectorize:'vectorize.html',analyzer:'analyzer.html',sheet:'gang-sheet.html',color:'color-enhance.html',upscale:'upscale.html',extract:'extract.html'};
export async function rpc(name,args={}) {const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
export async function rows(table) {let result=[];for(let offset=0;;offset+=1000){const {data,error}=await client.from(table).select('*').order('id').range(offset,offset+999);if(error)throw error;result.push(...data);if(data.length<1000)return result;}}
export function safeReturn(value){return Object.values(routes).includes(value)?value:'index.html';}
export async function identity(){if(!client)return null;const {data,error}=await client.auth.getUser();if(error||!data.user)return null;await rpc('lz_ensure_profile');const [profiles,isAdmin,tools]=await Promise.all([rows('lz_profiles'),rpc('lz_is_admin'),rows('lz_tools')]);return {user:data.user,profile:profiles.find(p=>p.id===data.user.id),profiles,isAdmin,tools};}
export function allowed(state,id){return Boolean(state&&state.profile&&!state.profile.blocked&&routes[id]&&state.tools.some(t=>t.id===id&&t.enabled!==false));}
export async function syncServerSession(session){const response=await fetch('/api/account/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:session?.access_token||null,remember:rememberSession()}),credentials:'same-origin'});if(!response.ok){const data=await response.json();throw new Error(data.message||'No pudimos verificar tu sesión.');}}

export async function setToolEnabled(id,enabled){const {data,error}=await client.from('lz_tools').update({enabled}).eq('id',id).select('id,enabled');if(error)throw error;if(!data?.length)throw new Error('No tienes permiso para cambiar esta herramienta.');}
