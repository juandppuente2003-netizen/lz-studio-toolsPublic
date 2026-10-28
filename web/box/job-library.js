/* LZ Box Studio · biblioteca de trabajos de archivo (v62).
   Dos lugares, siempre identificados:
   - «Esta computadora»: IndexedDB del navegador (sin límite práctico de 5 MB).
   - «Tu cuenta»: /api/box/library (Supabase). Solo se marca «sincronizado»
     cuando el servidor confirma la escritura.
   Un trabajo guarda archivo original, operaciones, parámetros, colocación,
   dimensiones, miniatura y versión de formato. Nunca guarda posiciones físicas:
   al abrirlo hay que volver a verificar cama, colocación y origen. */
export const JOB_FORMAT = 2;
const DB = 'lzbox-jobs', STORE = 'items';
let dbPromise = null;
function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(Error('Este navegador no permite guardar trabajos de archivo.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, {keyPath: 'id'});
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error('No se pudo abrir el almacenamiento local.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), store = t.objectStore(STORE);
    let result; const r = fn(store); if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result); t.onerror = () => reject(t.error || Error('No se pudo guardar en esta computadora.')); t.onabort = () => reject(t.error || Error('Espacio insuficiente en esta computadora.'));
  });
}
export const localAll = () => tx('readonly', (s) => s.getAll()).then((list) => (list || []).filter(validItem));
export const localGet = (id) => tx('readonly', (s) => s.get(id));
export const localPut = (item) => tx('readwrite', (s) => s.put(item));
export const localDelete = (id) => tx('readwrite', (s) => s.delete(id));

export function validItem(item) {
  return !!item && typeof item.id === 'string' && item.kind === 'file' && Number.isInteger(item.format) && item.format <= JOB_FORMAT && typeof item.name === 'string' && item.source && typeof item.source.data === 'string';
}

/** Elemento de biblioteca a partir del estado del estudio (sin coordenadas físicas). */
export function makeJobItem({id, name, source, unitOverride, plan, placement, bed, dims, opsSummary, thumb, created}) {
  if (!String(name || '').trim()) throw Error('Escribe un nombre para el trabajo.');
  if (!source?.data) throw Error('No hay archivo importado para guardar.');
  const now = new Date().toISOString();
  return {id: id || crypto.randomUUID(), kind: 'file', format: JOB_FORMAT, name: String(name).trim().slice(0, 80), created: created || now, updated: now, deletedAt: null,
    source: {type: source.type, name: String(source.name || '').slice(0, 120), mime: source.mime, data: source.data, size: source.data.length},
    unitOverride: unitOverride || 'auto', plan: JSON.parse(JSON.stringify(plan)), placement: {x: +placement.x || 0, y: +placement.y || 0, scale: +placement.scale || 1, rotation: +placement.rotation || 0},
    bedAtSave: bed ? {width: bed.width, height: bed.height} : null, dims: dims ? {width: +dims.width.toFixed(2), height: +dims.height.toFixed(2)} : null,
    opsSummary: opsSummary || [], thumb: typeof thumb === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(thumb) && thumb.length < 150000 ? thumb : null,
    requiresReference: true, cloud: null};
}
const metaOf = (item) => ({name: item.name, dims: item.dims, opsSummary: item.opsSummary, thumb: item.thumb, source: {type: item.source.type, name: item.source.name, size: item.source.size}, created: item.created});
const payloadOf = (item) => ({source: item.source, unitOverride: item.unitOverride, plan: item.plan, placement: item.placement, bedAtSave: item.bedAtSave});

/* ------------------------------------------------------------ cuenta */
async function cloud(action, body = {}) {
  let response;
  try { response = await fetch('/api/box/library', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({action, ...body}), signal: AbortSignal.timeout(30000)}); }
  catch { const e = Error('Sin conexión con la biblioteca de la cuenta.'); e.offline = true; throw e; }
  let value = {}; try { value = await response.json(); } catch {}
  if (!response.ok) { const e = Error(value.message || 'La biblioteca de la cuenta no respondió.'); e.status = response.status; e.code = value.code; throw e; }
  return value;
}
export const cloudList = () => cloud('list').then((v) => Array.isArray(v.items) ? v.items : []);
export async function cloudGet(id) {
  const v = await cloud('get', {id});
  return {id: v.id, kind: 'file', format: v.format, name: v.name, created: v.meta?.created || v.createdAt, updated: v.updatedAt, deletedAt: v.deletedAt, ...v.payload, dims: v.meta?.dims || null, opsSummary: v.meta?.opsSummary || [], thumb: v.meta?.thumb || null, requiresReference: true, cloud: {updatedAt: v.updatedAt}};
}
export const cloudPut = (item) => cloud('put', {id: item.id, item: {kind: 'file', name: item.name, format: item.format, meta: metaOf(item), payload: payloadOf(item), baseUpdatedAt: item.cloud?.updatedAt || null}});
export const cloudAction = (action, id, extra = {}) => cloud(action, {id, ...extra});

/**
 * Biblioteca combinada. `where`: 'local' | 'cloud' | 'both'. `synced` solo es
 * verdadero si la copia local coincide con la confirmada por el servidor.
 */
