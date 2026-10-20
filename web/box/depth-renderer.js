import {materialTiles} from './materials.js?v=3.5';
/* Orthographic per-pixel depth. Holes and receiving tenons share one depth
 * buffer; average polygon depth cannot correctly order intersecting bounds. */
function plane(points){const a=points[0];let best=null,size=0;for(let i=1;i<points.length-1;i++){const b=points[i],c=points[i+1],det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(det)<=size)continue;size=Math.abs(det);const x=((b[2]-a[2])*(c[1]-a[1])-(c[2]-a[2])*(b[1]-a[1]))/det,y=((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/det;best=[x,y,a[2]-x*a[0]-y*a[1]];}return size>1e-8?best:null;}
const rgb=hex=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
function uvPlane(basis){if(!basis)return null;const[a,b,c]=basis,x=b[0]-a[0],y=b[1]-a[1],X=c[0]-a[0],Y=c[1]-a[1],det=x*Y-y*X;if(Math.abs(det)<1e-10)return null;return[Y/det,-X/det,(-a[0]*Y+a[1]*X)/det,-y/det,x/det,(a[0]*y-a[1]*x)/det];}
export function depthRaster(faces,width,height,{scale=1,texture='mdf',grain=true,atlas=null,outlines=true,edge='#765532',outline='#b18f5e',showJoints=false,joint='#abd5af'}={}){
 const pixels=new Uint8ClampedArray(width*height*4),depth=new Float32Array(width*height);depth.fill(Infinity);
 const prepared=faces.map(f=>({...f,rings:[f.screen,...(f.holeScreens||[])].map(r=>r.map(p=>[p[0]*scale,p[1]*scale,p[2]])),uv:uvPlane(f.uvBasis?.map(p=>[p[0]*scale,p[1]*scale,p[2]])),color:rgb(f.fill)}));
 for(const f of prepared){const eq=plane(f.rings[0]);if(!eq)continue;const points=f.rings.flat(),minY=Math.max(0,Math.ceil(Math.min(...points.map(p=>p[1]))-.5)),maxY=Math.min(height-1,Math.floor(Math.max(...points.map(p=>p[1]))-.5));
  for(let y=minY;y<=maxY;y++){const yy=y+.5,xs=[];for(const ring of f.rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a[1]>yy)!==(b[1]>yy))xs.push(a[0]+(yy-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);
   for(let i=0;i+1<xs.length;i+=2){const lo=Math.max(0,Math.ceil(xs[i]-.5)),hi=Math.min(width-1,Math.floor(xs[i+1]-.5));for(let x=lo;x<=hi;x++){const index=y*width+x,z=eq[0]*(x+.5)+eq[1]*yy+eq[2];if(z>=depth[index]-1e-6)continue;depth[index]=z;let shade=f.light??1,texel=-1;
     if(grain&&!f.edge&&f.uv&&texture!=='white'&&texture!=='black'){const q=f.uv,u=q[0]*(x+.5)+q[1]*yy+q[2],v=q[3]*(x+.5)+q[4]*yy+q[5];if(atlas&&materialTiles[texture]){const tile=materialTiles[texture],tw=Math.floor(atlas.width/2),th=Math.floor(atlas.height/2),tx=((u/160%1+1)%1),ty=((v/160%1+1)%1),ix=tile[0]*tw+Math.floor(tx*(tw-2))+1,iy=tile[1]*th+Math.floor(ty*(th-2))+1,offset=(iy*atlas.width+ix)*4;texel=offset;}else shade*=texture==='oak'||texture==='walnut'?.965+.035*Math.sin(u*.55+Math.sin(v*.035)*.65):.982+(((Math.floor(u*13)*73856093)^(Math.floor(v*13)*19349663))&255)/255*.028;}
     const at=index*4;pixels[at]=(texel>=0?atlas.data[texel]:f.color[0])*shade;pixels[at+1]=(texel>=0?atlas.data[texel+1]:f.color[1])*shade;pixels[at+2]=(texel>=0?atlas.data[texel+2]:f.color[2])*shade;pixels[at+3]=255;
   }}
  }
 }
 // Only visible edge samples are drawn. Hidden slots and rear panel edges
 // cannot bleed through the surface in front of them.
 const line=(a,b,color)=>{const steps=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))*1.5);if(!steps)return;for(let i=0;i<=steps;i++){const q=i/steps,x=Math.floor(a[0]+(b[0]-a[0])*q),y=Math.floor(a[1]+(b[1]-a[1])*q);if(x<0||x>=width||y<0||y>=height)continue;const index=y*width+x,z=a[2]+(b[2]-a[2])*q;if(z>depth[index]+.025)continue;const at=index*4;pixels[at]=color[0];pixels[at+1]=color[1];pixels[at+2]=color[2];pixels[at+3]=255;}};
 for(const f of prepared){if(!outlines&&!showJoints)continue;const color=rgb(f.rope?f.fill:f.edge?edge:outline);if(outlines)for(const ring of f.rings)for(let i=0;i<ring.length;i++)line(ring[i],ring[(i+1)%ring.length],color);if(showJoints)for(const ring of f.jointScreens||[]){const r=ring.map(p=>[p[0]*scale,p[1]*scale,p[2]]);for(let i=0;i<r.length;i++)line(r[i],r[(i+1)%r.length],rgb(joint));}}
 return {pixels,depth,width,height};
}
