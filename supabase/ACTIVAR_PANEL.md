# Panel LZ Studio Tools

Se usa el proyecto Supabase que eligió el propietario, con su URL y clave publishable pública. No se utiliza service_role ni contraseña de base de datos en el sitio.

## Estado inicial

- Las tablas y reglas de `schema.sql` ya se ejecutaron en Supabase. No volver a ejecutarlo.
- Correo con enlace de acceso. Google está desactivado hasta configurar el proveedor.
- `enforceToolAccess` está desactivado: las herramientas del inicio siguen públicas durante la prueba.
- No hay pagos ni acceso Pro automático.

## Primera cuenta administradora

1. Abrir `account.html`, escribir el mismo correo usado como miembro del proyecto Supabase y solicitar el enlace.
2. Abrir el enlace en el mismo navegador y comprobar que aparece Mi cuenta.
3. El propietario identifica el correo exacto de esa cuenta. Sólo desde SQL Editor, se agrega su UUID a `lz_admins` con una consulta específica para ese correo. No dar este rol automáticamente al primer visitante.
4. Actualizar accesos. El panel administrador aparece sólo si el servidor confirma el rol.

Los usuarios normales no pueden escribir directamente en perfiles o permisos. Las RPC requieren rol administrador y registran las operaciones en `lz_access_log`. La expiración se comprueba con `now()` del servidor.

## Correo y Google

El correo predeterminado de Supabase sirve para pruebas con miembros de la organización. Para permitir altas de otras personas se necesita configurar SMTP propio o un proveedor como Google. Antes de abrir el registro al público: configurar protección antiabuso y verificar los límites de correo y el manejo de datos personales.

## Desarrollo y seguridad comercial

`npm run build:accounts` recompila el cliente oficial y ambas entradas. Se entrega `dist` completo, incluyendo `account/`.

Una interfaz de acceso no protege los algoritmos, modelos ni recursos que ya se entregan al navegador. Antes de cobrar, trasladar la parte comercial sensible al servidor y validar el permiso en cada operación. Activar una bandera o esconder botones no sustituye esa protección.
