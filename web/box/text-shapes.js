/* LZ Box · texto a contornos en mm (fuentes incluidas o importadas) y utilidades
   de polígonos con Clipper. Todas las coordenadas salen en mm, eje Y hacia arriba,
   anillos en sentido antihorario (exteriores y huecos), como el resto de Box. */
import opentype from './vendor/opentype.mjs';
import ClipperLib from './vendor/clipper.mjs';

export const BUILTIN_FONTS=[
 {id:'alfa-slab-one',name:'Alfa Slab One'},{id:'archivo-black',name:'Archivo Black'},{id:'anton',name:'Anton'},
 {id:'bebas-neue',name:'Bebas Neue'},{id:'bungee',name:'Bungee'},{id:'righteous',name:'Righteous'},
 {id:'lobster',name:'Lobster'},{id:'pacifico',name:'Pacifico'}
];
const SCALE=1000;// Clipper trabaja en enteros: micras.
const fonts=new Map(),names=new Map(),listeners=new Set();
export function onFontLoaded(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function fontName(id){return names.get(id)||BUILTIN_FONTS.find(f=>f.id===id)?.name||id;}
export function getFont(id){return fonts.get(id)||null;}
export function registerFont(id,buffer,name){const font=opentype.parse(buffer instanceof ArrayBuffer?buffer:buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));if(!font.supported&&font.supported!==undefined)throw Error('La fuente no es compatible.');fonts.set(id,font);names.set(id,name||font.names?.fontFamily?.en||id);shapeCache.clear();for(const fn of listeners)try{fn(id);}catch{}return font;}
const pending=new Map();
/** Carga una fuente incluida (carpeta fonts/) o una importada guardada en este navegador. */
export function loadFont(id){
 if(fonts.has(id))return Promise.resolve(fonts.get(id));if(pending.has(id))return pending.get(id);
 const job=(async()=>{
  if(BUILTIN_FONTS.some(f=>f.id===id)){const r=await fetch(new URL(`./fonts/${id}.woff`,import.meta.url));if(!r.ok)throw Error('No se pudo descargar la fuente.');return registerFont(id,await r.arrayBuffer(),fontName(id));}
  const stored=await customFontStore('get',id);if(!stored)throw Error('La fuente importada no está en este navegador. Vuelve a cargarla.');return registerFont(id,stored.data,stored.name);
 })();pending.set(id,job);job.catch(()=>{}).finally(()=>pending.delete(id));return job;
}
/** Importa una fuente TTF/OTF/WOFF del usuario y la conserva en IndexedDB. */
export async function importFont(file){
 if(!file||file.size>8e6)throw Error('La fuente debe pesar menos de 8 MB.');
 const data=await file.arrayBuffer(),bytes=new Uint8Array(data),sig=String.fromCharCode(...bytes.slice(0,4));
 if(sig==='wOF2')throw Error('WOFF2 no es compatible: usa el archivo TTF u OTF de la fuente.');
 let hash=2166136261;for(let i=0;i<bytes.length;i+=Math.max(1,bytes.length>>14))hash=Math.imul(hash^bytes[i],16777619)>>>0;
 const id='custom-'+hash.toString(36)+'-'+bytes.length.toString(36),font=registerFont(id,data,file.name.replace(/\.(ttf|otf|woff)$/i,''));
 if(!font.charToGlyph('A')?.path?.commands?.length)throw Error('La fuente no contiene letras dibujables.');
 const name=fontName(id);await customFontStore('put',id,{name,data}).catch(()=>{});return{id,name};
}
export async function customFonts(){try{return await customFontStore('list');}catch{return[];}}
function customFontStore(op,id,value){
 if(typeof indexedDB==='undefined')return Promise.resolve(op==='list'?[]:null);
 return new Promise((resolve,reject)=>{const open=indexedDB.open('lzbox-fonts',1);open.onupgradeneeded=()=>open.result.createObjectStore('fonts');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('fonts',op==='get'||op==='list'?'readonly':'readwrite'),st=tx.objectStore('fonts');
  if(op==='get'){const q=st.get(id);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);}
  else if(op==='put'){st.put(value,id);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);}
  else{const out=[],q=st.openCursor();q.onsuccess=()=>{const c=q.result;if(c){out.push({id:c.key,name:c.value.name});c.continue();}else resolve(out);};q.onerror=()=>reject(q.error);}
 };});
}

