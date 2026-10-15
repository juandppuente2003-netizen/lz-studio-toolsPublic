import {canvasArtifact,processedArtifact,requireTransferImage} from './transfer-export.js';
import {registerStudioModule} from './studio-shell.js';
import {CORNERS,cornerPosition,designGeometry,designContains,resizeMockup} from './mockup-transform.js';

const $=id=>document.getElementById(id),SIZE=1400,MAX_DESIGN_BYTES=200*1024*1024,MAX_DESIGN_SIDE=4096,MAX_DESIGN_PIXELS=16_000_000;
const products=[
  {id:'regular-tee',category:'apparel',name:'Playera regular',asset:'assets/mockups/regular-tee.webp',zone:{x:.5,y:.49,w:.31,h:.38,r:24}},
  {id:'oversized-tee',category:'apparel',name:'Playera oversize',asset:'assets/mockups/oversized-tee.webp',zone:{x:.5,y:.49,w:.37,h:.39,r:24}},
  {id:'dryfit-short',category:'apparel',name:'Dry fit manga corta',asset:'assets/mockups/dryfit-short.webp',zone:{x:.5,y:.48,w:.31,h:.38,r:24}},
  {id:'dryfit-long',category:'apparel',name:'Dry fit manga larga',asset:'assets/mockups/dryfit-long.webp',zone:{x:.5,y:.47,w:.31,h:.37,r:24}},
  {id:'hoodie',category:'apparel',name:'Sudadera con gorro',asset:'assets/mockups/hoodie.webp',zone:{x:.5,y:.43,w:.31,h:.25,r:24}},
  {id:'trucker-cap',category:'caps',name:'Gorra trucker',asset:'assets/mockups/trucker-cap.webp',zone:{x:.5,y:.43,w:.28,h:.19,r:54}},
  {id:'snapback-cap',category:'caps',name:'Gorra snapback',asset:'assets/mockups/snapback-cap.webp',zone:{x:.5,y:.43,w:.27,h:.18,r:48}},
  {id:'fitted-cap',category:'caps',name:'Gorra cerrada',asset:'assets/mockups/fitted-cap.webp',zone:{x:.5,y:.43,w:.27,h:.18,r:48}}
];
const state={category:'apparel',product:products[0],color:'#17191b',background:'#e3e6e8',scale:70,x:0,y:0,rotation:0};
const canvas=$('mockupCanvas'),ctx=canvas.getContext('2d'),productLayer=document.createElement('canvas'),productCtx=productLayer.getContext('2d'),designLayer=document.createElement('canvas'),designCtx=designLayer.getContext('2d');
productLayer.width=productLayer.height=designLayer.width=designLayer.height=SIZE;
const assets=new Map();let design=null,drag=null,mockupZoom=1,mockupFit=true;

function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('No se pudo cargar '+src));image.src=src;});}
function status(message,error=false){$('mockupStatus').textContent=message;$('mockupStatus').classList.toggle('error',error);}
function zone(){const z=state.product.zone;return {x:z.x*SIZE,y:z.y*SIZE,w:z.w*SIZE,h:z.h*SIZE,r:z.r};}
function controlValues(){state.scale=Number($('designScale').value);state.x=Number($('designX').value);state.y=Number($('designY').value);state.rotation=Number($('designRotation').value);$('designScaleOut').value=state.scale+' %';$('designXOut').value=String(state.x);$('designYOut').value=String(state.y);$('designRotationOut').value=state.rotation+'°';}
function setControls(){for(const key of ['scale','x','y','rotation'])$('design'+key[0].toUpperCase()+key.slice(1)).value=state[key];$('designScaleOut').value=Number(state.scale.toFixed(1))+' %';$('designXOut').value=String(Number(state.x.toFixed(1)));$('designYOut').value=String(Number(state.y.toFixed(1)));$('designRotationOut').value=state.rotation+'°';}
function layoutMockup(){const wrap=document.querySelector('.mockup-canvas-wrap'),fit=Math.min((wrap.clientWidth-20)/SIZE,(wrap.clientHeight-20)/SIZE),scale=Math.max(.05,Math.min(3,mockupFit?fit:mockupZoom));canvas.style.width=SIZE*scale+'px';canvas.style.height=SIZE*scale+'px';$('mockupZoomLabel').textContent=mockupFit?'Ajustar':Math.round(scale*100)+' %';if(mockupFit)mockupZoom=scale;}

