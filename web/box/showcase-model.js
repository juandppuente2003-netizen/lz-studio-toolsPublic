/* LZ Box · Vitrina coleccionable.
   Cuerpo de la caja con tapa corrediza (mismo mecanismo probado de «Tapa superior corrediza»),
   girado para que la tapa salga por la trasera. El frente lleva una ventana, un acrílico
   capturado por ranuras de los laterales, número + colección y nombre grabados, y una
   figura recortada de una imagen (silueta + grabado) que se encaja en la base. */
import {basicFrames,frame,materialWeb,roundedRect} from './models.js?v=3.5';
import {auditWebs} from './structure.js?v=3.5';
import {textArea,booleanShapes,offsetShapes,unionShapes,ccw,simplifyRing} from './text-shapes.js?v=1';
import {getFigure,figureOutline} from './figure.js?v=1';
import {viewToPanel} from './engrave.js?v=1';

const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const toPanel=(p,X)=>{const d=sub(X,p.frame.o);return[dot(d,p.frame.u),dot(d,p.frame.v),dot(d,p.frame.n)];};
const toWorld=(p,u,v,n)=>p.frame.o.map((x,i)=>x+u*p.frame.u[i]+v*p.frame.v[i]+n*p.frame.n[i]);
function worldBox(p,t){const pts=p.p.flatMap(([u,v])=>[toWorld(p,u,v,0),toWorld(p,u,v,t)]);return[0,1,2].map(i=>[Math.min(...pts.map(q=>q[i])),Math.max(...pts.map(q=>q[i]))]);}
/** Rectángulo del mundo (alineado a ejes) → hueco en una pieza plana. */
function worldSlot(p,box,fit){const corners=[];for(const x of box[0])for(const y of box[1])for(const z of box[2])corners.push(toPanel(p,[x,y,z]));const us=corners.map(c=>c[0]),vs=corners.map(c=>c[1]),u0=Math.min(...us)-fit/2,u1=Math.max(...us)+fit/2,v0=Math.min(...vs)-fit/2,v1=Math.max(...vs)+fit/2;return[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];}
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];

export function validateShowcase(s,{W,D,H,t}){const e=[],m=materialWeb(s,t);if(D<10*m+4*t)e.push(`Aumenta el fondo: al menos ${(10*m+4*t).toFixed(0)} mm.`);if(s.measure==='inner')e.push('La vitrina usa medidas exteriores.');if(W<16*m||H<18*m)e.push(`Aumenta ancho y alto: la vitrina necesita al menos ${(16*m).toFixed(0)} × ${(18*m).toFixed(0)} mm para la ventana y los textos.`);for(const k of['showNumber','showLabel','showName'])if(String(s[k]??'').length>30)e.push('Los textos admiten hasta 30 caracteres.');if(!(+s.figWidth>=20&&+s.figWidth<=95))e.push('El ancho de la figura debe estar entre 20% y 95%.');if(!(+s.figX>=0&&+s.figX<=100))e.push('La posición de la figura debe estar entre 0% y 100%.');return e;}

