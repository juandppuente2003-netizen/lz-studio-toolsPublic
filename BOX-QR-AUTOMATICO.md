# QR automático · preparado para revisión

El nuevo QR contiene un identificador y una autorización aleatoria de 256 bits en
el fragmento de URL. El celular obtiene la oferta y devuelve su respuesta por HTTPS
automáticamente. La computadora termina el enlace WebRTC y permite ceder movimientos
con un botón. No se copia ni pega ninguna respuesta en este flujo.

La conexión USB, el perfil y las órdenes del láser no cambian. Supabase conserva
únicamente oferta/respuesta de conexión, hash de la autorización y propietario;
no recibe el código USB ni las órdenes de movimiento. El QR vale cinco minutos,
admite un único celular y se revoca al generar otro o cerrar el enlace. El intercambio
se elimina al consumir la respuesta, al revocarlo o al limpiar vencidos en una nueva
creación. La expiración de acceso no depende de esa limpieza.

La tabla está en un esquema privado con RLS y sin acceso directo de anon/authenticated.
La función pública es SECURITY INVOKER. La implementación SECURITY DEFINER está en
el esquema privado; requiere auth.uid y cuenta habilitada para crear/consultar/revocar,
o el secreto del QR y su reclamante para ofrecer/responder. Nunca permite control
de la máquina: la autorización de movimientos sigue en el navegador del PC.

## Estado de activación

La revisión automática rechazó ejecutar `supabase/box-pairing.sql` en el proyecto
activo porque crea funciones y permisos de emparejamiento para anon/authenticated.
No se aplicó el cambio ni se activó este flujo en el sitio de uso actual.
Se requiere autorización explícita del propietario para activar ese SQL. Después
corresponde probarlo en Supabase y revisar sus asesores de seguridad antes de integrar.

Las pruebas de PostgreSQL se ejecutan en una base aislada (PGlite), sin datos ni
conexión al proyecto del usuario. Las pruebas DOM usan los controladores reales de
escritorio/celular con WebRTC simulado: intercambio automático, campos de respuesta
ocultos, autorización separada, Stop y ausencia de arranque automático.

Comandos: `node --test automatic-pairing-tests.mjs pairing-api-tests.mjs mobile-control-tests.mjs`;
`PGLITE_MODULE=/ruta/a/@electric-sql/pglite/dist/index.js node pairing-db-tests.mjs`;
`npm run build:vercel`; `npm test`.

Queda pendiente la prueba de enlace real PC–celular en el Wi-Fi del taller.
La protección existente de Vercel puede pedir iniciar sesión también en el teléfono;
este cambio no la deshabilita.
