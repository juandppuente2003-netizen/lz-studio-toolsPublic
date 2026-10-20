import {frame,rect,roundedRect,circle,materialWeb,basicFrames,attachBodyConnections} from './models.js?v=3.5';
import {carrierShell,buildCarrier,decorativeRosette} from './reference-models.js?v=3.5';
import {auditWebs} from './structure.js?v=3.5';
import {applyPattern} from './patterns.js?v=3.5';
export const productModels=['rack','bag','floral','gaming','bottle','drawer','heart'];
export const productCarriers=['rack','bag','bottle','heart'];
export const outerOnlyModels=['bag','floral','gaming','drawer','heart'];
const slot=(x,y,w,h)=>rect(w,h).map(([u,v])=>[x+u,y+v]);
const sample=(a,b,n,fn)=>Array.from({length:n+1},(_,i)=>fn(a+(b-a)*i/n));
const clean=p=>{const r=p.filter((q,i)=>!i||Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1])>1e-7);if(Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-7)r.pop();return r;};
const area=p=>p.reduce((v,a,i)=>{const b=p[(i+1)%p.length];return v+a[0]*b[1]-a[1]*b[0];},0)/2;
const ccw=p=>area(p)<0?p.slice().reverse():p;
function part(id,name,p,holes,f,connections=[],extra={}){p=clean(ccw(p));return{id,name,w:Math.max(...p.map(p=>p[0])),h:Math.max(...p.map(p=>p[1])),p,holes,jointHoles:holes.map((_,i)=>i),frame:f,connections,...extra};}
function spans(L,m,target){const w=Math.max(m,Math.min(target,L*.18));return[.28,.72].map(q=>[L*q-w/2,L*q+w/2]);}
function safeHole(p,h,m){try{auditWebs([{...p,holes:[...p.holes,h]}],m);p.holes.push(h);return true;}catch{return false;}}
function decorate(p,s,bodyH){if(!s.decoration)return;if(s.model==='heart'||(s.model==='bag'&&s.handleStyle==='heart')||(s.pattern&&s.pattern!=='legacy')){applyPattern(p,s,{y1:bodyH});return;}const m=materialWeb(s),before=p.holes.length;for(const x of[p.w*.3,p.w*.7])for(const z of[bodyH*.35,bodyH*.7])decorativeRosette(p,x,z,{m,t:+s.thickness});p.decorationStart=before;}
export function tKey(m,t){return[[0,0],[3*m,0],[3*m,m],[2*m,m],[2*m,2*m+t],[m,2*m+t],[m,m],[0,m]];}

// An open C profile is cut independently of the rail. Its two-stage mounting
// path passes through the mouth before lowering onto the top rail.
export function hookSpec(s,t=+s.thickness){const m=materialWeb(s,t),R=2*m,outer=R+m,band=2*m,alpha=Math.PI*.29,lift=Math.sqrt(R*R-(t/2)**2)-band/2;return{m,R,outer,band,alpha,lift};}
function cProfile(q,cx,cz,stemHalf,lower){const{outer:Ro,R,alpha}=q,a0=Math.PI+alpha,a1=3*Math.PI/2-Math.asin(stemHalf/Ro),a2=3*Math.PI/2+Math.asin(stemHalf/Ro),a3=3*Math.PI-alpha;
 return clean([...sample(a0,a1,12,a=>[cx+Ro*Math.cos(a),cz+Ro*Math.sin(a)]),...lower,...sample(a2,a3,44,a=>[cx+Ro*Math.cos(a),cz+Ro*Math.sin(a)]),...sample(Math.PI-alpha,-Math.PI+alpha,48,a=>[cx+R*Math.cos(a),cz+R*Math.sin(a)])]);}
