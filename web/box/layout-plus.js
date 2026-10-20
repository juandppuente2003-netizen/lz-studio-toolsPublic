/* LZ Studio · distribución de piezas en hojas (v3.4).
   «Por filas» conserva exactamente el acomodo original (geometry.layout).
   «Compacta» usa MaxRects con giro de 90° sobre los rectángulos envolventes.
   «Cortes compartidos» junta los envolventes rectos sin separación (v3.5).
   Las posiciones manuales (state.placements) sustituyen a las automáticas
   y alimentan los mismos SVG/DXF: el plano que ves es el que se exporta. */
import {layout,compensate} from './geometry.js?v=3.5';

export const sheetPresets=[
 {id:'lz400',label:'Láser LZ · 400 × 400',w:400,h:400},
 {id:'300x200',label:'300 × 200',w:300,h:200},
 {id:'600x400',label:'600 × 400',w:600,h:400},
 {id:'900x600',label:'900 × 600',w:900,h:600},
 {id:'1300x900',label:'1300 × 900',w:1300,h:900}
];
export const ROTATIONS=[0,90,180,270];

const area=r=>Math.abs(r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2;
export const netArea=p=>Math.max(0,area(p.p)-(p.holes||[]).reduce((a,h)=>a+area(h),0));

function size(p,rot,k){return rot%180===0?[p.w+k,p.h+k]:[p.h+k,p.w+k];}
/** Same transform family as geometry.layout (rot 90 = original «rot»). */
export function place(p,x,y,rot,k){
 const tr=([a,b])=>rot===90?[x+b+k/2,y+p.w-a+k/2]:rot===180?[x+p.w-a+k/2,y+p.h-b+k/2]:rot===270?[x+p.h-b+k/2,y+a+k/2]:[x+a+k/2,y+b+k/2];
 const [bw,bh]=size(p,rot,k);
 return {...p,points:compensate(p.p,k/2,p.name).map(tr),holePoints:(p.holes||[]).map(h=>compensate(h,-k/2,p.name).map(tr)),x,y,bw,bh,rot:rot===90,rotation:rot};
}

function maxRects(items,W,H,g){
 let free=[{x:0,y:0,w:W,h:H}];const placed=[],left=[];
 for(const it of items){let best=null;
  for(const rot of[0,90]){const w=(rot?it.h:it.w)+g,h=(rot?it.w:it.h)+g;for(const f of free)if(w<=f.w+1e-9&&h<=f.h+1e-9){const a=Math.min(f.w-w,f.h-h),b=Math.max(f.w-w,f.h-h);if(!best||a<best.a||(a===best.a&&b<best.b))best={a,b,x:f.x,y:f.y,rot,w,h};}}
  if(!best){left.push(it);continue;}placed.push({id:it.id,x:best.x,y:best.y,rot:best.rot});
  const u=best,next=[];for(const f of free){if(u.x>=f.x+f.w||u.x+u.w<=f.x||u.y>=f.y+f.h||u.y+u.h<=f.y){next.push(f);continue;}if(u.x>f.x)next.push({x:f.x,y:f.y,w:u.x-f.x,h:f.h});if(u.x+u.w<f.x+f.w)next.push({x:u.x+u.w,y:f.y,w:f.x+f.w-u.x-u.w,h:f.h});if(u.y>f.y)next.push({x:f.x,y:f.y,w:f.w,h:u.y-f.y});if(u.y+u.h<f.y+f.h)next.push({x:f.x,y:u.y+u.h,w:f.w,h:f.y+f.h-u.y-u.h});}
  free=next.filter((a,i)=>!next.some((b,j)=>j!==i&&a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h&&(j<i||a.w!==b.w||a.h!==b.h||a.x!==b.x||a.y!==b.y)));
 }return {placed,left};
}

/** Compact automatic layout. Tries several orders and keeps the fewest sheets. */
export function compactPositions(panels,s){
 const g=+s.gap,k=+s.kerf,W=+s.sheetW-g,H=+s.sheetH-g;
 const items=panels.map(p=>({id:p.id,w:p.w+k,h:p.h+k}));
 const fits=it=>(it.w+2*g<=+s.sheetW&&it.h+2*g<=+s.sheetH)||(it.h+2*g<=+s.sheetW&&it.w+2*g<=+s.sheetH);
 const unplaced=items.filter(i=>!fits(i)).map(i=>i.id),usable=items.filter(fits);
 const orders=[(a,b)=>b.w*b.h-a.w*a.h,(a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h),(a,b)=>b.h-a.h,(a,b)=>b.w-a.w,(a,b)=>b.w+b.h-a.w-a.h];
 let best=null;
 for(const order of orders){let rest=usable.slice().sort(order),sheet=0,last=0;const pos={};
  while(rest.length&&sheet<60){const {placed,left}=maxRects(rest,W,H,g);if(!placed.length)break;last=0;for(const q of placed){const it=rest.find(i=>i.id===q.id);pos[q.id]={sheet,x:g+q.x,y:g+q.y,rot:q.rot};last=Math.max(last,q.y+(q.rot?it.w:it.h));}rest=left;sheet++;}
  const score=sheet*1e7+last;if(!best||score<best.score)best={score,pos,count:Math.max(1,sheet),left:rest.map(r=>r.id)};
 }
 return {positions:best?.pos||{},count:best?.count||1,unplaced:[...unplaced,...(best?.left||[])]};
}

/**
 * Fraction of each side of the nominal envelope covered by straight outline
 * segments lying on it: [bottom(y=0), right(x=w), top(y=h), left(x=0)].
 * Curved or diagonal pieces barely touch their envelope and gain nothing
 * from sharing; they keep the normal gap.
 */
export function sideCoverage(p){
 const r=p.p,e=1e-6,cov=[0,0,0,0];
 for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(Math.abs(a[1])<e&&Math.abs(b[1])<e)cov[0]+=L;else if(Math.abs(a[0]-p.w)<e&&Math.abs(b[0]-p.w)<e)cov[1]+=L;else if(Math.abs(a[1]-p.h)<e&&Math.abs(b[1]-p.h)<e)cov[2]+=L;else if(Math.abs(a[0])<e&&Math.abs(b[0])<e)cov[3]+=L;}
 return [cov[0]/p.w,cov[1]/p.h,cov[2]/p.w,cov[3]/p.h];
}
/** A side is shared only when it is mostly one straight edge. Finger edges
 * would coincide only at the tooth tips: a few millimetres saved for many
 * extra laser starts, so they keep the normal gap. */
