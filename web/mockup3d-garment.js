// Prendas 3D para Mockups 3D, construidas desde su patrón plano real (silueta en cm) e infladas
// como una prenda en maniquí invisible: panel delantero y trasero unidos en las costuras.
// Unidades de escena: 1 unidad = 52 cm.
import * as THREE from './box/vendor/three.module.min.js';

export const UNIT_CM=52;
const OFFSET_Y=.36;

// Media silueta (lado derecho de la imagen = lado izquierdo de quien la viste), en cm.
// y = 0 en el punto alto del hombro junto al cuello. Cada punto: [x, y, esquina].
const patterns={
 tee:{name:'Playera regular',neck:{w:9.2,front:9.5,back:2.2},depth:10,shoulder:22.8,
  half:[[9.2,0,1],[16,-2.4],[22.8,-4.6,1],[30.5,-11.5],[36.5,-18.2,1],[30.8,-27.6,1],[26.6,-24.4,1],[26.2,-36],[25.6,-50],[26.4,-70.5,1],[13,-71.2],[0,-71.4]],
  chest:-21,back:-17,sleeve:[31,-18],raglan:false,armpit:[26.6,-24.4]},
 dryfit:{name:'Dry fit deportiva',neck:{w:8.6,front:8.8,back:2},depth:9,shoulder:21.6,
  half:[[8.6,0,1],[15.5,-2.6],[21.6,-4.8,1],[28.8,-11.8],[33.6,-17.4,1],[28.6,-25.8,1],[24.8,-23.2,1],[24,-34],[22.6,-47],[23.8,-69.5,1],[12,-70.6],[0,-71]],
  chest:-20,back:-16,sleeve:[28.6,-17],raglan:true,armpit:[24.8,-23.2]},
 oversized:{name:'Playera oversize',neck:{w:10,front:9,back:2.4},depth:10.5,shoulder:29.5,
  half:[[10,0,1],[19,-3],[29.5,-6.5,1],[36,-15.5],[40.5,-24.5,1],[33.2,-33.5,1],[30.6,-31,1],[30.4,-45],[30.4,-68.5,1],[15,-69.2],[0,-69.4]],
  chest:-22,back:-18,sleeve:[35.5,-22],raglan:false,armpit:[30.6,-31]},
 long:{name:'Manga larga',neck:{w:9,front:9.2,back:2.1},depth:9.6,shoulder:22.6,
  half:[[9,0,1],[16,-2.4],[22.6,-4.6,1],[27.5,-16],[32,-34],[36.6,-58.5],[37.6,-63.6,1],[31,-65,1],[29.6,-58],[28.4,-40],[26.4,-24.6,1],[26,-36],[25.4,-50],[26.2,-71,1],[13,-71.8],[0,-72]],
  chest:-21,back:-17,sleeve:[32.4,-44],raglan:true,armpit:[26.4,-24.6]}
};
export const garments=Object.fromEntries(Object.entries(patterns).map(([id,p])=>[id,{name:p.name}]));

/* Geometría 2D --------------------------------------------------------- */
const backNeckY=(p,x)=>-p.neck.back*Math.max(0,1-(x/p.neck.w)**2)**.9;
const frontNeckY=(p,x)=>-p.neck.front*Math.max(0,1-(x/p.neck.w)**2)**.75;
// Contorno completo, suavizado (Chaikin) salvo en las esquinas marcadas.
function outline(p){
 const right=p.half;
 const loop=[...right.map(v=>[...v]),...right.slice(0,-1).reverse().map(([x,y,c])=>[-x,y,c])];
 // Borde superior: escote trasero, del cuello izquierdo al derecho.
 for(let i=1;i<12;i++){const x=-p.neck.w+2*p.neck.w*i/12;loop.push([x,backNeckY(p,x),0]);}
 let out=loop;
 for(let k=0;k<3;k++){const next=[];for(let i=0;i<out.length;i++){const a=out[i],b=out[(i+1)%out.length];if(a[2])next.push(a);else next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25,0]);next.push([a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75,0]);}out=next;}
 return out.map(([x,y])=>[x,y]);
}
function frontNeck(p){const pts=[];for(let i=0;i<=28;i++){const x=-p.neck.w+2*p.neck.w*i/28;pts.push([x,frontNeckY(p,x)]);}return pts;}
function inside(poly,x,y){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;}
function segDist(px,py,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/(dx*dx+dy*dy||1)));const x=a[0]+t*dx,y=a[1]+t*dy;return [Math.hypot(x-px,y-py),x,y];}
function nearest(poly,x,y,closed=true){let best=[Infinity,x,y];const n=poly.length;for(let i=0;i<(closed?n:n-1);i++){const r=segDist(x,y,poly[i],poly[(i+1)%n]);if(r[0]<best[0])best=r;}return best;}
// Ruido suave para arrugas leves.
const noise=(x,y)=>Math.sin(x*.37+y*.11)*.5+Math.sin(x*.13-y*.29+1.7)*.35+Math.sin(x*.71+y*.53+.4)*.15;