export function buildRack(s,d,union,offset){
 const{W,D,H,t}=d,m=materialWeb(s,t),fit=+s.clearance,{q,parts,ends}=carrierShell(s,d,union),post=4*m,beamTop=H-2*m,railY=D/2-t/2,hq=hookSpec(s,t);
 for(const p of ends){p.p=union([[0,0,D,q.bodyH],[D/2-post/2,q.bodyH,D/2+post/2,H]]);p.h=H;p.name=(p.id==='left'?'Lateral izquierdo':'Lateral derecho')+' · poste integral';p.holes.push(slot(railY-fit/2,beamTop-hq.band-fit/2,t+fit,hq.band+fit));p.connections.push('rack-rail');p.jointHoles=p.holes.map((_,i)=>i);}
 const rail=part('rack-rail','Barra superior · pestañas capturadas',rect(W,hq.band),[],frame([0,railY,beamTop-hq.band],[1,0,0],[0,0,1],[0,1,0],[0,0,1]),['left','right']);parts.push(rail);
 // The rail ends pass through both post slots. The full-height rectangular
 // profile is intentional; the ends themselves are not glued-on decorations.
 const cx=4*m,triH=4*m,cz=triH+2*m+hq.outer,root=cz-Math.sqrt(hq.outer**2-(m/2)**2),lower=[[cx-m/2,root],[cx-m/2,triH-m],[0,0],[8*m,0],[cx+m/2,triH-m],[cx+m/2,root]],outline=cProfile(hq,cx,cz,m/2,lower),hole=offset([[0,0],[8*m,0],[cx+m/2,triH-m],[cx-m/2,triH-m]],-m),z0=beamTop-Math.sqrt(hq.R**2-(t/2)**2)-cz;
 for(let i=0;i<s.hookCount;i++){const x=s.swing?W*(.43+.48*(i+.5)/s.hookCount):2*m+(W-4*m-t)*(i+.5)/s.hookCount;parts.push(part('rack-hook-'+i,'Percha desmontable '+(i+1)+' · pieza suelta',outline,[hole],frame([x,D/2-cx,z0],[0,1,0],[0,0,1],[1,0,0],[0,1,0]),['rack-rail'],{loose:true,role:'accessory',jointHoles:[],insertPath:[[0,4*hq.outer,hq.lift],[0,0,hq.lift],[0,0,0]]}));}
 if(s.swing){
  const trayW=Math.max(W*.24,6*m+2*t),trayD=Math.max(D*.25,6*m),trayX=4*m,drop=Math.max(9*m,+(s.handleRise)*.34),stemHalf=1.5*m+fit/2,Cx=trayD/2,Cz=drop,trayLocal=m+t+fit/2,rootZ=Cz-Math.sqrt(hq.outer**2-stemHalf**2),sz=beamTop-Math.sqrt(hq.R**2-(t/2)**2)-Cz,trayZ=sz+trayLocal,sy=D/2-Cx;
  const tray=part('swing-tray','Repisa colgante · dos receptores',rect(trayW,trayD),[],frame([trayX,sy,trayZ],[1,0,0],[0,1,0],[0,0,1],[0,0,-1]),['swing-strap-0','swing-strap-1']);
  for(let i=0;i<2;i++){const x=trayX+(i?trayW-m-t-fit/2:m+fit/2),lowerStem=[[Cx-stemHalf,rootZ],[Cx-stemHalf,trayLocal+t+m],[Cx-2.5*m,trayLocal+t+m],[Cx-2.5*m,trayLocal+t],[Cx-stemHalf,trayLocal+t],[Cx-stemHalf,0],[Cx+stemHalf,0],[Cx+stemHalf,trayLocal+t],[Cx+2.5*m,trayLocal+t],[Cx+2.5*m,trayLocal+t+m],[Cx+stemHalf,trayLocal+t+m],[Cx+stemHalf,rootZ]],p=part('swing-strap-'+i,'Colgante desmontable '+(i+1),cProfile(hq,Cx,Cz,stemHalf,lowerStem),[slot(Cx-m/2-fit/2,m,m+fit,t+fit)],frame([x,sy,sz],[0,1,0],[0,0,1],[1,0,0],[0,1,0]),['rack-rail','swing-tray','swing-key-'+i],{loose:true,insertPath:[[0,4*hq.outer,hq.lift],[0,0,hq.lift],[0,0,0]]});parts.push(p);tray.holes.push(slot(x-trayX-fit/2,Cx-stemHalf-fit/2,t+fit,3*m+2*fit));
   parts.push(part('swing-key-'+i,'Seguro suelto de repisa '+(i+1),tKey(m,t),[],(i?frame([x+t+m,D/2-1.5*m,trayZ-t],[0,1,0],[-1,0,0],[0,0,1],[1,0,0]):frame([x-m,D/2+1.5*m,trayZ-t],[0,-1,0],[1,0,0],[0,0,1],[-1,0,0])),[p.id,'swing-tray'],{loose:true,role:'locking-key',insertPath:[[i?2*m+t:-(2*m+t),0,0],[0,0,0]]}));}
  tray.jointHoles=[0,1];parts.push(tray);
 }
 for(const p of parts.filter(p=>['front','back'].includes(p.id))){p.jointHoles=p.holes.map((_,i)=>i);decorate(p,s,q.bodyH);}
 auditWebs(parts,m);return parts;
}

