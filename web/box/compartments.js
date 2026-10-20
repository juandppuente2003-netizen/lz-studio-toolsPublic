import {materialWeb,jointInset,frame,rect} from './models.js?v=3.5';
import {auditWebs,ringDistance} from './structure.js?v=3.5';
import {inside} from './direct-edit.js?v=3.5';

export const compartmentModels=['box','tray','crate','bag','heart'];
export const canDivide=s=>compartmentModels.includes(s.model||'box')&&(s.model!=='box'||!s.shape||s.shape==='rect');
export function cleanGrid(raw){
 if(raw==null)return{enabled:false,cols:3,rows:2,height:40,x:[],y:[],removed:[]};
 const g={enabled:raw.enabled===true,cols:+raw.cols,rows:+raw.rows,height:+raw.height,x:[],y:[],removed:[]};
 if(![g.cols,g.rows].every(n=>Number.isInteger(n)&&n>=1&&n<=8)||!Number.isFinite(g.height)||g.height<12||g.height>2400)throw Error('La retícula admite de 1 a 8 filas/columnas y un alto de división de al menos 12 mm.');
 for(const axis of['x','y']){const n=axis==='x'?g.cols:g.rows,values=raw[axis];g[axis]=Array.isArray(values)&&values.length===n-1?values.map(Number):Array.from({length:n-1},(_,i)=>100*(i+1)/n);if(g[axis].some((v,i)=>!Number.isFinite(v)||v<=0||v>=100||(i&&v<=g[axis][i-1])))throw Error('Las divisiones deben conservar su orden entre 0 y 100%.');}
 if(!Array.isArray(raw.removed??[])||(raw.removed?.length||0)>112)throw Error('Retícula inválida.');
 g.removed=[...new Set(raw.removed||[])].filter(k=>typeof k==='string'&&/^[xy]:\d+:\d+$/.test(k));
 for(const key of g.removed){const[a,line,cell]=key.split(':');if(+line<1||+line>=(a==='x'?g.cols:g.rows)||+cell<0||+cell>=(a==='x'?g.rows:g.cols))throw Error('Un tramo de división ya no pertenece a esta retícula.');}
 return g;
}
export function gridRuns(raw){const g=cleanGrid(raw),gone=new Set(g.removed),runs=[];
 for(const axis of['x','y']){const n=axis==='x'?g.cols:g.rows,cells=axis==='x'?g.rows:g.cols;for(let line=1;line<n;line++){let start=null;for(let cell=0;cell<=cells;cell++){const on=cell<cells&&!gone.has(`${axis}:${line}:${cell}`);if(on&&start===null)start=cell;if(!on&&start!==null){runs.push({axis,line,start,end:cell,id:`grid-${axis}-${line}-${start}-${cell}`});start=null;}}}}
 return runs;
}
export function mergeCells(raw,selected,restore=false){const g=cleanGrid(raw),set=new Set(selected),gone=new Set(g.removed);for(let y=0;y<g.rows;y++)for(let x=0;x<g.cols;x++)if(set.has(`${x}:${y}`)){for(const[key,neighbor]of[[`x:${x+1}:${y}`,`${x+1}:${y}`],[`y:${y+1}:${x}`,`${x}:${y+1}`]])if(set.has(neighbor)){if(restore)gone.delete(key);else gone.add(key);}}return{...g,removed:[...gone]};}
export function removeRun(raw,run){const g=cleanGrid(raw),gone=new Set(g.removed);for(let c=run.start;c<run.end;c++)gone.add(`${run.axis}:${run.line}:${c}`);return{...g,removed:[...gone]};}
export function cellGroups(raw){const g=cleanGrid(raw),gone=new Set(g.removed),seen=new Set(),groups=[];for(let y=0;y<g.rows;y++)for(let x=0;x<g.cols;x++){const key=`${x}:${y}`;if(seen.has(key))continue;const group=[],queue=[[x,y]];seen.add(key);while(queue.length){const[a,b]=queue.pop();group.push(`${a}:${b}`);for(const[c,d,k]of[[a-1,b,`x:${a}:${b}`],[a+1,b,`x:${a+1}:${b}`],[a,b-1,`y:${b}:${a}`],[a,b+1,`y:${b+1}:${a}`]])if(c>=0&&c<g.cols&&d>=0&&d<g.rows&&!seen.has(`${c}:${d}`)&&gone.has(k)){seen.add(`${c}:${d}`);queue.push([c,d]);}}groups.push(group);}return groups;}
export function compartmentSpec(s,d,parts){
 const g=cleanGrid(s.grid),{W,D,H,t}=d,B=jointInset(s),base=parts.find(p=>p.id==='bottom'),floor=base.frame.o[2]+t,top=parts.find(p=>p.id==='top'),bodyH=['tray','crate','bag','heart'].includes(s.model)?H-(+s.handleRise):H,ceiling=top?top.frame.o[2]:bodyH,gap=Math.max(.2,(+s.clearance)/2),y0=t+gap,y1=D-t-gap;let x0=B+t+gap,x1=W-B-t-gap;
 if(['bag','heart'].includes(s.model)){const wallX=(p,z,n)=>p.frame.o[0]+(z-p.frame.o[2])*p.frame.v[0]/p.frame.v[2]+n*(p.frame.n[0]-p.frame.n[2]*p.frame.v[0]/p.frame.v[2]),left=parts.find(p=>p.id==='left'),right=parts.find(p=>p.id==='right'),zs=[floor,Math.min(ceiling,floor+g.height)];x0=Math.min(...base.p.map(p=>p[0]))+gap;x1=Math.max(...base.p.map(p=>p[0]))-gap;for(const z of zs){x0=Math.max(x0,wallX(left,z,0)+gap,wallX(left,z,t)+gap);x1=Math.min(x1,wallX(right,z,0)-gap,wallX(right,z,t)-gap);}}
 return{g,base,floor,ceiling,x0,x1,y0,y1,x:[x0,...g.x.map(q=>x0+(x1-x0)*q/100),x1],y:[y0,...g.y.map(q=>y0+(y1-y0)*q/100),y1]};
}
const slot=(x,y,w,h)=>rect(w,h).map(([u,v])=>[x+u,y+v]);
// Orthogonal outline from a rectangle minus edge notches, plus two lower tenons.
function profile(length,height,t,notches,tabs,topOpen,fit){
 const bottom=topOpen?[]:notches,top=topOpen?notches:[],half=t+(height-t)/2,out=[[0,t]];
 const features=[...tabs.map(a=>({a,b:a+2*t,z:0})),...bottom.map(u=>({a:u-(t+fit)/2,b:u+(t+fit)/2,z:half+fit/2}))].sort((a,b)=>a.a-b.a);
 for(const f of features)out.push([f.a,t],[f.a,f.z],[f.b,f.z],[f.b,t]);out.push([length,t],[length,height]);
 for(const u of [...top].sort((a,b)=>b-a))out.push([u+(t+fit)/2,height],[u+(t+fit)/2,half-fit/2],[u-(t+fit)/2,half-fit/2],[u-(t+fit)/2,height]);out.push([0,height]);return out;
}
export function addCompartments(parts,s,d){
 const g=cleanGrid(s.grid);if(!g.enabled||!canDivide(s))return parts;
 const q=compartmentSpec(s,d,parts),{base,floor,ceiling,x,y}=q,{t}=d,m=materialWeb(s),fit=+s.clearance,web=m+fit/2;
 if(g.height<4*m||g.height>ceiling-floor-1)throw Error(`Las divisiones necesitan un alto de ${4*m} a ${Math.floor(ceiling-floor-1)} mm. Ajusta su alto o aumenta la caja.`);
 for(const[axis,positions]of[['ancho',x],['fondo',y]])for(let i=1;i<positions.length;i++)if(positions[i]-positions[i-1]<5*m+2*t+fit)throw Error(`Falta ${axis} para esa retícula. Cada columna/fila necesita al menos ${(5*m+2*t+fit).toFixed(1)} mm entre divisiones; reduce su cantidad o aumenta la caja.`);
 const runs=gridRuns(g).map(run=>({...run,position:(run.axis==='x'?x:y)[run.line],a:(run.axis==='x'?y:x)[run.start],b:(run.axis==='x'?y:x)[run.end],crosses:[]}));
 // End-to-face T junctions stay separate; through crossings use complementary half laps.
 for(const a of runs)for(const b of runs)if(a.axis==='x'&&b.axis==='y'){
  const epsilon=1e-6;if(b.position<a.a-epsilon||b.position>a.b+epsilon||a.position<b.a-epsilon||a.position>b.b+epsilon)continue;
  const ax=b.position>a.a+epsilon&&b.position<a.b-epsilon,by=a.position>b.a+epsilon&&a.position<b.b-epsilon;
  if(ax&&by){a.crosses.push(b.position);b.crosses.push(a.position);a.connections??=[];b.connections??=[];a.connections.push(b.id);b.connections.push(a.id);}
  else{if(!ax){if(Math.abs(a.a-b.position)<epsilon)a.a+=t/2+fit/2;else a.b-=t/2+fit/2;}if(!by&&ax){if(Math.abs(b.a-a.position)<epsilon)b.a+=t/2+fit/2;else b.b-=t/2+fit/2;}}
 }
 base.holes??=[];base.jointHoles??=[];base.connections??=[];
 for(const run of runs){const length=run.b-run.a,notches=run.crosses.map(pos=>pos-run.a),w=2*t;
  const holeAt=u=>run.axis==='x'?slot(run.position-t/2-fit/2-base.frame.o[0],run.a+u-fit/2-base.frame.o[1],t+fit,w+fit):slot(run.a+u-fit/2-base.frame.o[0],run.position-t/2-fit/2-base.frame.o[1],w+fit,t+fit);
  const candidates=[];for(let u=web;u+w+web<=length+1e-6;u+=Math.max(.5,t/2)){
   if(run.axis==='y'&&notches.some(v=>u+w+web>v-(t+fit)/2&&u-web<v+(t+fit)/2))continue;
   const hole=holeAt(u);if(hole.every(v=>inside(base.p,v))&&ringDistance(base.p,hole)>=m-1e-5&&!base.holes.some(old=>inside(old,hole[0])||inside(hole,old[0])||ringDistance(old,hole)<m-1e-5))candidates.push(u);
  }
  const first=candidates[0],last=candidates.at(-1);if(first===undefined||last-first<w+web)throw Error('Una división queda demasiado corta para dos pestañas resistentes. Amplía sus celdas o une los espacios pequeños.');
  const tabs=[first,last];for(const u of tabs){base.jointHoles.push(base.holes.length);base.holes.push(holeAt(u));}base.connections.push(run.id);
  const h=g.height+t,p=profile(length,h,t,notches,tabs,run.axis==='x',fit),position=run.position,origin=run.axis==='x'?[position-t/2,run.a,floor-t]:[run.a,position-t/2,floor-t];
  parts.push({id:run.id,name:`División ${run.axis==='x'?'X':'Y'}${run.line} · tramo ${run.start+1}–${run.end}`,w:length,h,p,holes:[],jointHoles:[],role:'compartment-divider',gridRun:{axis:run.axis,line:run.line,start:run.start,end:run.end},connections:['bottom',...(run.connections||[])],frame:run.axis==='x'?frame(origin,[0,1,0],[0,0,1],[1,0,0],[0,0,1]):frame(origin,[1,0,0],[0,0,1],[0,1,0],[0,0,1])});
 }
 auditWebs([base],m);return parts;
}