/* ------------------------------------------------------------ polígonos */
export const area=r=>r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;
export const ccw=r=>area(r)<0?r.slice().reverse():r;
const toPath=r=>r.map(([x,y])=>({X:Math.round(x*SCALE),Y:Math.round(y*SCALE)}));
const fromPath=p=>p.map(q=>[q.X/SCALE,q.Y/SCALE]);
function clean(r,eps=1e-4){const out=[];for(const p of r){const q=out[out.length-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>eps)out.push(p);}while(out.length>2&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<=eps)out.pop();
 // quita vértices colineales
 return out.filter((v,i)=>{const a=out[(i+out.length-1)%out.length],b=out[(i+1)%out.length];return Math.abs((v[0]-a[0])*(b[1]-v[1])-(v[1]-a[1])*(b[0]-v[0]))>1e-9;});}
function treeToShapes(tree){const shapes=[];const walk=node=>{for(const child of node.Childs()){if(child.IsHole())continue;const outer=ccw(clean(fromPath(child.Contour())));const holes=child.Childs().map(h=>ccw(clean(fromPath(h.Contour())))).filter(h=>h.length>2);if(outer.length>2)shapes.push({outer,holes});for(const h of child.Childs())walk(h);}};walk(tree);return shapes;}
/** Une anillos (regla no nula o par-impar) y devuelve formas {outer, holes}. */
export function unionShapes(rings,evenOdd=false){const c=new ClipperLib.Clipper();c.AddPaths(rings.filter(r=>r.length>2).map(toPath),ClipperLib.PolyType.ptSubject,true);const tree=new ClipperLib.PolyTree(),fill=evenOdd?ClipperLib.PolyFillType.pftEvenOdd:ClipperLib.PolyFillType.pftNonZero;c.Execute(ClipperLib.ClipType.ctUnion,tree,fill,fill);return treeToShapes(tree);}
/** Desplaza formas (delta > 0 crece). round: esquinas redondeadas. */
export function offsetShapes(shapes,delta,{round=true,arc=0.1}={}){const o=new ClipperLib.ClipperOffset(2,arc*SCALE);for(const s of shapes){o.AddPath(toPath(s.outer),round?ClipperLib.JoinType.jtRound:ClipperLib.JoinType.jtMiter,ClipperLib.EndType.etClosedPolygon);for(const h of s.holes)o.AddPath(toPath(h).reverse(),round?ClipperLib.JoinType.jtRound:ClipperLib.JoinType.jtMiter,ClipperLib.EndType.etClosedPolygon);}const tree=new ClipperLib.PolyTree();o.Execute(tree,delta*SCALE);return treeToShapes(tree);}
/** Intersección/diferencia de formas. */
export function booleanShapes(a,b,op='difference'){const c=new ClipperLib.Clipper(),add=(shapes,type)=>{for(const s of shapes){c.AddPath(toPath(s.outer),type,true);for(const h of s.holes)c.AddPath(toPath(h).reverse(),type,true);}};add(a,ClipperLib.PolyType.ptSubject);add(b,ClipperLib.PolyType.ptClip);const tree=new ClipperLib.PolyTree();c.Execute(op==='intersection'?ClipperLib.ClipType.ctIntersection:op==='union'?ClipperLib.ClipType.ctUnion:ClipperLib.ClipType.ctDifference,tree,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);return treeToShapes(tree);}
export function simplifyRing(r,tol){if(r.length<4)return r;const keep=new Uint8Array(r.length);keep[0]=1;keep[r.length-1]=1;const stack=[[0,r.length-1]];while(stack.length){const[a,b]=stack.pop();let best=-1,dist=tol;const[ax,ay]=r[a],[bx,by]=r[b],L=Math.hypot(bx-ax,by-ay)||1e-12;for(let i=a+1;i<b;i++){const d=Math.abs((bx-ax)*(ay-r[i][1])-(ax-r[i][0])*(by-ay))/L;if(d>dist){dist=d;best=i;}}if(best>0){keep[best]=1;stack.push([a,best],[best,b]);}}return r.filter((_,i)=>keep[i]);}
export function bounds(shapes){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const s of shapes)for(const[x,y]of s.outer){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return{x0,y0,x1,y1,w:x1-x0,h:y1-y0};}
export const translateShape=(s,dx,dy)=>({outer:s.outer.map(([x,y])=>[x+dx,y+dy]),holes:s.holes.map(h=>h.map(([x,y])=>[x+dx,y+dy]))});

