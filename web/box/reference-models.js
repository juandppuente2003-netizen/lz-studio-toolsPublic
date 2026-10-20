import {frame,rect,circle,roundedRect,materialWeb,buildHinged} from './models.js?v=3.5';
import {auditWebs,ringDistance} from './structure.js?v=3.5';
import {applyPattern} from './patterns.js?v=3.5';
export const carrierModels=['bridge','caddy','petal'];
const slot=(x,y,w,h)=>rect(w,h).map(([u,v])=>[x+u,y+v]);
const clean=ring=>{const out=ring.filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>1e-7);if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<1e-7)out.pop();return out;};
const samples=(a,b,n,fn)=>Array.from({length:n+1},(_,i)=>fn(a+(b-a)*i/n));
export function carrierSpec(s,{W=+s.width,D=+s.depth,H=+s.height+(+s.handleRise),t=+s.thickness}={}){
 const m=materialWeb(s,t),fit=+s.clearance,B=m+fit/2,bodyH=H-(+s.handleRise),band=4*m,amplitude=Math.max(4*m,(+s.handleRise)*.20),endZ=H-band-amplitude,separation=s.model==='bridge'?Math.max(2*m+2*t,D*.19):0,crownHalf=separation/2+t+2*m+fit,b=m+t+fit/2,frontY=b,backY=D-b-t,baseZ=B,tab=Math.max(m,2*t),lowZ=B+t+2*m;
 return {W,D,H,t,m,fit,B,bodyH,band,amplitude,endZ,separation,crownHalf,frontY,backY,baseZ,tab,lowZ};
}
function sideProfile(q){const{D,m,bodyH,endZ,band,crownHalf}=q,cx=D/2,r=Math.min(2*m,D*.12),neck=endZ+band+m;
 
 // Full lower body and gently narrowed shoulders, with a rounded crown.
 const shoulder=samples(0,1,32,a=>{const f=a*a*(3-2*a);return[D-(D/2-crownHalf)*f,bodyH+m+(neck-bodyH-m)*a];});
 const crown=samples(0,Math.PI,40,a=>[cx+crownHalf*Math.cos(a),neck+2*m*Math.sin(a)]),left=shoulder.slice().reverse().map(([y,z])=>[D-y,z]);
 return clean([[r,0],[D-r,0],...samples(-Math.PI/2,0,8,a=>[D-r+r*Math.cos(a),r+r*Math.sin(a)]),[D,bodyH+m],...shoulder.slice(1),...crown.slice(1),...left.slice(1),[0,r],...samples(Math.PI,Math.PI*1.5,8,a=>[r+r*Math.cos(a),r+r*Math.sin(a)]).slice(1)]);
}
function tenonSpans(length,m,target=length*.10){const tab=Math.max(m,Math.min(target,(length-3*m)/2)),centers=[.26,.74];return centers.map(q=>[length*q-tab/2,length*q+tab/2]);}
export function carrierShell(s,d,union){
 const q=carrierSpec(s,d),{W,D,H,t,m,fit,frontY,backY,baseZ,tab,lowZ,bodyH}=q,parts=[],pSide=sideProfile(q),ends=[];
 for(const[id,x,sign]of[['left',0,-1],['right',W-t,1]]){const p={id,name:(id==='left'?'Lateral izquierdo':'Lateral derecho')+' · perfil y ranuras',w:D,h:H,p:pSide,holes:[],jointHoles:[],frame:frame([x,0,0],[0,1,0],[0,0,1],[1,0,0],[sign,0,0]),connections:['front','back','bottom']};parts.push(p);ends.push(p);}
 const wallTab=Math.max(m,Math.min(2*m,(bodyH-lowZ-m)/3)),zs=[lowZ,bodyH-m-wallTab-fit/2],xs=tenonSpans(W-2*t,m,+s.finger).map(([a,b])=>[a+t,b+t]),ys=tenonSpans(backY-frontY-t,m,+s.finger).map(([a,b])=>[a+frontY+t,b+frontY+t]);
 for(const[id,y,sign]of[['front',frontY,-1],['back',backY,1]]){const rs=[[t,0,W-t,bodyH]];for(const z of zs)rs.push([0,z,t,z+wallTab],[W-t,z,W,z+wallTab]);let outline=union(rs);
  if(s.model==='petal'){const top=outline.findIndex((a,i)=>Math.abs(a[1]-bodyH)<1e-5&&Math.abs(outline[(i+1)%outline.length][1]-bodyH)<1e-5&&a[0]>outline[(i+1)%outline.length][0]);if(top>=0){const a=outline[top],b=outline[(top+1)%outline.length],curve=samples(a[0],b[0],40,x=>[x,bodyH-Math.min(2*m,bodyH*.12)*Math.sin(Math.PI*x/W)]);outline=clean([...outline.slice(0,top),...curve,...outline.slice(top+2)]);}}
  const p={id,name:id==='front'?'Frente · pestañas capturadas':'Fondo · pestañas capturadas',w:W,h:bodyH,p:outline,holes:[],jointHoles:[],frame:frame([0,y,0],[1,0,0],[0,0,1],[0,1,0],[0,sign,0]),connections:['left','right','bottom']};for(const[a,b]of xs)p.holes.push(slot(a-fit/2,baseZ-fit/2,b-a+fit,t+fit));parts.push(p);
  for(const end of ends)for(const z of zs)end.holes.push(slot(y-fit/2,z-fit/2,t+fit,wallTab+fit));
 }
 const rs=[[t,frontY+t,W-t,backY]];for(const[a,b]of xs)rs.push([a,frontY,b,frontY+t],[a,backY,b,backY+t]);for(const[a,b]of ys)rs.push([0,a,t,b],[W-t,a,W,b]);
 parts.push({id:'bottom',name:'Base elevada · pestañas en cuatro paredes',w:W,h:D,p:union(rs),holes:[],jointHoles:[],frame:frame([0,0,baseZ],[1,0,0],[0,1,0],[0,0,1],[0,0,-1]),connections:['front','back','left','right']});for(const end of ends)for(const[a,b]of ys)end.holes.push(slot(a-fit/2,baseZ-fit/2,b-a+fit,t+fit));
 return{q,parts,ends};
}
function arch(q){const{W,t,band,amplitude}=q,lower=samples(t,W-t,64,x=>[x,amplitude*Math.sin(Math.PI*(x-t)/(W-2*t))]),upper=lower.map(([x,z])=>[x,z+band]).reverse();return clean([[0,0],...lower,[W,0],[W,band],...upper,[0,band]]);}
function addEndReceivers(ends,y,z,width,height,fit,id){for(const p of ends){p.holes.push(slot(y-fit/2,z-fit/2,width+fit,height+fit));p.connections.push(id);}}
export function decorativeRosette(p,x,y,q){const{m,t}=q,r=Math.max(1.5,.6*t),R=m+2.8*r+1,holes=Array.from({length:6},(_,i)=>{const a=i*Math.PI/3,cx=x+R*Math.cos(a),cy=y+R*Math.sin(a);return samples(0,2*Math.PI,24,b=>[cx+1.4*r*Math.cos(b)*Math.cos(a)-.7*r*Math.sin(b)*Math.sin(a),cy+1.4*r*Math.cos(b)*Math.sin(a)+.7*r*Math.sin(b)*Math.cos(a)]).slice(0,-1);});
 try{auditWebs([{...p,holes:[...p.holes,...holes]}],m);p.holes.push(...holes);p.decorativeCount=(p.decorativeCount||0)+1;return true;}catch{return false;}
}
function decorate(s,parts,q){if(!s.decoration)return;for(const p of parts.filter(p=>['front','back','left','right'].includes(p.id))){if(s.pattern&&s.pattern!=='legacy')applyPattern(p,s,{y1:q.bodyH});else{const width=p.w;for(const x of[width*.28,width*.72])decorativeRosette(p,x,q.bodyH*.58,q);}}}
export function buildCarrier(s,d,union){const{q,parts,ends}=carrierShell(s,d,union),{W,D,H,t,m,fit,baseZ,bodyH,endZ,band,amplitude,separation,lowZ}=q;
 if(s.model==='caddy'){
  const y=D/2-t/2,base=parts.find(p=>p.id==='bottom'),bottomSpans=tenonSpans(W-2*t,m,+s.finger).map(([a,b])=>[a+t,b+t]),top=samples(W-t,t,64,x=>[x,endZ+band+amplitude*Math.sin(Math.PI*(x-t)/(W-2*t))]),rs=[[t,baseZ+t,W-t,endZ+band],[0,lowZ,t,lowZ+2*m],[W-t,lowZ,W,lowZ+2*m],[0,endZ,t,endZ+band],[W-t,endZ,W,endZ+band]];for(const[a,b]of bottomSpans){rs.push([a,baseZ,b,baseZ+t]);base.holes.push(slot(a-fit/2,y-fit/2,b-a+fit,t+fit));}
  let outline=union(rs);const idx=outline.findIndex((a,i)=>Math.abs(a[1]-endZ-band)<1e-5&&Math.abs(outline[(i+1)%outline.length][1]-endZ-band)<1e-5&&a[0]>outline[(i+1)%outline.length][0]&&a[0]>=W-t-1e-5&&outline[(i+1)%outline.length][0]<=t+1e-5);if(idx<0)throw Error('No se pudo formar el asa ovalada.');outline=clean([...outline.slice(0,idx+1),...top,...outline.slice(idx+1)]);
  const holeW=Math.min(W*.52,W-2*(t+3*m)),holeH=Math.max(2*m,Math.min(30,(+s.handleRise)*.25)),cy=H-3*m-holeH/2,hole=samples(0,2*Math.PI,64,a=>[W/2+holeW/2*Math.cos(a),cy+holeH/2*Math.sin(a)]).slice(0,-1);
  parts.push({id:'carry-panel',name:'Divisor portador · asa ovalada integral',w:W,h:H,p:outline,holes:[hole],nonJointHoles:[0],jointHoles:[],connections:['left','right','bottom'],frame:frame([0,y,0],[1,0,0],[0,0,1],[0,1,0],[0,0,1])});addEndReceivers(ends,y,endZ,t,band,fit,'carry-panel');addEndReceivers(ends,y,lowZ,t,2*m,fit,'carry-panel');base.connections.push('carry-panel');
 }else{
  const positions=s.model==='bridge'?[D/2-separation/2-t/2,D/2+separation/2-t/2]:[D/2-t/2],ribs=[];
  for(let i=0;i<positions.length;i++){const y=positions[i],id=positions.length===2?'handle-'+(i?'back':'front'):'arch-handle',p={id,name:positions.length===2?'Arco '+(i?'trasero':'delantero')+' · asa doble':'Asa arqueada · pestañas capturadas',w:W,h:band+amplitude,p:arch(q),holes:[],jointHoles:[],connections:['left','right'],frame:frame([0,y,endZ],[1,0,0],[0,0,1],[0,1,0],[0,0,1])};parts.push(p);ribs.push(p);addEndReceivers(ends,y,endZ,t,band,fit,id);}
  if(s.model==='bridge'){
   const tieWidth=2*m,length=separation+t,y0=positions[0];for(const[index,ratio]of[.25,.5,.75].entries()){const x=t+(W-2*t)*ratio,z=endZ+amplitude*Math.sin(Math.PI*ratio)+band/2-t/2,id='handle-tie-'+index;
    const p={id,name:index===1?'Travesaño central · zona de agarre':'Travesaño de asa '+(index+1),w:tieWidth,h:length,p:rect(tieWidth,length),holes:[],connections:ribs.map(p=>p.id),frame:frame([x-tieWidth/2,y0,z],[1,0,0],[0,1,0],[0,0,1],[0,0,1])};parts.push(p);for(const rib of ribs){rib.holes.push(slot(x-tieWidth/2-fit/2,z-endZ-fit/2,tieWidth+fit,t+fit));rib.connections.push(id);}}
   // An opening in each end keeps the distinctive triangular silhouette.
   for(const end of ends){const base=bodyH+2*m,tip=endZ-2*m,L=D*.24;end.nonJointHoles=[end.holes.length];end.holes.push([[D/2-L,base],[D/2+L,base],[D/2,tip]]);}
  }
 }
 for(const p of parts){p.jointHoles=p.holes.map((_,i)=>i).filter(i=>!p.nonJointHoles?.includes(i));p.decorationStart=p.holes.length;}
 decorate(s,parts,q);
 auditWebs(parts,m);return parts;
}