export function bagSpec(s,d){const{W,D,H,t}=d,m=materialWeb(s,t),fit=+s.clearance,bodyH=H-(+s.handleRise),heart=s.model==='heart',inset=W*(+s.bagTaper)/100,k=(heart?-inset:inset)/bodyH,c=1/Math.hypot(1,k),a=k*c,B=2*m+t,edge=B+(heart?inset:0),z0=heart?0:t*a,baseZ=m+fit/2,L=(bodyH-z0+t*Math.min(a,0))/c,left=heart?edge+k*baseZ+t/c+fit/2+.25:B+(baseZ+t)*k+t/c+fit/2+.25;return{m,fit,bodyH,inset,k,c,a,B,edge,z0,baseZ,L,left};}
const bezier=(a,b,c,d,n=20)=>sample(0,1,n,t=>a.map((v,i)=>(1-t)**3*v+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i]));
const heartRing=()=>clean([...bezier([0,.72],[-.32,1.18],[-1.15,1.03],[-1,.6]),...bezier([-1,.6],[-.95,.3],[-.4,.15],[0,0]).slice(1),...bezier([0,0],[.4,.15],[.95,.3],[1,.6]).slice(1),...bezier([1,.6],[1.15,1.03],[.32,1.18],[0,.72]).slice(1)]);
function bagProfiles(s,q,W){const{m,bodyH,inset}=q,rise=+s.handleRise,wide=s.model==='heart',ro=Math.min((wide?W:W-2*inset)*.32,rise*.85),cx=W/2,style=s.handleStyle||'oval';
 let crown=sample(0,Math.PI,64,b=>[cx+ro*Math.cos(b),bodyH+rise*Math.sin(b)]),handle=sample(0,2*Math.PI,64,b=>[cx+(ro-3*m)*Math.cos(b),bodyH+rise*.46+rise*.24*Math.sin(b)]).slice(0,-1);
 if(style==='round')handle=circle(cx,bodyH+rise*.46,Math.min(ro-3*m,rise*.24));
 if(style==='heart'){const raw=[...bezier([1,.6],[1.15,1.03],[.32,1.18],[0,.72]),...bezier([0,.72],[-.32,1.18],[-1.15,1.03],[-1,.6]).slice(1)],top=Math.max(...raw.map(p=>p[1]));crown=[[cx+ro,bodyH],...raw.map(([x,y])=>[cx+ro*x,bodyH+rise*(.2+.8*y/top)]),[cx-ro,bodyH]];handle=ccw(heartRing().map(([x,y])=>[cx+(ro-3*m)*x,bodyH+rise*(.1+.62*y/top)]));}
 const outer=clean([...(wide?[[inset,0],[W-inset,0],[W,bodyH]]:[[0,0],[W,0],[W-inset,bodyH]]),...crown,[wide?0:inset,bodyH]]);return{outer,handle};
}
export function buildBag(s,d,union,offset){const{W,D,H,t}=d,q=bagSpec(s,d),{m,fit,bodyH,inset,c,a,edge,z0,baseZ,L,left}=q,parts=[],{outer,handle}=bagProfiles(s,q,W),faces=[];
 for(const[id,y,sign]of[['front',0,-1],['back',D-t,1]]){const p=part(id,(id==='front'?'Frente':'Fondo')+' trapezoidal · asa integral',outer,[handle],frame([0,y,0],[1,0,0],[0,0,1],[0,1,0],[0,sign,0]),['left','right','bottom'],{jointHoles:[]});parts.push(p);faces.push(p);}
 const zSpans=[.30,.73].map(r=>{const middle=(bodyH*r-z0)/c,half=Math.max(m,Math.min(+s.finger,2*m))/2;return[middle-half,middle+half];});
 for(const[id,x,sign]of[['left',edge,1],['right',W-edge,-1]]){const rs=[[t,0,D-t,L]];for(const[lo,hi]of zSpans)rs.push([0,lo,t,hi],[D-t,lo,D,hi]);const f=frame([x,0,z0],[0,1,0],[sign*a,0,c],[sign*c,0,-a],[sign===1?-1:1,0,0]),p=part(id,(id==='left'?'Costado izquierdo':'Costado derecho')+' inclinado',union(rs),[],f,['front','back']);parts.push(p);
  for(const[lo,hi]of zSpans){const ring=ccw([[lo,0],[hi,0],[hi,t],[lo,t]].map(([v,n])=>[x+sign*a*v+sign*c*n,z0+c*v-a*n]));for(const wall of faces){wall.holes.push(offset(ring,fit/2));wall.jointHoles.push(wall.holes.length-1);}}
 }
 const xs=spans(W-2*left,m,+s.finger).map(([a,b])=>[a+left,b+left]),rs=[[left,t,W-left,D-t]];for(const[a,b]of xs){rs.push([a,0,b,t],[a,D-t,b,D]);for(const p of faces){p.holes.push(slot(a-fit/2,baseZ-fit/2,b-a+fit,t+fit));p.jointHoles.push(p.holes.length-1);}}
 parts.push(part('bottom','Base del bolso · capturada en frente y fondo',union(rs),[],frame([0,0,baseZ],[1,0,0],[0,1,0],[0,0,1],[0,0,-1]),['front','back']));for(const p of faces)decorate(p,s,bodyH);auditWebs(parts,m);return parts;
}

