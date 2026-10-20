/* LZ Studio · optimización de cortes compartidos (v3.5).
   Trabaja sobre la geometría real que se exporta (contornos ya colocados en
   la hoja y compensados por kerf). Elimina tramos repetidos —idénticos,
   invertidos o superpuestos en parte— para que el láser recorra cada tramo
   una sola vez, sin agregar líneas nuevas ni unir piezas.
   Reglas:
   - Solo se comparan trayectorias de la misma operación (corte, marcado,
     grabado) y del mismo número de pasadas. Una pasada doble declarada
     (passes:2) es intencional y se conserva.
   - Un cruce puntual no es un tramo compartido: solo se divide un segmento
     cuando otro es colineal y se superpone con él.
   - La tolerancia es pequeña (0,01 mm por omisión) y configurable; líneas
     paralelas más separadas que la tolerancia nunca se fusionan.
   - Las trayectorias que no pierden ningún tramo se conservan tal cual
     (mismo anillo cerrado); las demás se encadenan en polilíneas abiertas
     o cerradas que recorren solo segmentos existentes. */

export const DEFAULT_TOLERANCE=0.01;
export const OPERATIONS={cut:{label:'Corte',layer:'CUT',color:'#ff0000'},mark:{label:'Marcado',layer:'MARK',color:'#0000ff'},engrave:{label:'Grabado',layer:'ENGRAVE',color:'#000000'}};

const dist=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const opOf=p=>OPERATIONS[p.op]?p.op:'cut';
// Same operation, passes and layer: tramos de capas distintas nunca se fusionan.
const groupKey=p=>`${opOf(p)}|${Math.max(1,Math.round(+p.passes||1))}|${p.layer||OPERATIONS[opOf(p)].layer}`;

/** Longitud de una trayectoria (sin multiplicar por pasadas). */
export function pathLength(path){const r=path.points;let L=0;for(let i=1;i<r.length;i++)L+=dist(r[i-1],r[i]);if(path.closed&&r.length>2)L+=dist(r[r.length-1],r[0]);return L;}

/** Convierte las piezas colocadas (layout/arrange) en trayectorias de corte, en el mismo orden que el exportador original. */
export function pathsFromItems(items){
 const out=[];
 for(const p of items){
  out.push({points:p.points,closed:true,op:'cut',passes:1,parts:[p.id],role:'outer'});
  (p.holePoints||[]).forEach(r=>out.push({points:r,closed:true,op:'cut',passes:1,parts:[p.id],role:'hole'}));
 }
 return out;
}

/** Índice espacial simple por celdas para puntos y segmentos. */
class Grid{
 constructor(cell){this.cell=Math.max(cell,1e-9);this.map=new Map();}
 key(i,j){return i+','+j;}
 cellOf(v){return Math.floor(v/this.cell);}
 add(minX,minY,maxX,maxY,val){const c=this.cell,i0=Math.floor(minX/c),i1=Math.floor(maxX/c),j0=Math.floor(minY/c),j1=Math.floor(maxY/c);for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const k=this.key(i,j);let a=this.map.get(k);if(!a)this.map.set(k,a=[]);a.push(val);}}
 query(minX,minY,maxX,maxY,fn){const c=this.cell,i0=Math.floor(minX/c),i1=Math.floor(maxX/c),j0=Math.floor(minY/c),j1=Math.floor(maxY/c);for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const a=this.map.get(this.key(i,j));if(a)for(const v of a)fn(v);}}
}

/** Distancia de un punto a la recta (no al segmento) a→b, y parámetro u en mm a lo largo de a→b. */
function lineInfo(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(L<1e-12)return{d:dist(p,a),u:0,L};const ux=dx/L,uy=dy/L,px=p[0]-a[0],py=p[1]-a[1];return{d:Math.abs(px*uy-py*ux),u:px*ux+py*uy,L};}
/** Distancia de un punto a un segmento. */
function segDist(p,a,b){const {d,u,L}=lineInfo(p,a,b);if(u<0)return dist(p,a);if(u>L)return dist(p,b);return d;}

/**
 * Optimiza trayectorias.
 * @param {Array} paths  [{points:[[x,y]...], closed, op, passes, parts:[id], role:'outer'|'hole'}]
 * @param {Object} options {tolerance, order:true}
 * @returns {{paths, stats, removed, shared}}
 */
