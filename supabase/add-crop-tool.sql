-- Alta de Recortar imagen: no cambia usuarios ni permisos.
insert into public.lz_tools(id,name,enabled) values('crop','Recortar imagen',true) on conflict(id) do nothing;
