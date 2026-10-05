import {CORNERS,cornerPosition,toWorld} from './sheet-transform.js';
export {CORNERS,cornerPosition};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function designGeometry(design,state,zone){
  const base=Math.min(zone.w/design.width,zone.h/design.height);
  return {x:zone.x+state.x/100*zone.w*.5,y:zone.y+state.y/100*zone.h*.5,widthCm:design.width*base*state.scale/100,heightCm:design.height*base*state.scale/100,rotation:state.rotation};
}
export function designContains(item,p){
  const a=-item.rotation*Math.PI/180,dx=p.x-item.x,dy=p.y-item.y;
  return Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=item.widthCm/2&&Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=item.heightCm/2;
}
export function resizeMockup(start,startScale,corner,pointer,zone){
  const [sx,sy]=corner,anchor=cornerPosition(start,[-sx,-sy]),a=start.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=pointer.x-anchor.x,dy=pointer.y-anchor.y;
  const localX=sx*(dx*c+dy*s),localY=sy*(-dx*s+dy*c);
  const factor=(localX*start.widthCm+localY*start.heightCm)/(start.widthCm**2+start.heightCm**2),scale=clamp(startScale*factor,5,600),width=start.widthCm*scale/startScale,height=start.heightCm*scale/startScale;
  const center=toWorld({...start,x:anchor.x,y:anchor.y},sx*width/2,sy*height/2);
  return {scale,x:clamp((center.x-zone.x)/(zone.w*.5)*100,-300,300),y:clamp((center.y-zone.y)/(zone.h*.5)*100,-300,300)};
}
