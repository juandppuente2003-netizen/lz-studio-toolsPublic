/* LZ Box · Dibujar: editor vectorial 2D en mm dentro de Box Studio.
   Formas, pluma, nodos, texto con fuentes, importar SVG/imagen, combinar (unir, restar,
   intersectar, excluir), contorno/anillo, redondear esquinas, matriz, alinear, girar, voltear.
   El resultado se manda a Operar máquina (rojo = corte, negro = grabado, azul = línea grabada)
   o se descarga como SVG. Nada de esto mueve la máquina. */
import * as G from './draw-geometry.js?v=1';
import {BUILTIN_FONTS,loadFont,getFont,importFont,customFonts,unionShapes,simplifyRing} from './text-shapes.js?v=1';
import {importSVG} from './svg-import.js?v=2';
import {processFigure} from './figure.js?v=1';

const NS='http://www.w3.org/2000/svg',STORE='lzbox-draw-v1';
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v===true?'':v);}for(const k of kids.flat())if(k!=null)e.append(k);return e;};
const s=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))if(v!=null)e.setAttribute(k,v);return e;};
const r2=n=>Math.round(n*100)/100;
const ICON={select:'↖',nodes:'◇',shapes:'⬠',pen:'✒',text:'T',image:'🖼',array:'▦',outline:'◎',radius:'◜',measure:'↔'};

