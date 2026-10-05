begin;
create table public.lz_tool_events(
 id bigint generated always as identity primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 tool_id text not null references public.lz_tools(id),
 kind text not null check(kind in ('open','export','error')),
 created_at timestamptz not null default now()
);
create index lz_tool_events_created_tool on public.lz_tool_events(created_at desc,tool_id);
alter table public.lz_tool_events enable row level security;
create policy events_insert_own on public.lz_tool_events for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.lz_profiles p where p.id=(select auth.uid()) and not p.blocked));
create policy events_admin_read on public.lz_tool_events for select to authenticated using((select public.lz_is_admin()));
revoke all on public.lz_tool_events from anon,authenticated;
grant insert(tool_id,kind),select on public.lz_tool_events to authenticated;
grant usage on sequence public.lz_tool_events_id_seq to authenticated;
create function public.lz_usage_stats() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare output jsonb;
begin
 if not public.lz_is_admin() then raise exception 'Se requiere administrador.';end if;
 select jsonb_build_object(
 'users',(select count(distinct user_id) from public.lz_tool_events where created_at>=now()-interval '30 days'),
 'tools',coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)) into output from (
 select tools.id,tools.name,count(e.id) filter(where e.kind='open') as opens,count(e.id) filter(where e.kind='export') as export_requests,count(e.id) filter(where e.kind='error') as errors,count(distinct e.user_id) as users
 from public.lz_tools tools left join public.lz_tool_events e on e.tool_id=tools.id and e.created_at>=now()-interval '30 days'
 group by tools.id,tools.name order by count(e.id) filter(where e.kind='open') desc,tools.name
 ) t;
 return output;
end $$;
revoke all on function public.lz_usage_stats() from public,anon;
grant execute on function public.lz_usage_stats() to authenticated;
commit;

-- Mantener el nombre alineado con el catálogo.
update public.lz_tools set name='Preparar para impresión' where id='analyzer';