export function optimizeCuts(paths,options={}){
 const tol=Math.max(1e-6,+options.tolerance||DEFAULT_TOLERANCE);
 // 1 · vértices únicos (agrupados dentro de la tolerancia)
 const verts=[],vgrid=new Grid(tol*4);
 const vid=p=>{let best=-1,bd=Infinity;vgrid.query(p[0]-tol,p[1]-tol,p[0]+tol,p[1]+tol,i=>{const d=dist(verts[i],p);if(d<=tol&&d<bd){bd=d;best=i;}});if(best>=0)return best;verts.push([p[0],p[1]]);vgrid.add(p[0],p[1],p[0],p[1],verts.length-1);return verts.length-1;};
 // 2 · segmentos por trayectoria
 const segs=[];
 paths.forEach((path,pi)=>{const r=path.points||[],n=r.length;if(n<2)return;const ids=r.map(vid),g=groupKey(path),m=path.closed&&n>2?n:n-1;for(let i=0;i<m;i++){const a=ids[i],b=ids[(i+1)%n];if(a===b)continue;segs.push({a,b,g,path:pi,splits:null});}});
 // 3 · dividir en las superposiciones colineales
 const sgrid=new Grid(Math.max(5,tol*100));
 segs.forEach((s,i)=>{const A=verts[s.a],B=verts[s.b];sgrid.add(Math.min(A[0],B[0])-tol,Math.min(A[1],B[1])-tol,Math.max(A[0],B[0])+tol,Math.max(A[1],B[1])+tol,i);});
 const addSplit=(s,v)=>{if(v===s.a||v===s.b)return;const A=verts[s.a],B=verts[s.b],{d,u,L}=lineInfo(verts[v],A,B);if(d<=tol&&u>tol&&u<L-tol){(s.splits||(s.splits=new Map())).set(v,u);}};
 segs.forEach((s,i)=>{const A=verts[s.a],B=verts[s.b];const seen=new Set();
  sgrid.query(Math.min(A[0],B[0])-tol,Math.min(A[1],B[1])-tol,Math.max(A[0],B[0])+tol,Math.max(A[1],B[1])+tol,j=>{if(j<=i||seen.has(j))return;seen.add(j);const t=segs[j];if(t.g!==s.g)return;const C=verts[t.a],D=verts[t.b];
   // colineales: los cuatro extremos a menos de tol de la recta del otro
   if(lineInfo(C,A,B).d>tol||lineInfo(D,A,B).d>tol||lineInfo(A,C,D).d>tol||lineInfo(B,C,D).d>tol)return;
   addSplit(s,t.a);addSplit(s,t.b);addSplit(t,s.a);addSplit(t,s.b);});});
 const subs=[];
 for(const s of segs){if(!s.splits){subs.push({a:s.a,b:s.b,g:s.g,path:s.path});continue;}const order=[...s.splits].sort((x,y)=>x[1]-y[1]).map(x=>x[0]);let prev=s.a;for(const v of [...order,s.b]){if(v!==prev)subs.push({a:prev,b:v,g:s.g,path:s.path});prev=v;}}
 // 4 · eliminar duplicados (se conserva la copia de la trayectoria con menor índice)
 const keep=new Map(),removed=[],sharedKeys=new Set();
 for(const s of subs){const k=s.g+'|'+Math.min(s.a,s.b)+'|'+Math.max(s.a,s.b);const first=keep.get(k);if(!first){keep.set(k,s);continue;}
  s.removed=true;const samePart=(paths[first.path].parts||[]).some(id=>(paths[s.path].parts||[]).includes(id));removed.push({a:verts[s.a],b:verts[s.b],op:paths[s.path].op||'cut',length:dist(verts[s.a],verts[s.b]),parts:[...(paths[first.path].parts||[]),...(paths[s.path].parts||[])],shared:!samePart});if(!samePart)sharedKeys.add(k);}
 const touched=new Set(subs.filter(s=>s.removed).map(s=>s.path));
 // 5 · reconstruir trayectorias
 const out=[];
 paths.forEach((p,pi)=>{if(!touched.has(pi)&&(p.points||[]).length>=2)out.push({...p,points:p.points.map(v=>[v[0],v[1]]),parts:[...(p.parts||[])],origin:[pi]});});
 const byGroup=new Map();for(const s of subs)if(!s.removed&&touched.has(s.path)){let a=byGroup.get(s.g);if(!a)byGroup.set(s.g,a=[]);a.push(s);}
 for(const [g,list] of byGroup){const [op,passes,layer]=g.split('|');
  const adj=new Map();list.forEach((s,i)=>{for(const v of[s.a,s.b]){let a=adj.get(v);if(!a)adj.set(v,a=[]);a.push(i);}});
  const used=new Array(list.length).fill(false);
  const degree=v=>(adj.get(v)||[]).filter(i=>!used[i]).length;
  const starts=()=>{for(const [v,a] of adj)if(a.some(i=>!used[i])&&degree(v)%2===1)return v;for(const [v,a] of adj)if(a.some(i=>!used[i]))return v;return null;};
  let start;
  while((start=starts())!==null){const chain=[start],seg=[];let cur=start,prevPath=null;
   for(;;){const cand=(adj.get(cur)||[]).filter(i=>!used[i]);if(!cand.length)break;const pick=cand.find(i=>list[i].path===prevPath)??cand[0];used[pick]=true;const s=list[pick];cur=s.a===cur?s.b:s.a;chain.push(cur);seg.push(s);prevPath=s.path;}
   const closed=chain.length>3&&chain[0]===chain[chain.length-1];if(closed)chain.pop();
   const origin=[...new Set(seg.map(s=>s.path))],parts=[...new Set(origin.flatMap(i=>paths[i].parts||[]))],role=origin.every(i=>paths[i].role==='hole')?'hole':'outer';
   out.push({points:simplify(chain.map(v=>verts[v]),closed,tol),closed,op,layer,passes:+passes,parts,role,origin,rebuilt:true});
  }
 }
 const result=options.order===false?out:orderPaths(out);
 const shared=[...sharedKeys].map(k=>{const s=keep.get(k);return{a:verts[s.a],b:verts[s.b],length:dist(verts[s.a],verts[s.b])};});
 return {paths:result,removed,shared,stats:cutStats(paths,result,removed,shared),tolerance:tol};
}

