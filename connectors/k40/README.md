# LZ Box → K40 M2 · primera versión experimental

Conecta el plano de Box con una M2 Nano por USB mediante un puente local.
El sitio sigue en GitHub/Vercel; el acceso USB ocurre en la computadora del taller.
No hace falta descargar/importar SVG o DXF para cada trabajo. El motor convierte
las coordenadas ya compensadas por kerf a LHYMicro-GL usando MeerK40t 0.9.9100.

## Estado de esta entrega

- Integrados: selección de hoja, vista de trayectorias, velocidad, pasadas,
  desplazamiento, bloqueo de superposiciones y límites, marco sin disparo y envío.
- La simulación genera instrucciones con el controlador M2 real de MeerK40t,
  pero nunca abre USB. Se distingue del modo USB en pantalla y en el conector.
- Comprobados en Linux: compilación, HTTP local, validaciones, repetición de
  trabajos, pérdida de conexión y flujo del panel mediante DOM automatizado.
- Pendientes: instalación en Windows, compatibilidad del driver USB existente,
  revisión visual en navegador de la nueva versión y prueba física supervisada.
  No se declara listo para producción ni idéntico a K40 Whisperer.

## Preparación en Windows

1. Instala Python 3.10 o posterior desde su fuente oficial, con `py` disponible.
2. Descarga esta carpeta desde la rama de desarrollo del repositorio.
3. Abre `instalar-windows.bat`. Crea un entorno local e instala las dependencias.
4. Abre `simular-windows.bat` y deja esa ventana abierta.
5. En la versión de Box que incluye este cambio, pulsa **Cortar en mi K40**.
   Copia el código del conector en el campo y pulsa **Conectar**.
6. Revisa el trabajo y ejecuta la simulación. El estado debe indicar SIMULACIÓN.

El código cambia al reiniciar, no se incluye en URLs y se borra del panel al
cerrarlo. El puente solo escucha en `127.0.0.1:17840`; nunca en la red del taller.
Permite por defecto únicamente los orígenes HTTPS de lzstudiotools.com.
Chrome/Edge pueden solicitar permiso de red local; los navegadores que bloqueen
estas peticiones no podrán conectar. No se ha verificado Safari/iPhone.

## Primera prueba USB, siempre junto a la máquina

1. Confirma la cama útil REAL y que Home sea la esquina superior izquierda.
   El perfil inicial es **400 × 400 mm**, editable en `usb-windows.bat` con
   `--width` y `--height`. No es una medición ni una calibración de tu equipo.
2. Cierra Sagaon Laser/K40 Whisperer para liberar el USB. Esta entrega no cambia
   los drivers instalados. Si no conecta, diagnostica el driver antes de cambiarlo.
3. Cierra el simulador y abre `usb-windows.bat`.
4. Conecta desde Box con el nuevo código. Debe indicar **USB · experimental**.
5. Haz primero **Recorrer marco sin láser**, con la emisión del láser físicamente
   deshabilitada. El trabajo vuelve a Home antes de recorrer el contorno.
6. Tras verificar la escala, dirección y límites, haz un corte sencillo de prueba.
   Ajusta la potencia en el panel físico; la M2 no recibe un porcentaje de potencia.

Cada envío establece Home; no se admite un origen relativo a una posición
desconocida. Las hojas se procesan una por una, con confirmación individual.
Los interiores van primero, luego los contornos. Pasadas: 1–10, velocidad: 1–100
mm/s; estos límites de software NO son parámetros recomendados para tu material.

**Cancelar envío no es un paro de emergencia.** Detiene datos pendientes en el
conector, pero la placa puede ejecutar lo recibido. El porcentaje corresponde a
datos transmitidos, no al avance físico. Después de enviar/cancelar, el panel exige
confirmar que la máquina se detuvo y volver a conectar antes de preparar otra hoja.
Si se pierde USB, el puente abandona la cola en lugar de reconectarla y continuar.
No reinicies un corte interrumpido sin revisar la pieza y la posición.

## Desarrollo y comprobaciones

Desde la raíz del repositorio:

```sh
npm ci
node --test k40-tests.mjs
python -m pip install -r connectors/k40/requirements.txt
python -m unittest discover -s connectors/k40 -p test_bridge.py -v
npm run build:vercel
```

Prueba de integración real, aún sin USB:

```sh
node k40-http-integration.mjs
```

El último comando requiere las dependencias Python anteriores en el mismo entorno
que `python`. Inicia y cierra un servidor de prueba con un código desechable.

Para probar una versión de Box con otro origen, inicia el puente con ese origen
exacto (sin barra final). No uses comodines ni expongas este puerto a Internet:

```sh
python connectors/k40/bridge.py --origin http://127.0.0.1:17841
```

La integración usa `k40-job.js` para construir un snapshot de las trayectorias de
`app.packed`; no vuelve a importar el diseño ni compensa el kerf otra vez.
`k40-control.js` añade el panel a `lzApp` sin cambiar generadores ni exportadores.
Los archivos generados de `dist/` y `api/site.js` se regeneran al ejecutar el build
de Vercel; la rama mantiene los cambios en el código fuente.

## Licencias y referencias

MeerK40t es una dependencia externa bajo licencia MIT. Esta entrega lo instala
desde PyPI y no copia su código en el sitio ni redistribuye sus binarios.
Conserva las licencias de MeerK40t y sus dependencias si empaquetas un instalador.

- https://github.com/meerk40t/meerk40t
- https://pypi.org/project/meerk40t/0.9.9100/
- https://www.scorchworks.com/K40whisperer/k40whisperer.html
