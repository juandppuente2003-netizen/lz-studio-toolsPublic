const STORE='files';

function asPromise(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('IndexedDB no respondió.'));
  });
}

function keyOf(input){
  const value=typeof input==='string'?input:input?.url||String(input);
  return new URL(value,location.href).href;
}

export function createIndexedDbCache(databaseName){
  let connection;
  const open=()=>{
    if(!('indexedDB' in globalThis))return Promise.reject(new Error('IndexedDB no está disponible.'));
    if(connection)return connection;
    connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open(databaseName,1);
      request.onupgradeneeded=()=>{
        const database=request.result;
        if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:'key'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('No se pudo abrir la caché local.'));
    });
    return connection;
  };
  return {
    async match(input){
      const database=await open(),key=keyOf(input),transaction=database.transaction(STORE,'readonly');
      const entry=await asPromise(transaction.objectStore(STORE).get(key));
      if(!entry)return undefined;
      return new Response(entry.body.slice(0),{status:entry.status,statusText:entry.statusText,headers:entry.headers});
    },
    async put(input,response,progress){
      const copy=response.clone(),body=await copy.arrayBuffer(),entry={key:keyOf(input),body,status:copy.status||200,statusText:copy.statusText||'OK',headers:[...copy.headers.entries()],updatedAt:Date.now()};
      const database=await open(),transaction=database.transaction(STORE,'readwrite');
      await asPromise(transaction.objectStore(STORE).put(entry));
      progress?.({loaded:body.byteLength,total:body.byteLength,progress:100});
      navigator.storage?.persist?.().catch(()=>{});
    }
  };
}