export const SHARE_MIN_COVERAGE=0.85;
const straight=c=>c>=SHARE_MIN_COVERAGE;
/** Coverage after placing with rotation 0/90 (sides: y-min, x-max, y-max, x-min). */
const rotated=(c,rot)=>rot===90?[c[1],c[2],c[3],c[0]]:c;
export const canShare=p=>sideCoverage(p).some(straight);

/**
 * Shelf layout where straight sides touch: their kerf envelopes abut with no
 * gap, so the compensated outlines coincide on the common edge and the
 * cut-optimizer leaves a single pass there. Each envelope keeps its kerf
 * (bw = w + kerf), so final dimensions do not change. Any other pair keeps at
 * least the configured gap, as does the sheet border. Pieces without a
 * straight side return in `apart` and are placed later with the normal gap.
 */
export function sharedPositions(panels,s){
 const g=+s.gap,k=+s.kerf,sw=+s.sheetW,sh=+s.sheetH,pos={},apart=[],unplaced=[],items=[];
 for(const p of panels){if(!canShare(p)){apart.push(p.id);continue;}const c=sideCoverage(p);let rot=0,[w,h]=size(p,0,k);
  // tall pieces lie down so shelves stay low; rotate only when it still fits
  if(h>w&&h+2*g<=sw&&w+2*g<=sh){rot=90;[w,h]=[h,w];}
  if(w+2*g>sw||h+2*g>sh){if(h+2*g<=sw&&w+2*g<=sh){rot=rot?0:90;[w,h]=[h,w];}else{unplaced.push(p.id);continue;}}
  items.push({id:p.id,w,h,rot,cov:rotated(c,rot)});}
 items.sort((a,b)=>b.h-a.h||b.w-a.w);
 // 1 · rows: neighbours touch only when both facing sides are straight
 const rows=[];let row=null;
 for(const it of items){const prev=row?.items[row.items.length-1],gap=prev?(straight(prev.cov[1])&&straight(it.cov[3])?0:g):0;
  if(!row||row.x+gap+it.w>sw-g+1e-9){row={items:[],x:g,h:0};rows.push(row);it.x=g;}else it.x=row.x+gap;
  row.items.push(it);row.x=it.x+it.w;row.h=Math.max(row.h,it.h);}
 // 2 · stack rows: zero gap only where every facing pair touches on straight sides, otherwise ≥ gap
 let sheet=0,y=g,above=null;
 for(const r of rows){let dy=0;
  if(above)for(const q of r.items)for(const p of above.items){if(Math.min(p.x+p.w,q.x+q.w)-Math.max(p.x,q.x)<=1e-9)continue;const clear=above.h-p.h;dy=Math.max(dy,clear<1e-9&&straight(p.cov[2])&&straight(q.cov[0])?0:Math.max(0,g-clear));}
  let top=above?y+above.h+dy:g;if(top+r.h>sh-g+1e-9){sheet++;top=g;}
  for(const it of r.items)pos[it.id]={sheet,x:it.x,y:top,rot:it.rot};y=top;above=r;}
 return {positions:pos,count:items.length?sheet+1:1,apart,unplaced};
}

