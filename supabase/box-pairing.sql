-- Short-lived signaling only. Never stores machine commands or USB credentials.
begin;
create schema if not exists lz_box_private;
revoke all on schema lz_box_private from public;
create table lz_box_private.pairings (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 secret_hash text not null, offer text not null check(octet_length(offer)<=30000),
 answer text check(octet_length(answer)<=30000), claimant uuid,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '5 minutes',
 unique(owner_id)
);
alter table lz_box_private.pairings enable row level security;
revoke all on lz_box_private.pairings from public,anon,authenticated;
create index box_pairing_expiry on lz_box_private.pairings(expires_at);

-- Definer is confined to a non-exposed schema. Each action requires either
-- authenticated ownership or the QR's random 256-bit capability and claimant.
create function lz_box_private.exchange(p_action text,p_id uuid,p_secret text default null,p_sdp text default null,p_claim uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r lz_box_private.pairings%rowtype; u uuid:=auth.uid(); result jsonb;
begin
 if p_action in ('create','poll','remove') then
  if u is null or not exists(select 1 from public.lz_profiles where id=u and blocked=false) then
   raise exception 'Inicia sesion para emparejar.' using errcode='42501';
  end if;
 end if;
 if p_action='create' then
  if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' or p_sdp is null or octet_length(p_sdp)>30000 or length(p_sdp)<1 then raise exception 'Emparejamiento invalido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  if exists(select 1 from lz_box_private.pairings where owner_id=u and created_at>now()-interval '2 seconds') then raise exception 'Espera dos segundos antes de generar otro QR.'; end if;
  delete from lz_box_private.pairings where owner_id=u or expires_at<now();
  insert into lz_box_private.pairings(id,owner_id,secret_hash,offer) values(p_id,u,encode(sha256(convert_to(p_secret,'UTF8')),'hex'),p_sdp) returning * into r;
  return jsonb_build_object('session',r.id,'expires',floor(extract(epoch from r.expires_at)*1000));
 end if;
 select * into r from lz_box_private.pairings where id=p_id for update;
 if not found or r.expires_at<=now() then raise exception 'El QR expiro o fue revocado. Genera otro.'; end if;
 if p_action in ('poll','remove') then
  if r.owner_id<>u then raise exception 'Emparejamiento no permitido.' using errcode='42501'; end if;
  if p_action='remove' then delete from lz_box_private.pairings where id=p_id; return '{}'::jsonb; end if;
  result:=jsonb_build_object('answer',r.answer);
  if r.answer is not null then delete from lz_box_private.pairings where id=p_id; end if;
  return result;
 end if;
 if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' or encode(sha256(convert_to(p_secret,'UTF8')),'hex')<>r.secret_hash
    or p_claim is null or not exists(select 1 from public.lz_profiles where id=r.owner_id and blocked=false) then
  raise exception 'Emparejamiento no permitido.' using errcode='42501';
 end if;
 if p_action='offer' then
  if r.claimant is not null and r.claimant<>p_claim then raise exception 'Este QR ya fue escaneado. Genera otro para cambiar de celular.'; end if;
  update lz_box_private.pairings set claimant=p_claim where id=p_id;
  return jsonb_build_object('session',r.id,'expires',floor(extract(epoch from r.expires_at)*1000),'sdp',r.offer);
 elsif p_action='answer' then
  if r.claimant is distinct from p_claim or p_sdp is null or length(p_sdp)<1 or octet_length(p_sdp)>30000 then raise exception 'Respuesta de enlace invalida.'; end if;
  if r.answer is not null and r.answer<>p_sdp then raise exception 'Respuesta de enlace ya registrada.'; end if;
  update lz_box_private.pairings set answer=p_sdp where id=p_id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Accion de emparejamiento invalida.';
end $$;
revoke all on function lz_box_private.exchange(text,uuid,text,text,uuid) from public;
grant usage on schema lz_box_private to anon,authenticated;
grant execute on function lz_box_private.exchange(text,uuid,text,text,uuid) to anon,authenticated;
create function public.lz_box_pair_exchange(p_action text,p_id uuid,p_secret text default null,p_sdp text default null,p_claim uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select lz_box_private.exchange(p_action,p_id,p_secret,p_sdp,p_claim);
$$;
revoke all on function public.lz_box_pair_exchange(text,uuid,text,text,uuid) from public;
grant execute on function public.lz_box_pair_exchange(text,uuid,text,text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