export function mountDraw(root,app){
 if(root.dataset.mounted)return root.__draw;root.dataset.mounted='1';
 const bed={w:+(app.state?.sheetW)||400,h:+(app.state?.sheetH)||400};
 let objs=[],sel=new Set(),tool='select',view={x:-20,y:-20,k:2},history=[],future=[],clip=null,pen=null,nodeEdit=null,drag=null,spaceDown=false;
 try{const saved=JSON.parse(localStorage.getItem(STORE)||'null');if(saved&&Array.isArray(saved.objs))objs=saved.objs;}catch{}
 const fontsNeeded=()=>[...new Set(objs.filter(o=>o.kind==='text').map(o=>o.params.font))];
 for(const f of fontsNeeded())loadFont(f).then(render).catch(()=>{});

 /* ---------------- estructura ---------------- */
 const toolbar=h('div',{class:'draw-tools',role:'toolbar','aria-label':'Herramientas de dibujo'});
 const tools=[['select','Seleccionar','V'],['nodes','Nodos','A'],['shapes','Formas','F'],['pen','Pluma','P'],['text','Texto','T'],['image','Importar','I'],['outline','Contorno','O'],['radius','Radio','R'],['array','Matriz','M']];
 const toolBtn=new Map();for(const[id,label,key]of tools){const b=h('button',{type:'button',class:'draw-tool','data-tool':id,title:`${label} (${key})`,onclick:()=>setTool(id)},h('span',{class:'draw-tool-icon','aria-hidden':'true'},ICON[id]),h('span',{},label));toolBtn.set(id,b);toolbar.append(b);}
 const fileInput=h('input',{type:'file',accept:'.svg,image/svg+xml,image/png,image/jpeg,image/webp',hidden:true,multiple:true,onchange:e=>{importFiles([...e.target.files]);e.target.value='';}});toolbar.append(fileInput);

 const top=h('div',{class:'draw-top'});
 const btn=(label,title,fn,cls='')=>h('button',{type:'button',class:'draw-btn '+cls,title,onclick:fn},label);
 const num=(label,id,step=.5)=>{const i=h('input',{type:'number',step,id:'draw'+id,'aria-label':label});return h('label',{class:'draw-num'},h('span',{},label),i);};
 top.append(
  h('div',{class:'draw-group'},btn('↶','Deshacer (Ctrl+Z)',undo),btn('↷','Rehacer (Ctrl+Shift+Z)',redo)),
  h('div',{class:'draw-group'},h('span',{class:'draw-label'},'Alinear'),...[['⇤','left'],['↔','hcenter'],['⇥','right'],['⤒','top'],['↕','vcenter'],['⤓','bottom']].map(([t,a])=>btn(t,'Alinear '+{left:'izquierda',hcenter:'centro horizontal',right:'derecha',top:'arriba',vcenter:'centro vertical',bottom:'abajo'}[a]+' (con una sola forma: a la cama)',()=>align(a)))),
  h('div',{class:'draw-group'},btn('⟲ 90°','Girar 90° a la izquierda',()=>rotateSel(-90)),btn('⟳ 90°','Girar 90° a la derecha',()=>rotateSel(90)),btn('⇋','Voltear horizontal',()=>flip(-1,1)),btn('⥮','Voltear vertical',()=>flip(1,-1))),
  h('div',{class:'draw-group'},h('span',{class:'draw-label'},'Combinar'),btn('Unir','Une las formas seleccionadas en una sola pieza',()=>combine('union')),btn('Restar','A la forma de abajo le quita las de encima',()=>combine('difference')),btn('Intersectar','Deja solo la parte común',()=>combine('intersection')),btn('Excluir','Quita la parte común',()=>combine('xor'))),
  h('div',{class:'draw-group'},btn('Duplicar','Duplicar (Ctrl+D)',duplicate),btn('Al frente','Traer al frente',()=>order(1)),btn('Atrás','Enviar atrás',()=>order(-1)),btn('Borrar','Borrar (Supr)',remove,'danger'))
 );
 const dims=h('div',{class:'draw-dims'},num('X','X'),num('Y','Y'),num('Ancho','W'),num('Alto','H'),num('Giro °','R',1),h('label',{class:'draw-lock',title:'Mantener proporción'},h('input',{type:'checkbox',id:'drawLock',checked:true}),'Proporción'),h('span',{class:'draw-unit'},'mm'));
 const hint=h('p',{class:'draw-hint',id:'drawHint'});
 const svg=s('svg',{class:'draw-canvas',tabindex:'0','aria-label':'Lienzo de dibujo en milímetros'});
 const gGrid=s('g'),gObjs=s('g'),gUi=s('g');svg.append(gGrid,gObjs,gUi);
 const zoom=h('div',{class:'draw-zoom'},btn('+','Acercar',()=>zoomBy(1.25)),btn('−','Alejar',()=>zoomBy(.8)),btn('⤢','Ver todo',fit),h('span',{id:'drawZoom'},'100%'));
 const stage=h('div',{class:'draw-stage'},svg,zoom);
 const props=h('aside',{class:'draw-props','aria-label':'Propiedades'});
 const out=h('div',{class:'draw-out'},btn('Enviar a Operar máquina','Abre el dibujo en Operar máquina para grabar y cortar',sendToMachine,'primary'),btn('Descargar SVG','SVG en mm (rojo = corte, negro = grabado)',downloadSVG),btn('Nuevo','Vaciar el lienzo',()=>{if(!objs.length||confirm('¿Borrar todo el dibujo?')){commit();objs=[];sel.clear();render();}},'quiet'));
 const body=h('div',{class:'draw-body'},toolbar,h('div',{class:'draw-center'},top,dims,stage,hint),h('div',{class:'draw-side'},props,out));
 root.replaceChildren(body);

 /* ---------------- vista ---------------- */
 const box=()=>svg.getBoundingClientRect();
 function setViewBox(){const b=box(),w=b.width/view.k,hh=b.height/view.k;svg.setAttribute('viewBox',`${view.x} ${view.y} ${w} ${hh}`);document.getElementById('drawZoom').textContent=Math.round(view.k/2*100)+'%';drawGrid(w,hh);}
 function drawGrid(w,hh){gGrid.replaceChildren();const step=view.k>4?5:view.k>1.2?10:50,x0=Math.floor(view.x/step)*step,y0=Math.floor(view.y/step)*step,d=[];for(let x=x0;x<view.x+w;x+=step)d.push(`M${x} ${view.y}V${view.y+hh}`);for(let y=y0;y<view.y+hh;y+=step)d.push(`M${view.x} ${y}H${view.x+w}`);gGrid.append(s('path',{d:d.join(''),class:'draw-grid','vector-effect':'non-scaling-stroke'}),s('rect',{x:0,y:0,width:bed.w,height:bed.h,class:'draw-bed','vector-effect':'non-scaling-stroke'}));}
 function toMM(e){const b=box();return[view.x+(e.clientX-b.left)/view.k,view.y+(e.clientY-b.top)/view.k];}
 function zoomBy(f,at){const b=box(),p=at||[view.x+b.width/2/view.k,view.y+b.height/2/view.k];const k=Math.max(.3,Math.min(40,view.k*f));view.x=p[0]-(p[0]-view.x)*view.k/k;view.y=p[1]-(p[1]-view.y)*view.k/k;view.k=k;setViewBox();renderUi();}
 function fit(){root.style.setProperty('--draw-top',Math.max(60,root.getBoundingClientRect().top+window.scrollY)+'px');const b=G.bbox(objs)||{x:0,y:0,w:bed.w,h:bed.h},c=box();const k=Math.min(c.width/(b.w+40),c.height/(b.h+40));view.k=Math.max(.3,Math.min(40,k));view.x=b.x-(c.width/view.k-b.w)/2;view.y=b.y-(c.height/view.k-b.h)/2;setViewBox();renderUi();}

 /* ---------------- historial ---------------- */
 function commit(){history.push(JSON.stringify(objs));if(history.length>80)history.shift();future=[];}
 function undo(){if(!history.length)return;future.push(JSON.stringify(objs));objs=JSON.parse(history.pop());sel=new Set([...sel].filter(id=>objs.some(o=>o.id===id)));nodeEdit=null;render();}
 function redo(){if(!future.length)return;history.push(JSON.stringify(objs));objs=JSON.parse(future.pop());render();}
 function save(){try{localStorage.setItem(STORE,JSON.stringify({objs}));}catch{}}

 /* ---------------- dibujo ---------------- */
 const selected=()=>objs.filter(o=>sel.has(o.id));
 function pathOf(o){const g=G.worldGeometry(o);return{d:g.shapes.map(sh=>[sh.outer,...sh.holes].map(G.ringPath).join('')).join(''),l:g.lines.map(G.linePath).join('')};}
 function render(){
  gObjs.replaceChildren();
  for(const o of objs){const{d,l}=pathOf(o),cls=`draw-obj op-${o.op}${sel.has(o.id)?' selected':''}`;if(d)gObjs.append(Object.assign(s('path',{d,class:cls,'fill-rule':'evenodd','data-id':o.id,'vector-effect':'non-scaling-stroke'})));if(l)gObjs.append(s('path',{d:l,class:cls+' open','data-id':o.id,'vector-effect':'non-scaling-stroke'}));if(o.kind==='text'&&!getFont(o.params.font))loadFont(o.params.font).then(render).catch(()=>{});}
  renderUi();renderProps();syncDims();save();
 }
 function renderUi(){
  gUi.replaceChildren();const px=1/view.k,list=selected(),b=G.bbox(list);
  if(pen&&pen.points.length){gUi.append(s('polyline',{points:[...pen.points,pen.hover||pen.points.at(-1)].map(p=>p.join(',')).join(' '),class:'draw-pen','vector-effect':'non-scaling-stroke'}));for(const p of pen.points)gUi.append(s('circle',{cx:p[0],cy:p[1],r:3*px,class:'draw-node'}));}
  if(drag?.type==='marquee'){const[x0,y0]=drag.start,[x1,y1]=drag.now;gUi.append(s('rect',{x:Math.min(x0,x1),y:Math.min(y0,y1),width:Math.abs(x1-x0),height:Math.abs(y1-y0),class:'draw-marquee','vector-effect':'non-scaling-stroke'}));}
  if(!b)return;
  gUi.append(s('rect',{x:b.x,y:b.y,width:b.w,height:b.h,class:'draw-selbox','vector-effect':'non-scaling-stroke'}));
  const label=s('text',{x:b.x,y:b.y+b.h+14*px,class:'draw-size','font-size':11*px});label.textContent=`${r2(b.w)} × ${r2(b.h)} mm`;gUi.append(label);
  if(tool==='nodes'&&nodeEdit&&list.length===1){for(const[ri,ring]of nodeRings(list[0]).entries())ring.forEach((p,i)=>gUi.append(s('rect',{x:p[0]-3.5*px,y:p[1]-3.5*px,width:7*px,height:7*px,class:'draw-node'+(nodeEdit.active&&nodeEdit.active[0]===ri&&nodeEdit.active[1]===i?' active':''),'data-node':`${ri}:${i}`})));return;}
  if(tool!=='select')return;
  for(const[hx,hy,cur]of handles(b))gUi.append(s('rect',{x:hx-4*px,y:hy-4*px,width:8*px,height:8*px,class:'draw-handle','data-handle':cur,style:`cursor:${cur}`}));
  const rx=b.x+b.w/2,ry=b.y-22*px;gUi.append(s('line',{x1:rx,y1:b.y,x2:rx,y2:ry,class:'draw-selbox','vector-effect':'non-scaling-stroke'}),s('circle',{cx:rx,cy:ry,r:5*px,class:'draw-handle rotate','data-handle':'rotate'}));
 }
 const handles=b=>[[b.x,b.y,'nwse-resize'],[b.x+b.w/2,b.y,'ns-resize'],[b.x+b.w,b.y,'nesw-resize'],[b.x+b.w,b.y+b.h/2,'ew-resize'],[b.x+b.w,b.y+b.h,'nwse-resize'],[b.x+b.w/2,b.y+b.h,'ns-resize'],[b.x,b.y+b.h,'nesw-resize'],[b.x,b.y+b.h/2,'ew-resize']].map((v,i)=>[v[0],v[1],['nw','n','ne','e','se','s','sw','w'][i]]);
 function nodeRings(o){if(o.kind==='polyline')return[o.params.points];return(o.params.shapes||[]).flatMap(sh=>[sh.outer,...sh.holes]);}

 /* ---------------- propiedades ---------------- */
 function renderProps(){
  const list=selected();props.replaceChildren();
  props.append(h('h3',{},list.length?(list.length===1?(list[0].name||kindName(list[0])):`${list.length} formas`):'Lienzo'));
  if(!list.length){props.append(h('p',{class:'draw-hint'},'Elige una herramienta a la izquierda. Clic derecho o espacio + arrastrar para mover la vista; rueda para acercar. La cama de '+bed.w+' × '+bed.h+' mm se ve punteada.'),layerList());return;}
  const op=h('div',{class:'draw-seg',role:'group','aria-label':'Operación'},...Object.entries(G.OPS).map(([k,v])=>h('button',{type:'button',class:list.every(o=>o.op===k)?'active':'',onclick:()=>{commit();for(const o of list)o.op=k;render();}},h('i',{style:`background:${v.color}`}),v.name)));
  props.append(h('label',{class:'draw-field-title'},'Qué hace el láser'),op);
  if(list.length===1){const o=list[0],p=o.params;
   const field=(label,key,attrs={})=>{const i=h('input',{type:attrs.type||'number',step:attrs.step??.5,min:attrs.min,max:attrs.max,value:p[key]});i.addEventListener('change',()=>{commit();p[key]=attrs.type==='text'?i.value:+i.value;render();});return h('label',{class:'draw-field'},h('span',{},label),i);};
   if(['rect','ellipse','polygon','star','heart','cross','arrow','arch','slot','tri'].includes(o.kind)){props.append(h('div',{class:'draw-grid2'},field('Ancho base','w',{min:1}),field('Alto base','h',{min:1}),...(o.kind==='rect'?[field('Radio esquinas','r',{min:0})]:[]),...(['polygon','star'].includes(o.kind)?[field(o.kind==='star'?'Puntas':'Lados','n',{step:1,min:3})]:[]),...(o.kind==='star'?[field('Interior (0–1)','inner',{step:.05,min:.1,max:.95})]:[]),...(o.kind==='cross'?[field('Grosor (0–1)','bar',{step:.02,min:.08,max:.6})]:[])));}
   if(o.kind==='text'){const t=h('textarea',{rows:2,maxlength:80},p.text);t.addEventListener('input',()=>{p.text=t.value;clearTimeout(t._t);t._t=setTimeout(()=>{commit();render();},250);});
    const fs=h('select',{});for(const f of BUILTIN_FONTS)fs.append(h('option',{value:f.id,selected:p.font===f.id},f.name));customFonts().then(list=>{for(const f of list)fs.append(h('option',{value:f.id,selected:p.font===f.id},f.name));});
    fs.addEventListener('change',async()=>{commit();p.font=fs.value;await loadFont(p.font).catch(()=>{});render();});
    const load=h('label',{class:'draw-btn'},'Cargar fuente…',h('input',{type:'file',accept:'.ttf,.otf,.woff',hidden:true,onchange:async e=>{const f=e.target.files[0];if(!f)return;try{const r=await importFont(f);commit();p.font=r.id;render();}catch(err){toast(err.message);}}}));
    const joined=h('input',{type:'checkbox',checked:!!p.joined,onchange:e=>{commit();p.joined=e.target.checked;render();}});
    props.append(h('label',{class:'draw-field-title'},'Texto'),t,h('div',{class:'draw-row'},fs,load),h('div',{class:'draw-grid2'},field('Alto «H» mm','size',{min:2}),field('Espaciado mm','spacing',{step:.5})),h('label',{class:'draw-check'},joined,'Unir letras en una pieza (pon espaciado negativo para que se toquen)'));}
   if(o.kind!=='path'&&o.kind!=='polyline')props.append(btn('Convertir a trazado','Para editar nodos o combinar sin perder la forma actual',()=>{commit();Object.assign(o,G.bake(o));render();}));
  }
  // Contorno / radio / matriz
  props.append(h('details',{class:'draw-box',open:tool==='outline'},h('summary',{},'Contorno / desplazamiento'),(()=>{const d=h('input',{type:'number',step:.5,value:3}),ring=h('input',{type:'checkbox'}),miter=h('input',{type:'checkbox'});return h('div',{},h('label',{class:'draw-field'},h('span',{},'Distancia mm (negativa = hacia adentro)'),d),h('label',{class:'draw-check'},ring,'Solo el anillo (marco)'),h('label',{class:'draw-check'},miter,'Esquinas en punta'),btn('Crear contorno','Agrega una forma nueva alrededor',()=>{try{commit();const made=list.map(o=>G.outline(o,+d.value,{ring:ring.checked,round:!miter.checked}));objs.push(...made);sel=new Set(made.map(o=>o.id));render();}catch(e){undoSilently();toast(e.message);}},'primary'));})()));
  props.append(h('details',{class:'draw-box',open:tool==='radius'},h('summary',{},'Redondear esquinas'),(()=>{const r=h('input',{type:'number',step:.5,min:0,value:3});return h('div',{},h('label',{class:'draw-field'},h('span',{},'Radio mm'),r),btn('Redondear','Redondea esquinas de las formas seleccionadas',()=>{try{commit();for(const o of list){if(o.kind==='polyline')continue;const n=G.roundCorners(o,+r.value);Object.assign(o,n);}render();}catch(e){undoSilently();toast(e.message);}},'primary'));})()));
  props.append(h('details',{class:'draw-box',open:tool==='array'},h('summary',{},'Matriz (copias)'),(()=>{const mode=h('select',{},h('option',{value:'grid'},'Filas y columnas'),h('option',{value:'circular'},'Circular')),rows=h('input',{type:'number',min:1,value:2}),cols=h('input',{type:'number',min:1,value:3}),gx=h('input',{type:'number',step:.5,value:5}),gy=h('input',{type:'number',step:.5,value:5}),count=h('input',{type:'number',min:2,value:6}),rad=h('input',{type:'number',step:1,value:40});
   return h('div',{},mode,h('div',{class:'draw-grid2'},h('label',{class:'draw-field'},h('span',{},'Filas'),rows),h('label',{class:'draw-field'},h('span',{},'Columnas'),cols),h('label',{class:'draw-field'},h('span',{},'Separación X'),gx),h('label',{class:'draw-field'},h('span',{},'Separación Y'),gy),h('label',{class:'draw-field'},h('span',{},'Copias (circular)'),count),h('label',{class:'draw-field'},h('span',{},'Radio (circular)'),rad)),btn('Crear copias','',()=>{commit();const made=G.array(list,{mode:mode.value,rows:+rows.value,cols:+cols.value,gapX:+gx.value,gapY:+gy.value,count:+count.value,radius:+rad.value});objs.push(...made);sel=new Set([...list,...made].map(o=>o.id));render();},'primary'));})()));
  props.append(layerList());
 }
 function layerList(){if(!objs.length)return h('p',{class:'draw-hint'},'Todavía no hay formas.');const ul=h('ul',{class:'draw-layers'});for(const o of objs.slice().reverse())ul.append(h('li',{class:sel.has(o.id)?'active':'',onclick:e=>{if(!e.shiftKey)sel.clear();sel.has(o.id)&&e.shiftKey?sel.delete(o.id):sel.add(o.id);render();}},h('i',{style:`background:${G.OPS[o.op]?.color}`}),o.name||kindName(o)));return h('div',{},h('h4',{},'Capas'),ul);}
 const kindName=o=>({path:'Trazado',polyline:'Línea',text:`Texto «${(o.params.text||'').slice(0,14)}»`}[o.kind]||G.SHAPES.find(x=>x.kind===o.kind)?.name||o.kind);
 function undoSilently(){if(history.length)objs=JSON.parse(history.pop());}

 /* ---------------- medidas numéricas ---------------- */
 const D=k=>document.getElementById('draw'+k);
 function syncDims(){const b=G.bbox(selected());for(const k of['X','Y','W','H','R']){D(k).disabled=!b;if(document.activeElement!==D(k))D(k).value=b?r2({X:b.x,Y:b.y,W:b.w,H:b.h,R:0}[k]):'';}}
 for(const k of['X','Y','W','H','R'])D(k).addEventListener('change',()=>{const list=selected(),b=G.bbox(list);if(!b)return;const v=+D(k).value;if(!Number.isFinite(v))return;commit();let m;
  if(k==='X')m=G.translate(v-b.x,0);else if(k==='Y')m=G.translate(0,v-b.y);else if(k==='R')m=G.rotateAt(v,b.x+b.w/2,b.y+b.h/2);
  else{if(v<=0)return;const lock=document.getElementById('drawLock').checked,sx=k==='W'?v/b.w:lock?v/b.h:1,sy=k==='H'?v/b.h:lock?v/b.w:1;m=G.scaleAt(sx,sy,b.x,b.y);}
  for(const o of list)o.m=G.mul(m,o.m);render();});

 /* ---------------- acciones ---------------- */
 function add(o,select=true){commit();objs.push(o);if(select)sel=new Set([o.id]);render();}
 function center(){const b=box();return[view.x+b.width/2/view.k,view.y+b.height/2/view.k];}
 function addShape(def,at=center()){const p=JSON.parse(JSON.stringify(def.params));add({id:G.uid(),kind:def.kind,name:def.name,params:p,m:G.translate(at[0]-p.w/2,at[1]-p.h/2),op:'cut'});setTool('select');}
 async function addText(at){const font=BUILTIN_FONTS[0].id;await loadFont(font).catch(()=>{});add({id:G.uid(),kind:'text',params:{text:'Texto',font,size:20,spacing:0,joined:false},m:G.translate(at[0],at[1]),op:'cut'});setTool('select');setTimeout(()=>props.querySelector('textarea')?.select(),30);}
 function remove(){if(!sel.size)return;commit();objs=objs.filter(o=>!sel.has(o.id));sel.clear();render();}
 function duplicate(){const list=selected();if(!list.length)return;commit();const made=list.map(o=>({...G.clone(o),id:G.uid(),m:G.mul(G.translate(5,5),o.m)}));objs.push(...made);sel=new Set(made.map(o=>o.id));render();}
 function order(dir){const list=selected();if(!list.length)return;commit();const rest=objs.filter(o=>!sel.has(o.id));objs=dir>0?[...rest,...list]:[...list,...rest];render();}
 function rotateSel(deg){const list=selected(),b=G.bbox(list);if(!b)return;commit();const m=G.rotateAt(deg,b.x+b.w/2,b.y+b.h/2);for(const o of list)o.m=G.mul(m,o.m);render();}
 function flip(sx,sy){const list=selected(),b=G.bbox(list);if(!b)return;commit();const m=G.scaleAt(sx,sy,b.x+b.w/2,b.y+b.h/2);for(const o of list)o.m=G.mul(m,o.m);render();}
 function align(a){const list=selected();if(!list.length)return;const ref=list.length>1?G.bbox(list):{x:0,y:0,w:bed.w,h:bed.h};commit();for(const o of list){const b=G.bbox([o]);const dx=a==='left'?ref.x-b.x:a==='right'?ref.x+ref.w-b.x-b.w:a==='hcenter'?ref.x+ref.w/2-b.x-b.w/2:0,dy=a==='top'?ref.y-b.y:a==='bottom'?ref.y+ref.h-b.y-b.h:a==='vcenter'?ref.y+ref.h/2-b.y-b.h/2:0;o.m=G.mul(G.translate(dx,dy),o.m);}render();}
 function combine(op){const list=selected();try{const r=G.combine(list,op);commit();const first=objs.findIndex(o=>sel.has(o.id));objs=objs.filter(o=>!sel.has(o.id));objs.splice(Math.max(0,first),0,r);sel=new Set([r.id]);render();}catch(e){toast(e.message);}}
 function setTool(t){
  if(t==='image'){fileInput.click();return;}
  if(t==='shapes'){shapePicker();return;}
  if(pen)finishPen(false);tool=t;nodeEdit=null;
  if(t==='nodes'){const list=selected();if(list.length===1){const o=list[0];if(o.kind!=='path'&&o.kind!=='polyline'){commit();Object.assign(o,G.bake(o));}else if(!G.I().every((v,i)=>Math.abs(v-o.m[i])<1e-9)){commit();Object.assign(o,G.bake(o));}nodeEdit={id:o.id,active:null};}else toast('Selecciona una forma para editar sus nodos.');}
  for(const[id,b]of toolBtn)b.classList.toggle('active',id===tool);
  svg.dataset.tool=tool;hint.textContent={select:'Clic para elegir (Mayús suma). Arrastra para mover; esquinas para escalar; círculo para girar. Flechas: 1 mm (Mayús: 10 mm).',nodes:'Arrastra un nodo para moverlo. Doble clic sobre un lado agrega un nodo; Supr borra el nodo elegido.',pen:'Clic para poner puntos. Clic en el primer punto cierra la forma; Enter o doble clic deja una línea abierta; Esc cancela.',text:'Clic en el lienzo para escribir. Cambia fuente y tamaño a la derecha.',outline:'Elige formas y crea su contorno a la derecha (sirve para marcos, bordes y anillos).',radius:'Elige formas y redondea sus esquinas a la derecha.',array:'Elige formas y crea copias en filas y columnas o en círculo.'}[tool]||'';
  render();
 }
 function shapePicker(){const dlg=h('dialog',{class:'draw-dialog'},h('h3',{},'Elegir una forma'),h('div',{class:'draw-shapes'},...G.SHAPES.map(def=>{const o={kind:def.kind,params:def.params,m:G.I()},b=G.bbox([o]),{d}=pathOf(o);const ic=s('svg',{viewBox:`${b.x-2} ${b.y-2} ${b.w+4} ${b.h+4}`});ic.append(s('path',{d,'fill-rule':'evenodd'}));return h('button',{type:'button',onclick:()=>{dlg.close();addShape(def);}},ic,h('span',{},def.name));})),h('form',{method:'dialog'},h('button',{class:'draw-btn'},'Cerrar')));document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove());dlg.showModal();}
 function finishPen(close){if(!pen)return;const pts=pen.points;pen=null;if(close&&pts.length>=3)add({id:G.uid(),kind:'path',name:'Forma de pluma',params:{shapes:[{outer:pts,holes:[]}]},m:G.I(),op:'cut'});else if(!close&&pts.length>=2)add({id:G.uid(),kind:'polyline',name:'Línea',params:{points:pts},m:G.I(),op:'line'});else renderUi();}

 /* ---------------- importar ---------------- */
 async function importFiles(files){for(const f of files){try{if(/svg/.test(f.type)||/\.svg$/i.test(f.name))importSvgText(await f.text(),f.name);else await importImage(f);}catch(e){toast(`${f.name}: ${e.message}`);}}}
 function importSvgText(text,name){const d=importSVG(text,{name});const made=[];const at=center(),b=d.bbox||{x:0,y:0,width:0,height:0},dx=at[0]-(b.x+b.width/2),dy=at[1]-(b.y+b.height/2);
  for(const e of d.elements){const color=(e.stroke?.color||e.fill?.color||'#000').toLowerCase(),red=/^#(ff0000|f00|e[0-9a-f]0000|ff[0-3][0-9a-f][0-3][0-9a-f])$/.test(color);const closed=e.subpaths.filter(p=>p.closed&&p.points.length>2).map(p=>p.points),open=e.subpaths.filter(p=>!p.closed&&p.points.length>1).map(p=>p.points);
   if(closed.length){const shapes=unionShapes(closed,e.fill?.rule==='evenodd'||!e.fill);if(shapes.length)made.push({id:G.uid(),kind:'path',name:(e.tag||'Trazado')+' importado',params:{shapes},m:G.translate(dx,dy),op:e.fill&&!red?'engrave':red?'cut':'line'});}
   for(const l of open)made.push({id:G.uid(),kind:'polyline',name:'Línea importada',params:{points:l},m:G.translate(dx,dy),op:red?'cut':'line'});}
  if(!made.length)throw Error('El SVG no tiene trazos utilizables.');commit();objs.push(...made);sel=new Set(made.map(o=>o.id));render();toast(`${made.length} formas importadas de ${name}.`);}
 async function importImage(file){const url=URL.createObjectURL(file);try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('No se pudo leer la imagen.'));i.src=url;});const k=Math.min(1,600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);
  const r=processFigure(ctx.getImageData(0,0,c.width,c.height),{threshold:128,background:40,mode:'outline'});if(!r?.contour?.length)throw Error('No se encontró una silueta (usa fondo transparente o claro).');
  const mm=80/Math.max(c.width,c.height),at=center(),pts=simplifyRing(r.contour.map(([x,y])=>[at[0]+(x-c.width/2)*mm,at[1]+(y-c.height/2)*mm]),.08);add({id:G.uid(),kind:'path',name:'Silueta de '+file.name.slice(0,24),params:{shapes:[{outer:pts,holes:[]}]},m:G.I(),op:'cut'});toast('Silueta creada a 80 mm; ajusta el tamaño arriba.');}finally{URL.revokeObjectURL(url);}}

 /* ---------------- salida ---------------- */
 function exportable(){if(!objs.length)throw Error('Dibuja algo primero.');return G.exportSVG(objs);}
 async function sendToMachine(){try{const svgText=exportable();if(!app.jobStudio)throw Error('Operar máquina no está disponible.');await app.jobStudio.receiveFile({name:'dibujo.svg',type:'image/svg+xml',data:svgText});app.workshop?.show('operate');toast('Dibujo abierto en Operar máquina: revisa operaciones y colocación antes de enviar.');}catch(e){toast(e.message);}}
 function downloadSVG(){try{const blob=new Blob([exportable()],{type:'image/svg+xml'}),a=h('a',{href:URL.createObjectURL(blob),download:'dibujo-lzbox.svg'});document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}catch(e){toast(e.message);}}
 const toast=m=>(app.toast||globalThis.alert)(m);

 /* ---------------- ratón y teclado ---------------- */
 const hitObj=e=>{const t=e.target.closest?.('[data-id]');return t?objs.find(o=>o.id===t.dataset.id):null;};
 svg.addEventListener('contextmenu',e=>e.preventDefault());
 svg.addEventListener('pointerdown',e=>{
  svg.focus();const now=performance.now();if(e.button===0&&now-lastDown.t<380&&Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)<6){lastDown={t:0,x:0,y:0};drag=null;onDouble(e);return;}lastDown={t:now,x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);const p=toMM(e);
  if(e.button===1||e.button===2||spaceDown){drag={type:'pan',startClient:[e.clientX,e.clientY],view:{...view}};return;}
  if(tool==='pen'){if(!pen)pen={points:[]};const first=pen.points[0];if(first&&pen.points.length>=3&&Math.hypot(p[0]-first[0],p[1]-first[1])<6/view.k){finishPen(true);return;}pen.points.push(p);renderUi();return;}
  if(tool==='text'){addText(p);return;}
  if(tool==='nodes'&&nodeEdit){const n=e.target.dataset?.node;if(n){const[ri,i]=n.split(':').map(Number);nodeEdit.active=[ri,i];commit();drag={type:'node',ri,i};renderUi();return;}}
  const handle=e.target.dataset?.handle;
  if(handle&&tool==='select'){const list=selected(),b=G.bbox(list);commit();drag={type:handle==='rotate'?'rotate':'scale',handle,start:p,b,orig:list.map(o=>[o,[...o.m]])};return;}
  const o=hitObj(e);
  if(o){if(e.shiftKey){sel.has(o.id)?sel.delete(o.id):sel.add(o.id);}else if(!sel.has(o.id))sel=new Set([o.id]);if(tool!=='select'&&tool!=='nodes'&&!['outline','radius','array'].includes(tool))setTool('select');commit();drag={type:'move',start:p,orig:selected().map(o=>[o,[...o.m]]),moved:false};render();return;}
  if(!e.shiftKey)sel.clear();drag={type:'marquee',start:p,now:p};render();
 });
 svg.addEventListener('pointermove',e=>{const p=toMM(e);
  if(pen){pen.hover=p;renderUi();}
  if(!drag)return;
  if(drag.type==='pan'){view.x=drag.view.x-(e.clientX-drag.startClient[0])/view.k;view.y=drag.view.y-(e.clientY-drag.startClient[1])/view.k;setViewBox();renderUi();return;}
  if(drag.type==='marquee'){drag.now=p;renderUi();return;}
  if(drag.type==='move'){let dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}drag.moved=true;for(const[o,m]of drag.orig)o.m=G.mul(G.translate(dx,dy),m);render();return;}
  if(drag.type==='scale'){const{b,handle}=drag,ax=handle.includes('w')?b.x+b.w:handle.includes('e')?b.x:b.x+b.w/2,ay=handle.includes('n')?b.y+b.h:handle.includes('s')?b.y:b.y+b.h/2;let sx=handle.includes('e')||handle.includes('w')?(p[0]-ax)/(drag.start[0]-ax):1,sy=handle.includes('n')||handle.includes('s')?(p[1]-ay)/(drag.start[1]-ay):1;
   if(!Number.isFinite(sx)||Math.abs(sx)<.01)sx=.01*Math.sign(sx||1);if(!Number.isFinite(sy)||Math.abs(sy)<.01)sy=.01*Math.sign(sy||1);if(handle.length===2&&!e.altKey&&document.getElementById('drawLock').checked){const k=Math.abs(sx)>Math.abs(sy)?sx:sy;sx=Math.sign(sx)*Math.abs(k);sy=Math.sign(sy)*Math.abs(k);}
   const m=G.scaleAt(sx,sy,ax,ay);for(const[o,om]of drag.orig)o.m=G.mul(m,om);render();return;}
  if(drag.type==='rotate'){const{b}=drag,cx=b.x+b.w/2,cy=b.y+b.h/2;let deg=(Math.atan2(p[1]-cy,p[0]-cx)-Math.atan2(drag.start[1]-cy,drag.start[0]-cx))*180/Math.PI;if(e.shiftKey)deg=Math.round(deg/15)*15;const m=G.rotateAt(deg,cx,cy);for(const[o,om]of drag.orig)o.m=G.mul(m,om);render();return;}
  if(drag.type==='node'){const o=selected()[0],rings=nodeRings(o);rings[drag.ri][drag.i]=p;render();}
 });
 svg.addEventListener('pointerup',e=>{if(!drag)return;
  if(drag.type==='marquee'){const[x0,y0]=drag.start,[x1,y1]=drag.now,X0=Math.min(x0,x1),X1=Math.max(x0,x1),Y0=Math.min(y0,y1),Y1=Math.max(y0,y1);if(X1-X0>1&&Y1-Y0>1)for(const o of objs){const b=G.bbox([o]);if(b&&b.x>=X0&&b.y>=Y0&&b.x+b.w<=X1&&b.y+b.h<=Y1)sel.add(o.id);}}
  if(drag.type==='move'&&!drag.moved)history.pop();
  drag=null;render();});
 // Doble clic propio: el lienzo se redibuja entre clics y el navegador no lo detectaría.
 function onDouble(e){if(tool==='pen'){finishPen(false);return;}
  if(tool==='nodes'&&nodeEdit){const o=selected()[0];if(!o)return;const p=toMM(e),rings=nodeRings(o);let best=null;rings.forEach((r,ri)=>{const n=r.length,closed=o.kind!=='polyline';for(let i=0;i<(closed?n:n-1);i++){const a=r[i],b=r[(i+1)%n],t=Math.max(0,Math.min(1,((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/(((b[0]-a[0])**2+(b[1]-a[1])**2)||1))),q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(!best||d<best.d)best={d,ri,i,q};}});if(best&&best.d<8/view.k){commit();rings[best.ri].splice(best.i+1,0,best.q);nodeEdit.active=[best.ri,best.i+1];render();}return;}
  const o=hitObj(e);if(o&&tool==='select'&&(o.kind==='path'||o.kind==='polyline')){sel=new Set([o.id]);setTool('nodes');}}
 let lastDown={t:0,x:0,y:0};
 svg.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.12:1/1.12,toMM(e));},{passive:false});
 root.addEventListener('keydown',e=>{if(root.hidden||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(k===' '){spaceDown=true;svg.style.cursor='grab';e.preventDefault();return;}
  if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if(mod&&k==='y'){e.preventDefault();redo();return;}
  if(mod&&k==='d'){e.preventDefault();duplicate();return;}if(mod&&k==='a'){e.preventDefault();sel=new Set(objs.map(o=>o.id));render();return;}
  if(mod&&k==='c'){clip=G.clone(selected());return;}if(mod&&k==='v'&&clip?.length){e.preventDefault();commit();const made=clip.map(o=>({...G.clone(o),id:G.uid(),m:G.mul(G.translate(10,10),o.m)}));objs.push(...made);sel=new Set(made.map(o=>o.id));clip=made.map(G.clone);render();return;}
  if(k==='escape'){if(pen){pen=null;renderUi();}else{sel.clear();setTool('select');}return;}
  if(k==='enter'&&pen){finishPen(false);return;}
  if(k==='delete'||k==='backspace'){e.preventDefault();if(tool==='nodes'&&nodeEdit?.active){const o=selected()[0],rings=nodeRings(o),r=rings[nodeEdit.active[0]];if(r&&r.length>(o.kind==='polyline'?2:3)){commit();r.splice(nodeEdit.active[1],1);nodeEdit.active=null;render();}return;}remove();return;}
  if(k.startsWith('arrow')&&sel.size){e.preventDefault();const d=e.shiftKey?10:1,dx=k==='arrowleft'?-d:k==='arrowright'?d:0,dy=k==='arrowup'?-d:k==='arrowdown'?d:0;commit();for(const o of selected())o.m=G.mul(G.translate(dx,dy),o.m);render();return;}
  if(!mod){const t=tools.find(x=>x[2].toLowerCase()===k);if(t)setTool(t[0]);}
 });
 root.addEventListener('keyup',e=>{if(e.key===' '){spaceDown=false;svg.style.cursor='';}});
 new ResizeObserver(()=>{setViewBox();renderUi();}).observe(stage);
 setTool('select');requestAnimationFrame(()=>{objs.length?fit():(setViewBox(),fit());});
 const api={get objects(){return objs;},set objects(v){objs=v;render();},render,fit,setTool,addShape,combine,select:ids=>{sel=new Set(ids);render();},exportSVG:()=>G.exportSVG(objs)};root.__draw=api;return api;
}