/* ------------------------------------------------------------ texto */
function flatten(commands,step){const rings=[];let ring=null,last=null,start=null;
 const push=p=>{ring.push(p);last=p;};
 for(const c of commands){
  if(c.type==='M'){if(ring&&ring.length>2)rings.push(ring);ring=[];start=[c.x,-c.y];push(start);}
  else if(c.type==='L')push([c.x,-c.y]);
  else if(c.type==='Q'){const p0=last,p1=[c.x1,-c.y1],p2=[c.x,-c.y],n=Math.max(2,Math.ceil((Math.hypot(p1[0]-p0[0],p1[1]-p0[1])+Math.hypot(p2[0]-p1[0],p2[1]-p1[1]))/step));for(let i=1;i<=n;i++){const t=i/n,a=(1-t)*(1-t),b=2*(1-t)*t,d=t*t;push([a*p0[0]+b*p1[0]+d*p2[0],a*p0[1]+b*p1[1]+d*p2[1]]);}}
  else if(c.type==='C'){const p0=last,p1=[c.x1,-c.y1],p2=[c.x2,-c.y2],p3=[c.x,-c.y],len=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])+Math.hypot(p2[0]-p1[0],p2[1]-p1[1])+Math.hypot(p3[0]-p2[0],p3[1]-p2[1]),n=Math.max(2,Math.ceil(len/step));for(let i=1;i<=n;i++){const t=i/n,u=1-t;push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}}
  else if(c.type==='Z'){if(ring&&ring.length>2)rings.push(ring);ring=null;}
 }if(ring&&ring.length>2)rings.push(ring);return rings;}
/** Altura de mayúscula (la «H») en unidades de la fuente. */
function capUnits(font){const os2=font.tables?.os2;if(os2?.sCapHeight>0)return os2.sCapHeight;const g=font.charToGlyph('H'),b=g?.getBoundingBox?.();return b&&b.y2>0?b.y2:font.unitsPerEm*.7;}
const shapeCache=new Map();
/**
 * Contornos de un texto. capHeight: alto de la «H» en mm. spacing: separación extra entre letras (mm).
 * joined: une todo en una sola pieza (las letras deben tocarse; usa separación negativa).
 * Devuelve {letters:[{char, shapes:[{outer,holes}]}], width, height} con la esquina inferior izquierda en (0,0).
 */
export function textShapes(fontId,text,{capHeight=100,spacing=0,joined=false}={}){
 const font=getFont(fontId);if(!font)throw Error('Cargando fuente…');
 const key=[fontId,text,capHeight,spacing,joined].join('|');if(shapeCache.has(key))return shapeCache.get(key);
 const size=font.unitsPerEm*capHeight/capUnits(font),glyphs=font.stringToGlyphs(text),letters=[],step=Math.max(.25,capHeight/220);let x=0;
 for(let i=0;i<glyphs.length;i++){const g=glyphs[i],ch=[...text][i]||'';
  const rings=flatten(g.getPath(x,0,size).commands,step).map(r=>clean(r)).filter(r=>r.length>2);
  if(rings.length&&!/\s/.test(ch)){const shapes=unionShapes(rings).filter(s=>Math.abs(area(s.outer))>capHeight*capHeight*.0004);if(shapes.length)letters.push({char:ch,shapes});}
  x+=g.advanceWidth*size/font.unitsPerEm+spacing;if(i+1<glyphs.length)x+=font.getKerningValue(g,glyphs[i+1])*size/font.unitsPerEm;
 }
 if(!letters.length)throw Error('Escribe al menos una letra que exista en la fuente.');
 let out=letters;
 if(joined){const all=unionShapes(letters.flatMap(l=>l.shapes.flatMap(s=>[s.outer,...s.holes.map(h=>h.slice().reverse())])));out=all.map((s,i)=>({char:all.length===1?text.replace(/\s+/g,''):`Pieza ${i+1}`,shapes:[s]}));}
 const b=bounds(out.flatMap(l=>l.shapes));out=out.map(l=>({...l,shapes:l.shapes.map(s=>translateShape(s,-b.x0,-b.y0))}));
 const result={letters:out,width:b.w,height:b.h};if(shapeCache.size>60)shapeCache.clear();shapeCache.set(key,result);return result;
}
/** Texto para grabar dentro de un rectángulo (ajusta el tamaño): formas en mm, centradas en (cx, cy). */
export function textArea(fontId,text,{cx,cy,maxW,maxH,align='center'}){
 if(!String(text||'').trim())return[];
 const base=textShapes(fontId,text,{capHeight:100}),k=Math.min(maxW/Math.max(1e-6,base.width),maxH/Math.max(1e-6,base.height)),w=base.width*k,h=base.height*k,x0=align==='left'?cx:cx-w/2,y0=cy-h/2;
 return base.letters.flatMap(l=>l.shapes).map(s=>({outer:s.outer.map(([x,y])=>[x0+x*k,y0+y*k]),holes:s.holes.map(r=>r.map(([x,y])=>[x0+x*k,y0+y*k]))}));
}
