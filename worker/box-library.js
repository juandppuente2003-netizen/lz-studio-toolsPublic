import {AUTH_CONFIG} from '../web/auth-config.js';
// Biblioteca de trabajos de la cuenta. Solo el dueño (sesión verificada) accede;
// la base de datos vuelve a comprobar la identidad con auth.uid().
export const LIBRARY_LIMIT = 3_800_000;
export async function boxLibrary(request, {fetchUpstream, verify, token}) {
  const reply = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'}});
  if (request.method !== 'POST') return reply({message: 'Metodo no permitido.'}, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply({message: 'Solicitud no permitida.'}, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({message: 'Solicitud invalida.'}, 415);
  if (Number(request.headers.get('Content-Length') || 0) > LIBRARY_LIMIT) return reply({message: 'El trabajo es demasiado grande para la biblioteca de la cuenta (máx. 3.5 MB). Se conserva en esta computadora.'}, 413);
  const raw = await request.text();
  if (raw.length > LIBRARY_LIMIT) return reply({message: 'El trabajo es demasiado grande para la biblioteca de la cuenta (máx. 3.5 MB). Se conserva en esta computadora.'}, 413);
  let data; try { data = JSON.parse(raw); } catch { return reply({message: 'Solicitud invalida.'}, 400); }
  const actions = ['list', 'get', 'put', 'rename', 'delete', 'restore', 'purge'];
  if (!data || !actions.includes(data.action)) return reply({message: 'Accion invalida.'}, 400);
  if (data.action !== 'list' && (typeof data.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.id))) return reply({message: 'Elemento invalido.'}, 400);
  if (data.action === 'put' && (!data.item || typeof data.item !== 'object' || !['file', 'prepared', 'template'].includes(data.item.kind) || typeof data.item.name !== 'string' || !Number.isInteger(data.item.format))) return reply({message: 'Elemento invalido.'}, 400);
  const identity = await verify(token);
  if (!identity || identity.blocked) return reply({message: 'Inicia sesión para sincronizar la biblioteca con tu cuenta.'}, 401);
  const item = data.action === 'put' ? data.item : data.action === 'rename' ? {name: String(data.name || '')} : null;
  const response = await fetchUpstream(AUTH_CONFIG.supabaseUrl + '/rest/v1/rpc/lz_box_library', {method: 'POST', headers: {apikey: AUTH_CONFIG.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify({p_action: data.action, p_id: data.id || null, p_item: item})});
  if (!response.ok) {
    let error; try { error = await response.json(); } catch {}
    if (response.status === 404 || error?.code === 'PGRST202') return reply({message: 'La biblioteca de la cuenta aún no está activada en el servidor. Los trabajos se guardan en esta computadora.', code: 'not-enabled'}, 503);
    return reply({message: error?.message?.match(/^(Inicia sesion|Elemento|El elemento|Este trabajo|La biblioteca|Nombre|Primero|Accion)/) ? error.message : 'No se pudo completar la operación en la biblioteca de la cuenta.'}, response.status === 401 || response.status === 403 ? 403 : 409);
  }
  return reply(await response.json());
}