export function wineSpec(s,d){const{W,D,H,t}=d,m=materialWeb(s,t);return{m,mainX:W*(+s.dividerRatio/100)-t/2,crossY:D*.64,tab:Math.max(m,2*t),pullWidth:Math.max(18,3*m),pullHeight:Math.max(8,1.2*m)};}
export function buildWine(s,d,box,panel,union){const{W,D,H,t}=d,parts=buildHinged(s,d,box,panel,union),q=wineSpec(s,d),{m,mainX,crossY,tab,pullWidth,pullHeight}=q,fit=+s.clearance,by=id=>parts.find(p=>p.id===id),seat=by('hinged-lid').frame.o[2],top=seat-m,lo=t+m+fit/2,hi=top-3*m-tab;
 const zs=[lo,hi],ys=tenonSpans(D-2*t,m,+s.finger).map(([a,b])=>[a+t,b+t]),mainRects=[[t,t,D-t,top]];
 for(const z of zs)mainRects.push([0,z,t,z+tab],[D-t,z,D,z+tab]);for(const[a,b]of ys)mainRects.push([a,0,b,t]);
 const main={id:'divider-main',name:'Divisor longitudinal · botella y accesorios',w:D,h:top,p:union(mainRects),holes:[],jointHoles:[],connections:['bottom','front','back','divider-cross'],frame:frame([mainX,0,0],[0,1,0],[0,0,1],[1,0,0],[-1,0,0])};
 for(const id of['front','back']){const wall=by(id);for(const z of zs)wall.holes.push(slot(mainX-fit/2,z-fit/2,t+fit,tab+fit));wall.jointHoles=wall.holes.map((_,i)=>i);wall.connections??=['left','right','bottom'];wall.connections.push(main.id);}
 const base=by('bottom');for(const[a,b]of ys)base.holes.push(slot(mainX-fit/2,a-fit/2,t+fit,b-a+fit));base.connections??=['left','right','front','back'];base.connections.push(main.id);
 const length=W-mainX,xs=tenonSpans(length-2*t,m,+s.finger).map(([a,b])=>[a+t,b+t]),rs=[[t,t,length-t,top]];for(const z of zs)rs.push([0,z,t,z+tab],[length-t,z,length,z+tab]);for(const[a,b]of xs)rs.push([a,0,b,t]);
 const cross={id:'divider-cross',name:'Divisor corto · dos compartimentos de accesorios',w:length,h:top,p:union(rs),holes:[],connections:['divider-main','right','bottom'],frame:frame([mainX,crossY,0],[1,0,0],[0,0,1],[0,1,0],[1,0,0])};
 for(const z of zs){main.holes.push(slot(crossY-fit/2,z-fit/2,t+fit,tab+fit));by('right').holes.push(slot(crossY-fit/2,z-fit/2,t+fit,tab+fit));}by('right').jointHoles=by('right').holes.map((_,i)=>i);by('right').connections??=['front','back','bottom'];by('right').connections.push(cross.id);
 for(const[a,b]of xs)base.holes.push(slot(mainX+a-fit/2,crossY-fit/2,b-a+fit,t+fit));base.connections.push(cross.id);base.jointHoles=base.holes.map((_,i)=>i);main.jointHoles=main.holes.map((_,i)=>i);
 const lid=by('hinged-lid');lid.holes.push(roundedRect((W-pullWidth)/2,2*m,pullWidth,pullHeight,pullHeight/2));parts.push(main,cross);
 // The hinge already has its own pivot rim checks. Audit every new cut and
 // divider against the same structural web rule used by the other models.
 auditWebs([main,cross,base,by('front'),lid],m);
 for(const wall of[by('back'),by('right')]){const newHoles=wall.holes.slice(2);for(let i=2;i<wall.holes.length;i++)for(let j=0;j<i;j++)if(ringDistance(wall.holes[i],wall.holes[j])+1e-5<m)throw Error('Los receptores del divisor quedan demasiado cerca del pivote o del puente.');for(const hole of newHoles)auditWebs([{...wall,holes:[hole]}],m);for(let i=0;i<newHoles.length;i++)auditWebs([{...wall,holes:newHoles.slice(0,i+1)}],m);}
 return parts;
}
