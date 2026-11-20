/* LZ Box · Placa con base: placa rectangular lisa (para foto, reconocimiento o grabado propio)
   que se empotra en una base rectangular. La placa lleva una pestaña abajo que entra en una
   ranura cerrada de la base: el ancho de la ranura es el espesor del material + la holgura. */
import {frame,materialWeb} from './models.js?v=3.5';
import {auditWebs} from './structure.js?v=3.5';

export function plaqueSpec(s){const t=+s.thickness,m=materialWeb(s,t),fit=+s.clearance,W=+s.width,Hp=+s.height,D=+s.depth,margin=Math.max(0,+s.plaqueMargin||0),r=Math.max(0,+s.plaqueRadius||0),slot=Math.min(90,Math.max(10,+s.plaqueSlot||45));return{t,m,fit,W,Hp,D,margin,r,slot,Bw:W+2*margin};}
export function plaqueDims(s){const q=plaqueSpec(s);return{W:q.Bw,D:q.D,H:q.Hp+q.t,t:q.t};}

export function validatePlaque(s){
 const q=plaqueSpec(s),e=[];
 if(s.measure==='inner')e.push('La placa usa medidas exteriores.');
 if(q.W<8*q.m)e.push(`El ancho de la placa debe ser de al menos ${(8*q.m).toFixed(0)} mm.`);
 if(q.Hp<6*q.m)e.push(`El alto de la placa debe ser de al menos ${(6*q.m).toFixed(0)} mm.`);
 const minD=q.t+q.fit+2*q.m+2;if(q.D<minD)e.push(`El fondo de la base debe ser de al menos ${minD.toFixed(0)} mm para la ranura.`);
 if(q.margin>100)e.push('La base puede sobresalir hasta 100 mm por lado.');
 if(q.r>Math.min(q.W,q.Hp)/2-1)e.push('El radio de las esquinas es demasiado grande para la placa.');
 if(!['acrylic','mdf'].includes(s.plaqueMaterial||'acrylic'))e.push('Elige el material de la placa.');
 return e;
}
const arc=(cx,cy,r,a0,a1,n=10)=>Array.from({length:n+1},(_,i)=>{const a=a0+(a1-a0)*i/n;return[cx+r*Math.cos(a),cy+r*Math.sin(a)];});
function roundedRect(x,y,w,h,r){if(r<.05)return[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];return[...arc(x+w-r,y+r,r,-Math.PI/2,0),...arc(x+w-r,y+h-r,r,0,Math.PI/2),...arc(x+r,y+h-r,r,Math.PI/2,Math.PI),...arc(x+r,y+r,r,Math.PI,1.5*Math.PI)];}

export function buildPlaque(s){
 const q=plaqueSpec(s),{t,m,fit,W,Hp,D,margin,r,slot,Bw}=q,glass=(s.plaqueMaterial||'acrylic')==='acrylic'?'acrylic':undefined;
 // Pestaña casi de todo el ancho; la ranura conserva el puente mínimo en los extremos de la base.
 const tabW=Math.max(2*m,Math.min(W-2*Math.max(2,r*.3),Bw-2*m-fit)),tx0=(W-tabW)/2;
 const slotY=Math.min(D-m-fit/2-t,Math.max(m+fit/2,(D-t)*slot/100));
 const plaque=[[tx0,0],[tx0+tabW,0],[tx0+tabW,t],[W,t],...(r>.05?[...arc(W-r,t+Hp-r,r,0,Math.PI/2),...arc(r,t+Hp-r,r,Math.PI/2,Math.PI)]:[[W,t+Hp],[0,t+Hp]]),[0,t],[tx0,t]];
 const baseOutline=roundedRect(0,0,Bw,D,Math.min(r,D/2-1,Bw/2-1)),slotRing=[[margin+tx0-fit/2,slotY-fit/2],[margin+tx0+tabW+fit/2,slotY-fit/2],[margin+tx0+tabW+fit/2,slotY+t+fit/2],[margin+tx0-fit/2,slotY+t+fit/2]];
 const parts=[
  {id:'base',name:`Base · ranura de ${(t+fit).toFixed(2)} mm`,w:Bw,h:D,p:baseOutline,holes:[slotRing],jointHoles:[0],connections:['plaque'],material:glass,frame:frame([0,0,0],[1,0,0],[0,1,0],[0,0,1],[0,0,-1])},
  {id:'plaque',name:'Placa · pestaña inferior',w:W,h:t+Hp,p:plaque,holes:[],jointHoles:[],connections:['base'],material:glass,frame:frame([margin,slotY,0],[1,0,0],[0,0,1],[0,1,0],[0,0,1])}
 ];
 auditWebs(parts,m);return parts;
}