export function buildShowcase(s,d,box,panel,union){
 const{W,D,H,t}=d,m=materialWeb(s,t),fit=+s.clearance,font=s.font||'alfa-slab-one';
 // 1 · caja abierta con peines + tapa que entra por una ranura de la trasera y corre sobre dos rieles.
 const parts=basicFrames(box(W,D,H,false,s),{W,D,H,t}).map(p=>({...p,holes:[...(p.holes||[])],jointHoles:[...(p.jointHoles||[])]}));
 const by=id=>parts.find(p=>p.id===id),wall=by('front'),base=by('bottom'),left=by('left'),right=by('right'),back=by('back'),c=Math.max(.3,+s.slideGap||.3);
 wall.name='Frente de vitrina · ventana y grabado';back.name='Trasera · ranura de la tapa';base.name='Base · ranura de la figura';left.name='Lateral izquierdo · ranuras';right.name='Lateral derecho · ranuras';
 const baseTop=t,lidZ=H-m-t-c/2,railW=2*m+c,ceiling=lidZ-t-1;
 const lidX0=t+m+c/2,lidW=W-2*t-2*m-c,lidY0=t+c,lidL=D-lidY0;
 back.holes.push(rect(t+m,lidZ-c/2,W-t-m,lidZ+t+c/2));back.jointHoles.push(back.holes.length-1);
 parts.push({id:'sliding-lid',name:'Tapa corrediza · entra por la trasera',w:lidW,h:lidL,p:rect(0,0,lidW,lidL),holes:[roundedRect(lidW/2-14,lidL-20,28,9,4.5)],jointHoles:[],motion:'slide',slideAxis:[0,1,0],slideTravel:lidL*.55,connections:['back','rail-left','rail-right'],frame:frame([lidX0,lidY0,lidZ],[1,0,0],[0,1,0],[0,0,1],[0,0,1])});
 for(const[sideWall,sign]of[[left,-1],[right,1]]){const x0=sign<0?0:W-t-railW,L=D-2*t,tabL=Math.max(2*m,10),tabs=[.28,.72].map(q=>t+L*q),rs=[[sign<0?t:0,0,sign<0?t+railW:railW,L]];
  for(const y of tabs){rs.push(sign<0?[0,y-t-tabL/2,t,y-t+tabL/2]:[railW,y-t-tabL/2,railW+t,y-t+tabL/2]);sideWall.holes.push(worldSlot(sideWall,[[sign<0?0:W-t,sign<0?t:W],[y-tabL/2,y+tabL/2],[lidZ-t,lidZ]],+s.clearance));sideWall.jointHoles.push(sideWall.holes.length-1);}
  parts.push({id:sign<0?'rail-left':'rail-right',name:`Riel ${sign<0?'izquierdo':'derecho'} de la tapa · 2 pestañas`,w:railW+t,h:L,p:union(rs),holes:[],jointHoles:[],connections:[sideWall.id],frame:frame([sign<0?0:W-t-railW,t,lidZ-t],[1,0,0],[0,1,0],[0,0,1],[sign,0,0])});}
 // 2 · ventana con bandas para los textos.
 const bandTop=Math.max(4.2*m,H*.2),bandBottom=Math.max(3.4*m,H*.14),side=Math.max(2*m+t,W*.09),win={x0:side,x1:W-side,z0:Math.max(bandBottom,baseTop+m),z1:Math.min(H-bandTop,ceiling-1.2*m)};
 if(win.x1-win.x0<6*m||win.z1-win.z0<6*m)throw Error('La ventana queda muy chica: aumenta el ancho o el alto de la vitrina.');
 const r=Math.min(8,(win.x1-win.x0)/6);wall.engraveFace=0;wall.holes.push(ccw(roundedRect(win.x0,win.z0,win.x1-win.x0,win.z1-win.z0,r).map(p=>viewToPanel(wall,p))));
 // 3 · acrílico capturado por los laterales, detrás del frente.
 let pane=null;
 for(let y=t+m+fit;y<D/2&&!pane;y+=1.5){
  const zb=baseTop+.5,zt=Math.min(ceiling,win.z1+1.5*m)-.5,tabH=Math.max(2*m,8),tabs=[.28,.72].map(q=>zb+(zt-zb)*q),cand={id:'acrylic-window',name:'Acrílico de la ventana · pestañas laterales',material:'acrylic',w:W,h:zt-zb,holes:[],jointHoles:[],connections:['left','right'],frame:frame([0,y,zb],[1,0,0],[0,0,1],[0,1,0],[0,-1,0])};
  const rs=[[t,0,W-t,zt-zb]];for(const z of tabs){rs.push([0,z-zb-tabH/2,t,z-zb+tabH/2],[W-t,z-zb-tabH/2,W,z-zb+tabH/2]);}cand.p=union(rs);
  const trial=[left,right].map(w=>({...w,holes:[...w.holes,...tabs.map(z=>worldSlot(w,[[w===left?0:W-t,w===left?t:W],[y,y+t],[z-tabH/2,z+tabH/2]],fit))]}));
  try{auditWebs(trial,m);for(let i=0;i<2;i++){const w=[left,right][i],add=trial[i].holes.slice(w.holes.length);for(const h of add){w.holes.push(h);w.jointHoles.push(w.holes.length-1);}w.connections=[...(w.connections||[]),'acrylic-window'];}pane=cand;}catch{}
 }
 if(!pane)throw Error('No queda lugar para las ranuras del acrílico en los laterales: aumenta el fondo o el alto.');
 parts.push(pane);const paneBack=pane.frame.o[1]+t;
 // 4 · textos grabados en el frente (vista desde afuera: x a la derecha, z arriba).
 const areas=[],cy=H-bandTop/2,rad=Math.min(bandTop*.36,W*.12),cx=side+rad,toWall=sh=>({outer:ccw(sh.outer.map(p=>viewToPanel(wall,p))),holes:sh.holes.map(h=>ccw(h.map(p=>viewToPanel(wall,p))))});
 const num=String(s.showNumber??'').trim(),label=String(s.showLabel??'').trim(),name=String(s.showName??'').trim();
 try{
  if(num){const circle={outer:Array.from({length:72},(_,i)=>[cx+rad*Math.cos(i*Math.PI/36),cy+rad*Math.sin(i*Math.PI/36)]),holes:[]},digits=textArea(font,num,{cx,cy,maxW:rad*1.25,maxH:rad*.95});areas.push(...booleanShapes([circle],digits,'difference'));}
  if(label){const x0=num?cx+rad+Math.max(3,rad*.35):side,maxW=W-side-x0;if(maxW>2*m)areas.push(...textArea(font,label,{cx:num?x0:W/2,cy,maxW,maxH:bandTop*.42,align:num?'left':'center'}));}
  if(name)areas.push(...textArea(font,name,{cx:W/2,cy:bandBottom/2+Math.min(bandBottom*.08,2),maxW:W-2*side,maxH:bandBottom*.46}));
 }catch(e){if(!/Cargando/.test(e.message))throw e;}
 if(areas.length)wall.engrave={areas:areas.map(toWall),images:[]};
 // 5 · figura recortada de la imagen, de pie sobre la base.
 const fig=getFigure(s);
 if(fig){
  const interior=W-2*t-2*m,widthMm=interior*(+s.figWidth)/100,o=figureOutline(fig,widthMm),maxH=Math.min(ceiling,win.z1)-baseTop-m,k=Math.min(1,maxH/Math.max(1,o.height)),fw=widthMm*k,fh=o.height*k;
  if(fw>=6*m&&fh>=6*m){
   const ring=simplifyRing(o.ring.map(([x,y])=>[x*k,y*k]),.15),grown=offsetShapes([{outer:ring,holes:[]}],.4),foot={outer:rect(fw*.2,0,fw*.8,m+1.2),holes:[]},shape=unionShapes([...grown.map(g=>g.outer),foot.outer]);
   const main=shape.sort((a,b)=>Math.abs(b.outer.length)-Math.abs(a.outer.length))[0],tabW=Math.max(3*m,fw*.22),gx=Math.min(...main.outer.map(p=>p[0])),gy=0;
   const outline=unionShapes([main.outer,rect(fw/2-tabW/2,-t,fw/2+tabW/2,1)])[0].outer.map(([x,y])=>[x-gx,y+t]),w=Math.max(...outline.map(p=>p[0])),h=Math.max(...outline.map(p=>p[1]));
   const xCenter=t+m+fw/2+(interior-fw)*(+s.figX)/100,y=paneBack+Math.max(m,(D-t-paneBack-t)*.35),x0=xCenter-fw/2-(gx<0?-gx:0);
   const figure={id:'figure',name:'Figura · silueta grabada con pestaña',w,h,p:outline,holes:[],jointHoles:[],connections:['bottom'],role:'figure',frame:frame([x0,y,baseTop-t],[1,0,0],[0,0,1],[0,1,0],[0,0,1]),engraveFace:0};
   if(fig.png)figure.engrave={areas:[],images:[{x:(o.image.x)*k-gx,y:(o.image.y)*k+t,w:o.image.w*k,h:o.image.h*k,href:fig.png}]};
   const slot=worldSlot(base,[[x0-gx+fw/2-tabW/2,x0-gx+fw/2+tabW/2],[y,y+t],[baseTop-t,baseTop]],fit);
   try{auditWebs([{...base,holes:[...base.holes,slot]}],m);base.holes.push(slot);base.jointHoles=[...(base.jointHoles||[]),base.holes.length-1];parts.push(figure);}catch{}
  }
 }
 auditWebs(parts.filter(p=>!p.motion),m);
 return parts;
}
