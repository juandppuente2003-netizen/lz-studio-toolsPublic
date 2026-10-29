import {frame,materialWeb} from './models.js?v=3.5';
import {auditWebs} from './structure.js?v=3.5';
import {applyPattern} from './patterns.js?v=3.5';
/* Altar de muertos escalonado: dos laterales con perfil de escalera y, entre ellos,
   contrahuellas, escalones y un retablo trasero. Cada pieza atraviesa ranuras cerradas
   de ambos laterales (pestañas pasantes). Coordenadas en mm: X ancho, Y fondo (0 = frente), Z alto. */

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const sample=(a,b,n,fn)=>Array.from({length:n+1},(_,i)=>fn(a+(b-a)*i/n));

/** Medidas derivadas. bodyH es el alto de los escalones; el retablo suma archRise. */
export function altarSpec(s,{W,D,H,t}){
 const m=materialWeb(s,t),fit=+s.clearance,N=Math.round(+s.levels),archRise=+s.archRise,bodyH=H-archRise,e=m+fit,run=D/N,r=bodyH/N;
 return{m,fit,N,archRise,bodyH,e,run,r,W,D,t,backY:D-e-t};
}
/** Pestañas a lo largo del tramo útil [lo,hi] (coordenadas del lateral). */
function tabs(lo,hi,m){const L=hi-lo;if(L<2*m-1e-9)return null;const w=Math.min(Math.max(2*m,L*.28),40);if(L>=2*w+3*m){const c=[lo+L*.25,lo+L*.75];return c.map(x=>[Math.max(lo,x-w/2),Math.min(hi,x+w/2)]);}const c=(lo+hi)/2,h=Math.min(w,L)/2;return[[c-h,c+h]];}

/** Piezas que unen ambos laterales: posición en el lateral (u = Y, v = Z) y tramo útil para pestañas. */
export function altarMembers(q){
 const{N,e,run,r,bodyH,t,m,fit,D,backY}=q,out=[];
 for(let i=0;i<N;i++){
  const y=i*run+e,zb=i?i*r-e:0,zt=(i+1)*r-e-t;
  out.push({id:'riser-'+i,name:`Contrahuella ${i+1}`,axis:'z',fixed:y,from:zb,to:zt,lo:zb+(i?m+fit:m+fit/2)+fit/2,hi:zt-m-fit-fit/2});
  const top=i===N-1,z=(i+1)*r-e-t,y0=i*run+e,y1=top?backY:(i+1)*run+e+t;
  out.push({id:'tread-'+i,name:top?'Escalón superior · ofrenda':`Escalón ${i+1}`,axis:'y',fixed:z,from:y0,to:y1,lo:y0+fit/2,hi:y1-fit/2-(top?m+fit:0)});
 }
 out.push({id:'back',name:'Retablo trasero',axis:'z',fixed:backY,from:0,to:bodyH,lo:m+fit,hi:bodyH-e-t-m-fit-fit/2});
 return out;
}

export function validateAltar(s,{W,D,H,t}){
 const errors=[],q=altarSpec(s,{W,D,H,t}),{m,N,archRise,bodyH,run,r}=q;
 if(!Number.isInteger(+s.levels)||N<2||N>7)errors.push('El altar admite de 2 a 7 niveles.');
 if(!Number.isFinite(archRise)||(archRise!==0&&(archRise<6*m||archRise>600)))errors.push(`La altura del retablo debe ser 0 (sin arco) o de ${(6*m).toFixed(0)} a 600 mm.`);
 if(s.measure==='inner')errors.push('El altar usa medidas exteriores.');
 if(W<14*m)errors.push(`Aumenta el ancho: el altar necesita al menos ${(14*m).toFixed(0)} mm.`);
 if(errors.length)return errors;
 if(r-t<4*m+2*q.fit)errors.push(`Cada nivel queda de ${r.toFixed(1)} mm de alto: aumenta el alto o usa menos niveles (mínimo ${(4*m+t).toFixed(0)} mm por nivel).`);
 if(run-t<4*m)errors.push(`Cada escalón queda de ${run.toFixed(1)} mm de fondo: aumenta el fondo o usa menos niveles.`);
 if(q.backY-((N-1)*run+q.e)<5*m)errors.push('Aumenta el fondo: el escalón superior necesita espacio delante del retablo.');
 if(!errors.length)for(const p of altarMembers(q))if(!tabs(p.lo,p.hi,m))errors.push(`«${p.name}» no tiene espacio para sus pestañas. Aumenta el alto o el fondo, o usa menos niveles.`);
 return [...new Set(errors)];
}

