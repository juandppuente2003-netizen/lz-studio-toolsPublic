/* LZ Box · grabado por pieza y cortes abiertos (bisagras).
   part.engrave = {areas:[{outer,holes}], images:[{x,y,w,h,href,flipX}]} en coordenadas de la
   pieza (u, v), sobre la cara indicada por part.engraveFace (0 o espesor).
   part.slits = polilíneas abiertas que se cortan (bisagra flexible), sin compensar kerf.
   Al acomodar en la hoja, una pieza con grabado se voltea si hace falta para que la cara
   grabada quede hacia arriba en la cama del láser. */
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const hasEngrave=p=>!!(p.engrave&&((p.engrave.areas||[]).length||(p.engrave.images||[]).length));
/** La cara grabada, vista desde afuera, ¿se ve en espejo respecto a (u, v)? */
export function viewMirrored(p){const f=p.frame;if(!f)return false;const toward=(p.engraveFace||0)>0?f.n:f.n.map(x=>-x);return dot(cross(f.u,f.v),toward)<0;}
/** En la cama (y hacia abajo) la pieza se ve en espejo; se voltea si así la cara grabada queda arriba y legible. */
export const bedMirror=p=>hasEngrave(p)&&!viewMirrored(p);
/** Convierte coordenadas vistas desde afuera (x a la derecha, y arriba) a coordenadas de la pieza. */
export const viewToPanel=(p,[x,y])=>viewMirrored(p)?[p.w-x,y]:[x,y];
/** Transformación de la pieza a la hoja, con volteo opcional, y matriz afín equivalente. */
export function withMirror(p,tr){if(!bedMirror(p))return tr;return([a,b])=>tr([a,p.h-b]);}
export function affine(tr){const o=tr([0,0]),u=tr([1,0]),v=tr([0,1]);return[u[0]-o[0],u[1]-o[1],v[0]-o[0],v[1]-o[1],o[0],o[1]];}
/** Datos extra para una pieza ya colocada. */
export function placedExtras(p,tr){const out={};if(p.slits?.length)out.slitPoints=p.slits.map(l=>l.map(tr));if(hasEngrave(p)){out.engraveMatrix=affine(tr);out.engraveAreas=(p.engrave.areas||[]).map(s=>({outer:s.outer.map(tr),holes:s.holes.map(h=>h.map(tr))}));}return out;}
const f3=n=>Math.round(n*1000)/1000;
const ringD=r=>'M'+r.map(v=>v.map(f3).join(' ')).join('L')+'Z';
/** SVG del grabado de las piezas colocadas (negro = grabar). */
export function engraveSVG(items){
 const blocks=[];
 for(const p of items){if(!p.engraveMatrix)continue;const[a,b,c,d,e,f]=p.engraveMatrix,areas=p.engrave.areas||[],images=p.engrave.images||[];
  const paths=areas.map(s=>[s.outer,...s.holes].map(ringD).join('')).join('');
  const imgs=images.map(im=>`<image x="${f3(im.flipX?-(im.x+im.w):im.x)}" y="${f3(-(im.y+im.h))}" width="${f3(im.w)}" height="${f3(im.h)}" preserveAspectRatio="none" href="${im.href}" transform="scale(${im.flipX?-1:1},-1)"/>`).join('');
  blocks.push(`<g id="grabado-${p.id}" transform="matrix(${[a,b,c,d,e,f].map(f3).join(' ')})">${paths?`<path d="${paths}" fill="#000000" fill-rule="evenodd" stroke="none"/>`:''}${imgs}</g>`);}
 return blocks.length?`<g id="engrave">${blocks.join('')}</g>`:'';
}
/** Polilíneas abiertas de bisagra, en rojo (corte). */
export function slitsSVG(items,stroke='#ff0000',width='0.01'){const lines=items.flatMap(p=>p.slitPoints||[]);if(!lines.length)return'';return`<g id="bisagras" fill="none" stroke="${stroke}" stroke-width="${width}">${lines.map(l=>`<path d="M${l.map(v=>v.map(f3).join(' ')).join('L')}"/>`).join('')}</g>`;}
