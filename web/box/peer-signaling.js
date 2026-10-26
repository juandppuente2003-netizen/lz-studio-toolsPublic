export async function pairingRequest(action,data,signal){
 const response=await fetch('/api/box/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),credentials:'same-origin',cache:'no-store',signal:signal||AbortSignal.timeout(10000)});
 const value=await response.json();if(!response.ok)throw Error(value.message||'No se pudo completar el enlace.');return value;
}
export const pairingSecret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export function parsePairingLink(code){
 if(typeof code!=='string'||!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/i.test(code))throw Error('El enlace QR no es valido. Genera otro.');
 const [session,secret]=code.split('.');return {session,secret};
}
