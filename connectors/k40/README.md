# LZ K40 · conector 0.6.0 para Box Studio

Control por USB para M2 Nano conservando libusb-win32 y Sagaon/K40 Whisperer.
El navegador usa un conector local; no hay que descargar/importar diseños para
cada trabajo. La potencia se ajusta en el panel físico de la M2.

## Instalar o actualizar una vez en Windows

1. Termina cualquier trabajo. Cierra el conector anterior y Sagaon.
2. Extrae **LZ-K40-Windows.zip** en una carpeta fija, por ejemplo
   `Documentos\LZ-K40`. No lo ejecutes dentro del ZIP ni borres/muevas esa carpeta.
3. Ejecuta **instalar-windows.bat**. Requiere Python 3.10 o posterior con el comando
   `py` y Tkinter de la instalación oficial. Instala dependencias en su `.venv`,
   comprueba el motor sin USB, activa el inicio automático y abre el panel local.
   Si estás actualizando, cierra por completo el conector anterior antes. Cerrar
   solo la ventana no lo termina. Tras instalar, reinicia Windows si el panel local
   sigue mostrando otra versión; debe indicar **Conector 0.6.0**.
4. Pulsa **Copiar código** y pégalo una vez en Box. Deja **Recordar esta computadora**
   marcado. Si ya estaba emparejado, el código se conserva y no se repite este paso.
5. En adelante, el conector inicia en segundo plano al iniciar sesión en Windows.
   Abre Box y pulsa **Controlar mi K40**: el panel recupera el código e intenta
   conectar. No inicia movimientos ni cortes al abrirse.

El inicio automático escribe únicamente el valor `LZStudioK40` en
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; ejecuta `pythonw.exe`
con `background.pyw`, sin consola. No instala servicios ni pide administrador.
No abre/retiene USB hasta conectar desde Box. No modifica drivers ni Sagaon.
El perfil de segundo plano usa cama **400 × 400 mm**, no una calibración.

Para abrir el panel local manualmente usa **abrir-conector.vbs**. Permite copiar
el código, ver el estado, abrir Box y activar/desactivar el inicio automático.
**Cerrar conector** rechaza la operación si hay trabajo pendiente. Cerrar solo
la ventana del panel mantiene el conector en segundo plano.

**desactivar-inicio-windows.bat** quita exclusivamente su entrada de inicio para
las próximas sesiones. **activar-inicio-windows.bat** la vuelve a crear y arranca
el conector. Si mueves la carpeta, vuelve a activar desde la nueva ubicación.

## Mover el cabezal y elegir origen

1. Con la emisión físicamente deshabilitada, conecta y verifica que el recorrido
   esté libre. Pulsa **Home** una vez para establecer la referencia de la sesión.
2. Usa las flechas: un clic es un movimiento de 0.1, 1, 5, 10, 25 o 50 mm.
   No se acumulan pulsaciones mientras la controladora no indique fin.
3. En la posición deseada pulsa **Usar esta posición como origen**. La vista
   alinea la esquina superior izquierda del contorno del diseño con el cabezal.
4. Prueba **Recorrer marco sin láser**. En origen actual no se ejecuta Home.
   Al terminar el marco o corte vuelve al origen elegido, no al otro lado de la cama.
5. Valida direcciones, escala, límites y cancelación antes de habilitar la emisión.
   Después puedes enviar la hoja desde Box, sin descargar SVG/DXF.

La posición es **estimada a partir de las órdenes**, no medida por un encoder.
Se descarta al cancelar, perder comunicación, reiniciar o liberar el USB. Si mueves
el cabezal a mano, libera/reconecta y establece Home. El modo **Desde Home** sigue
existiendo para los trabajos que deban referenciarse a la esquina de la cama.

El conector valida nuevamente los límites después de situar el diseño en el
origen actual. No envía coordenadas EGV arbitrarias, comandos de consola ni archivos
recibidos por HTTP. Los movimientos se compilan con el driver M2 de MeerK40t
0.9.9100; Home, flechas y marco no incluyen órdenes de encendido del láser.
El motor requiere confirmación de cada paquete; una comunicación fallida no se
reanuda automáticamente. Las pruebas de protocolo no sustituyen la prueba física.

## Stop / Pausa, reanudación y cancelación

**STOP / PAUSA** permanece visible en la barra inferior durante el trabajo.
Solicita la pausa prioritaria `PN` del driver M2 y conserva los datos pendientes.
Hasta que el USB confirme su recepción, el panel dice **Solicitando pausa** y
mantiene **Reanudar** deshabilitado. Los datos ya almacenados en la placa pueden
seguir ejecutándose antes de que la orden sea aceptada; una confirmación USB no
es un sensor de movimiento ni una parada de emergencia.

En pausa, **Reanudar trabajo** continúa la cola conservada sin preparar ni enviar
otra vez el diseño. **Cancelar trabajo** descarta la cola y solicita el reinicio
prioritario soportado por MeerK40t; también está disponible mientras se solicita
la pausa. Una cancelación nunca permite reanudar ese trabajo.
La cancelación ya no espera el candado del envío: interrumpe las esperas normales
y bloquea nuevas escrituras del trabajo, conservando el envío del reinicio.
Las lecturas de estado tampoco retienen el candado HTTP que necesita Stop.
Una transferencia USB ya iniciada puede terminar; la parada física inmediata no
está garantizada por software.
No sustituye al paro físico: si continúa, utiliza el paro físico de la máquina.
Se eliminó **Confirmar máquina detenida** del panel. Cuando el reset se acepta,
la sesión USB se libera automáticamente y aparece **Reconectar M2**. Si no se
confirma en 15 segundos, se muestra el error y **Restablecer conexión USB**;
no se habilitan cortes ni reanudaciones basados en un temporizador. Restablecer
libera una sesión fallida; no confirma la parada física. Ante una máquina aún
activa, utiliza primero su paro físico.
En operación normal, Home, flechas, marco y corte vuelven a estar listos
automáticamente cuando la controladora indica fin; enviar datos no basta.
Se eliminó la casilla repetitiva: cada botón inicia solamente su propia operación.
El porcentaje solo mide datos transmitidos. La parada modificada requiere
validación física con emisión deshabilitada antes de otro corte.