/* Panel inflado ------------------------------------------------------- */
function panel(p,side){
 const poly=outline(p),neckCurve=frontNeck(p),h=.7,isFront=side>0;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const [x,y] of poly){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 const nx=Math.ceil((maxX-minX)/h)+3,ny=Math.ceil((maxY-minY)/h)+3,x0=minX-h,y0=minY-h,idx=new Int32Array(nx*ny).fill(-1),pos=[],uv=[],dist=[];
 const belowNeck=(x,y)=>Math.abs(x)>=p.neck.w||y<=frontNeckY(p,x);
 const valid=(x,y)=>inside(poly,x,y)&&(!isFront||belowNeck(x,y));
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  let x=x0+i*h,y=y0+j*h;
  if(!valid(x,y)){
   // Vértices exteriores vecinos del borde: se llevan al contorno para una silueta limpia.
   let near=false;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]])if(valid(x+di*h,y+dj*h)){near=true;break;}
   if(!near)continue;
   const a=nearest(poly,x,y);let bx=a[1],by=a[2];
   if(isFront&&Math.abs(x)<p.neck.w+h&&y>-p.neck.front-2*h){const b=nearest(neckCurve,x,y,false);if(b[0]<a[0]){bx=b[1];by=b[2];}}
   x=bx;y=by;
  }
  idx[j*nx+i]=pos.length/3;
  let d=nearest(poly,x,y)[0];if(isFront&&Math.abs(x)<p.neck.w+4&&y>-p.neck.front-4)d=Math.min(d,nearest(neckCurve,x,y,false)[0]+.8);
  dist.push(d);pos.push(x,y,0);uv.push((x-minX)/(maxX-minX),(y-minY)/(maxY-minY));
 }
 // Inflado: perfil redondeado junto a la costura y casi plano al centro.
 const R=p.depth*1.6;
 for(let k=0;k<dist.length;k++){
  const x=pos[k*3],y=pos[k*3+1],t=Math.min(1,dist[k]/R),prof=Math.sqrt(1-(1-t)**2);
  let z=p.depth*prof*(isFront?1:.85);
  const chest=Math.exp(-(((y+20)/15)**2))*(isFront?1.1:.45),sleeve=Math.abs(x)>p.shoulder-1?1:0;
  z+=chest*prof+prof*(.32*noise(x,y)*(.35+.65*sleeve)+.3*noise(x*1.7,y*1.3)*Math.exp(-(((y+68)/6)**2)));
  pos[k*3+2]=side*z;
 }
 const index=[];
 for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
  const a=idx[j*nx+i],b=idx[j*nx+i+1],c=idx[(j+1)*nx+i],d=idx[(j+1)*nx+i+1];
  const tri=(u,v,w)=>{if(u<0||v<0||w<0)return;const cx=(pos[u*3]+pos[v*3]+pos[w*3])/3,cy=(pos[u*3+1]+pos[v*3+1]+pos[w*3+1])/3;if(!valid(cx,cy))return;if(side>0)index.push(u,v,w);else index.push(u,w,v);};
  tri(a,b,d);tri(a,d,c);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos.map(v=>v/UNIT_CM),3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(index);geo.computeVertexNormals();
 return {geo,neckCurve};
}

