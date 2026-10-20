import {processDesignEffect} from './effects-engine.js';
import {processColorAdjustments} from './color-engine.js';
export function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
const clamp=x=>Math.max(0,Math.min(1,x));
function distance(a,r,g,b){return Math.hypot(r-a[0],g-a[1],b-a[2])/Math.sqrt(3)}
// Grid thresholds preserve area coverage for each shape, including merged highlights.
export function spot(x,y,shape){x=Math.abs(x);y=Math.abs(y);if(shape==='square')return 4*Math.max(x,y)**2;if(shape==='diamond'){const s=x+y;return s<=.5?2*s*s:1-2*(1-s)**2}if(shape==='line')return 2*y;const r=Math.hypot(x,y);if(r<=.5)return Math.PI*r*r;const cap=r*r*Math.acos(.5/r)-.5*Math.sqrt(r*r-.25);return clamp(Math.PI*r*r-4*cap)}
export function removeIsolatedResidue(data,w,h,pixelsPerCm,sizeMm=.3){const diameter=Math.max(.5,pixelsPerCm*sizeMm/10),maxArea=Math.max(1,Math.round(Math.PI*(diameter/2)**2)),visited=new Uint8Array(w*h),stack=[],component=[];for(let pos=0;pos<w*h;pos++){if(visited[pos]||data[pos*4+3]<12)continue;visited[pos]=1;stack.push(pos);component.length=0;let touchesEdge=false,tooLarge=false;while(stack.length){const current=stack.pop(),x=current%w,y=current/w|0;component.push(current);if(x===0||y===0||x===w-1||y===h-1)touchesEdge=true;if(component.length>maxArea)tooLarge=true;for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){const next=yy*w+xx;if(!visited[next]&&data[next*4+3]>=12){visited[next]=1;stack.push(next)}}}if(!touchesEdge&&!tooLarge)for(const pixel of component)data[pixel*4+3]=0}return data}

