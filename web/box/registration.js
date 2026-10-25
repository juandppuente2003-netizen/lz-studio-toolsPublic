// Rigid registration in millimetres. Never scales or shears fabrication geometry.
export function fitRegistration(pairs,mode='rigid'){
 if(!['rigid','translation'].includes(mode)||!Array.isArray(pairs)||pairs.length<(mode==='rigid'?2:1)||pairs.length>8)throw Error(mode==='rigid'?'Registra al menos dos puntos separados.':'Registra un punto.');
 for(const p of pairs)for(const key of ['design','machine'])if(!Array.isArray(p[key])||p[key].length!==2||!p[key].every(Number.isFinite))throw Error('Punto de referencia inválido.');
 const n=pairs.length,mean=key=>[0,1].map(i=>pairs.reduce((s,p)=>s+p[key][i],0)/n),a=mean('design'),b=mean('machine');
 let c=1,s=0,scale=1;
 if(mode==='rigid'){
  let dot=0,cross=0,source=0,target=0;
  for(const p of pairs){const x=p.design[0]-a[0],y=p.design[1]-a[1],u=p.machine[0]-b[0],v=p.machine[1]-b[1];dot+=x*u+y*v;cross+=x*v-y*u;source+=x*x+y*y;target+=u*u+v*v;}
  if(source<50||target<50)throw Error('Separa las referencias al menos 10 mm.');
  const length=Math.hypot(dot,cross);if(length<1e-9)throw Error('Las referencias no definen una rotación válida.');
  c=dot/length;s=cross/length;scale=Math.sqrt(target/source);
  if(Math.abs(scale-1)>.02)throw Error('La escala medida difiere más del 2%. Revisa las referencias; no se deformará el diseño.');
 }
 const tx=b[0]-c*a[0]+s*a[1],ty=b[1]-s*a[0]-c*a[1],transform=point=>[c*point[0]-s*point[1]+tx,s*point[0]+c*point[1]+ty];
 const errors=pairs.map(p=>Math.hypot(...transform(p.design).map((v,i)=>v-p.machine[i]))),rms=Math.sqrt(errors.reduce((v,e)=>v+e*e,0)/n),max=Math.max(...errors);
 if(max>.5)throw Error(`Error de registro ${max.toFixed(2)} mm; corrige los puntos (máximo 0.50 mm).`);
 return {mode,c,s,tx,ty,scale,rms,max,angle:Math.atan2(s,c)*180/Math.PI};
}
export function transformPoint(point,fit){return [fit.c*point[0]-fit.s*point[1]+fit.tx,fit.s*point[0]+fit.c*point[1]+fit.ty];}
export function registeredJob(job,pairs,mode='rigid'){
 const fit=fitRegistration(pairs,mode),paths=job.paths.map(path=>({...path,points:path.points.map(point=>transformPoint(point,fit).map(v=>Math.round(v*1e6)/1e6))}));
 if(paths.some(path=>path.points.some(([x,y])=>x<0||y<0||x>job.bed.width||y>job.bed.height)))throw Error('El registro coloca parte del trabajo fuera de la cama.');
 return {...job,paths,registrationFit:fit};
}
export function referencePoints(job){
 const points=job.paths.flatMap(p=>p.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),xm=(x0+x1)/2,ym=(y0+y1)/2;
 return [[x0,y0],[xm,y0],[x1,y0],[x1,ym],[x1,y1],[xm,y1],[x0,y1],[x0,ym]];
}