/** Quita vértices intermedios que quedaron sobre una recta al dividir tramos. */
function simplify(r,closed,tol){
 if(r.length<3)return r.map(v=>[v[0],v[1]]);let pts=r.slice(),changed=true;
 while(changed&&pts.length>(closed?3:2)){changed=false;const n=pts.length;for(let i=closed?0:1;i<(closed?n:n-1);i++){const a=pts[(i-1+n)%n],b=pts[i],c=pts[(i+1)%n],{d,u,L}=lineInfo(b,a,c);if(d<=tol*0.1&&u>0&&u<L){pts.splice(i,1);changed=true;break;}}}
 return pts.map(v=>[v[0],v[1]]);
}

const startOf=p=>p.points[0],endOf=p=>p.closed?p.points[0]:p.points[p.points.length-1];

/**
 * Ordena para reducir desplazamientos: primero los detalles interiores
 * (agujeros y ranuras) y después los contornos que liberan las piezas.
 * Vecino más cercano; los anillos cerrados pueden empezar en su vértice más
 * próximo y las polilíneas abiertas pueden recorrerse al revés.
 */
export function orderPaths(paths,origin=[0,0]){
 const phases=[paths.filter(p=>p.role==='hole'),paths.filter(p=>p.role!=='hole')],out=[];let at=origin;
 for(const phase of phases){const rest=phase.slice();
  while(rest.length){let best=null;
   rest.forEach((p,i)=>{if(p.closed){p.points.forEach((v,k)=>{const d=dist(at,v);if(!best||d<best.d)best={d,i,k,rev:false};});}else{const d0=dist(at,startOf(p)),d1=dist(at,endOf(p));if(!best||d0<best.d)best={d:d0,i,k:0,rev:false};if(d1<best.d)best={d:d1,i,k:0,rev:true};}});
   const p=rest.splice(best.i,1)[0];let pts=p.points;if(p.closed&&best.k)pts=[...pts.slice(best.k),...pts.slice(0,best.k)];if(best.rev)pts=pts.slice().reverse();const q={...p,points:pts};out.push(q);at=endOf(q);}
 }
 return out;
}

/** Recorrido en vacío entre trayectorias, en el orden dado, desde el origen. */
export function travelLength(paths,origin=[0,0]){let at=origin,L=0;for(const p of paths){if(!p.points.length)continue;L+=dist(at,startOf(p));at=endOf(p);}return L;}

export function cutStats(before,after,removed=[],shared=[]){
 const byOp=list=>{const o={};for(const p of list){const op=OPERATIONS[p.op]?p.op:'cut';o[op]=(o[op]||0)+pathLength(p)*Math.max(1,Math.round(+p.passes||1));}return o;};
 const b=byOp(before),a=byOp(after),total=o=>Object.values(o).reduce((x,y)=>x+y,0),lb=total(b),la=total(a);
 return {before:lb,after:la,saved:lb-la,percent:lb>0?100*(lb-la)/lb:0,byOpBefore:b,byOpAfter:a,pathsBefore:before.length,pathsAfter:after.length,removedCount:removed.length,removedLength:removed.reduce((x,r)=>x+r.length,0),sharedCount:shared.length,sharedLength:shared.reduce((x,r)=>x+r.length,0),travelBefore:travelLength(before),travelAfter:travelLength(after)};
}

