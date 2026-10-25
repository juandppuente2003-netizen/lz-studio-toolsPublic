# LZ Box Studio · revisión del taller 3.6

Base analizada: main f5c6d6220f3836fb40becdd11cd01025e7d86930.

## Diagnóstico

La geometría y el empaquetado estaban separados de los controles, pero la página
acumulaba catálogo, propiedades, instrucciones y producción en una columna larga.
El panel de máquina era un diálogo separado del plano. Se conservan los 17 modelos,
generadores, visor 3D, edición de piezas, kerf, cortes compartidos, archivos y
controlador M2. No se modifica el resto de herramientas DTF.

## Cambios

- Cuatro espacios de acceso directo; catálogo independiente; propiedades y
  herramientas existentes redistribuidas. Panel ajustable/contraíble y distribución
  persistente con restauración.
- Mesa 2D con material y cama distintos, reglas y edición numérica de posición.
  Se conservan selección, arrastre, giro, hojas, validaciones y exportaciones.
- Panel de máquina persistente y Stop disponible al salir del espacio Operar.
  Las transiciones no recrean conexión ni reenvían trabajos. El avance mostrado
  sigue describiendo datos, no desplazamiento físico comprobado.
- Biblioteca local de diseños, trabajos preparados y plantillas; miniaturas,
  búsqueda, filtros, duplicar/renombrar/eliminar con deshacer y respaldo.
- Registro rígido opcional validado de nuevo por el conector y ligado a la sesión.
  Las plantillas requieren nueva referencia física. No hay escala ni cámara.
- Cliente móvil específico y emparejamiento WebRTC autenticado por intercambio
  manual de oferta/respuesta y autorización del PC. No publica el USB ni sus
  credenciales. Una sola autoridad de movimientos y órdenes deduplicadas.

## Verificación y límites

Ejecutar `node --test workshop-tests.mjs k40-tests.mjs`, pruebas Python del conector,
`PYTHON=connectors/k40/.venv/bin/python node k40-http-integration.mjs`, build Vercel
y suite general `npm test`. La prueba DOM usa la aplicación real con Canvas; no
sustituye una revisión visual en navegador. Prueba de red opcional:
`WRTC_MODULE=/ruta/a/@roamhq/wrtc/lib/index.js node workshop-peer-integration.mjs`.

El entorno no proporcionó candidatos ICE para la prueba WebRTC real. El recorrido
entre PC e iPhone está implementado pero pendiente de validación en la red local.
También están pendientes revisión visual de escritorio/móvil, instalación Windows
y pruebas físicas sin emisión de direcciones, marco, registro, pausa/reanudación y
cancelación. Los cambios de protocolo USB de 0.5.0 se conservan. La alineación 0.6.0
no debe considerarse precisión mecánica certificada.

## Recorrido de revisión

1. Crear una caja, editarla en 3D y cambiar a Preparar corte; mover/girar piezas,
   comprobar hojas y límites, exportar SVG/DXF.
2. Guardar diseño y preparación; recuperar, duplicar y renombrar desde Biblioteca.
3. Actualizar conector 0.6.0, conectar, Home, flechas y origen actual; recorrer marco.
4. Cambiar espacios durante trabajo sin perder su estado. Stop solicita pausa antes
   de ofrecer reanudar/cancelar. Reanudar conserva cola; cancelar la invalida.
5. Recargar durante operación y consultar estado sin preparar ni ejecutar de nuevo.
6. Enlazar celular, ceder movimientos, comprobar que PC no puede mover y que Stop
   sigue disponible; desconectar/recargar y comprobar que no se repiten órdenes.
7. Registrar uno o varios puntos, revisar error/transformación y marco sin emisión.
   Guardar plantilla, recuperarla y comprobar que exige volver a referenciar.