Después de terminar un trabajo normal se conserva la conexión y el origen,
para evitar reconectar en cada hoja. Después de cancelación/error se descarta la
posición y se requiere reconectar. Para Sagaon pulsa **Liberar USB para Sagaon**.
Usa solo un programa a la vez. No se garantiza que WebUSB funcione con libusb-win32;
este panel vuelve al conector local que funcionó con el driver existente.

## Emparejamiento y recuperación

El secreto se conserva en `%LOCALAPPDATA%\LZStudioTools\K40\pairing.json`, fuera
del código. No se incluye en URLs ni se manda a Vercel. El navegador lo guarda
únicamente para el origen/perfil actual si marcas Recordar. Cambiar entre la URL
de prueba y producción requiere emparejar ese origen una vez. Olvidar código lo
borra de ese navegador. `bridge.py --reset-pairing` lo rota al iniciar el conector.

El conector escucha solo en **127.0.0.1:17840**, con Origin exacto y token. Una
segunda instancia no reemplaza el código. El registro local de errores está en
el mismo directorio de datos (`connector.log`) y no registra el código.
Si cierras/reabres el panel web durante una operación, recupera el estado sin
reenviar el trabajo. No prepares de nuevo un corte cuya respuesta se haya perdido.

## Verificación y desarrollo

## Taller 3.6 y registro opcional (conector 0.6.0)

Box conserva una sola sesión al cambiar entre Diseñar, Preparar corte, Operar
máquina y Biblioteca. Los diseños, preparaciones y plantillas se guardan en este
navegador; no en la placa. Exporta un respaldo antes de borrar datos del navegador.

El registro admite un punto para desplazamiento o dos a ocho para giro y
desplazamiento. Los puntos adicionales comprueban el error; no se aplica escala
ni deformación. Se rechazan referencias separadas menos de 10 mm, diferencias
de escala mayores al 2% y error máximo mayor a 0.5 mm. Estas tolerancias son de
validación numérica, no una garantía de precisión mecánica. El conector vuelve
a calcular la transformación, comprueba límites y exige la misma sesión USB.
Las plantillas conservan referencias de diseño, nunca posiciones físicas válidas
para otra sesión. Después de cargarlas hay que referenciarlas y recorrer el marco.

### Celular: etapa de validación en red local

En Operar máquina > Control desde celular genera el QR. Escanéalo, acepta el
emparejamiento en el celular y pega su respuesta en la computadora. Pulsa Ceder
control solo cuando ambas vistas coincidan. Es un enlace WebRTC cifrado directo,
sin servidor de señalización ni relay. El teléfono no recibe el código USB.
Mantén Box abierto en la computadora; ambos equipos necesitan una red local que
permita comunicación entre clientes. Las redes con aislamiento pueden impedirlo.
El conector sigue escuchando exclusivamente en 127.0.0.1.

Solo un dispositivo controla movimientos. Stop permanece accesible desde ambos.
Cerrar el enlace devuelve el control al PC; no inicia, reanuda ni repite trabajos.
Recargar el celular exige un nuevo enlace. No hay reconexión automática ni reintento
de una orden cuya respuesta se haya perdido.

El protocolo, el fraccionamiento de vistas grandes y la deduplicación tienen
pruebas automatizadas. La prueba WebRTC real no obtuvo candidatos de red en el
entorno de desarrollo: iPhone/Safari, Chrome, QR y funcionamiento entre dos equipos
en el Wi-Fi del taller siguen pendientes de validación. Tampoco se han validado
físicamente el registro ni la pausa en una M2. No se cambia potencia, PWM o perfil.

## Pruebas

- Probados en Linux: compilador real M2 sin abrir USB; movimientos y fin de
  controladora con transporte de prueba; origen, límites, cancelación, sesión,
  persistencia del código y arranque/cierre HTTP en segundo plano sin USB.
- Probado el flujo DOM del panel, geometría de 17 modelos y vista de origen actual;
  pausa/reanudación/cancelación por HTTP y parser real con transporte USB de prueba,
  incluyendo pausa antes y durante un envío, sin duplicar paquetes.
- La instalación, el panel Tkinter y la entrada de inicio requieren verificación
  en Windows. Las pruebas del registro usan un sustituto, no modifican el sistema.
- Pendientes: revisión visual en navegador del nuevo panel y prueba física con
  emisión deshabilitada. No se declara idéntico a K40 Whisperer ni listo para producción.

```sh
npm ci
node --test k40-tests.mjs
python -m pip install -r connectors/k40/requirements.txt
python -m unittest discover -s connectors/k40 -p 'test_*.py' -v
PYTHON=python node k40-http-integration.mjs
npm run build:vercel
node vercel-tests.mjs
```

Se conservan **simular-windows.bat** (sin USB) y **usb-windows.bat** (con consola)
para diagnóstico. No ejecutes ambos junto al conector de segundo plano.

Referencias: https://github.com/meerk40t/meerk40t (MIT),
https://www.scorchworks.com/K40whisperer/k40w_manual.html y
https://support.microsoft.com/es-es/windows/experience/startup-boot/configure-startup-applications-in-windows .
No se redistribuyen binarios de MeerK40t ni de los controladores; se instalan las
dependencias fijadas en requirements.txt. Conserva sus licencias al empaquetarlas.
