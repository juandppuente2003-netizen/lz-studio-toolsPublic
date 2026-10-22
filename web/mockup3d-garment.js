// Prendas 3D paramétricas para Mockups 3D. Unidades: 1 unidad = 52 cm (ancho de pecho de una playera talla M).
import * as THREE from './box/vendor/three.module.min.js';

export const UNIT_CM=52;
export const garments={
 tee:{name:'Playera',sleeve:{length:.40,start:.165,end:.145,angle:-34},width:.50,depth:.205,hem:-.80,shoulder:.40},
 oversized:{name:'Playera oversize',sleeve:{length:.44,start:.19,end:.175,angle:-30},width:.56,depth:.22,hem:-.76,shoulder:.47},
 long:{name:'Manga larga',sleeve:{length:.98,start:.165,end:.095,angle:-67,inset:.07,y:.37},width:.49,depth:.20,hem:-.82,shoulder:.39}
};
const smooth=(a,b,t)=>{t=Math.min(1,Math.max(0,(t-a)/(b-a)));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
// Sección superelíptica: se parece más a una prenda (lados más rectos) que una elipse.
function section(theta,w,d,n=2.6){const c=Math.cos(theta),s=Math.sin(theta);return [Math.sign(c)*w*Math.abs(c)**(2/n),Math.sign(s)*d*Math.abs(s)**(2/n)];}

function bodyGeometry(g){
 const rows=96,cols=128,top=.60,positions=[],uvs=[],index=[];
 for(let r=0;r<=rows;r++){
  const v=r/rows,y=lerp(g.hem,top,v);
  // Ancho: cadera, cintura, pecho, hombros y cuello.
  let w=g.width*(1.02-.03*smooth(g.hem,-.35,y)+.02*smooth(-.35,.15,y));
  w=lerp(w,g.shoulder,smooth(.28,.50,y));w=lerp(w,.165,smooth(.49,top,y));
  let d=g.depth*(1+.05*smooth(-.4,.12,y)-.05*smooth(.12,.35,y));d=lerp(d,.135,smooth(.40,top,y));
  for(let c=0;c<=cols;c++){
   // La costura de la malla queda al costado (bajo el brazo), no en el centro de la espalda.
   const u=c/cols,theta=u*Math.PI*2;let [x,z]=section(theta,w,d);
   // Pecho un poco más abombado que la espalda.
   if(z>0)z*=1+.06*smooth(-.3,.2,y)*(1-smooth(.35,.55,y));
   let yy=y;
   // Escote: más bajo al frente.
   const front=Math.max(0,z/Math.max(1e-6,d));if(v>.9)yy-=.07*front**1.6*smooth(.9,1,v);
   // Pliegues suaves en cintura y axilas (no alteran las zonas de estampado).
   const fold=.004*Math.sin(theta*7+y*9)*smooth(-.75,-.4,y)*(1-smooth(-.2,0,y))+.003*Math.sin(theta*11)*smooth(.25,.4,y)*(1-smooth(.45,.55,y));
   x+=x*fold*4;z+=z*fold*4;
   positions.push(x,yy,z);uvs.push(u,v);
  }
 }
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*(cols+1)+c,b=a+cols+1;index.push(a,b,a+1,b,b+1,a+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(index);geo.computeVertexNormals();return geo;
}
function sleeveGeometry(g,side){
 const s=g.sleeve,rows=40,cols=64,positions=[],index=[],uvs=[];
 const start=new THREE.Vector3(side*(g.shoulder-(s.inset??.03)),s.y??.40,0),a=THREE.MathUtils.degToRad(s.angle),dir=new THREE.Vector3(side*Math.cos(a),Math.sin(a),0).normalize();
 const ax=new THREE.Vector3(0,0,1),ay=new THREE.Vector3().crossVectors(dir,ax).normalize();
 for(let r=0;r<=rows;r++){const v=r/rows,center=start.clone().addScaledVector(dir,v*s.length),rad=lerp(s.start,s.end,v)*(1+.03*Math.sin(v*Math.PI));
  for(let c=0;c<=cols;c++){const t=c/cols*Math.PI*2,p=center.clone().addScaledVector(ay,Math.cos(t)*rad).addScaledVector(ax,Math.sin(t)*rad*.86);positions.push(p.x,p.y,p.z);uvs.push(c/cols,v);}}
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const i=r*(cols+1)+c,j=i+cols+1;index.push(i,j,i+1,j,j+1,i+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(index);geo.computeVertexNormals();
 // Puño o dobladillo
 const end=start.clone().addScaledVector(dir,s.length),cuff=new THREE.TorusGeometry(s.end*.93,.012,10,48);cuff.lookAt(dir);cuff.translate(end.x,end.y,end.z);
 return {geo,cuff};
}
function fabricNormal(){
 // Textura de punto: ruido fino + trama vertical, como mapa normal en mosaico.
 const size=256,c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d'),img=x.createImageData(size,size);
 const h=new Float32Array(size*size);for(let i=0;i<h.length;i++){const px=i%size,py=(i/size)|0;h[i]=.5+.18*Math.sin(px*Math.PI/2)*.5+.25*(Math.random()-.5)+.08*Math.sin(py*.7);}
 for(let py=0;py<size;py++)for(let px=0;px<size;px++){const i=py*size+px,dx=h[py*size+(px+1)%size]-h[py*size+(px+size-1)%size],dy=h[((py+1)%size)*size+px]-h[((py+size-1)%size)*size+px];img.data[i*4]=128+dx*90;img.data[i*4+1]=128+dy*90;img.data[i*4+2]=255;img.data[i*4+3]=255;}
 x.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(10,10);return t;
}
let normalMap=null;
export function buildGarment(type,color){
 const g=garments[type]||garments.tee;normalMap??=fabricNormal();
 const material=new THREE.MeshStandardMaterial({color,roughness:.93,metalness:0,normalMap,normalScale:new THREE.Vector2(.35,.35),side:THREE.DoubleSide});
 const group=new THREE.Group();group.name=type;
 const body=new THREE.Mesh(bodyGeometry(g),material);body.name='body';group.add(body);
 const meshes={body};
 for(const side of [-1,1]){const {geo,cuff}=sleeveGeometry(g,side),sleeve=new THREE.Mesh(geo,material);sleeve.name=side<0?'sleeveR':'sleeveL';group.add(sleeve,new THREE.Mesh(cuff,material));meshes[sleeve.name]=sleeve;}
 // Cuello acanalado y dobladillo
 const collarCurve=[];for(let i=0;i<=64;i++){const t=i/64*Math.PI*2-Math.PI/2,[x,z]=section(t,.165,.135),front=Math.max(0,z/.135);collarCurve.push(new THREE.Vector3(x,.60-.07*front**1.6,z));}
 const collar=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collarCurve,true),96,.016,10,true),material);group.add(collar);
 const hemCurve=[];for(let i=0;i<=64;i++){const t=i/64*Math.PI*2-Math.PI/2,[x,z]=section(t,g.width*1.02,g.depth);hemCurve.push(new THREE.Vector3(x,g.hem,z));}
 group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemCurve,true),128,.008,8,true),material));
 return {group,material,meshes,spec:g};
}
// Puntos de colocación rápida (en coordenadas de la prenda).
export function placements(spec){
 const s=spec.sleeve,a=THREE.MathUtils.degToRad(s.angle),mid=v=>new THREE.Vector3((spec.shoulder-(s.inset??.03))+Math.cos(a)*s.length*v,(s.y??.40)+Math.sin(a)*s.length*v,0);
 return {front:{target:'body',from:new THREE.Vector3(0,.18,2),to:new THREE.Vector3(0,.18,0)},back:{target:'body',from:new THREE.Vector3(0,.22,-2),to:new THREE.Vector3(0,.22,0)},sleeveL:{target:'sleeveL',from:mid(.5).add(new THREE.Vector3(1.5,0,0)),to:mid(.5)},sleeveR:{target:'sleeveR',from:mid(.5).multiply(new THREE.Vector3(-1,1,1)).add(new THREE.Vector3(-1.5,0,0)),to:mid(.5).multiply(new THREE.Vector3(-1,1,1))},chestLeft:{target:'body',from:new THREE.Vector3(.16,.30,2),to:new THREE.Vector3(.16,.30,0)}};
}
