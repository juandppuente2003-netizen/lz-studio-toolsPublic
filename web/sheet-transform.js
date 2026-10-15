export const CORNERS=[[-1,-1],[1,-1],[1,1],[-1,1]];
export function toWorld(item,x,y){
  const a=item.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return {x:item.x+x*c-y*s,y:item.y+x*s+y*c};
}
export function cornerPosition(item,[sx,sy]){return toWorld(item,sx*item.widthCm/2,sy*item.heightCm/2)}

// Anchor the opposite corner, including on rotated designs. Fit all four
// corners inside the physical sheet before committing dimensions in cm.
export function resizeFromCorner(start,corner,pointer,lockRatio,sheetWidth,sheetHeight){
  const [sx,sy]=corner,anchor=cornerPosition(start,[-sx,-sy]);
  const a=start.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const dx=pointer.x-anchor.x,dy=pointer.y-anchor.y;
  const localX=sx*(dx*c+dy*s),localY=sy*(-dx*s+dy*c);
  let w,h;
  if(lockRatio){
    const factor=Math.max(.5/start.widthCm,.5/start.heightCm,
      (localX*start.widthCm+localY*start.heightCm)/(start.widthCm**2+start.heightCm**2));
    w=start.widthCm*factor;h=start.heightCm*factor;
  }else{w=Math.max(.5,localX);h=Math.max(.5,localY)}
  let fit=1;
  for(const [ux,uy] of [[sx*w,0],[0,sy*h],[sx*w,sy*h]]){
    const vx=ux*c-uy*s,vy=ux*s+uy*c;
    if(vx>0)fit=Math.min(fit,(sheetWidth-anchor.x)/vx);
    if(vx<0)fit=Math.min(fit,-anchor.x/vx);
    if(vy>0)fit=Math.min(fit,(sheetHeight-anchor.y)/vy);
    if(vy<0)fit=Math.min(fit,-anchor.y/vy);
  }
  fit=Math.max(0,Math.min(1,fit));w*=fit;h*=fit;
  if(w<.5-1e-8||h<.5-1e-8)return {x:start.x,y:start.y,widthCm:start.widthCm,heightCm:start.heightCm};
  const center=toWorld({...start,x:anchor.x,y:anchor.y},sx*w/2,sy*h/2);
  return {x:center.x,y:center.y,widthCm:w,heightCm:h};
}