/** First free spot (row scan) for pieces that have no manual position yet. */
function firstFree(p,s,taken,count){
 const g=+s.gap,k=+s.kerf;for(let sheet=0;sheet<=count;sheet++)for(const rot of[0,90]){const [w,h]=size(p,rot,k);for(let y=g;y+h+g<=+s.sheetH;y+=2)for(let x=g;x+w+g<=+s.sheetW;x+=2){if(!taken.some(t=>t.sheet===sheet&&!(x+w+g<=t.x||t.x+t.bw+g<=x||y+h+g<=t.y||t.y+t.bh+g<=y)))return{sheet,x,y,rot};}}
 return null;
}

/**
 * Produce the packed object used by the plan and every exporter.
 * Returns {panels,count,unplaced,mode,manual}.
 */
export function arrange(panels,s){
 const k=+s.kerf,mode=['compact','shared'].includes(s.layoutMode)?s.layoutMode:'rows',manual=s.placements&&typeof s.placements==='object'?s.placements:null;
 if(mode==='rows'&&!manual){const packed=layout(panels,s);packed.panels.forEach(p=>p.rotation=p.rot?90:0);return{...packed,unplaced:[],mode,manual:false};}
 let base={},count=1,unplaced=[];
 if(mode==='compact'){const c=compactPositions(panels,s);base=c.positions;count=c.count;unplaced=c.unplaced;}
 else if(mode==='shared'){const c=sharedPositions(panels,s);base=c.positions;count=c.count;unplaced=c.unplaced;}
 else{try{const packed=layout(panels,s);for(const p of packed.panels)base[p.id]={sheet:p.sheet,x:p.x,y:p.y,rot:p.rot?90:0};count=packed.count;}catch{const c=compactPositions(panels,s);base=c.positions;count=c.count;unplaced=c.unplaced;}}
 const out=[],missing=[];
 for(const p of panels){const m=manual?.[p.id];const q=m&&ROTATIONS.includes(+m.rot)&&Number.isFinite(+m.x)&&Number.isFinite(+m.y)&&Number.isInteger(+m.sheet)&&+m.sheet>=0?{sheet:+m.sheet,x:+m.x,y:+m.y,rot:+m.rot}:manual?null:base[p.id];if(q){out.push({...place(p,q.x,q.y,q.rot,k),sheet:q.sheet});count=Math.max(count,q.sheet+1);}else if(!unplaced.includes(p.id))missing.push(p);}
 for(const p of missing){const q=firstFree(p,s,out,count);if(q){out.push({...place(p,q.x,q.y,q.rot,k),sheet:q.sheet});count=Math.max(count,q.sheet+1);}else unplaced.push(p.id);}
 count=Math.max(count,+(s.extraSheets||0)+1,...out.map(p=>p.sheet+1));
 return {panels:out,count,unplaced,mode,manual:!!manual};
}

/** Verification of a packed layout on rectangles that include the kerf. */
export function checkPacked(packed,s,panels){
 const g=+s.gap,res={overlaps:[],tight:[],outside:[],shared:[],sheets:[]};const ps=packed.panels;
 for(const p of ps)if(p.x<-1e-6||p.y<-1e-6||p.x+p.bw>+s.sheetW+1e-6||p.y+p.bh>+s.sheetH+1e-6)res.outside.push(p.id);
 for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],b=ps[j];if(a.sheet!==b.sheet)continue;const ox=Math.min(a.x+a.bw,b.x+b.bw)-Math.max(a.x,b.x),oy=Math.min(a.y+a.bh,b.y+b.bh)-Math.max(a.y,b.y);if(ox>1e-6&&oy>1e-6)res.overlaps.push([a.id,b.id]);else if(ox>-g+1e-6&&oy>-g+1e-6){if(s.layoutMode==='shared'&&(Math.abs(ox)<1e-6||Math.abs(oy)<1e-6))res.shared.push([a.id,b.id]);else res.tight.push([a.id,b.id]);}}
 const byId=new Map(panels.map(p=>[p.id,p]));
 for(let i=0;i<packed.count;i++){const parts=ps.filter(p=>p.sheet===i),net=parts.reduce((a,p)=>a+netArea(byId.get(p.id)||p),0),sheetArea=+s.sheetW*+s.sheetH;res.sheets.push({index:i,pieces:parts.length,net,sheetArea,pct:100*net/sheetArea});}
 return res;
}

/** Freeze the current automatic layout so manual edits start from what the user sees. */
export function freeze(packed){const out={};for(const p of packed.panels)out[p.id]={sheet:p.sheet,x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100,rot:p.rotation??(p.rot?90:0)};return out;}