/**
 * Estimación orientativa de tiempo. No considera aceleraciones, esquinas,
 * tiempo de perforación ni la configuración real de la máquina.
 */
export function estimateTime(stats,{cutSpeed=10,travelSpeed=100}={}){
 const t=(cut,travel)=>cut/Math.max(.1,cutSpeed)+travel/Math.max(.1,travelSpeed);
 return {before:t(stats.before,stats.travelBefore),after:t(stats.after,stats.travelAfter),cutSpeed,travelSpeed};
}

/**
 * Comprueba que la optimización no pierde ni inventa cortes:
 * cada tramo original queda cubierto por una trayectoria final de la misma
 * operación, y cada tramo final está sobre un tramo original.
 */
export function verifyOptimization(before,after,tolerance=DEFAULT_TOLERANCE){
 const tol=Math.max(1e-6,tolerance)*2+1e-6,problems=[];
 const segsOf=list=>{const out=[];list.forEach(p=>{const r=p.points,n=r.length,m=p.closed&&n>2?n:n-1,g=groupKey(p);for(let i=0;i<m;i++){const a=r[i],b=r[(i+1)%n];if(dist(a,b)>1e-9)out.push({a,b,g});}});return out;};
 const index=segs=>{const grid=new Grid(10);segs.forEach((s,i)=>grid.add(Math.min(s.a[0],s.b[0])-tol,Math.min(s.a[1],s.b[1])-tol,Math.max(s.a[0],s.b[0])+tol,Math.max(s.a[1],s.b[1])+tol,i));return grid;};
 const covered=(from,to,label)=>{const grid=index(to);
  for(const s of from){const L=dist(s.a,s.b),n=Math.max(2,Math.ceil(L/0.5));
   for(let k=0;k<=n;k++){const t=k/n,p=[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];let ok=false;grid.query(p[0],p[1],p[0],p[1],i=>{if(!ok&&to[i].g===s.g&&segDist(p,to[i].a,to[i].b)<=tol)ok=true;});
    if(!ok){problems.push(`${label} en (${p[0].toFixed(3)}, ${p[1].toFixed(3)})`);break;}}
   if(problems.length>20)break;}};
 const A=segsOf(before),B=segsOf(after);
 covered(A,B,'Tramo original sin cortar');covered(B,A,'Tramo final que no existía');
 return {ok:!problems.length,problems};
}

/** Optimiza una hoja colocada y verifica el resultado antes de usarlo en un archivo. */
export function optimizeSheet(items,tolerance=DEFAULT_TOLERANCE){
 const paths=pathsFromItems(items),r=optimizeCuts(paths,{tolerance}),v=verifyOptimization(paths,r.paths,r.tolerance);
 if(!v.ok)throw Error(`La optimización no superó la verificación (${v.problems[0]}). Exporta sin optimizar.`);
 return r;
}

/** Vista previa SVG: trayectorias finales, tramos compartidos y duplicados eliminados dentro de una pieza. */
export function previewSVG(result,s,{numbers=false}={}){
 const W=+s.sheetW,H=+s.sheetH,w=Math.max(W,H)/450,f=n=>Math.round(n*100)/100,d=p=>'M'+p.points.map(v=>f(v[0])+' '+f(v[1])).join('L')+(p.closed?'Z':'');
 const seg=(r,cls)=>`<line class="${cls}" x1="${f(r.a[0])}" y1="${f(r.a[1])}" x2="${f(r.b[0])}" y2="${f(r.b[1])}"/>`;
 const starts=numbers?result.paths.map((p,i)=>`<circle class="opt-start" cx="${f(p.points[0][0])}" cy="${f(p.points[0][1])}" r="${f(w*2.2)}"><title>${i+1}</title></circle>`).join(''):'';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vista previa de trayectorias optimizadas" style="--w:${f(w)}px"><rect class="opt-sheet" x="0" y="0" width="${W}" height="${H}"/><g class="opt-paths" stroke-width="${f(w)}">${result.paths.map(p=>`<path class="opt-path${p.role==='hole'?' is-hole':''}" d="${d(p)}"/>`).join('')}</g><g class="opt-shared-g" stroke-width="${f(w*3)}">${result.shared.map(r=>seg(r,'opt-shared')).join('')}</g><g class="opt-dup-g" stroke-width="${f(w*3)}">${result.removed.filter(r=>!r.shared).map(r=>seg(r,'opt-dup')).join('')}</g>${starts}</svg>`;
}
