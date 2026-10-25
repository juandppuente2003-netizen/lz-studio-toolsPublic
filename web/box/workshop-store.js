export const WORKSHOP_KEY='lzbox-workshop-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
export function readWorkshop(storage){
 try{const list=JSON.parse(storage.getItem(WORKSHOP_KEY)||'[]');return Array.isArray(list)?list.filter(p=>p&&['prepared','template'].includes(p.kind)&&typeof p.id==='string'&&p.state&&typeof p.state==='object').slice(0,200):[];}catch{return [];}
}
export function writeWorkshop(storage,list){
 if(!Array.isArray(list)||list.length>200)throw Error('La biblioteca admite hasta 200 preparaciones. Exporta un respaldo antes de liberar espacio.');
 // setItem is atomic: a quota failure leaves the previous library intact.
 storage.setItem(WORKSHOP_KEY,JSON.stringify(list));
 return list;
}
export function makeWorkshopItem({state,settings={},kind='prepared',name,thumb=null,references=[]}){
 if(!['prepared','template'].includes(kind)||!state||typeof state!=='object'||!String(name||'').trim())throw Error('Escribe un nombre para la preparación.');
 const safeSettings={};for(const key of ['sheet','speed','passes','bedWidth','bedHeight','offsetX','offsetY'])if(Number.isFinite(Number(settings[key])))safeSettings[key]=Number(settings[key]);
 safeSettings.origin=settings.origin==='current'?'current':'home';
 const safeReferences=references.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).slice(0,8).map(p=>[...p]);
 return {id:crypto.randomUUID(),kind,name:String(name).trim().slice(0,80),updated:new Date().toISOString(),state:clone(state),settings:safeSettings,references:safeReferences,thumb:typeof thumb==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(thumb)?thumb:null,requiresReference:kind==='template'||settings.origin!=='home'||safeReferences.length>0};
}
export function filterWorkshop(items,{query='',kind='all',model='all'}={}){
 const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),q=norm(query);
 return items.filter(p=>(kind==='all'||p.kind===kind)&&(model==='all'||p.state?.model===model)&&norm(`${p.name||p.state?.name||''} ${p.state?.model||''} ${p.state?.thickness||''} ${p.state?.texture||''}`).includes(q));
}
