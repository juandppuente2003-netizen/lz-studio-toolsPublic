import {ringDistance} from './structure.js?v=3.5';
import {materialWeb} from './models.js?v=3.5';

export const cutShapes=['circle','oval','heart','hex','diamond','rounded','rect','slot','polygon','star'];
export const cutShapeNames={circle:'Círculo',oval:'Óvalo',heart:'Corazón',hex:'Hexágono',diamond:'Rombo',rounded:'Rectángulo redondeado',rect:'Rectángulo recto',slot:'Ranura redondeada',polygon:'Polígono regular',star:'Estrella'};
export const modelKey=s=>(s.model||'box')+'/'+(s.model==='box'?(s.shape||'rect'):'rect');
export const bounds=ring=>[Math.min(...ring.map(q=>q[0])),Math.min(...ring.map(q=>q[1])),Math.max(...ring.map(q=>q[0])),Math.max(...ring.map(q=>q[1]))];
export function inside(r,[x,y]){let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function cleanCuts(raw){
 if(raw===undefined)return[];if(!Array.isArray(raw)||raw.length>64)throw Error('Se admiten hasta 64 formas por diseño.');
 return raw.map(c=>{if(!c||!cutShapes.includes(c.shape)||typeof c.panel!=='string'||typeof c.model!=='string')throw Error('Forma de corte inválida.');const out={model:c.model.slice(0,40),panel:c.panel.slice(0,80),shape:c.shape};for(const k of['x','y','width','height','rotation']){out[k]=Number(c[k]);if(!Number.isFinite(out[k]))throw Error('Revisa las medidas de la forma.');}if(c.sides!==undefined||['polygon','star'].includes(out.shape)){out.sides=Math.round(Number(c.sides??6));if(!Number.isFinite(out.sides)||out.sides<3||out.sides>12)throw Error('El polígono admite de 3 a 12 lados.');}if(out.x<0||out.x>100||out.y<0||out.y>100||Math.min(out.width,out.height)<4||Math.max(out.width,out.height)>2000||Math.abs(out.rotation)>360)throw Error('La forma necesita medidas de 4 a 2000 mm y una posición dentro de la pieza.');return out;});
}
export function cutRing(c,p){
 const [x0,y0,x1,y1]=bounds(p.p),cx=x0+(x1-x0)*c.x/100,cy=y0+(y1-y0)*c.y/100,w=c.width,h=c.height;let r;
 if(c.shape==='diamond')r=[[0,-1],[1,0],[0,1],[-1,0]];
 else if(c.shape==='hex')r=Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3),Math.sin(i*Math.PI/3)]);
 else if(c.shape==='heart'){
  // Sample smooth cubic lobes, avoiding a zero tangent at the cleft.
  const cubic=(a,b,c,d,t)=>a*(1-t)**3+3*b*(1-t)**2*t+3*c*(1-t)*t*t+d*t**3;
  const curves=[[[0,-1],[.32,-.7],[1,-.25],[1,.32]],[[1,.32],[1,1],[.32,1],[0,.55]],[[0,.55],[-.32,1],[-1,1],[-1,.32]],[[-1,.32],[-1,-.25],[-.32,-.7],[0,-1]]];
  r=curves.flatMap(q=>Array.from({length:12},(_,i)=>[cubic(...q.map(p=>p[0]),i/12),cubic(...q.map(p=>p[1]),i/12)]));
 }else if(c.shape==='rounded'){
  r=[];const rad=.3;for(const [cx,cy,a]of[[1-rad,1-rad,0],[-1+rad,1-rad,Math.PI/2],[-1+rad,-1+rad,Math.PI],[1-rad,-1+rad,Math.PI*1.5]])for(let i=0;i<=8;i++){const angle=a+i*Math.PI/16;r.push([cx+rad*Math.cos(angle),cy+rad*Math.sin(angle)]);}
 }else if(c.shape==='rect')r=[[1,1],[-1,1],[-1,-1],[1,-1]];
 else if(c.shape==='slot'){r=[];const wide=w>=h,a=wide?h/w:w/h,arc=(t0,cx,cy)=>{for(let i=0;i<=16;i++){const t=t0+i*Math.PI/16;r.push(wide?[cx+a*Math.cos(t),Math.sin(t)]:[Math.cos(t),cy+a*Math.sin(t)]);}};if(wide){arc(-Math.PI/2,1-a,0);arc(Math.PI/2,-1+a,0);}else{arc(0,0,1-a);arc(Math.PI,0,-1+a);}}
 else if(c.shape==='polygon'){const n=c.sides||6;r=Array.from({length:n},(_,i)=>[Math.cos(Math.PI/2+i*2*Math.PI/n),Math.sin(Math.PI/2+i*2*Math.PI/n)]);}
 else if(c.shape==='star'){const n=c.sides||5;r=Array.from({length:2*n},(_,i)=>{const rad=i%2?.45:1,a=Math.PI/2+i*Math.PI/n;return[rad*Math.cos(a),rad*Math.sin(a)];});}
 else r=Array.from({length:64},(_,i)=>[Math.cos(i*Math.PI/32),Math.sin(i*Math.PI/32)]);
 if(c.shape==='heart'){const[x0,y0,x1,y1]=bounds(r);r=r.map(([x,y])=>[(x-(x0+x1)/2)*2/(x1-x0),(y-(y0+y1)/2)*2/(y1-y0)]);}
 const a=c.rotation*Math.PI/180,co=Math.cos(a),si=Math.sin(a),height=c.shape==='circle'?w:h;
 return r.map(([x,y])=>[cx+x*w/2*co-y*height/2*si,cy+x*w/2*si+y*height/2*co]);
}
export function applyCuts(parts,s){
 const cuts=cleanCuts(s.customCuts),m=materialWeb(s);
 for(const c of cuts.filter(c=>c.model===modelKey(s))){const p=parts.find(p=>p.id===c.panel);if(!p)throw Error('La pieza de una forma ya no existe. Deshaz el cambio o elimina sus formas.');const ring=cutRing(c,p);
  validateCutRing(p,ring,m);
  p.holes??=[];p.holes.push(ring);p.customCount=(p.customCount||0)+1;
 }return parts;
}
function validateCutRing(p,ring,m){if(!ring.every(q=>inside(p.p,q))||ringDistance(p.p,ring)<m-1e-5)throw Error(`«${p.name}»: la forma queda cerca del borde. Conserva ${m} mm de MDF o reduce/mueve la forma.`);for(const old of p.holes||[])if(inside(old,ring[0])||inside(ring,old[0])||ringDistance(old,ring)<m-1e-5)throw Error(`«${p.name}»: la forma invade un corte o una unión. Deja ${m} mm de MDF entre huecos.`);}
export function cutDraft(p,s,c,index=-1){const peer=s.customCuts.map((c,i)=>({c,i})).filter(q=>q.c.model===modelKey(s)&&q.c.panel===p.id),current=peer.findIndex(q=>q.i===index),holeIndex=current<0?-1:p.holes.length-(p.customCount||0)+current,holes=p.holes.filter((_,i)=>i!==holeIndex);try{cleanCuts([c]);const ring=cutRing(c,p);validateCutRing({...p,holes},ring,materialWeb(s));return{ring,holes,error:null};}catch(e){return{ring:cutRing(c,p),holes,error:e.message};}}
export function findCutPlacement(p,s,c,index=-1){const candidates=[{...c,x:50,y:50}];for(let y=5;y<100;y+=5)for(let x=5;x<100;x+=5)candidates.push({...c,x,y});candidates.sort((a,b)=>(a.x-c.x)**2+(a.y-c.y)**2-((b.x-c.x)**2+(b.y-c.y)**2));return candidates.find(q=>!cutDraft(p,s,q,index).error)||null;}
// Picking the nearest solid face respects real holes even in the Canvas fallback.
export function pickFace(parts,project,mapping,t,point){
 let best=null;
 for(const p of parts)for(const n of[0,t]){const o=project(mapping(p,0,0,n)),a=project(mapping(p,1,0,n)),b=project(mapping(p,0,1,n)),ux=a[0]-o[0],uy=a[1]-o[1],vx=b[0]-o[0],vy=b[1]-o[1],det=ux*vy-uy*vx;if(Math.abs(det)<1e-8)continue;const dx=point[0]-o[0],dy=point[1]-o[1],u=(dx*vy-dy*vx)/det,v=(dy*ux-dx*uy)/det;
  if(!inside(p.p,[u,v])||(p.holes||[]).some(r=>inside(r,[u,v])))continue;
  const depth=o[2]+u*(a[2]-o[2])+v*(b[2]-o[2]);if(!best||depth<best.depth)best={part:p,u,v,depth};
 }
 // Top edges of standing dividers and the inside walls of holes are solid faces too.
 for(const p of parts)for(const ring of[p.p,...(p.holes||[])])for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],O=project(mapping(p,...a,0)),U=project(mapping(p,...b,0)),V=project(mapping(p,...a,t)),ux=U[0]-O[0],uy=U[1]-O[1],vx=V[0]-O[0],vy=V[1]-O[1],det=ux*vy-uy*vx;if(Math.abs(det)<1e-8)continue;const dx=point[0]-O[0],dy=point[1]-O[1],along=(dx*vy-dy*vx)/det,normal=(dy*ux-dx*uy)/det;if(along<0||along>1||normal<0||normal>1)continue;
  const depth=O[2]+along*(U[2]-O[2])+normal*(V[2]-O[2]);if(!best||depth<best.depth)best={part:p,u:a[0]+along*(b[0]-a[0]),v:a[1]+along*(b[1]-a[1]),depth,edge:true};
 }return best;
}
export function dragValue(start,dx,dy,vector,snap=1){const len=vector[0]**2+vector[1]**2;if(len<.01)return start;return Math.round((start+(dx*vector[0]+dy*vector[1])/len)/snap)*snap;}
export function pickCustomCut(s,parts,project,mapping,t,point){let best=null;const solid=pickFace(parts,project,mapping,t,point);for(const[index,c]of(s.customCuts||[]).entries()){if(c.model!==modelKey(s))continue;const p=parts.find(p=>p.id===c.panel);if(!p)continue;const ring=cutRing(c,p);for(const n of[0,t]){const O=project(mapping(p,0,0,n)),U=project(mapping(p,1,0,n)),V=project(mapping(p,0,1,n)),ux=U[0]-O[0],uy=U[1]-O[1],vx=V[0]-O[0],vy=V[1]-O[1],det=ux*vy-uy*vx;if(Math.abs(det)<1e-8)continue;const dx=point[0]-O[0],dy=point[1]-O[1],u=(dx*vy-dy*vx)/det,v=(dy*ux-dx*uy)/det;if(!inside(ring,[u,v]))continue;const depth=O[2]+u*(U[2]-O[2])+v*(V[2]-O[2]);if(solid&&depth>solid.depth+1e-5)continue;if(!best||depth<best.depth)best={index,part:p,u,v,depth};}}return best;}
export function planeDrag(dx,dy,u,v){const det=u[0]*v[1]-u[1]*v[0];if(Math.abs(det)<1e-6)return null;return[(dx*v[1]-dy*v[0])/det,(dy*u[0]-dx*u[1])/det];}
export class EditHistory{
 constructor(){this.past=[];this.future=[];this.present=null;}
 reset(s){this.past=[];this.future=[];this.present=s===undefined?null:JSON.stringify(s);}
 record(s){const next=JSON.stringify(s);if(next===this.present)return;if(this.present!==null)this.past.push(this.present);if(this.past.length>50)this.past.shift();this.present=next;this.future=[];}
 move(direction){const from=direction<0?this.past:this.future,to=direction<0?this.future:this.past;if(!from.length)return null;to.push(this.present);this.present=from.pop();return JSON.parse(this.present);}
}