function optimizedDimensions(width,height){const scale=Math.min(1,MAX_DESIGN_SIDE/Math.max(width,height),Math.sqrt(MAX_DESIGN_PIXELS/(width*height)));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),reduced:scale<.999};}
async function decodeOptimizedDesign(file){const Decoder=globalThis.ImageDecoder;if(Decoder&&await Decoder.isTypeSupported(file.type)){let decoder,frame;try{decoder=new Decoder({data:file.stream(),type:file.type,preferAnimation:false});await decoder.tracks.ready;const track=decoder.tracks.selectedTrack,originalWidth=track.displayWidth||track.codedWidth,originalHeight=track.displayHeight||track.codedHeight,target=optimizedDimensions(originalWidth,originalHeight),result=await decoder.decode({frameIndex:0,completeFramesOnly:true,desiredWidth:target.width,desiredHeight:target.height});frame=result.image;const image=await createImageBitmap(frame);return {image,originalWidth,originalHeight,width:image.width,height:image.height,reduced:target.reduced};}catch{}finally{frame?.close?.();decoder?.close?.();}}const original=await createImageBitmap(file,{imageOrientation:'from-image'}),originalWidth=original.width,originalHeight=original.height,target=optimizedDimensions(originalWidth,originalHeight);if(!target.reduced)return {image:original,originalWidth,originalHeight,width:originalWidth,height:originalHeight,reduced:false};const surface=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(target.width,target.height):document.createElement('canvas');surface.width=target.width;surface.height=target.height;surface.getContext('2d').drawImage(original,0,0,target.width,target.height);const image=await createImageBitmap(surface);original.close?.();return {image,originalWidth,originalHeight,width:target.width,height:target.height,reduced:true};}

function rebuildProduct(){const image=assets.get(state.product.id);if(!image)return;productCtx.clearRect(0,0,SIZE,SIZE);productCtx.globalCompositeOperation='source-over';productCtx.globalAlpha=1;productCtx.drawImage(image,0,0,SIZE,SIZE);productCtx.globalCompositeOperation='source-atop';productCtx.globalAlpha=.82;productCtx.fillStyle=state.color;productCtx.fillRect(0,0,SIZE,SIZE);productCtx.globalCompositeOperation='multiply';productCtx.globalAlpha=.38;productCtx.drawImage(image,0,0,SIZE,SIZE);productCtx.globalCompositeOperation='destination-in';productCtx.globalAlpha=1;productCtx.drawImage(image,0,0,SIZE,SIZE);productCtx.globalCompositeOperation='source-over';render();}

function drawDesign(){if(!design)return;const z=zone(),fit=Math.min(z.w/design.width,z.h/design.height),width=design.width*fit*state.scale/100,height=design.height*fit*state.scale/100,cx=z.x+state.x/100*z.w*.5,cy=z.y+state.y/100*z.h*.5,original=assets.get(state.product.id);designCtx.clearRect(0,0,SIZE,SIZE);designCtx.save();designCtx.translate(cx,cy);designCtx.rotate(state.rotation*Math.PI/180);designCtx.globalAlpha=.98;designCtx.drawImage(design,-width/2,-height/2,width,height);designCtx.restore();if(original){designCtx.save();designCtx.globalCompositeOperation='destination-in';designCtx.drawImage(original,0,0,SIZE,SIZE);designCtx.restore();}ctx.drawImage(designLayer,0,0);if(original){ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=state.product.category==='caps'?.21:.14;ctx.drawImage(original,0,0,SIZE,SIZE);ctx.restore();}}
function drawHandles(){
  if(!design)return;const item=designGeometry(design,state,zone()),rect=canvas.getBoundingClientRect(),unit=SIZE/(rect.width||SIZE),r=5*unit;
  ctx.save();ctx.fillStyle='#b8ff3d';ctx.strokeStyle='#090b0c';ctx.lineWidth=2*unit;
  // Four handles on the artwork only; no product-area bounding rectangle.
  for(const corner of CORNERS){const p=cornerPosition(item,corner);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke()}
  ctx.restore();
}
function render(editing=true){if(globalThis.Event)document.dispatchEvent?.(new Event('lz-work-changed'));ctx.clearRect(0,0,SIZE,SIZE);if(state.background!=='transparent'){ctx.fillStyle=state.background;ctx.fillRect(0,0,SIZE,SIZE);}ctx.save();ctx.shadowColor='#00000035';ctx.shadowBlur=42;ctx.shadowOffsetY=20;ctx.drawImage(productLayer,0,0);ctx.restore();drawDesign();if(editing)drawHandles();}

