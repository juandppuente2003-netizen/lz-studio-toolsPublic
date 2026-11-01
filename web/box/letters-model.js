/* LZ Box · Letras 3D (cajas con forma de letra).
   Cada letra: frente y trasera con el contorno de la fuente, y paredes de MDF flexible
   (cortes de bisagra solo donde la pared se curva) que siguen el contorno a una ceja
   del borde. Las paredes se dividen en tramos que caben en la hoja; cada tramo tiene
   pestañas que atraviesan ranuras cerradas (curvas) del frente y la trasera. Sin pegamento. */
import {frame,materialWeb} from './models.js?v=3.5';
import {auditWebs,ringDistance} from './structure.js?v=3.5';
import {textShapes,offsetShapes,getFont,simplifyRing,area,ccw,bounds} from './text-shapes.js?v=1';

export const LETTER_FRONTS=['mdf','acrylic','open'];
export function lettersText(s){return String(s.text??'').replace(/\s+/g,' ').trim().slice(0,24);}
export function lettersShapes(s){return textShapes(s.font||'alfa-slab-one',lettersText(s),{capHeight:+s.height,spacing:+s.letterSpacing||0,joined:s.letterJoin==='joined'});}
/** Medidas exteriores del conjunto (X, Y, Z) según la posición. */
export function lettersDims(s){const t=+s.thickness,Dp=+s.depth;let w=+s.width,h=+s.height;try{if(getFont(s.font||'alfa-slab-one')&&lettersText(s)){const r=lettersShapes(s);w=r.width;h=r.height;}}catch{}return s.letterPose==='lying'?{W:w,D:h,H:Dp,t}:{W:w,D:Dp,H:h,t};}

export function validateLetters(s){
 const errors=[],t=+s.thickness,m=materialWeb(s,t),Dp=+s.depth;
 if(!lettersText(s))errors.push('Escribe el texto de las letras.');
 if(String(s.text??'').length>24)errors.push('Máximo 24 caracteres.');
 if(!getFont(s.font||'alfa-slab-one'))errors.push('Cargando la fuente…');
 if(!(+s.height>=30&&+s.height<=900))errors.push('El alto de letra debe estar entre 30 y 900 mm.');
 if(!(Dp>=2*t+3*m&&Dp<=300))errors.push(`La profundidad debe estar entre ${(2*t+3*m).toFixed(0)} y 300 mm.`);
 if(Dp+2*(+s.gap)>Math.min(+s.sheetW,+s.sheetH))errors.push('La profundidad no cabe en el área de corte.');
 if(!Number.isFinite(+s.letterSpacing)||+s.letterSpacing<-100||+s.letterSpacing>200)errors.push('La separación entre letras debe estar entre −100 y 200 mm.');
 if(!LETTER_FRONTS.includes(s.letterFront||'mdf'))errors.push('Elige el tipo de frente.');
 if(s.measure==='inner')errors.push('Las letras usan medidas exteriores.');
 return errors;
}

/* ---- recorridos cerrados muestreados por longitud de arco ---- */
function loopSamples(ring,step){const n=ring.length,cum=[0];for(let i=1;i<=n;i++){const a=ring[i-1],b=ring[i%n];cum.push(cum[i-1]+Math.hypot(b[0]-a[0],b[1]-a[1]));}const L=cum[n],count=Math.max(12,Math.round(L/step)),pts=[];let j=0;
 for(let k=0;k<count;k++){const s=k*L/count;while(cum[j+1]<s)j++;const a=ring[j],b=ring[(j+1)%n],f=(s-cum[j])/Math.max(1e-12,cum[j+1]-cum[j]);pts.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);}
 const ds=L/count,normals=pts.map((_,i)=>{const a=pts[(i-1+count)%count],b=pts[(i+1)%count],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return[-dy/l,dx/l];});
 const turn=pts.map((p,i)=>{const a=pts[(i-1+count)%count],b=pts[(i+1)%count],u=[p[0]-a[0],p[1]-a[1]],v=[b[0]-p[0],b[1]-p[1]];return Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]));});
 return{pts,normals,turn,L,ds,count};}
