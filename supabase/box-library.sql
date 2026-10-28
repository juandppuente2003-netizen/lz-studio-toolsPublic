-- LZ Box Studio · biblioteca de trabajos sincronizada con la cuenta (v62).
-- Guarda el archivo original (SVG o imagen), operaciones, parámetros, colocación,
-- dimensiones, miniatura y versión de formato. Nunca guarda coordenadas físicas
-- calibradas ni códigos del conector USB. Solo el dueño puede leer o escribir.
begin;
create schema if not exists lz_box_private;
revoke all on schema lz_box_private from public;
create table if not exists lz_box_private.library (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('file','prepared','template')),
 name text not null check (char_length(name) between 1 and 80),
 format int not null check (format between 1 and 100),
 meta jsonb not null check (octet_length(meta::text) <= 200000),
 payload jsonb not null check (octet_length(payload::text) <= 3500000),
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table lz_box_private.library enable row level security;
revoke all on lz_box_private.library from public, anon, authenticated;
create index if not exists box_library_owner on lz_box_private.library(owner_id, updated_at desc);

create or replace function lz_box_private.library_op(p_action text, p_id uuid default null, p_item jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r lz_box_private.library%rowtype; total bigint; n int; result jsonb;
begin
 if u is null or not exists (select 1 from public.lz_profiles where id = u and blocked = false) then
  raise exception 'Inicia sesion para usar la biblioteca de tu cuenta.' using errcode = '42501';
 end if;
 -- La papelera conserva elementos 30 dias.
 delete from lz_box_private.library where owner_id = u and deleted_at < now() - interval '30 days';
 if p_action = 'list' then
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name, 'format', format, 'meta', meta,
   'deletedAt', deleted_at, 'updatedAt', updated_at, 'createdAt', created_at) order by updated_at desc), '[]'::jsonb)
   into result from (select * from lz_box_private.library where owner_id = u order by updated_at desc limit 400) q;
  return jsonb_build_object('items', result);
 end if;
 if p_id is null then raise exception 'Elemento invalido.'; end if;
 select * into r from lz_box_private.library where id = p_id for update;
 if found and r.owner_id <> u then raise exception 'Elemento no permitido.' using errcode = '42501'; end if;
 if p_action = 'get' then
  if not found then raise exception 'El elemento ya no existe en tu cuenta.'; end if;
  return jsonb_build_object('id', r.id, 'kind', r.kind, 'name', r.name, 'format', r.format, 'meta', r.meta, 'payload', r.payload,
   'deletedAt', r.deleted_at, 'updatedAt', r.updated_at, 'createdAt', r.created_at);
 elsif p_action = 'put' then
  if p_item is null or jsonb_typeof(p_item) <> 'object' then raise exception 'Elemento invalido.'; end if;
  -- Bloqueo optimista: no se pisa un cambio hecho desde otro dispositivo.
  if found and p_item ? 'baseUpdatedAt' and p_item->>'baseUpdatedAt' is not null
     and r.updated_at > (p_item->>'baseUpdatedAt')::timestamptz + interval '1 millisecond' then
   raise exception 'Este trabajo cambio en otro dispositivo. Abre la version mas reciente antes de guardar.';
  end if;
  if not found then
   select count(*), coalesce(sum(octet_length(payload::text)), 0) into n, total from lz_box_private.library where owner_id = u;
   if n >= 300 then raise exception 'La biblioteca de tu cuenta admite 300 elementos. Elimina alguno de la papelera.'; end if;
   if total > 200000000 then raise exception 'La biblioteca de tu cuenta llego a 200 MB.'; end if;
  end if;
  insert into lz_box_private.library as l (id, owner_id, kind, name, format, meta, payload, deleted_at, updated_at)
  values (p_id, u, p_item->>'kind', left(p_item->>'name', 80), (p_item->>'format')::int, coalesce(p_item->'meta', '{}'::jsonb), p_item->'payload', null, now())
  on conflict (id) do update set kind = excluded.kind, name = excluded.name, format = excluded.format, meta = excluded.meta,
   payload = excluded.payload, deleted_at = null, updated_at = now()
  returning * into r;
  return jsonb_build_object('id', r.id, 'updatedAt', r.updated_at);
 elsif p_action in ('rename', 'delete', 'restore', 'purge') then
  if not found then raise exception 'El elemento ya no existe en tu cuenta.'; end if;
  if p_action = 'rename' then
   if p_item->>'name' is null or char_length(trim(p_item->>'name')) not between 1 and 80 then raise exception 'Nombre invalido.'; end if;
   update lz_box_private.library set name = trim(p_item->>'name'), meta = jsonb_set(meta, '{name}', to_jsonb(trim(p_item->>'name'))), updated_at = now() where id = p_id returning * into r;
  elsif p_action = 'delete' then update lz_box_private.library set deleted_at = now(), updated_at = now() where id = p_id returning * into r;
  elsif p_action = 'restore' then update lz_box_private.library set deleted_at = null, updated_at = now() where id = p_id returning * into r;
  else
   if r.deleted_at is null then raise exception 'Primero envia el elemento a la papelera.'; end if;
   delete from lz_box_private.library where id = p_id; return '{}'::jsonb;
  end if;
  return jsonb_build_object('id', r.id, 'updatedAt', r.updated_at, 'deletedAt', r.deleted_at);
 end if;
 raise exception 'Accion de biblioteca invalida.';
end $$;
revoke all on function lz_box_private.library_op(text, uuid, jsonb) from public;
grant usage on schema lz_box_private to authenticated;
grant execute on function lz_box_private.library_op(text, uuid, jsonb) to authenticated;
create or replace function public.lz_box_library(p_action text, p_id uuid default null, p_item jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
 select lz_box_private.library_op(p_action, p_id, p_item);
$$;
revoke all on function public.lz_box_library(text, uuid, jsonb) from public, anon;
grant execute on function public.lz_box_library(text, uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
