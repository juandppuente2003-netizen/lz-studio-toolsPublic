// Un punto con halo suavizado se mide por lo que se imprime (alfa ≥ 50 %), en ambos motores.
import assert from 'node:assert/strict';
import {findSmallDots,adjustSmallDots} from './web/dot-audit-engine.js';
import {DotScanner} from './web/large-dot-engine.js';
const W=60,H=60,ppcm=118.11,min=.5;// 300 ppp → 0.5 mm ≈ 5.9 px
function image(core,halo){const d=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const r=Math.hypot(x-30,y-30),i=(y*W+x)*4;d[i]=d[i+1]=d[i+2]=255;if(r<=core/2)d[i+3]=255;else if(r<=core/2+halo)d[i+3]=60;}return d;}
// Núcleo de 4.5 px (0.38 mm) con halo tenue de 1.5 px: el área total equivale a ~7.5 px, pero se imprime 0.38 mm.
let d=image(4.5,1.5),r=findSmallDots(d,W,H,{minimumMm:min,pixelsPerCm:ppcm});assert.equal(r.count,1,'motor normal detecta el punto de 0.38 mm');
const s=new DotScanner(W,H,r.minimumPx);s.band(d,H,0);assert.equal(s.end().count,1,'motor de archivos grandes detecta el mismo punto');
// Un punto de 7 px sólidos (0.59 mm) no se marca.
d=image(7,1.5);assert.equal(findSmallDots(d,W,H,{minimumMm:min,pixelsPerCm:ppcm}).count,0);{const t=new DotScanner(W,H,5.9);t.band(d,H,0);assert.equal(t.end().count,0);}
// La corrección automática deja el núcleo imprimible en al menos 0.5 mm.
d=adjustSmallDots(image(4.5,1.5),W,H,{minimumMm:min,pixelsPerCm:ppcm,mode:'auto'}).data;let core=0;for(let i=3;i<d.length;i+=4)if(d[i]>=128)core++;assert.ok(2*Math.sqrt(core/Math.PI)>=5.9,'núcleo corregido '+(2*Math.sqrt(core/Math.PI)).toFixed(2)+' px');
console.log('PASS: puntos medidos por su parte imprimible (alfa ≥ 50 %) en ambos motores y corrección a 0.5 mm.');