export function buildBottle(s,d,union){const{D,t}=d,m=materialWeb(s,t),parts=buildCarrier({...s,decoration:false},d,union),bodyH=+s.height;
 if(s.decoration){for(const p of parts.filter(p=>['left','right'].includes(p.id))){for(const[r,z]of[[.65,bodyH+4*m],[.9,bodyH+(+s.handleRise)*.37],[1.2,bodyH+(+s.handleRise)*.60]])safeHole(p,circle(D/2,z,r*m),m);}for(const p of parts.filter(p=>['front','back'].includes(p.id))){for(const z of[bodyH*.42,bodyH*.74])safeHole(p,roundedRect(p.w*.24,z,p.w*.52,Math.max(t,3),1.4),m);}}
 auditWebs(parts,m);return parts;
}

function decompose(p){const ys=[...new Set(p.map(q=>q[1]))].sort((a,b)=>a-b),rects=[];for(let i=1;i<ys.length;i++){const y=(ys[i-1]+ys[i])/2,xs=[];for(let j=0;j<p.length;j++){const a=p[j],b=p[(j+1)%p.length];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);for(let j=0;j+1<xs.length;j+=2)rects.push([xs[j],ys[i-1],xs[j+1],ys[i]]);}return rects;}
export function floralSpec(s,d){const{W,D,H,t}=d,m=materialWeb(s,t),fit=+s.clearance,gap=+s.slideGap,margin=t+2*m,opening=s.model==='drawer'?H-2*m-2*t:+s.drawerHeight,drawerW=W-2*margin-2*gap,drawerD=D-2*t-gap,drawerZ=t+m,drawerH=opening-gap-drawerZ,lip=m+fit/2,shelfZ=opening+m+fit/2;return{m,fit,gap,margin,opening,drawerW,drawerD,drawerZ,drawerH,lip,shelfZ};}
export function buildFloral(s,d,box,union){const{W,D,H,t}=d,q=floralSpec(s,d),{m,fit,gap,margin,opening,drawerW:dw,drawerD:dd,drawerZ:dz,drawerH:dh,lip,shelfZ}=q,caseD=D-t,closed=s.model==='drawer',parts=attachBodyConnections(basicFrames(box(W,caseD,H,closed,s),{W,D:caseD,H,t}));
 for(const p of parts)p.frame.o[1]+=t;const by=id=>parts.find(p=>p.id===id),front=by('front');front.p=union(decompose(front.p).flatMap(r=>[[0,0,margin,H],[W-margin,0,W,H],[0,opening,W,H]].map(b=>[Math.max(r[0],b[0]),Math.max(r[1],b[1]),Math.min(r[2],b[2]),Math.min(r[3],b[3])]).filter(r=>r[2]>r[0]&&r[3]>r[1])));front.name='Frente de la caja · boca de cajón sin tira frágil';
 if(!closed){const xs=spans(W-2*t,m,+s.finger).map(([a,b])=>[a+t,b+t]),ys=spans(caseD-2*t,m,+s.finger).map(([a,b])=>[a+t,b+t]),rs=[[t,t,W-t,caseD-t]];for(const[a,b]of xs){rs.push([a,0,b,t],[a,caseD-t,b,caseD]);for(const id of['front','back'])by(id).holes.push(slot(a-fit/2,shelfZ-fit/2,b-a+fit,t+fit));}for(const[a,b]of ys){rs.push([0,a,t,b],[W-t,a,W,b]);for(const id of['left','right'])by(id).holes.push(slot(a-fit/2,shelfZ-fit/2,b-a+fit,t+fit));}
 parts.push(part('flower-floor','Piso del florero · techo del cajón',union(rs),[],frame([0,t,shelfZ],[1,0,0],[0,1,0],[0,0,1],[0,0,1]),['front','back','left','right']));
 }
 const railY=2*t+m,railL=D-3*t-2*m,railXs=[margin+gap+2*m,W-margin-gap-2*m-t];for(let i=0;i<2;i++){const x=railXs[i],span=spans(railL,m,+s.finger),rr=[[0,t,railL,t+m]];for(const[a,b]of span){rr.push([a,0,b,t]);by('bottom').holes.push(slot(x-fit/2,railY-t+a-fit/2,t+fit,b-a+fit));}parts.push(part('drawer-track-'+i,'Guía inferior del cajón '+(i+1),union(rr),[],frame([x,railY,0],[0,1,0],[0,0,1],[1,0,0],[0,0,1]),['bottom']));}
 const drawer=basicFrames(box(dw,dd,dh,false,s),{W:dw,D:dd,H:dh,t}),drawX=margin+gap,drawerFront=drawer.find(p=>p.id==='front'),receiver=[];
 for(const p of drawer.filter(p=>['left','right'].includes(p.id)))for(const r of decompose(p.p))if(r[0]<t-1e-6){const x=p.id==='left'?0:dw-t;receiver.push(slot(x+lip-fit/2,r[1]+lip-fit/2,t+fit,r[3]-r[1]+fit));}
 for(const r of decompose(drawer.find(p=>p.id==='bottom').p))if(r[1]<t-1e-6)receiver.push(slot(r[0]+lip-fit/2,lip-fit/2,r[2]-r[0]+fit,t+fit));
 // Adjacent rectangles from the finger contour can share an edge; merge
 // them into receiver runs instead of making duplicate touching cutouts.
 const merged=[];for(const h of receiver){const r=[h[0][0],h[0][1],h[2][0],h[2][1]],last=merged.find(v=>Math.abs(v[0]-r[0])<1e-6&&Math.abs(v[2]-r[2])<1e-6&&r[1]<=v[3]+1e-6&&r[3]>=v[1]-1e-6);if(last){last[1]=Math.min(last[1],r[1]);last[3]=Math.max(last[3],r[3]);}else merged.push(r);}
 const fw=dw+2*lip,fh=dh+2*lip,R=m,outline=clean([[0,0],[fw,0],[fw,fh],[fw/2+R,fh],...sample(0,-Math.PI,32,a=>[fw/2+R*Math.cos(a),fh+R*Math.sin(a)]).slice(1),[0,fh]]);drawerFront.p=outline;drawerFront.w=fw;drawerFront.h=fh;drawerFront.holes=merged.map(([x,y,X,Y])=>slot(x,y,X-x,Y-y));drawerFront.frame.o=[-lip,0,-lip];drawerFront.name='Frente del cajón · tapa de tope y tirador integrado';
 for(const p of drawer){const old=p.id;p.id='drawer-'+old;p.name=old==='front'?p.name:'Cajón · '+p.name.toLowerCase();p.frame.o[0]+=drawX;p.frame.o[2]+=dz;p.motion='slide';p.slideAxis=[0,-1,0];p.slideTravel=dd*.72;p.connections=(old==='bottom'?['front','back','left','right']:old==='front'||old==='back'?['left','right','bottom']:['front','back','bottom']).map(id=>'drawer-'+id);if(old==='bottom')p.connections.push('drawer-track-0','drawer-track-1');p.jointHoles=p.holes.map((_,i)=>i);}
 parts.push(...drawer);for(const p of parts.filter(p=>['front','back','left','right','bottom'].includes(p.id)))p.jointHoles=p.holes.map((_,i)=>i);
 if(closed){drawerFront.p=rect(fw,fh);drawerFront.name='Frente del cajón · tirador perforado integral';if(!safeHole(drawerFront,circle(fw/2,(lip+t+fh)/2,m),m))throw Error('Aumenta la altura del cajón para alojar el tirador con material suficiente.');const roof=by('top');roof.name='Cubierta calada · encastrada en cuatro paredes';applyPattern(roof,s);}
 else for(const p of parts.filter(p=>['back','left','right'].includes(p.id))){p.connections.push('flower-floor');if(s.pattern&&s.pattern!=='legacy')applyPattern(p,s,{y0:shelfZ+t,y1:H});else if(s.decoration)for(const x of[p.w*.3,p.w*.7])decorativeRosette(p,x,(shelfZ+H)/2,{m,t});}
 by('bottom').connections.push('drawer-track-0','drawer-track-1');auditWebs(parts,m);return parts;
}