export function buildAltar(s,d){
 const{W,t}=d,q=altarSpec(s,d),{m,fit,N,archRise,bodyH,run,r,D,backY}=q,parts=[],slots=[];
 // Lateral: perfil de escalera (u = Y, v = Z).
 const profile=[[0,0],[D,0],[D,bodyH]];for(let i=N-1;i>=1;i--)profile.push([i*run,(i+1)*r],[i*run,i*r]);profile.push([0,r]);
 const members=altarMembers(q);
 for(const p of members){
  const spans=tabs(p.lo,p.hi,m);if(!spans)throw Error(`«${p.name}» no tiene espacio para sus pestañas.`);p.spans=spans;
  for(const[a,b]of spans)slots.push(p.axis==='z'?rect(p.fixed-fit/2,a-fit/2,t+fit,b-a+fit):rect(a-fit/2,p.fixed-fit/2,b-a+fit,t+fit));
 }
 for(const[side,x,sign]of[['left',0,-1],['right',W-t,1]])parts.push({id:side,name:side==='left'?'Lateral izquierdo · escalera':'Lateral derecho · escalera',w:D,h:bodyH,p:profile.map(v=>[...v]),holes:slots.map(h=>h.map(v=>[...v])),jointHoles:slots.map((_,i)=>i),connections:members.map(p=>p.id),frame:frame([x,0,0],[0,1,0],[0,0,1],[1,0,0],[sign,0,0])});
 // Pieza entre laterales: cuerpo [t, W-t] y pestañas que llegan a las caras exteriores.
 const outline=(L,spans,top)=>{const right=spans.flatMap(([a,b])=>[[W-t,a],[W,a],[W,b],[W-t,b]]),left=spans.slice().reverse().flatMap(([a,b])=>[[t,b],[0,b],[0,a],[t,a]]);return[[t,0],[W-t,0],...right,...(top||[[W-t,L],[t,L]]),...left];};
 for(const p of members){
  const L=p.to-p.from,spans=p.spans.map(([a,b])=>[a-p.from,b-p.from]);let poly,holes=[],extra={};
  if(p.id==='back'&&archRise>0){
   const shoulder=archRise*.42,apex=bodyH+archRise,arc=sample(0,Math.PI,64,a=>[W/2+W/2*Math.cos(a),bodyH+shoulder+(apex-bodyH-shoulder)*Math.sin(a)]);
   poly=outline(L,spans,[[W-t,bodyH],[W,bodyH],...arc.slice(0,-1),[0,bodyH+shoulder],[0,bodyH],[t,bodyH]]);
  }else poly=outline(L,spans);
  const f=p.axis==='z'?(p.id==='back'?frame([0,backY,0],[1,0,0],[0,0,1],[0,1,0],[0,1,0]):frame([0,p.fixed,p.from],[1,0,0],[0,0,1],[0,1,0],[0,-1,0])):frame([0,p.from,p.fixed],[1,0,0],[0,1,0],[0,0,1],[0,0,1]);
  const piece={id:p.id,name:p.name+' · pestañas pasantes',w:W,h:Math.max(...poly.map(v=>v[1])),p:poly,holes,jointHoles:[],connections:['left','right'],frame:f,...extra};
  parts.push(piece);
 }
 decorateAltar(s,parts,q);
 auditWebs(parts,m);return parts;
}

