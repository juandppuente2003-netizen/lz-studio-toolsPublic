// Extracción local: perspectiva, transparencia por color y limpieza.
// No modelos remotos, claves, solicitudes de red ni reconstrucción generativa.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function validateQuad(points,width,height){
  if(points.length!==4)throw Error('Selecciona cuatro esquinas.');
  let sign=0,area=0;
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
    if(!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.x>width-1||a.y<0||a.y>height-1)throw Error('Las esquinas deben quedar dentro de la imagen.');
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(Math.abs(cross)<1||sign&&Math.sign(cross)!==sign)throw Error('Las esquinas se cruzan o la selección es demasiado estrecha.');
    sign=Math.sign(cross);area+=a.x*b.y-b.x*a.y;
  }
  if(Math.abs(area)<128)throw Error('Amplía la selección del diseño.');
}
function solve(matrix){
  const n=matrix.length;
  for(let i=0;i<n;i++){
    let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(matrix[j][i])>Math.abs(matrix[pivot][i]))pivot=j;
    [matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];
    const value=matrix[i][i];if(Math.abs(value)<1e-10)throw Error('No se pudo corregir esa perspectiva. Ajusta las esquinas.');
    for(let k=i;k<=n;k++)matrix[i][k]/=value;
    for(let j=0;j<n;j++)if(j!==i){const f=matrix[j][i];for(let k=i;k<=n;k++)matrix[j][k]-=f*matrix[i][k];}
  }
  return matrix.map(row=>row[n]);
}
export function projection(points){
  const unit=[[0,0],[1,0],[1,1],[0,1]],matrix=[];
  for(let i=0;i<4;i++){
    const [u,v]=unit[i],{x,y}=points[i];
    matrix.push([u,v,1,0,0,0,-u*x,-v*x,x],[0,0,0,u,v,1,-u*y,-v*y,y]);
  }
  const h=solve(matrix);
  return (u,v)=>{const d=h[6]*u+h[7]*v+1;return {x:(h[0]*u+h[1]*v+h[2])/d,y:(h[3]*u+h[4]*v+h[5])/d};};
}
export function rectify(pixels,width,height,points,ratio=0){
  validateQuad(points,width,height);
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  let w=Math.max(dist(points[0],points[1]),dist(points[3],points[2]))+1,h=Math.max(dist(points[0],points[3]),dist(points[1],points[2]))+1;
  if(ratio>0){if(w/h>ratio)w=h*ratio;else h=w/ratio;}
  const scale=Math.min(1,4096/Math.max(w,h),Math.sqrt(8e6/(w*h)));
  const outW=Math.max(2,Math.round(w*scale)),outH=Math.max(2,Math.round(h*scale)),out=new Uint8ClampedArray(outW*outH*4),map=projection(points);
  for(let y=0;y<outH;y++)for(let x=0;x<outW;x++){
    const p=map(x/(outW-1),y/(outH-1)),sx=clamp(p.x,0,width-1),sy=clamp(p.y,0,height-1),x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;
    const indexes=[(y0*width+x0)*4,(y0*width+Math.min(width-1,x0+1))*4,(Math.min(height-1,y0+1)*width+x0)*4,(Math.min(height-1,y0+1)*width+Math.min(width-1,x0+1))*4];
    const weights=[(1-dx)*(1-dy),dx*(1-dy),(1-dx)*dy,dx*dy],o=(y*outW+x)*4;
    let alpha=0;for(let k=0;k<4;k++)alpha+=pixels[indexes[k]+3]*weights[k];out[o+3]=alpha;
    if(alpha>0)for(let c=0;c<3;c++){let value=0;for(let k=0;k<4;k++)value+=pixels[indexes[k]+c]*pixels[indexes[k]+3]*weights[k];out[o+c]=value/alpha;}
  }
  return {data:out,width:outW,height:outH,reduced:scale<1};
}
export function edgeColor(data,width,height){
  const bins=new Map();
  const add=(x,y)=>{const o=(y*width+x)*4;if(data[o+3]<128)return;const key=(data[o]>>4)*256+(data[o+1]>>4)*16+(data[o+2]>>4);const b=bins.get(key)||[0,0,0,0];b[0]++;for(let c=0;c<3;c++)b[c+1]+=data[o+c];bins.set(key,b);};
  const step=Math.max(1,Math.floor(Math.min(width,height)/150));
  for(let x=0;x<width;x+=step){add(x,0);add(x,height-1);}for(let y=0;y<height;y+=step){add(0,y);add(width-1,y);}
  const best=[...bins.values()].sort((a,b)=>b[0]-a[0])[0];return best?best.slice(1).map(n=>Math.round(n/best[0])):[0,0,0];
}
export function removeColor(data,width,height,{color=[0,0,0],tolerance=35,softness=10,mode='edges',minArea=0}={}){
  const count=width*height,out=new Uint8ClampedArray(data),dist=new Float32Array(count),limit=tolerance+softness;
  for(let p=0;p<count;p++){const o=p*4;dist[p]=Math.hypot(data[o]-color[0],data[o+1]-color[1],data[o+2]-color[2])/Math.sqrt(3);}
  let connected=null;
  if(mode==='edges'){
    connected=new Uint8Array(count);const queue=new Int32Array(count);let head=0,tail=0;
    const visit=p=>{if(!connected[p]&&(dist[p]<=limit||data[p*4+3]===0)){connected[p]=1;queue[tail++]=p;}};
    for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
    while(head<tail){const p=queue[head++],x=p%width;if(x>0)visit(p-1);if(x<width-1)visit(p+1);if(p>=width)visit(p-width);if(p<count-width)visit(p+width);}
  }
  if(mode!=='none')for(let p=0;p<count;p++)if(!connected||connected[p]){
    const factor=softness?clamp((dist[p]-tolerance)/softness,0,1):Number(dist[p]>tolerance);out[p*4+3]=Math.round(data[p*4+3]*factor);
  }
  if(minArea>1){
    const visited=new Uint8Array(count),queue=new Int32Array(count);
    for(let start=0;start<count;start++)if(!visited[start]&&out[start*4+3]>0){
      let head=0,tail=1;queue[0]=start;visited[start]=1;
      while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const n=ny*width+nx;if(!visited[n]&&out[n*4+3]>0){visited[n]=1;queue[tail++]=n;}}
      }
      if(tail<minArea)for(let k=0;k<tail;k++)out[queue[k]*4+3]=0;
    }
  }
  return out;
}
export function alphaBounds(data,width,height){
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  return right<0?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}