function renderProducts(){const list=products.filter(product=>product.category===state.category);$('productGrid').innerHTML=list.map(product=>`<button class="product-card${product.id===state.product.id?' active':''}" data-product="${product.id}" aria-label="${product.name}"><img src="${product.asset}" alt=""><span>${product.name}</span></button>`).join('');for(const button of document.querySelectorAll('[data-product]'))button.onclick=()=>selectProduct(button.dataset.product);}
function resetPosition(){state.scale=70;state.x=0;state.y=0;state.rotation=0;setControls();render();}
async function selectProduct(id){const product=products.find(item=>item.id===id);if(!product)return;state.product=product;$('productName').textContent=product.name+' · frente';renderProducts();resetPosition();rebuildProduct();status(`${product.name} listo. Arrastra el diseño para acomodarlo.`);}
function setCategory(category){state.category=category;for(const button of document.querySelectorAll('[data-category]')){const active=button.dataset.category===category;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));}const first=products.find(product=>product.category===category);selectProduct(first.id);}

async function useDesign(source,name){stopDrag();design?.close?.();design=source;$('designName').textContent=name;resetPosition();status('Diseño cargado. Arrástralo para moverlo o arrastra sus esquinas para cambiar el tamaño.');}
async function uploadDesign(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status('Usa un archivo PNG, JPG o WebP.',true);return;}if(file.size>MAX_DESIGN_BYTES){status('El diseño supera 200 MB. Comprímelo ligeramente antes de cargarlo.',true);return;}try{status(file.size>25*1024*1024?'Optimizando imagen pesada…':'Cargando diseño…');const decoded=await decodeOptimizedDesign(file);await useDesign(decoded.image,file.name);if(decoded.reduced)status(`Diseño cargado. Se optimizó de ${decoded.originalWidth.toLocaleString()} × ${decoded.originalHeight.toLocaleString()} a ${decoded.width.toLocaleString()} × ${decoded.height.toLocaleString()} px para trabajar rápido.`);}catch{status('No se pudo abrir ese diseño.',true);}finally{$('designFile').value='';}}
function pointerPosition(event){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*SIZE,y:(event.clientY-rect.top)/rect.height*SIZE};}
function hitCorner(item,p){const radius=14*SIZE/(canvas.getBoundingClientRect().width||SIZE);let hit=null,best=radius;for(const corner of CORNERS){const q=cornerPosition(item,corner),distance=Math.hypot(p.x-q.x,p.y-q.y);if(distance<=best){best=distance;hit=corner}}return hit}
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false||!design||drag)return;
  const p=pointerPosition(event),item=designGeometry(design,state,zone()),corner=hitCorner(item,p);
  if(!corner&&!designContains(item,p))return;
  event.preventDefault();canvas.focus({preventScroll:true});
  drag={pointer:event.pointerId,x:p.x,y:p.y,startX:state.x,startY:state.y,startScale:state.scale,item,corner};
  canvas.setPointerCapture(event.pointerId);canvas.classList.add(corner?'resizing':'dragging');
});
canvas.addEventListener('pointermove',event=>{
  if(!design)return;const p=pointerPosition(event),z=zone();
  if(!drag){const item=designGeometry(design,state,z);canvas.style.cursor=hitCorner(item,p)?'nwse-resize':designContains(item,p)?'move':'default';return}
  if(drag.pointer!==event.pointerId)return;event.preventDefault();
  if(drag.corner)Object.assign(state,resizeMockup(drag.item,drag.startScale,drag.corner,p,z));
  else{state.x=Math.max(-300,Math.min(300,drag.startX+(p.x-drag.x)/(z.w*.5)*100));state.y=Math.max(-300,Math.min(300,drag.startY+(p.y-drag.y)/(z.h*.5)*100));}
  setControls();render();
});
function stopDrag(event){if(!drag||(event&&event.pointerId!==drag.pointer))return;const id=drag.pointer;drag=null;canvas.classList.remove('dragging','resizing');if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}
canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);canvas.addEventListener('lostpointercapture',stopDrag);window.addEventListener('blur',()=>stopDrag());
canvas.addEventListener('keydown',event=>{
  if(!design||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key))return;
  event.preventDefault();const step=event.shiftKey?10:2;
  if(event.key==='ArrowLeft')state.x=Math.max(-300,state.x-step);if(event.key==='ArrowRight')state.x=Math.min(300,state.x+step);
  if(event.key==='ArrowUp')state.y=Math.max(-300,state.y-step);if(event.key==='ArrowDown')state.y=Math.min(300,state.y+step);
  if(event.key==='+'||event.key==='=')state.scale=Math.min(600,state.scale*1.05);if(event.key==='-')state.scale=Math.max(5,state.scale/1.05);
  setControls();render();
});

