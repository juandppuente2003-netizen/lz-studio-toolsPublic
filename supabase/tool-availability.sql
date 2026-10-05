-- Actualización de un proyecto existente. Ejecutada el 2026-10-05.
begin;
alter table public.lz_tools add column enabled boolean not null default true;
insert into public.lz_tools(id,name) values ('extract','Extraer diseño') on conflict(id) do nothing;
create policy tools_public_read on public.lz_tools for select to anon using (true);
grant select on public.lz_tools to anon;
create policy tools_admin_update on public.lz_tools for update to authenticated
 using ((select public.lz_is_admin())) with check ((select public.lz_is_admin()));
grant update(enabled) on public.lz_tools to authenticated;
commit;