export class JobLibrary {
  constructor() { this.items = []; this.cloudState = 'unknown'; this.cloudMessage = ''; this.listeners = new Set(); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) try { fn(); } catch {} }
  async refresh() {
    let local = [];
    try { local = await localAll(); } catch (e) { this.localError = e.message; }
    let remote = null;
    try { remote = await cloudList(); this.cloudState = 'on'; this.cloudMessage = 'Biblioteca de tu cuenta activa.'; }
    catch (e) { this.cloudState = e.status === 401 ? 'signed-out' : e.code === 'not-enabled' ? 'not-enabled' : 'offline'; this.cloudMessage = e.message; }
    const map = new Map();
    for (const item of local) map.set(item.id, {...item, where: 'local', synced: false});
    for (const r of remote || []) {
      if (r.kind !== 'file') continue;
      const mine = map.get(r.id);
      if (mine) {
        const synced = mine.cloud?.updatedAt && new Date(mine.cloud.updatedAt).getTime() === new Date(r.updatedAt).getTime();
        const newer = new Date(r.updatedAt) > new Date(mine.cloud?.updatedAt || 0);
        map.set(r.id, {...mine, where: 'both', synced: !!synced, cloudNewer: newer && !synced, deletedAt: r.deletedAt || mine.deletedAt, remoteUpdated: r.updatedAt});
      } else map.set(r.id, {id: r.id, kind: 'file', format: r.format, name: r.name, updated: r.updatedAt, deletedAt: r.deletedAt, dims: r.meta?.dims, opsSummary: r.meta?.opsSummary || [], thumb: r.meta?.thumb, source: {type: r.meta?.source?.type, name: r.meta?.source?.name, size: r.meta?.source?.size, data: ''}, where: 'cloud', synced: true, remoteOnly: true, remoteUpdated: r.updatedAt});
    }
    this.items = [...map.values()].sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    this.emit();
    return this.items;
  }
  /** Guarda primero aquí y después en la cuenta; informa exactamente dónde quedó. */
  async save(item, {toCloud = true} = {}) {
    await localPut(item);
    let cloudResult = null;
    if (toCloud && this.cloudState !== 'signed-out' && this.cloudState !== 'not-enabled') {
      try { const r = await cloudPut(item); item.cloud = {updatedAt: r.updatedAt}; await localPut(item); cloudResult = 'synced'; }
      catch (e) { cloudResult = e.message; if (e.status === 401) this.cloudState = 'signed-out'; if (e.code === 'not-enabled') this.cloudState = 'not-enabled'; }
    }
    await this.refresh();
    return {item, cloud: cloudResult};
  }
  async open(id) {
    const entry = this.items.find((i) => i.id === id);
    if (entry && !entry.remoteOnly && !entry.cloudNewer) { const local = await localGet(id); if (local) return local; }
    const remote = await cloudGet(id);
    if (!validItem({...remote, source: remote.source})) throw Error('El trabajo guardado en la cuenta está incompleto.');
    await localPut(remote).catch(() => {});
    return remote;
  }
  async rename(id, name) {
    name = String(name || '').trim().slice(0, 80); if (!name) throw Error('Escribe un nombre.');
    const entry = this.items.find((i) => i.id === id);
    const local = await localGet(id).catch(() => null);
    if (local) { local.name = name; local.updated = new Date().toISOString(); await localPut(local); }
    if (entry && entry.where !== 'local') { const r = await cloudAction('rename', id, {name}); if (local) { local.cloud = {updatedAt: r.updatedAt}; await localPut(local); } }
    return this.refresh();
  }
  async duplicate(id) {
    const source = await this.open(id);
    const copy = {...JSON.parse(JSON.stringify(source)), id: crypto.randomUUID(), name: (source.name + ' (copia)').slice(0, 80), created: new Date().toISOString(), updated: new Date().toISOString(), deletedAt: null, cloud: null};
    return this.save(copy, {toCloud: this.items.find((i) => i.id === id)?.where !== 'local'});
  }
  /** Papelera: se puede restaurar durante 30 días. */
  async remove(id) {
    const entry = this.items.find((i) => i.id === id), local = await localGet(id).catch(() => null), now = new Date().toISOString();
    if (local) { local.deletedAt = now; await localPut(local); }
    if (entry && entry.where !== 'local') { const r = await cloudAction('delete', id); if (local) { local.cloud = {updatedAt: r.updatedAt}; await localPut(local); } }
    return this.refresh();
  }
  async restore(id) {
    const entry = this.items.find((i) => i.id === id), local = await localGet(id).catch(() => null);
    if (local) { local.deletedAt = null; await localPut(local); }
    if (entry && entry.where !== 'local') { const r = await cloudAction('restore', id); if (local) { local.cloud = {updatedAt: r.updatedAt}; await localPut(local); } }
    return this.refresh();
  }
  async purge(id) {
    const entry = this.items.find((i) => i.id === id);
    if (entry && entry.where !== 'local') await cloudAction('purge', id);
    await localDelete(id).catch(() => {});
    return this.refresh();
  }
  /** Sube a la cuenta un trabajo que solo estaba en esta computadora. */
  async upload(id) { const local = await localGet(id); if (!local) throw Error('No está en esta computadora.'); local.cloud = null; const r = await this.save(local, {toCloud: true}); if (r.cloud !== 'synced') throw Error(r.cloud || 'La cuenta no está disponible.'); return r; }
}
