import {processDesignEffect} from './effects-engine.js';
import {processColorAdjustments} from './color-engine.js';
export function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
const clamp=x=>Math.max(0,Math.min(1,x));
function distance(a,r,g,b){return Math.hypot(r-a[0],g-a[1],b-a[2])/Math.sqrt(3);}
// Grid thresholds preserve area coverage for each shape, including merged highlights.
export function spot(x,y,shape){x=Math.abs(x);y=Math.abs(y);if(shape==='square')return 4*Math.max(x,y)**2;if(shape==='diamond'){const s=x+y;return s<=.5?2*s*s:1-2*(1-s)**2;}if(shape==='line')return 2*y;const r=Math.hypot(x,y);if(r<=.5)return Math.PI*r*r;const cap=r*r*Math.acos(.5/r)-.5*Math.sqrt(r*r-.25);return clamp(Math.PI*r*r-4*cap);}
export function removeIsolatedResidue(data,w,h,pixelsPerCm,sizeMm=.3){
 const diameter=Math.max(.5,pixelsPerCm*sizeMm/10),maxArea=Math.max(1,Math.round(Math.PI*(diameter/2)**2)),visited=new Uint8Array(w*h),stack=[],component=[];
 for(let pos=0;pos<w*h;pos++){
  if(visited[pos]||data[pos*4+3]<12)continue;visited[pos]=1;stack.push(pos);component.length=0;let touchesEdge=false,tooLarge=false;
  while(stack.length){const current=stack.pop(),x=current%w,y=(current/w)|0;component.push(current);if(x===0||y===0||x===w-1||y===h-1)touchesEdge=true;if(component.length>maxArea)tooLarge=true;for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){const next=yy*w+xx;if(!visited[next]&&data[next*4+3]>=12){visited[next]=1;stack.push(next);}}}
  if(!touchesEdge&&!tooLarge)for(const pixel of component)data[pixel*4+3]=0;
 }
 return data;
}
export function processPixels(data,w,h,p,pixelsPerCm,offsetX=0,offsetY=0){
 if(p.effectTool==='color')return processColorAdjustments(data,w,h,p,pixelsPerCm,offsetX,offsetY);
 if(p.effectTool)return processDesignEffect(data,w,h,p,pixelsPerCm,offsetX,offsetY);
 const remove=rgb(p.removeColor),from=rgb(p.fromColor),to=rgb(p.toColor),halftone=rgb(p.halftoneColor||p.removeColor);
 const threshold=p.removeTolerance/100*255,soft=p.softness/100*255,recolor=p.recolorTolerance/100*255;
 const spacing=Math.max(.1,pixelsPerCm*2.54/p.lpi),angle=p.angle*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
 const spacing2=Math.max(.1,pixelsPerCm*2.54/(p.lpi2||p.lpi)),angle2=(p.angle2??105)*Math.PI/180,co2=Math.cos(angle2),si2=Math.sin(angle2);
 const whiteLuma=Math.max(1,.2126*from[0]+.7152*from[1]+.0722*from[2]);
 if(p.cleanupOn){
  for(let i=0;i<data.length;i+=4){let r=data[i],g=data[i+1],b=data[i+2],a=data[i+3]/255;if(p.removeOn){const d=distance(remove,r,g,b);a*=d<=threshold?0:soft>0?clamp((d-threshold)/soft):1;}if(p.recolorOn&&distance(from,r,g,b)<=recolor){const factor=p.keepShading?(.2126*r+.7152*g+.0722*b)/whiteLuma:1;r=Math.min(255,to[0]*factor);g=Math.min(255,to[1]*factor);b=Math.min(255,to[2]*factor);}data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=Math.round(a*255);}
  removeIsolatedResidue(data,w,h,pixelsPerCm,p.cleanupSize||.3);
  if(p.halftoneOn)for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];let a=data[i+3]/255;if(a<=0)continue;let tone;if(p.halftoneMode==='color'){const range=Math.max(1,(p.halftoneRange/100)*255),t=clamp(distance(halftone,r,g,b)/range);tone=t*t*(3-2*t);}else tone=clamp((.2126*r+.7152*g+.0722*b)/255);let coverage=a*tone*(p.coverage/100);const gx=x+offsetX,gy=y+offsetY,u=((gx+.5)*co+(gy+.5)*si)/spacing,v=(-(gx+.5)*si+(gy+.5)*co)/spacing,sx=u-Math.floor(u)-.5,sy=v-Math.floor(v)-.5;if(p.dualHalftone&&coverage>0&&coverage<.999){const each=1-Math.sqrt(1-coverage),u2=((gx+.5)*co2+(gy+.5)*si2)/spacing2,v2=(-(gx+.5)*si2+(gy+.5)*co2)/spacing2,sx2=u2-Math.floor(u2)-.5,sy2=v2-Math.floor(v2)-.5;a=spot(sx,sy,p.shape)<each||spot(sx2,sy2,p.shape)<each?1:0;}else a=coverage>=.999?1:coverage<=0?0:spot(sx,sy,p.shape)<coverage?1:0;data[i+3]=Math.round(a*255);}
  return data;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;let r=data[i],g=data[i+1],b=data[i+2],a=data[i+3]/255;
  if(p.removeOn){const d=distance(remove,r,g,b);a*=d<=threshold?0:soft>0?clamp((d-threshold)/soft):1;}
  if(p.recolorOn&&distance(from,r,g,b)<=recolor){const factor=p.keepShading?(.2126*r+.7152*g+.0722*b)/whiteLuma:1;r=Math.min(255,to[0]*factor);g=Math.min(255,to[1]*factor);b=Math.min(255,to[2]*factor);}
  if(p.halftoneOn&&a>0){let tone;if(p.halftoneMode==='color'){const range=Math.max(1,(p.halftoneRange/100)*255),t=clamp(distance(halftone,r,g,b)/range);tone=t*t*(3-2*t);}else tone=clamp((.2126*r+.7152*g+.0722*b)/255);let coverage=a*tone*(p.coverage/100);const gx=x+offsetX,gy=y+offsetY,u=((gx+.5)*co+(gy+.5)*si)/spacing,v=(-(gx+.5)*si+(gy+.5)*co)/spacing,sx=u-Math.floor(u)-.5,sy=v-Math.floor(v)-.5;if(p.dualHalftone&&coverage>0&&coverage<.999){const each=1-Math.sqrt(1-coverage),u2=((gx+.5)*co2+(gy+.5)*si2)/spacing2,v2=(-(gx+.5)*si2+(gy+.5)*co2)/spacing2,sx2=u2-Math.floor(u2)-.5,sy2=v2-Math.floor(v2)-.5;a=spot(sx,sy,p.shape)<each||spot(sx2,sy2,p.shape)<each?1:0;}else a=coverage>=.999?1:coverage<=0?0:spot(sx,sy,p.shape)<coverage?1:0;}
  data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=Math.round(a*255);
 }return data;
}