function knitNormal(){
 const size=256,c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d'),img=x.createImageData(size,size),h=new Float32Array(size*size);
 for(let py=0;py<size;py++)for(let px=0;px<size;px++){const rib=Math.sin(px*Math.PI/2)*.5+.5,row=Math.sin(py*Math.PI/3+((px>>1)&1)*Math.PI)*.5+.5;h[py*size+px]=rib*.6+row*.25+Math.random()*.15;}
 for(let py=0;py<size;py++)for(let px=0;px<size;px++){const i=py*size+px,dx=h[py*size+(px+1)%size]-h[py*size+(px+size-1)%size],dy=h[((py+1)%size)*size+px]-h[((py+size-1)%size)*size+px];img.data[i*4]=128+dx*70;img.data[i*4+1]=128+dy*70;img.data[i*4+2]=255;img.data[i*4+3]=255;}
 x.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(14,14);return t;
}
let normalMap=null;
function tubeAlong(points,radius,material){const curve=new THREE.CatmullRomCurve3(points.map(([x,y,z])=>new THREE.Vector3(x/UNIT_CM,y/UNIT_CM,z/UNIT_CM)));return new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(32,points.length*3),radius/UNIT_CM,10,false),material);}

export function buildGarment(type,color){
 const p=patterns[type]||patterns.tee;normalMap??=knitNormal();
 const material=new THREE.MeshPhysicalMaterial({color,roughness:.88,metalness:0,sheen:1,sheenRoughness:.55,sheenColor:new THREE.Color(0x8a8a8a),normalMap,normalScale:new THREE.Vector2(.28,.28),side:THREE.DoubleSide});
 const group=new THREE.Group();group.name=type;
 const front=panel(p,1),back=panel(p,-1);
 const frontMesh=new THREE.Mesh(front.geo,material),backMesh=new THREE.Mesh(back.geo,material);frontMesh.name='front';backMesh.name='back';group.add(frontMesh,backMesh);
 // Cuello acanalado: escote delantero y trasero.
 group.add(tubeAlong(front.neckCurve.map(([x,y])=>[x,y-.5,p.depth*.12]),.8,material));
 const neckBack=[];for(let i=0;i<=24;i++){const x=-p.neck.w+2*p.neck.w*i/24;neckBack.push([x,backNeckY(p,x)-.3,-p.depth*.08]);}group.add(tubeAlong(neckBack,.75,material));
 // Costuras raglán (deportiva y manga larga): del cuello a la axila, al frente y atrás.
 if(p.raglan){const seam=material.clone();seam.color.multiplyScalar(.78);seam.normalMap=null;
  for(const s of [-1,1])for(const face of [1,-1]){const a=[s*p.neck.w*.8,backNeckY(p,p.neck.w*.8)-1.2],b=[s*p.armpit[0]*.98,p.armpit[1]+1.2],pts=[];for(let i=0;i<=18;i++){const t=i/18,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t-Math.sin(t*Math.PI)*2.4;pts.push([x,y,face*p.depth*(face>0?1:.85)*(.55+.45*Math.sin(Math.min(1,t*1.2)*Math.PI/2))]);}group.add(tubeAlong(pts,.16,seam));}}
 group.position.y=OFFSET_Y;group.updateMatrixWorld(true);
 return {group,material,meshes:{front:frontMesh,back:backMesh},spec:p};
}
// Puntos de colocación rápida, en coordenadas de escena.
export function placements(p){
 const s=v=>v/UNIT_CM,at=(x,y,z)=>({from:new THREE.Vector3(s(x),s(y)+OFFSET_Y,z*2),to:new THREE.Vector3(s(x),s(y)+OFFSET_Y,0)});
 return {front:at(0,p.chest,1),back:at(0,p.back,-1),chestLeft:at(p.neck.w+2,p.chest+5,1),sleeveL:at(p.sleeve[0],p.sleeve[1],1),sleeveR:at(-p.sleeve[0],p.sleeve[1],1)};
}
// Zona según el punto: mangas fuera del ancho de hombros.
export function zoneOf(p,point,face){const x=point.x*UNIT_CM,y=(point.y-OFFSET_Y)*UNIT_CM,ax=Math.abs(x);if(ax>p.armpit[0]+.5||(ax>p.shoulder&&y>p.armpit[1]))return x>0?'sleeveL':'sleeveR';return face;}
