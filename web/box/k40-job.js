import {checkPacked} from './layout-plus.js?v=3.5';
import {optimizeSheet} from './cut-optimizer.js?v=3.5';

export const K40_PROTOCOL='lz-k40-m2/v1';
function number(value,min,max,label){
 const n=Number(value);
 if(!Number.isFinite(n)||n<min||n>max)throw Error(`${label}: escribe un valor entre ${min} y ${max}.`);
 return n;
}

/** A manufacturing snapshot; no SVG re-import and no second kerf compensation. */
export function prepareK40Job({state,panels,packed,valid=true},{sheet=0,speed=10,passes=1,bedWidth=400,bedHeight=400,offsetX=0,offsetY=0}={}){
 if(!valid||!packed?.panels?.length)throw Error('El diseño no tiene un plano válido.');
 const width=number(bedWidth,50,2500,'Ancho de máquina'),height=number(bedHeight,50,2500,'Alto de máquina');
 const x=number(offsetX,0,width,'Origen X'),y=number(offsetY,0,height,'Origen Y');
 speed=number(speed,1,100,'Velocidad');passes=number(passes,1,10,'Pasadas');
 if(!Number.isInteger(passes))throw Error('Las pasadas deben ser enteras.');
 sheet=number(sheet,0,packed.count-1,'Hoja');if(!Number.isInteger(sheet))throw Error('Selecciona una hoja.');
 if(packed.unplaced?.length)throw Error('Hay piezas sin acomodar.');
 const checks=checkPacked(packed,state,panels);
 if(checks.overlaps.length)throw Error('Hay piezas superpuestas. Corrige el plano antes de cortar.');
 if(checks.outside.length)throw Error('Hay piezas fuera de la hoja. Corrige el plano antes de cortar.');
 if(+state.sheetW+x>width+1e-6||+state.sheetH+y>height+1e-6)throw Error('La hoja y su desplazamiento exceden la cama de la máquina. Ajusta el área de corte.');
 const items=packed.panels.filter(p=>p.sheet===sheet);
 if(!items.length)throw Error('La hoja seleccionada está vacía.');
 const optimized=optimizeSheet(items,0.01);
 const paths=optimized.paths.map(p=>({points:p.points.map(v=>{
  if(v.length!==2||!v.every(Number.isFinite))throw Error('El plano contiene coordenadas inválidas.');
  const q=[v[0]+x,v[1]+y];
  if(q[0]<0||q[1]<0||q[0]>width||q[1]>height)throw Error('El recorrido excede los límites de la máquina.');
  return q;
 }),closed:!!p.closed,role:p.role==='hole'?'hole':'outer'}));
 return {protocol:K40_PROTOCOL,board:'M2',name:String(state.name||'Caja MDF').slice(0,80),sheet:sheet+1,
  bed:{width,height},speed,passes,paths,
  summary:{pieces:items.length,paths:paths.length,cutLengthMm:optimized.stats.after*passes,savedMm:optimized.stats.saved*passes,
   // Only cutting time; actual controller acceleration and travel add time.
   minimumCutSeconds:optimized.stats.after*passes/speed}};
}

/** Same geometry snapshot used for the wire protocol, displayed without re-packing. */
export function k40Preview(job){
 const {width,height}=job.bed;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Recorrido de la hoja seleccionada"><rect width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="0.6"/>${job.paths.map(p=>`<path d="M${p.points.map(q=>q.join(' ')).join('L')}${p.closed?'Z':''}" fill="none" stroke="${p.role==='hole'?'#78b1f3':'#86ccaa'}" stroke-width="0.7"/>`).join('')}</svg>`;
}

/** Anchor the design's upper-left bounding point to the tracked head position. */
export function placeK40Job(job,position){
 if(!Array.isArray(position)||position.length!==2||!position.every(Number.isFinite))throw Error('Haz Home una vez para establecer la posición del cabezal.');
 const minimum=[0,1].map(axis=>Math.min(...job.paths.flatMap(path=>path.points.map(p=>p[axis]))));
 const paths=job.paths.map(path=>({...path,points:path.points.map(p=>p.map((n,axis)=>{
  const value=Math.round((n-minimum[axis]+position[axis])*1e6)/1e6;
  if(value<0||value>(axis===0?job.bed.width:job.bed.height))throw Error('El diseño excede la cama desde esta posición. Mueve el cabezal o reduce el área de corte.');
  return value;
 }))}));
 return {...job,paths};
}