// v49 · Printable-dot limits, expressed in millimetres of the final print.
// The halftone cell measures 25.4/LPI mm whatever the resolution, so the coverage of a
// dot with an equivalent diameter d is π/4·(d/cell)². Defaults (0 mm) leave the output unchanged.
export function printableLimits(p){
 const cell=25.4/Math.max(1,p.lpi||25),minDot=Math.max(0,Number(p.minDotMm)||0),minHole=Math.max(0,Number(p.minHoleMm)||0);
 const minCov=minDot>0?Math.min(1,Math.PI/4*(minDot/cell)**2):0,maxCov=minHole>0?Math.max(0,1-Math.PI/4*(minHole/cell)**2):1;
 return {cellMm:cell,minCov,maxCov,minMode:p.minDotMode==='grow'?'grow':'drop'};
}
export function limitCoverage(coverage,limits){
 if(coverage<=0)return 0;
 if(limits.minCov>0&&coverage<limits.minCov)coverage=limits.minMode==='grow'?limits.minCov:0;
 if(coverage>=limits.maxCov)return 1;
 return coverage;
}
function halftoneScreen(p,pixelsPerCm){
 const angle=p.angle*Math.PI/180,angle2=(p.angle2??105)*Math.PI/180,samples=Math.max(1,Math.min(4,Math.round(p.previewSamples||1)));
 const offsets=[];for(let k=0;k<samples;k++)offsets.push((k+.5)/samples);
 return {spacing:Math.max(.1,pixelsPerCm*2.54/p.lpi),co:Math.cos(angle),si:Math.sin(angle),spacing2:Math.max(.1,pixelsPerCm*2.54/(p.lpi2||p.lpi)),co2:Math.cos(angle2),si2:Math.sin(angle2),offsets,inv:1/(samples*samples),limits:printableLimits(p),shape:p.shape,dual:!!p.dualHalftone};
}
// One output pixel. With previewSamples>1 the reduced preview shows the fraction of the pixel
// the dot covers (anti-aliased) so dot size reads correctly; exports use 1 sample, i.e. binary dots.
function halftoneAlpha(gx,gy,coverage,s){
 coverage=limitCoverage(coverage,s.limits);
 if(coverage>=.999)return 1;if(coverage<=0)return 0;
 const each=s.dual?1-Math.sqrt(1-coverage):coverage;let hits=0;
 for(const oy of s.offsets)for(const ox of s.offsets){
  const x=gx+ox,y=gy+oy,u=(x*s.co+y*s.si)/s.spacing,v=(-x*s.si+y*s.co)/s.spacing;
  let inside=spot(u-Math.floor(u)-.5,v-Math.floor(v)-.5,s.shape)<each;
  if(!inside&&s.dual){const u2=(x*s.co2+y*s.si2)/s.spacing2,v2=(-x*s.si2+y*s.co2)/s.spacing2;inside=spot(u2-Math.floor(u2)-.5,v2-Math.floor(v2)-.5,s.shape)<each;}
  if(inside)hits++;
 }
 return hits*s.inv;
}
function halftoneTone(p,halftone,r,g,b){if(p.halftoneMode==='color'){const range=Math.max(1,p.halftoneRange/100*255),t=clamp(distance(halftone,r,g,b)/range);return t*t*(3-2*t)}return clamp((.2126*r+.7152*g+.0722*b)/255)}
export function processPixels(data,w,h,p,pixelsPerCm,offsetX=0,offsetY=0){
 if(p.effectTool==='color')return processColorAdjustments(data,w,h,p,pixelsPerCm,offsetX,offsetY);
 if(p.effectTool)return processDesignEffect(data,w,h,p,pixelsPerCm,offsetX,offsetY);
 const remove=rgb(p.removeColor),from=rgb(p.fromColor),to=rgb(p.toColor),halftone=rgb(p.halftoneColor||p.removeColor);
 const threshold=p.removeTolerance/100*255,soft=p.softness/100*255,recolor=p.recolorTolerance/100*255;
 const screen=p.halftoneOn?halftoneScreen(p,pixelsPerCm):null,density=p.coverage/100;
 const whiteLuma=Math.max(1,.2126*from[0]+.7152*from[1]+.0722*from[2]);
 const colorPass=(i)=>{let r=data[i],g=data[i+1],b=data[i+2],a=data[i+3]/255;if(p.removeOn){const d=distance(remove,r,g,b);a*=d<=threshold?0:soft>0?clamp((d-threshold)/soft):1}if(p.recolorOn&&distance(from,r,g,b)<=recolor){const factor=p.keepShading?(.2126*r+.7152*g+.0722*b)/whiteLuma:1;r=Math.min(255,to[0]*factor);g=Math.min(255,to[1]*factor);b=Math.min(255,to[2]*factor)}data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=Math.round(a*255);};
 const halftonePass=()=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,a=data[i+3]/255;if(a<=0)continue;const coverage=a*halftoneTone(p,halftone,data[i],data[i+1],data[i+2])*density;data[i+3]=Math.round(halftoneAlpha(x+offsetX,y+offsetY,coverage,screen)*255);}};
 if(p.cleanupOn){for(let i=0;i<data.length;i+=4)colorPass(i);removeIsolatedResidue(data,w,h,pixelsPerCm,p.cleanupSize||.3);if(p.halftoneOn)halftonePass();return data;}
 // Single pass, as in v48: the halftone reads the unrounded alpha left by color removal.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;let r=data[i],g=data[i+1],b=data[i+2],a=data[i+3]/255;if(p.removeOn){const d=distance(remove,r,g,b);a*=d<=threshold?0:soft>0?clamp((d-threshold)/soft):1}if(p.recolorOn&&distance(from,r,g,b)<=recolor){const factor=p.keepShading?(.2126*r+.7152*g+.0722*b)/whiteLuma:1;r=Math.min(255,to[0]*factor);g=Math.min(255,to[1]*factor);b=Math.min(255,to[2]*factor)}if(p.halftoneOn&&a>0)a=halftoneAlpha(x+offsetX,y+offsetY,a*halftoneTone(p,halftone,r,g,b)*density,screen);data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=Math.round(a*255);}
 return data;
}
