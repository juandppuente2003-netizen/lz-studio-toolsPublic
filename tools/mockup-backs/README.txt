Vistas de espalda de Mockups (assets/mockups/*-back.webp)

Se generaron a partir de las fotos de frente: se cubre el escote con tela del mismo
producto (iluminación interpolada del entorno + textura fina del pecho) y se conserva el
borde del cuello trasero. La sudadera además quita cordones, abertura del gorro y bolsillo.

Parámetros usados (tee_back.py, JSON):
  regular-tee   {"cx":625,"cy":62,"ax":182,"by":146,"band":22,"rim":9,"dy":210}
  oversized-tee {"cx":622,"cy":92,"ax":182,"by":154,"band":24,"rim":10,"dy":260}
  dryfit-short  {"cx":622,"cy":64,"ax":174,"by":152,"band":20,"rim":9,"dy":230}
  dryfit-long   {"cx":622,"cy":52,"ax":166,"by":146,"band":20,"rim":9,"dy":230}
Después se exportan a WebP (calidad 88, alfa 95). Requiere numpy, scipy y Pillow.
