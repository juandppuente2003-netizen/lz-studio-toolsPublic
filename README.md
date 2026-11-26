# LZ-PLUS

App de TV para películas, series, anime y canales en vivo. Se maneja con el control remoto.

## Instalar en Android TV / Google TV

1. En la TV instala la app **Downloader** (de AFTVnews) desde Google Play.
2. Permite que Downloader instale apps: *Ajustes → Privacidad/Seguridad → Fuentes desconocidas → Downloader*.
3. En Downloader escribe el link de la descarga directa (está en la sección **Releases** de este repositorio):
   `https://github.com/juandppuente2003-netizen/lz-studio-toolsPublic/releases/download/lz-plus-tv/LZ-PLUS.apk`
4. Instala y abre **LZ-PLUS** desde el inicio de la TV.

Cada vez que se actualiza `lz-plus.html` en la rama `lz-plus-tv`, GitHub compila una versión nueva sola
(pestaña **Actions**) y la publica en el mismo link.

## Archivos

- `lz-plus.html` — la app (también funciona en un navegador).
- `android/` — la app de Android TV (abre la app y usa un reproductor nativo que lee MKV, HEVC, etc.).
- `lz-servidor.js`, `INICIAR-LZ-PLUS.bat`, `PERMITIR-EN-RED.bat` — opcional, solo si usas la app en un navegador.
