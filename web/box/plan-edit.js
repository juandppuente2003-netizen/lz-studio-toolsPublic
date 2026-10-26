import {optimizeSheet} from './cut-optimizer.js?v=3.5';
/* LZ Studio · plano de corte editable (v3.4).
   Dibuja cada hoja con las mismas coordenadas que exportan SVG/DXF
   (packed.panels: contornos ya compensados por kerf) y permite mover,
   girar y cambiar de hoja las piezas. Las posiciones se guardan en
   state.placements y entran al historial de deshacer. */
import {arrange,checkPacked,freeze,place,sheetPresets} from './layout-plus.js?v=3.5';

const esc=s=>String(s).replace(/[<&>"]/g,c=>({'<':'&lt;','&':'&amp;','>':'&gt;','"':'&quot;'}[c]));
const r2=n=>Math.round(n*100)/100;

export function sheetSVG(packed,s,sheet,{selected=null,status={},bed=null,uniqueCuts=false}={}){
 const items=packed.panels.filter(p=>p.sheet===sheet),fs=Math.max(4,+s.sheetW/70),g=+s.gap;
 const body=items.map(p=>{const d=[p.points,...(p.holePoints||[])].map(r=>'M'+r.map(v=>v.map(r2).join(' ')).join('L')+'Z').join('');const cls=['plan-piece',p.id===selected?'is-selected':'',status[p.id]||''].join(' ');const size=Math.min(fs,p.bw/Math.max(4,p.name.length)*1.6,p.bh*.3);
  return `<g class="${cls}" data-piece="${esc(p.id)}"><rect class="plan-hit" x="${r2(p.x)}" y="${r2(p.y)}" width="${r2(p.bw)}" height="${r2(p.bh)}"/><path d="${d}" fill-rule="evenodd" ${uniqueCuts?'style="stroke:none"':''}/><text x="${r2(p.x+p.bw/2)}" y="${r2(p.y+p.bh/2+size*.35)}" font-size="${r2(size)}" text-anchor="middle">${esc(p.name)}</text></g>`;}).join('');
 const optimized=uniqueCuts?optimizeSheet(items,.01):null;
 const toolpaths=optimized?'<g class="plan-unique-cuts" style="pointer-events:none">'+optimized.paths.map(p=>`<path d="M${p.points.map(q=>q.join(' ')).join('L')}${p.closed?'Z':''}" fill="none" stroke="#86ccaa" stroke-width=".7"/>`).join('')+'</g>':'';
 const W=bed?Math.max(+s.sheetW,bed.width):+s.sheetW,H=bed?Math.max(+s.sheetH,bed.height):+s.sheetH,step=Math.max(10,Math.ceil(Math.max(W,H)/10/10)*10);
 let ruler='';for(let x=0;x<=W;x+=step)ruler+=`<text class="plan-ruler" x="${x+1}" y="${fs}" font-size="${fs*.7}">${x}</text>`;for(let y=step;y<=H;y+=step)ruler+=`<text class="plan-ruler" x="1" y="${y}" font-size="${fs*.7}">${y}</text>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Hoja ${sheet+1}: ${items.length} piezas"><rect class="plan-bed" width="${W}" height="${H}"/><rect class="plan-stock" width="${+s.sheetW}" height="${+s.sheetH}"/><rect class="plan-margin" x="${g/2}" y="${g/2}" width="${+s.sheetW-g}" height="${+s.sheetH-g}"/>${ruler}${body}${toolpaths}</svg>`;
}

export class PlanEdit{
 constructor(api){
  this.api=api;this.editing=false;this.uniqueCuts=false;this.selected=null;this.$=id=>document.getElementById(id);const $=this.$;
  $('planEditToggle')&&($('planEditToggle').onclick=()=>{this.editing=!this.editing;this.refreshTools();this.api.redraw();});
  $('planLayoutMode')&&($('planLayoutMode').onchange=()=>{const s=this.api.state();this.api.commit({...s,layoutMode:$('planLayoutMode').value,placements:null,extraSheets:0});const m=$('planLayoutMode').value;this.api.toast(m==='compact'?'Distribución compacta aplicada.':m==='shared'?'Cortes compartidos: las piezas rectas se juntan y cada borde común se cortará una sola vez.':'Distribución por filas (original) aplicada.');});
  $('planRotate')&&($('planRotate').onclick=()=>this.rotate());
  $('planReset')&&($('planReset').onclick=()=>{const s=this.api.state();this.selected=null;this.api.commit({...s,placements:null,extraSheets:0});this.api.toast('Distribución automática restablecida.');});
  $('planAddSheet')&&($('planAddSheet').onclick=()=>{const s=this.api.state();this.api.commit({...s,placements:s.placements||freeze(this.api.packed()),extraSheets:this.api.packed().count});});
  $('planMoveSheet')&&($('planMoveSheet').onchange=()=>this.moveToSheet(+$('planMoveSheet').value));
  $('sheetPreset')&&($('sheetPreset').onchange=()=>{const p=sheetPresets.find(q=>q.id===$('sheetPreset').value);if(!p)return;const s=this.api.state();this.api.commit({...s,sheetW:p.w,sheetH:p.h});});
  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('keydown',e=>{if(!this.editing||this.api.view()!=='2d'||e.target.closest?.('input,select,textarea'))return;if(e.key==='r'||e.key==='R'){e.preventDefault();this.rotate();}if(e.key==='Escape'){this.selected=null;this.api.redraw();}if(this.selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const step=e.shiftKey?10:1;this.nudge(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);}});
 }
 /** Build sheet wrappers for PlanView and wire interactions. */
 render(packed,s,panels){
  this.check=checkPacked(packed,s,panels);const status={};for(const id of this.check.outside)status[id]='is-outside';for(const [a,b] of this.check.tight){status[a]||='is-tight';status[b]||='is-tight';}for(const [a,b] of this.check.overlaps){status[a]='is-overlap';status[b]='is-overlap';}
  if(this.selected&&!packed.panels.some(p=>p.id===this.selected))this.selected=null;
  const sheets=[];for(let i=0;i<packed.count;i++){const wrap=document.createElement('div');wrap.className='sheet-wrap';wrap.innerHTML=sheetSVG(packed,s,i,{selected:this.selected,status,bed:this.api.bed?.(),uniqueCuts:this.uniqueCuts||s.layoutMode==='shared'});const u=this.check.sheets[i];const label=document.createElement('p');label.textContent=`Hoja ${i+1} · ${+s.sheetW} × ${+s.sheetH} mm · ${u?u.pieces:0} piezas · ${u?u.pct.toFixed(1):'0.0'}% aprovechado`;wrap.append(label);if(this.editing)this.bind(wrap,i,packed,s);sheets.push(wrap);}
  this.refreshTools(packed,s);return sheets;
 }
 bind(wrap,sheet,packed,s){const svg=wrap.querySelector('svg');if(!svg)return;
  svg.querySelectorAll('[data-piece]').forEach(g=>{g.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.stopPropagation();e.preventDefault();const id=g.dataset.piece,p=packed.panels.find(q=>q.id===id);if(!p)return;this.selected=id;svg.querySelectorAll('.is-selected').forEach(n=>n.classList.remove('is-selected'));g.classList.add('is-selected');this.refreshTools();
   const m=svg.getScreenCTM?.();if(!m)return;const inv=m.inverse(),pt=svg.createSVGPoint(),toMM=ev=>{pt.x=ev.clientX;pt.y=ev.clientY;const q=pt.matrixTransform(inv);return[q.x,q.y];};const start=toMM(e);let delta=[0,0];
   const move=ev=>{const now=toMM(ev);delta=[Math.round((now[0]-start[0])*2)/2,Math.round((now[1]-start[1])*2)/2];g.setAttribute('transform',`translate(${delta[0]} ${delta[1]})`);this.$('planInfo')&&(this.$('planInfo').textContent=`${p.name} · X ${r2(p.x+delta[0])} · Y ${r2(p.y+delta[1])} mm`);};
   const up=()=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',up);svg.removeEventListener('pointercancel',up);if(Math.abs(delta[0])+Math.abs(delta[1])<.5){this.api.redraw();return;}const proposed={...p,x:r2(p.x+delta[0]),y:r2(p.y+delta[1])};const snapped=(s.layoutMode==='shared'||this.uniqueCuts)?snapSharedEdges(proposed,packed.panels,s):proposed;this.setPlacement(id,q=>({...q,x:snapped.x,y:snapped.y}));};
   try{svg.setPointerCapture(e.pointerId);}catch{}svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);});});
 }
 setPlacement(id,fn){const s=this.api.state(),packed=this.api.packed(),all=s.placements?{...s.placements}:freeze(packed);const cur=all[id]||(()=>{const p=packed.panels.find(q=>q.id===id);return p?{sheet:p.sheet,x:p.x,y:p.y,rot:p.rotation??0}:null;})();if(!cur)return;all[id]=fn(cur);this.api.commit({...s,placements:all});}
 rotate(){if(!this.selected)return this.api.toast('Selecciona una pieza en el plano para girarla.');const s=this.api.state(),k=+s.kerf,panel=this.api.panels().find(p=>p.id===this.selected);if(!panel)return;
  this.setPlacement(this.selected,q=>{const before=place(panel,q.x,q.y,q.rot,k),rot=(q.rot+90)%360,after=place(panel,0,0,rot,k);let x=q.x+(before.bw-after.bw)/2,y=q.y+(before.bh-after.bh)/2;const g=+s.gap;x=Math.min(Math.max(x,g),Math.max(g,+s.sheetW-g-after.bw));y=Math.min(Math.max(y,g),Math.max(g,+s.sheetH-g-after.bh));return{...q,rot,x:r2(x),y:r2(y)};});}
 nudge(dx,dy){if(this.selected)this.setPlacement(this.selected,q=>({...q,x:r2(q.x+dx),y:r2(q.y+dy)}));}
 moveToSheet(n){if(!this.selected||!Number.isInteger(n)||n<0)return;const s=this.api.state();this.setPlacement(this.selected,q=>({...q,sheet:n,x:+s.gap,y:+s.gap}));this.api.toast('Pieza enviada a la hoja '+(n+1)+'. Arrástrala a un espacio libre.');}
 refreshTools(packed=this.api.packed(),s=this.api.state()){const $=this.$;if(!$('planTools')||!packed)return;
  $('planEditToggle').setAttribute('aria-pressed',String(this.editing));$('planEditToggle').textContent=this.editing?'✓ Editando distribución':'✥ Editar distribución';
  document.getElementById('plan')?.classList?.toggle('editing',this.editing);
  $('planLayoutMode').value=['compact','shared'].includes(s.layoutMode)?s.layoutMode:'rows';$('planRotate').disabled=!this.editing||!this.selected;$('planMoveSheet').disabled=!this.editing||!this.selected;$('planReset').disabled=!s.placements&&!s.extraSheets;
  const sel=packed.panels.find(p=>p.id===this.selected);$('planMoveSheet').replaceChildren(...Array.from({length:packed.count},(_,i)=>{const o=document.createElement('option');o.value=i;o.textContent='Hoja '+(i+1);return o;}));if(sel)$('planMoveSheet').value=String(sel.sheet);
  const preset=sheetPresets.find(p=>p.w===+s.sheetW&&p.h===+s.sheetH);if($('sheetPreset'))$('sheetPreset').value=preset?preset.id:'custom';
  const c=this.check;if(!c)return;const total=c.sheets.reduce((a,q)=>a+q.net,0),used=c.sheets.filter(q=>q.pieces).length||1,pct=100*total/(used*+s.sheetW*+s.sheetH);
  const issues=[c.overlaps.length?`${c.overlaps.length} superposición(es)`:null,c.outside.length?`${c.outside.length} fuera de la hoja`:null,c.tight.length?`${c.tight.length} par(es) a menos de ${s.gap} mm`:null,packed.unplaced?.length?`${packed.unplaced.length} sin colocar`:null].filter(Boolean);
  $('planStats').textContent=`${packed.panels.length} piezas en ${packed.count} hoja${packed.count>1?'s':''} · ${pct.toFixed(1)}% aprovechado`;
  $('planStats').title='Aprovechamiento = área neta de las piezas (descontando huecos y ranuras) ÷ área de las hojas usadas. Se calcula sobre la geometría nominal.';
  $('planChecks').textContent=issues.length?issues.join(' · '):'Sin superposiciones · todo dentro de la hoja';$('planChecks').dataset.error=String(!!(c.overlaps.length||c.outside.length||packed.unplaced?.length));
  if($('planInfo')&&!sel)$('planInfo').textContent=this.editing?'Arrastra una pieza para moverla · R gira 90° · flechas ajustan 1 mm (Mayús: 10 mm)':s.layoutMode==='compact'?'Acomodo compacto (rectángulos envolventes, con giro de 90°). No es un anidado óptimo.':s.layoutMode==='shared'?`Cortes compartidos: ${c.shared.length} contacto(s) entre piezas rectas; el archivo corta cada borde común una vez. Las piezas curvas o inclinadas conservan ${s.gap} mm. Los peines no se intercalan: con kerf cambiarían dientes y huecos.`:'Acomodo por filas, como en la versión original.';
  if($('planInfo')&&sel)$('planInfo').textContent=`${sel.name} · X ${r2(sel.x)} · Y ${r2(sel.y)} mm · giro ${sel.rotation??0}°`;
 }
}
export {arrange};

