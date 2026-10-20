import {frame,rect,materialWeb} from './models.js?v=3.5';
/* Tenons on horizontal panels and side ends; closed receivers on all walls. */
function spans(L,s){const m=materialWeb(s),fit=+s.clearance,margin=m+fit,length=L-2*margin;if(length<m)throw Error('Aumenta la medida: las ranuras interiores necesitan margen y pestañas resistentes.');let n=Math.max(1,Math.round(length/(+s.finger)));n=Math.min(n,Math.floor(length/(m+fit)));if(n%2===0)n--;n=Math.max(n,1);return Array.from({length:(n+1)/2},(_,k)=>[margin+2*k*length/n,margin+(2*k+1)*length/n]);}
export function internalBox(s,{W,D,H,t},closed,union){
 const m=materialWeb(s),fit=+s.clearance,B=m+fit/2,span=W-2*B,slot=(x,y,w,h)=>rect(w,h).map(([u,v])=>[x+u,y+v]);
 const walls={front:{id:'front',name:'Frente · ranuras interiores',w:W,h:H,p:rect(W,H),holes:[],frame:frame([0,0,0],[1,0,0],[0,0,1],[0,1,0],[0,-1,0])},back:{id:'back',name:'Fondo · ranuras interiores',w:W,h:H,p:rect(W,H),holes:[],frame:frame([0,D-t,0],[1,0,0],[0,0,1],[0,1,0],[0,1,0])}};
 const zs=spans(H,s),sideRects=[[t,0,D-t,H]];for(const[a,b]of zs)sideRects.push([0,a,t,b],[D-t,a,D,b]);
 for(const[id,x,dir]of[['left',B,-1],['right',W-B-t,1]]){walls[id]={id,name:(id==='left'?'Lateral izquierdo':'Lateral derecho')+' · pestañas y receptores',w:D,h:H,p:union(sideRects),holes:[],frame:frame([x,0,0],[0,1,0],[0,0,1],[1,0,0],[dir,0,0])};for(const end of[walls.front,walls.back])for(const[a,b]of zs)end.holes.push(slot(x-fit/2,a-fit/2,t+fit,b-a+fit));}
 const out=Object.values(walls),xs=spans(span-2*t,s).map(([a,b])=>[a+t,b+t]),ys=spans(D-2*t,s).map(([a,b])=>[a+t,b+t]);
 for(const[id,z]of[['bottom',B],...(closed?[['top',H-B-t]]:[])]){
  const rs=[[t,t,span-t,D-t]];for(const[a,b]of xs)rs.push([a,0,b,t],[a,D-t,b,D]);for(const[a,b]of ys)rs.push([0,a,t,b],[span-t,a,span,b]);
  for(const wall of[walls.front,walls.back])for(const[a,b]of xs)wall.holes.push(slot(B+a-fit/2,z-fit/2,b-a+fit,t+fit));
  for(const wall of[walls.left,walls.right])for(const[a,b]of ys)wall.holes.push(slot(a-fit/2,z-fit/2,b-a+fit,t+fit));
  out.push({id,name:id==='bottom'?'Base · pestañas interiores':'Tapa · pestañas interiores',w:span,h:D,p:union(rs),holes:[],frame:frame([B,0,z],[1,0,0],[0,1,0],[0,0,1],[0,0,id==='bottom'?-1:1])});
 }
 for(const p of out){p.jointMode='internal';p.jointHoles=p.holes.map((_,i)=>i);}return out;
}
/* Keep the original outer silhouette. Plates sit below the wall edges and
 * enter closed wall slots; upward rope load is blocked by material above them. */
export function captiveBody(s,{W,D,H,t},shell,union,decompose){
 const fit=+s.clearance,B=materialWeb(s)+fit/2,slot=(x,y,w,h)=>rect(w,h).map(([u,v])=>[x+u,y+v]),out=shell.filter(p=>p.id!=='bottom'),by=id=>out.find(p=>p.id===id);
 for(const p of out){p.p=union([...decompose(p.p),[t,0,p.w-t,t]]);p.holes=[];p.jointHoles=[];}
 const xs=spans(W-2*t,s).map(([a,b])=>[a+t,b+t]),ys=spans(D-2*t,s).map(([a,b])=>[a+t,b+t]);
 for(const[id,z]of[['bottom',B],['top',H-B-t]]){
  const rs=[[t,t,W-t,D-t]];for(const[a,b]of xs)rs.push([a,0,b,t],[a,D-t,b,D]);for(const[a,b]of ys)rs.push([0,a,t,b],[W-t,a,W,b]);
  for(const wall of[by('front'),by('back')])for(const[a,b]of xs)wall.holes.push(slot(a-fit/2,z-fit/2,b-a+fit,t+fit));
  for(const wall of[by('left'),by('right')])for(const[a,b]of ys)wall.holes.push(slot(a-fit/2,z-fit/2,b-a+fit,t+fit));
  out.push({id,name:id==='bottom'?'Base capturada · sin salientes':'Techo capturado · sin salientes',w:W,h:D,p:union(rs),holes:[],jointHoles:[],frame:frame([0,0,z],[1,0,0],[0,1,0],[0,0,1],[0,0,id==='bottom'?-1:1])});
 }
 for(const p of out)p.jointHoles=p.holes.map((_,i)=>i);return out;
}
