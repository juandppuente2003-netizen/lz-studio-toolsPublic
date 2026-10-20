import {bounds,cutDraft} from './direct-edit.js?v=3.5';

// A local, unforeshortened view of the same cutting contours used by the model.
export function drawCutPreview(canvas,part,state,cut,index){
 const ctx=canvas.getContext('2d'),w=canvas.width||580,h=canvas.height||280,[x0,y0,x1,y1]=bounds(part.p),scale=Math.min((w-44)/(x1-x0),(h-38)/(y1-y0)),ox=(w-(x1+x0)*scale)/2,oy=(h+(y1+y0)*scale)/2,draft=cutDraft(part,state,cut,index),path=ring=>{ctx.moveTo(ox+ring[0][0]*scale,oy-ring[0][1]*scale);for(const[x,y]of ring.slice(1))ctx.lineTo(ox+x*scale,oy-y*scale);ctx.closePath();};canvas.width=w;canvas.height=h;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#151a1e';ctx.fillRect(0,0,w,h);ctx.beginPath();path(part.p);for(const ring of draft.holes)path(ring);ctx.fillStyle='#9a886b';ctx.fill('evenodd');ctx.strokeStyle='#dcc9a3';ctx.lineWidth=1;ctx.stroke();
 if(draft.ring.every(q=>q.every(Number.isFinite))){ctx.beginPath();path(draft.ring);ctx.fillStyle=draft.error?'#ee89752e':'#66cbb63d';ctx.fill();ctx.strokeStyle=draft.error?'#f59b87':'#80e1cb';ctx.lineWidth=2.5;ctx.stroke();const cx=x0+(x1-x0)*cut.x/100,cy=y0+(y1-y0)*cut.y/100,x=ox+cx*scale,y=oy-cy*scale;ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();}
 return{...draft,scale,ox,oy,bounds:[x0,y0,x1,y1]};
}
