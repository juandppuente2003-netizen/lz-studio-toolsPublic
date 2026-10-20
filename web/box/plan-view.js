export const clampPlanZoom=value=>Math.max(.25,Math.min(12,value));
export function zoomAnchor(scroll,point,oldZoom,newZoom,viewport,baseSize){
 const origin=z=>Math.max(24,(viewport-baseSize*z)/2);
 return Math.max(0,(scroll+point-origin(oldZoom))/oldZoom*newZoom+origin(newZoom)-point);
}
// SVG remains vector-based at every zoom. Only viewport dimensions change;
// export millimetres and laser compensation never pass through this class.
export class PlanView{
 constructor(root,onZoom=()=>{}){
  this.resize=new ResizeObserver(()=>{if(this.sheets.length&&root.clientWidth)this.setSheets(this.sheets,this.W,this.H);});this.resize.observe(root);
  this.root=root;this.onZoom=onZoom;this.zoom=1;this.sheets=[];this.pointers=new Map();
  root.tabIndex=0;root.setAttribute('aria-label','Plano de corte. Rueda o botones para zoom; arrastra para desplazar; Inicio para encajar.');
  root.addEventListener('wheel',e=>{e.preventDefault();const r=root.getBoundingClientRect();this.setZoom(this.zoom*Math.exp(-e.deltaY*.0015),[e.clientX-r.left,e.clientY-r.top]);},{passive:false});
  root.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;this.pointers.set(e.pointerId,[e.clientX,e.clientY]);root.setPointerCapture(e.pointerId);});
  root.addEventListener('pointermove',e=>{const before=this.pointers.get(e.pointerId);if(!before)return;const old=[...this.pointers.values()];this.pointers.set(e.pointerId,[e.clientX,e.clientY]);const next=[...this.pointers.values()];if(next.length===2){const distance=p=>Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]),r=root.getBoundingClientRect(),oldCenter=old[0].map((v,i)=>(v+old[1][i])/2),center=next[0].map((v,i)=>(v+next[1][i])/2);this.setZoom(this.zoom*distance(next)/Math.max(1,distance(old)),[oldCenter[0]-r.left,oldCenter[1]-r.top]);root.scrollLeft-=center[0]-oldCenter[0];root.scrollTop-=center[1]-oldCenter[1];}else{root.scrollLeft-=e.clientX-before[0];root.scrollTop-=e.clientY-before[1];}});
  for(const name of['pointerup','pointercancel','lostpointercapture'])root.addEventListener(name,e=>this.pointers.delete(e.pointerId));
  root.addEventListener('keydown',e=>{if(['+','=','-','Home','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='Home'||e.key==='0')this.fit();else if(e.key==='+'||e.key==='=')this.setZoom(this.zoom*1.25);else if(e.key==='-')this.setZoom(this.zoom/1.25);else{root.scrollLeft+=e.key==='ArrowRight'?45:e.key==='ArrowLeft'?-45:0;root.scrollTop+=e.key==='ArrowDown'?45:e.key==='ArrowUp'?-45:0;}}});
 }
 setSheets(sheets,W,H){this.sheets=sheets;this.W=W;this.H=H;this.content=document.createElement('div');this.content.className='plan-content';for(const s of sheets)this.content.append(s);this.root.replaceChildren(this.content);this.baseScale=Math.min(Math.max(180,this.root.clientWidth-48)/W,Math.max(160,this.root.clientHeight-80)/H);this.layout();}
 layout(){if(!this.content)return;const z=this.zoom,sw=this.W*this.baseScale,sh=this.H*this.baseScale;this.baseWidth=this.sheets.length*sw+Math.max(0,this.sheets.length-1)*24;this.baseHeight=sh+28;this.content.style.width=this.baseWidth*z+'px';this.content.style.height=this.baseHeight*z+'px';this.content.style.gap=24*z+'px';for(const s of this.sheets){s.style.width=sw*z+'px';s.style.minWidth=sw*z+'px';s.style.height=sh*z+'px';}this.onZoom();}
 setZoom(value,point=[this.root.clientWidth/2,this.root.clientHeight/2]){const z=clampPlanZoom(value),old=this.zoom,left=zoomAnchor(this.root.scrollLeft||0,point[0],old,z,this.root.clientWidth,this.baseWidth||1),top=zoomAnchor(this.root.scrollTop||0,point[1],old,z,this.root.clientHeight,this.baseHeight||1);this.zoom=z;this.layout();this.root.scrollLeft=left;this.root.scrollTop=top;this.onZoom();}
 fit(){this.zoom=1;this.layout();this.root.scrollLeft=this.root.scrollTop=0;this.onZoom();}
}
