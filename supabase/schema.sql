-- LZ Studio Tools: ejecutar una sola vez en Supabase > SQL Editor.
-- Crea únicamente objetos lz_ nuevos. No borra tablas ni usuarios existentes.
-- No crea administradores automáticamente ni activa cobros.
begin;
create table public.lz_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, display_name text not null default '',
 blocked boolean not null default false, created_at timestamptz not null default now()
);
create table public.lz_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.lz_tools (id text primary key, name text not null);
insert into public.lz_tools values
 ('editor','Editor DTF'),('recolor','Recolorizador DTF'),('opacity','Semitransparencias'),
 ('thickness','Auditor de grosor'),('texture','Texturas'),('text','Textos'),
 ('mockups','Mockups'),('vectorize','Vectorizar'),('analyzer','Revisar DTF'),
 ('sheet','Pliego DTF'),('color','Mejorar colores'),('upscale','Mejorar imágenes');
create table public.lz_access (
 user_id uuid not null references public.lz_profiles(id) on delete cascade,
 tool_id text not null references public.lz_tools(id),
 expires_at timestamptz, granted_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(), primary key(user_id,tool_id)
);
create table public.lz_access_log (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 target_id uuid references auth.users(id) on delete set null,
 action text not null, tool_id text, expires_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.lz_profiles enable row level security;
alter table public.lz_admins enable row level security;
alter table public.lz_tools enable row level security;
alter table public.lz_access enable row level security;
alter table public.lz_access_log enable row level security;
create function public.lz_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lz_admins a join public.lz_profiles p on p.id=a.user_id where a.user_id=auth.uid() and not p.blocked);
$$;
create policy profiles_read on public.lz_profiles for select to authenticated using (id=auth.uid() or public.lz_is_admin());
create policy tools_read on public.lz_tools for select to authenticated using (true);
create policy access_read on public.lz_access for select to authenticated using (user_id=auth.uid() or public.lz_is_admin());
create policy log_read on public.lz_access_log for select to authenticated using (public.lz_is_admin());
-- No políticas de escritura: sólo RPC verificadas, nunca desde campos editables del navegador.
revoke all on public.lz_profiles,public.lz_admins,public.lz_tools,public.lz_access,public.lz_access_log from anon,authenticated;
grant select on public.lz_profiles,public.lz_tools,public.lz_access,public.lz_access_log to authenticated;
create function public.lz_ensure_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
 insert into public.lz_profiles(id,email,display_name)
 select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'full_name',''),120)
 from auth.users where id=auth.uid()
 on conflict(id) do update set email=excluded.email,display_name=excluded.display_name;
end $$;
create function public.lz_set_access(target uuid, tool text, days integer, remove_access boolean default false)
 returns void language plpgsql security definer set search_path='' as $$
declare expiry timestamptz;
begin
 if not public.lz_is_admin() then raise exception 'Se requiere administrador.'; end if;
 if days is not null and (days<1 or days>365) then raise exception 'La duración debe ser de 1 a 365 días.'; end if;
 if not exists(select 1 from public.lz_profiles where id=target) then raise exception 'Usuario inexistente.'; end if;
 if not exists(select 1 from public.lz_tools where id=tool) then raise exception 'Herramienta inexistente.'; end if;
 expiry:=case when days is null then null else now()+make_interval(days=>days) end;
 if remove_access then delete from public.lz_access where user_id=target and tool_id=tool;
 else insert into public.lz_access(user_id,tool_id,expires_at,granted_by) values(target,tool,expiry,auth.uid())
 on conflict(user_id,tool_id) do update set expires_at=excluded.expires_at,granted_by=excluded.granted_by,updated_at=now(); end if;
 insert into public.lz_access_log(actor_id,target_id,action,tool_id,expires_at)
 values(auth.uid(),target,case when remove_access then 'revoke' else 'grant' end,tool,expiry);
end $$;
create function public.lz_grant_bundle(target uuid, days integer)
 returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if not public.lz_is_admin() then raise exception 'Se requiere administrador.'; end if;
 for item in select id from public.lz_tools loop perform public.lz_set_access(target,item.id,days,false); end loop;
end $$;
create function public.lz_set_blocked(target uuid, value boolean)
 returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.lz_is_admin() then raise exception 'Se requiere administrador.'; end if;
 if target=auth.uid() then raise exception 'No puedes bloquear tu propia cuenta.'; end if;
 update public.lz_profiles set blocked=value where id=target;
 if not found then raise exception 'Usuario inexistente.'; end if;
 insert into public.lz_access_log(actor_id,target_id,action) values(auth.uid(),target,case when value then 'block' else 'unblock' end);
end $$;
create function public.lz_can_access(tool text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lz_tools where id=tool) and exists(select 1 from public.lz_profiles p where p.id=auth.uid() and not p.blocked and
 (public.lz_is_admin() or exists(select 1 from public.lz_access a where a.user_id=p.id and a.tool_id=tool and (a.expires_at is null or a.expires_at>now()))));
$$;
revoke all on function public.lz_is_admin(),public.lz_ensure_profile(),public.lz_set_access(uuid,text,integer,boolean),public.lz_grant_bundle(uuid,integer),public.lz_set_blocked(uuid,boolean),public.lz_can_access(text) from public,anon;
grant execute on function public.lz_is_admin(),public.lz_ensure_profile(),public.lz_set_access(uuid,text,integer,boolean),public.lz_grant_bundle(uuid,integer),public.lz_set_blocked(uuid,boolean),public.lz_can_access(text) to authenticated;
commit;