async function download(){render(false);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));render();if(!blob){status('No se pudo preparar el mockup.',true);return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`LZ_mockup_${state.product.id}_${state.color.slice(1)}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('Mockup descargado en PNG · 1400 × 1400 px.');}

for(const input of ['designScale','designX','designY','designRotation'])$(input).addEventListener('input',()=>{controlValues();render();});
$('designFile').addEventListener('change',()=>uploadDesign($('designFile').files[0]));$('clearDesign').onclick=()=>{design?.close?.();design=null;$('designName').textContent='Sin diseño';render();status('Diseño retirado. Carga otro cuando quieras.');};$('resetDesign').onclick=resetPosition;$('downloadMockup').onclick=download;
$('productColor').addEventListener('input',()=>{state.color=$('productColor').value;rebuildProduct();});for(const swatch of document.querySelectorAll('[data-color]'))swatch.onclick=()=>{state.color=swatch.dataset.color;$('productColor').value=state.color;rebuildProduct();};
$('mockupBackground').addEventListener('change',()=>{state.background=$('mockupBackground').value;render();});for(const button of document.querySelectorAll('[data-category]'))button.onclick=()=>setCategory(button.dataset.category);
function toggleMenu(open){$('moduleMenu').hidden=!open;$('menuBackdrop').hidden=!open;$('menuButton').setAttribute('aria-expanded',String(open));if(open)$('menuClose').focus();}$('menuButton').onclick=()=>toggleMenu($('moduleMenu').hidden);$('menuClose').onclick=()=>toggleMenu(false);$('menuBackdrop').onclick=()=>toggleMenu(false);document.addEventListener('keydown',event=>{if(event.key==='Escape')toggleMenu(false);});
$('mockupZoomIn').onclick=()=>{mockupFit=false;mockupZoom=Math.min(3,mockupZoom*1.25);layoutMockup();};$('mockupZoomOut').onclick=()=>{mockupFit=false;mockupZoom=Math.max(.05,mockupZoom/1.25);layoutMockup();};$('mockupFit').onclick=()=>{mockupFit=true;layoutMockup();};const mockupWrap=document.querySelector('.mockup-canvas-wrap');mockupWrap.addEventListener('wheel',event=>{event.preventDefault();mockupFit=false;mockupZoom=Math.max(.05,Math.min(3,mockupZoom*(event.deltaY<0?1.14:1/1.14)));layoutMockup();},{passive:false});new ResizeObserver(()=>{if(mockupFit)layoutMockup();}).observe(mockupWrap);

try{for(const product of products)assets.set(product.id,await loadImage(product.asset));rebuildProduct();renderProducts();$('canvasLoading').hidden=true;requestAnimationFrame(layoutMockup);status('Mockups listos. Carga un diseño para comenzar.');}catch(error){$('canvasLoading').textContent='No se pudieron cargar los productos.';status(error.message||'No se pudieron preparar los mockups.',true);}

registerStudioModule({id:'mockups',getExportInfo:()=>({widthCm:SIZE/300*2.54,dpi:300,aspect:1}),getComparison:()=>{if(!design)return null;render(false);const after=document.createElement('canvas');after.width=after.height=SIZE;after.getContext('2d').drawImage(canvas,0,0);render();return [productLayer,after];},onFit:()=>{mockupFit=true;layoutMockup();},getDraft:()=>design?{images:{design},data:{...state,product:state.product.id}}:null,restoreDraft:async d=>{await useDesign(await createImageBitmap(d.images.design),'Diseño recuperado');await selectProduct(d.data.product);Object.assign(state,d.data,{product:products.find(p=>p.id===d.data.product)||products[0]});setControls();renderProducts();rebuildProduct();},afterRestore:()=>{controlValues();rebuildProduct();},onZoom:factor=>{mockupFit=false;mockupZoom=Math.max(.05,Math.min(3,mockupZoom*factor));layoutMockup();},exportCurrent:async()=>{requireTransferImage(design);render(false);try{return await canvasArtifact(canvas,`mockup_${state.product.id}.png`)}finally{render()}},importCurrent:async(blob,name)=>{const image=await createImageBitmap(blob);await useDesign(image,name);return true}});