export function gamingSpec(s,d){const{W,D,H,t}=d,m=materialWeb(s,t),fit=+s.clearance,baseZ=3*m+t,rearY=D*.69,cradleL=D*.37,cradleY=D*.20,cradleW=W*.62,shelfZ=baseZ+(+s.standSeat),saddleZ=H-3*m;return{m,fit,baseZ,rearY,cradleL,cradleY,cradleW,shelfZ,saddleZ};}
function attachHorizontalKey(parts,base,carrier,worldCenter,axis,suffix,m,t,fit){
 // A separate T key passes under the base and through the vertical foot.
 const local=worldCenter.map((v,i)=>v-carrier.frame.o[i]),u=local.reduce((v,x,i)=>v+x*carrier.frame.u[i],0),v=local.reduce((v,x,i)=>v+x*carrier.frame.v[i],0),z=worldCenter[2];carrier.holes.push(slot(u-m/2-fit/2,v-fit/2,m+fit,t+fit));
 const f=axis==='Y'?frame([worldCenter[0]-1.5*m,worldCenter[1]-t/2-m,z],[1,0,0],[0,1,0],[0,0,1],[0,-1,0]):frame([worldCenter[0]-t/2-m,worldCenter[1]+1.5*m,z],[0,-1,0],[1,0,0],[0,0,1],[-1,0,0]);
 const key=part('stand-key-'+suffix,'Chaveta desmontable de base '+suffix,tKey(m,t),[],f,[carrier.id,base.id],{loose:true,role:'locking-key'});parts.push(key);carrier.connections.push(key.id);base.connections.push(key.id);
}
export function buildGaming(s,d,union){const{W,D,H,t}=d,q=gamingSpec(s,d),{m,fit,baseZ,rearY,cradleL,cradleY,cradleW,shelfZ,saddleZ}=q,parts=[],base=part('bottom','Base ovalada elevada',sample(0,Math.PI*2,128,a=>[W/2+W/2*Math.cos(a),D/2+D/2*Math.sin(a)]).slice(0,-1),[],frame([0,0,baseZ],[1,0,0],[0,1,0],[0,0,1],[0,0,-1]),['headphone-panel','cradle-left','cradle-right']);parts.push(base);
 const pw=W*.78,px=(W-pw)/2,cx=pw/2,R=pw/2,feet=[cx-2.5*m,cx+2.5*m],stemHalf=5*m,joinZ=H-R-Math.sqrt(R*R-stemHalf*stemHalf),stem=union([[cx-stemHalf,baseZ+t,cx+stemHalf,joinZ],...feet.map(x=>[x-1.5*m-fit/2,0,x+1.5*m+fit/2,baseZ+t])]);
 // Combine the curved head with the footed stem by replacing the top edge
 // of the rectilinear stem, preserving every receiving foot below it.
 let pi=stem.findIndex((a,i)=>Math.abs(a[1]-joinZ)<1e-6&&Math.abs(stem[(i+1)%stem.length][1]-joinZ)<1e-6&&a[0]>stem[(i+1)%stem.length][0]);
 const angle=Math.acos(stemHalf/R),top=sample(-angle,Math.PI+angle,96,a=>[cx+R*Math.cos(a),H-R+R*Math.sin(a)]).slice(1,-1);
 const panelOutline=clean([...stem.slice(0,pi+1),...top,...stem.slice(pi+1)]),panel=part('headphone-panel','Soporte trasero de audífonos · dos pies',panelOutline,[],frame([px,rearY,0],[1,0,0],[0,0,1],[0,1,0],[0,1,0]),['bottom','headphone-saddle']);parts.push(panel);
 for(let i=0;i<feet.length;i++){const x=px+feet[i];base.holes.push(slot(x-1.5*m-fit/2,rearY-fit/2,3*m+2*fit,t+fit));attachHorizontalKey(parts,base,panel,[x,rearY+t/2,baseZ-t],'Y','rear-'+i,m,t,fit);}
 const saddleW=Math.max(12*m,W*.44),saddleD=Math.max(5*m,35),saddleX=W/2-saddleW/2,saddleY=rearY-saddleD,tongues=[saddleW/2-2.5*m,saddleW/2+2.5*m],saddleRects=[[0,0,saddleW,saddleD]],saddleHoles=[];
 for(let i=0;i<2;i++){const x=tongues[i];saddleRects.push([x-1.5*m-fit/2,saddleD,x+1.5*m+fit/2,saddleD+2*t+2*m+fit/2]);panel.holes.push(slot(saddleX+x-px-1.5*m-fit/2,saddleZ-fit/2,3*m+2*fit,t+fit));saddleHoles.push(slot(x-m/2-fit/2,saddleD+t+m-fit/2,m+fit,t+fit));
  const k=part('saddle-key-'+i,'Seguro suelto del apoyo de audífonos '+(i+1),[[m,0],[2*m,0],[2*m,m+t],[3*m,m+t],[3*m,2*m+t],[0,2*m+t],[0,m+t],[m,m+t]],[],frame([saddleX+x-1.5*m,rearY+t+m,saddleZ-m],[1,0,0],[0,0,1],[0,1,0],[1,0,0]),['headphone-saddle'],{loose:true,role:'locking-key'});parts.push(k);}
 const saddle=part('headphone-saddle','Apoyo horizontal de diadema · dos seguros',union(saddleRects),saddleHoles,frame([saddleX,saddleY,saddleZ],[1,0,0],[0,1,0],[0,0,1],[0,-1,0]),['headphone-panel','saddle-key-0','saddle-key-1']);parts.push(saddle);
 const cheekXs=[W/2-cradleW/2,W/2+cradleW/2-t],frontU=m+fit/2,shelfU=frontU+t,backU=cradleL-m,topZ=shelfZ+4*m+t,cheeks=[];
 for(let i=0;i<2;i++){const x=cheekXs[i],footSpans=[.23,.77].map(q=>[cradleL*q-1.5*m-fit/2,cradleL*q+1.5*m+fit/2]),profile=clean([[0,baseZ+t],[cradleL,baseZ+t],[cradleL,topZ+m],[cradleL*.82,topZ+m],[cradleL*.68,shelfZ+2*m],[frontU+t+2*m,shelfZ+2*m],[frontU+t+m,topZ],[0,topZ]]),rs=decompose(profile);for(const[a,b]of footSpans)rs.push([a,0,b,baseZ+t]);const p=part('cradle-'+(i?'right':'left'),'Costilla de apoyo del control '+(i?'derecha':'izquierda'),union(rs),[],frame([x,cradleY,0],[0,1,0],[0,0,1],[1,0,0],[i?1:-1,0,0]),['bottom','controller-shelf','controller-stop']);parts.push(p);cheeks.push(p);
  for(let j=0;j<2;j++){const[a,b]=footSpans[j],y=cradleY+(a+b)/2;base.holes.push(slot(x-fit/2,cradleY+a-fit/2,t+fit,b-a+fit));attachHorizontalKey(parts,base,p,[x+t/2,y,baseZ-t],'X',(i?'R':'L')+j,m,t,fit);}
 }
 const tabYs=[cradleL*.40,cradleL*.68],shelfRects=[[t,shelfU,cradleW-t,backU]];for(const y of tabYs){shelfRects.push([0,y-m/2,t,y+m/2],[cradleW-t,y-m/2,cradleW,y+m/2]);for(const p of cheeks)p.holes.push(slot(y-m/2-fit/2,shelfZ-fit/2,m+fit,t+fit));}
 parts.push(part('controller-shelf','Repisa de apoyo del control',union(shelfRects),[],frame([cheekXs[0],cradleY,shelfZ],[1,0,0],[0,1,0],[0,0,1],[0,0,1]),cheeks.map(p=>p.id)));
 const stopZ=shelfZ+t,stopH=3*m,stopRects=[[t,0,cradleW-t,stopH],[0,m,t,2*m],[cradleW-t,m,cradleW,2*m]];parts.push(part('controller-stop','Tope frontal del control · pestañas capturadas',union(stopRects),[],frame([cheekXs[0],cradleY+frontU,stopZ],[1,0,0],[0,0,1],[0,1,0],[0,-1,0]),cheeks.map(p=>p.id)));for(const p of cheeks)p.holes.push(slot(frontU-fit/2,stopZ+m-fit/2,t+fit,m+fit));
 for(const p of parts)p.jointHoles=p.holes.map((_,i)=>i);auditWebs(parts,m);return parts;
}