function fitsHole(p,h,m){try{auditWebs([{...p,holes:[...p.holes,h]}],m);p.holes.push(h);return true;}catch{return false;}}
/** Figura de calado con el estilo elegido (mismas formas que los patrones generales), radio R. */
function motif(style,cx,cy,R,k=0){if(style==='diamond')return[[cx,cy-R],[cx+R,cy],[cx,cy+R],[cx-R,cy]];
 return Array.from({length:36},(_,i)=>{const a=i*2*Math.PI/36,r=style==='quatrefoil'?R*(.79+.21*Math.cos(4*a)):style==='petals'?R*(.78+.22*Math.cos(6*a)):R,angle=style==='arches'?(k%2?Math.PI/4:-Math.PI/4):0,u=r*Math.cos(a),v=r*Math.sin(a)*(style==='arches'?.48:1);return[cx+u*Math.cos(angle)-v*Math.sin(angle),cy+u*Math.sin(angle)+v*Math.cos(angle)];});}
/** Papel picado: una hilera de calados que sigue el arco y los hombros del retablo. */
function archBand(s,back,q){
 const{m,W,bodyH,archRise}=q,style=s.pattern==='legacy'||!s.pattern?'petals':s.pattern,shoulder=archRise*.42,R=Math.max(m*.9,Math.min(11,archRise*.075,W*.035)),d=m+R+1.5,cx=W/2,cz=bodyH+shoulder,a=W/2-d,b=archRise-shoulder-d;
 if(a<=R||b<=R)return 0;
 const path=[[d,bodyH+d],...sample(Math.PI,0,90,t=>[cx+a*Math.cos(t),cz+b*Math.sin(t)]),[W-d,bodyH+d]];
 const lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
 const total=lengths.at(-1),pitch=2*R+m*1.3,count=Math.max(1,Math.floor(total/pitch)),step=total/count;let added=0;
 for(let k=0;k<=count;k++){const L=k*step;let i=lengths.findIndex(x=>x>=L);if(i<1)i=1;const f=(L-lengths[i-1])/Math.max(1e-9,lengths[i]-lengths[i-1]),x=path[i-1][0]+(path[i][0]-path[i-1][0])*f,z=path[i-1][1]+(path[i][1]-path[i-1][1])*f;
  if(fitsHole(back,motif(style,x,z,R,k),m))added++;}
 back.decorativeCount=(back.decorativeCount||0)+added;return added;
}
/** Calados opcionales: ventana para foto y papel picado en el retablo; fila de calados en cada contrahuella. */
function decorateAltar(s,parts,q){
 const{m,t,bodyH,archRise,W}=q,back=parts.find(p=>p.id==='back');
 if(s.decoration&&archRise>0){back.decorationStart=back.holes.length;archBand(s,back,q);}
 if(s.altarPhoto!==false&&archRise>0){
  const pw=Math.min(W*.34,archRise*.72),ph=Math.min(archRise-3*m,pw*1.25);
  if(pw>=6*m&&ph>=6*m){const cx=W/2,z0=bodyH+Math.max(m,archRise*.08),R=pw/2,straight=Math.max(0,ph-R),arc=sample(0,Math.PI,40,a=>[cx+R*Math.cos(a),z0+straight+R*Math.sin(a)]),win=[[cx-R,z0],[cx+R,z0],...(straight>1e-6?arc:arc.slice(1,-1))];
   // La ventana tiene prioridad: si choca con el papel picado, se retiran los calados que estorban.
   if(!fitsHole(back,win,m)&&s.decoration){const keep=back.holes;back.holes=[];if(fitsHole(back,win,m)){for(const h of keep)fitsHole(back,h,m);}else back.holes=keep;}
   back.photoWindow=back.holes.some(h=>h.length===win.length&&h[0][0]===win[0][0]&&h[0][1]===win[0][1]);}
 }
 if(!s.decoration)return;
 if(archRise>0&&!back.photoWindow)applyPattern(back,{...s,decoration:true},{x0:t+m,y0:bodyH,x1:W-t-m,y1:bodyH+archRise*.62});
 for(const p of parts.filter(p=>p.id.startsWith('riser-')))applyPattern(p,{...s,decoration:true},{x0:t+m,y0:0,x1:W-t-m,y1:p.h});
}