/** Snap adjacent envelope edges without overlap, rotation or dimension changes. */
export function snapSharedEdges(piece,others,state,tolerance=3){
 const candidates=[{x:piece.x,y:piece.y,score:Infinity}];
 for(const other of others){if(other.id===piece.id||other.sheet!==piece.sheet)continue;
  const vertical=Math.min(piece.y+piece.bh,other.y+other.bh)-Math.max(piece.y,other.y);
  const horizontal=Math.min(piece.x+piece.bw,other.x+other.bw)-Math.max(piece.x,other.x);
  if(vertical>0)for(const x of [other.x+other.bw,other.x-piece.bw])if(Math.abs(x-piece.x)<=tolerance)candidates.push({x,y:piece.y,score:Math.abs(x-piece.x)});
  if(horizontal>0)for(const y of [other.y+other.bh,other.y-piece.bh])if(Math.abs(y-piece.y)<=tolerance)candidates.push({x:piece.x,y,score:Math.abs(y-piece.y)});
 }
 for(const q of candidates.sort((a,b)=>a.score-b.score)){
  if(q.x<0||q.y<0||q.x+piece.bw>state.sheetW||q.y+piece.bh>state.sheetH)continue;
  if(others.some(o=>o.id!==piece.id&&o.sheet===piece.sheet&&Math.min(q.x+piece.bw,o.x+o.bw)-Math.max(q.x,o.x)>1e-6&&Math.min(q.y+piece.bh,o.y+o.bh)-Math.max(q.y,o.y)>1e-6))continue;
  return {x:q.x,y:q.y};
 }
 return {x:piece.x,y:piece.y};
}
