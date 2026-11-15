/* LZ Box · Dibujar: motor geométrico del editor 2D (sin DOM).
   Coordenadas en mm, eje Y hacia abajo (como la cama del láser y el SVG).
   Un objeto = {id, kind, params, m:[a,b,c,d,e,f], op:'cut'|'engrave'|'line', name}.
   Su geometría local se genera de kind+params y se lleva al lienzo con la matriz m. */
import {textShapes,unionShapes,offsetShapes,booleanShapes,simplifyRing,area,ccw,getFont} from './text-shapes.js?v=1';

export const OPS={cut:{name:'Corte',color:'#ff0000'},engrave:{name:'Grabado (relleno)',color:'#000000'},line:{name:'Línea grabada',color:'#1f6bff'}};
export const SHAPES=[
 {kind:'rect',name:'Rectángulo',params:{w:60,h:40,r:0}},{kind:'ellipse',name:'Círculo / elipse',params:{w:50,h:50}},
 {kind:'polygon',name:'Polígono',params:{w:50,h:50,n:6}},{kind:'star',name:'Estrella',params:{w:55,h:55,n:5,inner:.45}},
 {kind:'heart',name:'Corazón',params:{w:50,h:45}},{kind:'cross',name:'Cruz',params:{w:30,h:42,bar:.28}},
 {kind:'arrow',name:'Flecha',params:{w:60,h:30}},{kind:'arch',name:'Arco (lápida)',params:{w:50,h:65}},
 {kind:'slot',name:'Ranura redondeada',params:{w:40,h:10}},{kind:'tri',name:'Triángulo',params:{w:50,h:45}}
];
/* ---------------------------------------------------------------- matrices */
export const I=()=>[1,0,0,1,0,0];
export const mul=(A,B)=>[A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],A[0]*B[4]+A[2]*B[5]+A[4],A[1]*B[4]+A[3]*B[5]+A[5]];
export const apply=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export const inv=m=>{const d=m[0]*m[3]-m[1]*m[2];return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];};
export const translate=(dx,dy)=>[1,0,0,1,dx,dy];
export const scaleAt=(sx,sy,cx,cy)=>[sx,0,0,sy,cx-sx*cx,cy-sy*cy];
export const rotateAt=(deg,cx,cy)=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[c,s,-s,c,cx-c*cx+s*cy,cy-s*cx-c*cy];};
/* ---------------------------------------------------------------- formas base (local, y hacia abajo) */
const ring=(n,fn)=>Array.from({length:n},(_,i)=>fn(i/n*2*Math.PI));
function roundedRect(w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));if(r<.01)return[[0,0],[w,0],[w,h],[0,h]];const arc=(cx,cy,a0)=>Array.from({length:9},(_,i)=>{const a=a0+i*Math.PI/16;return[cx+r*Math.cos(a),cy+r*Math.sin(a)];});return[...arc(w-r,r,-Math.PI/2),...arc(w-r,h-r,0),...arc(r,h-r,Math.PI/2),...arc(r,r,Math.PI)];}
function base(kind,p){
 const w=Math.max(.5,+p.w||1),h=Math.max(.5,+p.h||1);
 switch(kind){
  case'rect':return[{outer:roundedRect(w,h,+p.r||0),holes:[]}];
  case'ellipse':return[{outer:ring(Math.max(32,Math.min(180,Math.round((w+h)))),a=>[w/2+w/2*Math.cos(a),h/2+h/2*Math.sin(a)]),holes:[]}];
  case'polygon':{const n=Math.max(3,Math.min(40,Math.round(+p.n||6)));return[{outer:ring(n,a=>[w/2+w/2*Math.cos(a-Math.PI/2),h/2+h/2*Math.sin(a-Math.PI/2)]),holes:[]}];}
  case'star':{const n=Math.max(3,Math.min(30,Math.round(+p.n||5))),k=Math.max(.1,Math.min(.95,+p.inner||.45));return[{outer:ring(2*n,a=>{const r=Math.round(a/(Math.PI/n))%2?k:1;return[w/2+w/2*r*Math.cos(a-Math.PI/2),h/2+h/2*r*Math.sin(a-Math.PI/2)];}),holes:[]}];}
  case'heart':return[{outer:ring(120,t=>{const x=16*Math.sin(t)**3,y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);return[w/2+x/32*w,h*.42-y/30*h];}),holes:[]}];
  case'cross':{const b=Math.max(.08,Math.min(.6,+p.bar||.28)),bw=w*b,y0=h*.24;return[{outer:[[w/2-bw/2,0],[w/2+bw/2,0],[w/2+bw/2,y0],[w,y0],[w,y0+bw],[w/2+bw/2,y0+bw],[w/2+bw/2,h],[w/2-bw/2,h],[w/2-bw/2,y0+bw],[0,y0+bw],[0,y0],[w/2-bw/2,y0]],holes:[]}];}
  case'arrow':return[{outer:[[0,h*.32],[w*.6,h*.32],[w*.6,0],[w,h/2],[w*.6,h],[w*.6,h*.68],[0,h*.68]],holes:[]}];
  case'arch':{const r=w/2;return[{outer:[[0,h],[0,r],...Array.from({length:31},(_,i)=>{const a=Math.PI+i*Math.PI/30;return[r+r*Math.cos(a),r+r*Math.sin(a)];}).slice(1,-1),[w,r],[w,h]],holes:[]}];}
  case'slot':{const r=Math.min(w,h)/2;return[{outer:roundedRect(w,h,r),holes:[]}];}
  case'tri':return[{outer:[[w/2,0],[w,h],[0,h]],holes:[]}];
  case'text':{if(!getFont(p.font))return[];const t=textShapes(p.font,String(p.text||'').slice(0,80)||' ',{capHeight:+p.size||20,spacing:+p.spacing||0,joined:!!p.joined}),H=t.height;return t.letters.flatMap(l=>l.shapes).map(s=>({outer:ccw(s.outer.map(([x,y])=>[x,H-y])),holes:s.holes.map(r=>ccw(r.map(([x,y])=>[x,H-y])))}));}
  case'path':return(p.shapes||[]).map(s=>({outer:s.outer.map(v=>[...v]),holes:(s.holes||[]).map(r=>r.map(v=>[...v]))}));
  case'polyline':return[];
  default:return[];
 }
}
const cacheKey=o=>o.kind==='path'?null:JSON.stringify([o.kind,o.params]);
const localCache=new Map();
export function localShapes(o){const k=cacheKey(o);if(k&&localCache.has(k))return localCache.get(k);const r=base(o.kind,o.params||{});if(k){if(localCache.size>400)localCache.clear();localCache.set(k,r);}return r;}
/** Geometría del objeto en el lienzo: {shapes:[{outer,holes}], lines:[[...]]} (líneas abiertas). */
export function worldGeometry(o){const m=o.m||I(),tr=r=>r.map(v=>apply(m,v));const flip=m[0]*m[3]-m[1]*m[2]<0;const fix=r=>flip?r.slice().reverse():r;
 return{shapes:localShapes(o).map(s=>({outer:fix(tr(s.outer)),holes:s.holes.map(h=>fix(tr(h)))})),lines:o.kind==='polyline'?[tr(o.params.points||[])]:[]};}