const at=(q,i)=>((i%q.count)+q.count)%q.count;
/** Banda de ancho w centrada en el recorrido entre las longitudes s0 y s1 (anillo antihorario). */
function band(q,s0,s1,w){const i0=Math.round(s0/q.ds),i1=Math.round(s1/q.ds),left=[],right=[];for(let i=i0;i<=i1;i++){const k=at(q,i),p=q.pts[k],n=q.normals[k];left.push([p[0]+n[0]*w/2,p[1]+n[1]*w/2]);right.push([p[0]-n[0]*w/2,p[1]-n[1]*w/2]);}return ccw([...left,...right.reverse()]);}
function loopOffset(q,d){return ccw(q.pts.map((p,i)=>[p[0]+q.normals[i][0]*d,p[1]+q.normals[i][1]*d]));}

function wallSegments(q,{maxLen,tab,pitch,minWeb,bendWindow=3}){
 // Inicio en la esquina más cerrada: así el primer corte cae donde el MDF ya dobla.
 let start=0;for(let i=1;i<q.count;i++)if(q.turn[i]>q.turn[start])start=i;
 const n=Math.max(1,Math.ceil(q.L/maxLen)),segs=[];
 for(let k=0;k<n;k++){const s0=start*q.ds+k*q.L/n,s1=start*q.ds+(k+1)*q.L/n,Ls=s1-s0,end=tab/2+minWeb/2+2,tabs=[];
  if(Ls<tab+6)throw Error('Una pared queda demasiado corta para sus pestañas. Aumenta el alto de letra.');
  if(Ls<2*end+tab+2)tabs.push(Ls/2);else{const inner=Math.max(0,Math.floor((Ls-2*end)/pitch));for(let i=0;i<=inner+1;i++)tabs.push(end+(Ls-2*end)*i/(inner+1));}
  // Zonas que doblan: giro acumulado alrededor de cada punto.
  const w=Math.max(1,Math.round(bendWindow/q.ds)),bend=[];for(let u=0;u<=Ls;u+=q.ds){const i=Math.round((s0+u)/q.ds);let sum=0;for(let d=-w;d<=w;d++)sum+=q.turn[at(q,i+d)];bend.push(sum>0.035);}
  segs.push({s0,s1,Ls,tabs:tabs.map(c=>[c-tab/2,c+tab/2]),bend});}
 return segs;
}
/** Bisagra de cortes rectos (kerf) en las zonas que doblan. */
function hingeSlits(seg,{v0,v1,spacing,bridge,tabs,ds}){
 const out=[],mid=(v0+v1)/2;let col=0;
 for(let u=3;u<=seg.Ls-3;u+=spacing,col++){const k=Math.min(seg.bend.length-1,Math.round(u/ds));const near=d=>seg.bend[Math.max(0,Math.min(seg.bend.length-1,k+d))];if(!(near(0)||near(-2)||near(2)))continue;if(tabs.some(([a,b])=>u>a-1.5&&u<b+1.5))continue;
  if(col%2===0){out.push([[u,v0],[u,mid-bridge/2]],[[u,mid+bridge/2],[u,v1]]);}else out.push([[u,v0+bridge],[u,v1-bridge]]);}
 return out;
}
function unionRects(rects){// contorno de rectángulos que se tocan o traslapan en una sola pieza (tira con pestañas)
 const xs=[...new Set(rects.flatMap(r=>[r[0],r[2]]))].sort((a,b)=>a-b),ys=[...new Set(rects.flatMap(r=>[r[1],r[3]]))].sort((a,b)=>a-b),inside=(x,y)=>rects.some(r=>x>r[0]&&x<r[2]&&y>r[1]&&y<r[3]),on=[];
 for(let i=0;i<xs.length-1;i++){on.push([]);for(let j=0;j<ys.length-1;j++)on[i].push(inside((xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2));}
 const edges=new Map(),add=(a,b)=>edges.set(a.join(','),b);
 for(let i=0;i<on.length;i++)for(let j=0;j<on[i].length;j++)if(on[i][j]){const x=xs[i],X=xs[i+1],y=ys[j],Y=ys[j+1];if(!on[i][j-1])add([x,y],[X,y]);if(!on[i+1]?.[j])add([X,y],[X,Y]);if(!on[i][j+1])add([X,Y],[x,Y]);if(!on[i-1]?.[j])add([x,Y],[x,y]);}
 const start=[...edges.keys()][0];let key=start;const p=[];do{p.push(key.split(',').map(Number));key=edges.get(key).join(',');}while(key!==start&&p.length<=edges.size);
 return p.filter((v,i)=>{const a=p[(i+p.length-1)%p.length],b=p[(i+1)%p.length];return Math.abs((v[0]-a[0])*(b[1]-v[1])-(v[1]-a[1])*(b[0]-v[0]))>1e-9;});
}

export function buildLetters(s){
 const t=+s.thickness,m=materialWeb(s,t),fit=+s.clearance,Dp=+s.depth,front=s.letterFront||'mdf',lying=s.letterPose==='lying',e=m+fit+.6,round=Math.max(t,2.5);
 const maxLen=Math.max(+s.sheetW,+s.sheetH)-2*(+s.gap)-(+s.kerf)-2,tab=Math.max(2*m,10),pitch=Math.max(55,6*tab),spacing=Math.max(1.6,.65*t),bridge=Math.max(2.5,t);
 const text=lettersShapes(s),parts=[],skipped=[];let serial=0;
 const placeFrame=(ox,oy,depthAt,explode)=>lying?frame([ox,oy,depthAt],[1,0,0],[0,1,0],[0,0,1],explode):frame([ox,depthAt,oy],[1,0,0],[0,0,1],[0,1,0],explode);
 const ex=v=>lying?[0,0,v]:[0,-v,0];
 for(const letter of text.letters){
  for(const shape of letter.shapes){
   const tag=++serial,b=bounds([shape]),ox=b.x0,oy=b.y0,local=r=>r.map(([x,y])=>[x-ox,y-oy]),label=letter.char.length===1?letter.char:letter.char;
   const outer=local(simplifyRing(shape.outer,.05)),holes=shape.holes.map(h=>local(simplifyRing(h,.05)));
   const core=offsetShapes([{outer,holes}],-(e+t)),centers=offsetShapes(offsetShapes([{outer,holes}],-(e+t/2+round)),round);
   const biggest=Math.max(...letter.shapes.map(x=>Math.abs(area(x.outer))));
   if((!core.length||!centers.length)&&letter.shapes.length>1&&Math.abs(area(shape.outer))<biggest*.35){skipped.push(label);continue;}
   if(!core.length||!centers.length)throw Error(`«${label}» es demasiado delgada para sus paredes: aumenta el alto de letra, usa una fuente más gruesa o reduce el espesor.`);
   const loops=centers.flatMap(c=>[{ring:c.outer,kind:'exterior'},...c.holes.map(h=>({ring:h,kind:'interior'}))]);
   const slots=[],walls=[],plans=[];let holeIndex=0;
   const bb=r=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const[x,y]of r){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return[x0,y0,x1,y1];};
   const fixed=[outer,...holes].map(r=>({r,b:bb(r)})),placed=[];
   const fits=ring=>{const b=bb(ring);for(const o of[...fixed,...placed]){if(o.b[0]-b[2]>m||b[0]-o.b[2]>m||o.b[1]-b[3]>m||b[1]-o.b[3]>m)continue;if(ringDistance(o.r,ring)<m+.02)return false;}return true;};
   for(const loop of loops){const q=loopSamples(loop.ring,.5),segs=wallSegments(q,{maxLen,tab,pitch,minWeb:m});plans.push({loop,q,segs,name:loop.kind==='exterior'?'pared exterior':`pared del hueco ${++holeIndex}`});}
   // Pestañas: se aceptan solo donde la ranura conserva el puente mínimo; si no, se desplazan unos milímetros.
   for(const plan of plans)for(const seg of plan.segs){const lo=tab/2+1,hi=seg.Ls-tab/2-1,ok=[];
    for(const[a0,c0]of seg.tabs){const center=(a0+c0)/2;for(const d of[0,4,-4,8,-8,12,-12,18,-18]){const c=center+d;if(c<lo||c>hi)continue;if(ok.some(([a,b])=>Math.abs((a+b)/2-c)<tab+m+fit))continue;const ring=band(plan.q,seg.s0+c-tab/2-fit/2,seg.s0+c+tab/2+fit/2,t+fit);if(fits(ring)){ok.push([c-tab/2,c+tab/2]);placed.push({r:ring,b:bb(ring)});slots.push(ring);break;}}}
    if(!ok.length)throw Error(`«${label}»: una zona es demasiado delgada para fijar la pared. Aumenta el alto de letra o usa una fuente más gruesa.`);seg.tabs=ok.sort((a,b)=>a[0]-b[0]);}
   for(const{q,segs,name,loop}of plans){
    segs.forEach((seg,k)=>{
     const top=front==='open'?Dp:Dp-t,rects=[[0,t,seg.Ls,top]];
     for(const[a,c]of seg.tabs){rects.push([a,0,c,t]);if(front!=='open')rects.push([a,Dp-t,c,Dp]);}
     const slits=hingeSlits(seg,{v0:t+1.5,v1:top-1.5,spacing,bridge,tabs:seg.tabs,ds:q.ds}),single=segs.length===1;
     const solid=single?{p:loopOffset(q,t/2),holes:[loopOffset(q,-t/2)],z0:t,depth:top-t}:{p:band(q,seg.s0,seg.s1,t),holes:[],z0:t,depth:top-t};
     walls.push({id:`L${tag}-${loop.kind==='exterior'?'wall':'hole'+(plans.filter(p=>p.loop.kind!=='exterior').indexOf(plans.find(p=>p.q===q))+1)}-${k+1}`,name:`${label} · ${name}${segs.length>1?` ${k+1}/${segs.length}`:''} · flexible`,w:seg.Ls,h:Dp,p:unionRects(rects),holes:[],jointHoles:[],slits,solid,role:'letter-wall',letter:tag,frame:placeFrame(ox,oy,0,[0,0,0]),connections:[]});
    });
   }
   const faceHoles=[...holes,...slots],joint=slots.map((_,i)=>holes.length+i),w=Math.max(...outer.map(p=>p[0])),h=Math.max(...outer.map(p=>p[1]));
   const back={id:`L${tag}-back`,name:`${label} · trasera`,w,h,p:outer,holes:faceHoles.map(r=>r.map(v=>[...v])),jointHoles:joint,role:'letter-back',letter:tag,frame:placeFrame(ox,oy,lying?0:Dp-t,ex(-1)),connections:walls.map(p=>p.id)};
   parts.push(back);
   for(const wall of walls){wall.connections=[back.id];parts.push(wall);}
   if(front!=='open'){const f={id:`L${tag}-front`,name:`${label} · frente${front==='acrylic'?' de acrílico':''}`,w,h,p:outer.map(v=>[...v]),holes:faceHoles.map(r=>r.map(v=>[...v])),jointHoles:joint,role:'letter-front',letter:tag,material:front==='acrylic'?'acrylic':undefined,frame:placeFrame(ox,oy,lying?Dp-t:0,ex(1)),connections:walls.map(p=>p.id)};parts.push(f);for(const wall of walls)wall.connections.push(f.id);}
  }
 }
 auditWebs(parts.filter(p=>p.role!=='letter-wall'),m);
 if(skipped.length)for(const p of parts)p.skippedMarks=skipped;
 return parts;
}
export function lettersSummary(parts){const acrylic=parts.filter(p=>p.material==='acrylic').length,walls=parts.filter(p=>p.role==='letter-wall'),slits=walls.reduce((n,p)=>n+p.slits.length,0);return{acrylic,walls:walls.length,slits,letters:new Set(parts.map(p=>p.letter)).size};}