export function bbox(objs){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const o of objs){const g=worldGeometry(o);for(const r of[...g.shapes.map(s=>s.outer),...g.lines])for(const[x,y]of r){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}}return Number.isFinite(x0)?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null;}
/** Convierte un objeto paramétrico en trazado editable (mismos puntos en el lienzo). */
export function bake(o){const g=worldGeometry(o);if(o.kind==='polyline')return{...o,m:I(),params:{points:g.lines[0]}};return{...o,kind:'path',m:I(),params:{shapes:g.shapes}};}
/* ---------------------------------------------------------------- operaciones */
const toUnion=list=>unionShapes(list.flatMap(o=>worldGeometry(o).shapes.flatMap(s=>[s.outer,...s.holes.map(h=>h.slice().reverse())])));
/** union | difference (el de abajo menos los de arriba) | intersection | xor. objs en orden de apilado. */
export function combine(objs,op){
 if(objs.length<2)throw Error('Selecciona dos o más formas.');if(objs.some(o=>o.kind==='polyline'))throw Error('Las líneas abiertas no se pueden combinar.');
 let out;if(op==='union')out=toUnion(objs);else if(op==='difference')out=booleanShapes(toUnion([objs[0]]),toUnion(objs.slice(1)),'difference');
 else if(op==='intersection'){out=toUnion([objs[0]]);for(const o of objs.slice(1))out=booleanShapes(out,toUnion([o]),'intersection');}
 else if(op==='xor'){out=toUnion([objs[0]]);for(const o of objs.slice(1))out=booleanShapes(out,toUnion([o]),'xor');}
 else throw Error('Operación desconocida.');
 out=clean(out);if(!out.length)throw Error('El resultado queda vacío.');
 return{id:uid(),kind:'path',name:{union:'Unión',difference:'Resta',intersection:'Intersección',xor:'Exclusión'}[op],params:{shapes:out},m:I(),op:objs[0].op||'cut'};
}
/** Contorno (desplazamiento). d > 0 hacia afuera. ring: deja solo el anillo entre el original y el contorno. */
export function outline(o,d,{ring=false,round=true}={}){const src=toUnion([o]);let out=offsetShapes(src,d,{round,arc:.05});if(ring)out=d>0?booleanShapes(out,src,'difference'):booleanShapes(src,out,'difference');out=clean(out);if(!out.length)throw Error('El contorno queda vacío: usa una distancia menor.');return{id:uid(),kind:'path',name:ring?'Anillo':'Contorno',params:{shapes:out},m:I(),op:o.op||'cut'};}
/** Redondea esquinas convexas y cóncavas con radio r. */
export function roundCorners(o,r){if(!(r>0))return o;let s=toUnion([o]);s=offsetShapes(offsetShapes(s,-r,{arc:.05}),r,{arc:.05});s=offsetShapes(offsetShapes(s,r,{arc:.05}),-r,{arc:.05});s=clean(s);if(!s.length)throw Error('El radio es demasiado grande para esta forma.');return{...o,kind:'path',params:{shapes:s},m:I()};}
/** Matriz rectangular (filas × columnas) o circular (copias alrededor del centro). */
export function array(objs,{mode='grid',rows=2,cols=3,gapX=5,gapY=5,count=6,radius=40}={}){
 const b=bbox(objs),out=[];
 if(mode==='grid'){for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(!r&&!c)continue;for(const o of objs)out.push({...clone(o),id:uid(),m:mul(translate(c*(b.w+gapX),r*(b.h+gapY)),o.m)});}}
 else{const cx=b.x+b.w/2,cy=b.y+b.h/2+radius;for(let k=1;k<count;k++)for(const o of objs)out.push({...clone(o),id:uid(),m:mul(rotateAt(360*k/count,cx,cy),o.m)});}
 return out;
}
function clean(shapes){return shapes.map(s=>({outer:simplifyRing(s.outer,.01),holes:s.holes.map(h=>simplifyRing(h,.01)).filter(h=>h.length>2&&Math.abs(area(h))>.01)})).filter(s=>s.outer.length>2&&Math.abs(area(s.outer))>.01);}
export const clone=o=>JSON.parse(JSON.stringify(o));
let seq=0;export const uid=()=>'d'+Date.now().toString(36)+(seq++).toString(36);
/* ---------------------------------------------------------------- SVG */
const f=n=>Math.round(n*1000)/1000;
export const ringPath=r=>'M'+r.map(v=>`${f(v[0])} ${f(v[1])}`).join('L')+'Z';
export const linePath=r=>'M'+r.map(v=>`${f(v[0])} ${f(v[1])}`).join('L');
/** SVG en mm listo para Operar máquina (rojo = corte, negro = grabado, azul = línea grabada). */
export function exportSVG(objs,{margin=0}={}){
 const b=bbox(objs);if(!b)throw Error('No hay nada que exportar.');const x0=b.x-margin,y0=b.y-margin,w=b.w+2*margin,h=b.h+2*margin,T=r=>r.map(([x,y])=>[x-x0,y-y0]);
 const body=objs.map(o=>{const g=worldGeometry(o),d=g.shapes.map(s=>[s.outer,...s.holes].map(r=>ringPath(T(r))).join('')).join('')+g.lines.map(l=>linePath(T(l))).join('');if(!d)return'';
  return o.op==='engrave'?`<path d="${d}" fill="#000000" fill-rule="evenodd" stroke="none"/>`:`<path d="${d}" fill="none" stroke="${OPS[o.op]?.color||'#ff0000'}" stroke-width="0.1"/>`;}).join('');
 return`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">${body}</svg>`;
}
