// Mockups 3D: varios diseños sobre una prenda 3D. Cada diseño se proyecta sobre la tela (decal)
// y se puede arrastrar sobre la superficie, escalar en cm y rotar.
import * as THREE from './box/vendor/three.module.min.js';
import {DecalGeometry} from './vendor/three-decal.js';
import {buildGarment,garments,placements,UNIT_CM} from './mockup3d-garment.js';
import {registerStudioModule} from './studio-shell.js';

const $=id=>document.getElementById(id);
const MAX_SIDE=2048,MAX_ITEMS=12;
const state={garment:'tee',color:'#17191b',background:'#e3e6e8',view:'front'};
let items=[],selected=null,nextId=1;

/* Escena ---------------------------------------------------------------- */
const canvas=$('m3dCanvas'),wrap=$('m3dStage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.05,30);
scene.add(new THREE.HemisphereLight(0xffffff,0x3a3d40,1.15));
const key=new THREE.DirectionalLight(0xffffff,2.1);key.position.set(2.4,3,3.2);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,.7);fill.position.set(-3,1,2);scene.add(fill);
const rim=new THREE.DirectionalLight(0xffffff,.9);rim.position.set(0,2.5,-3.5);scene.add(rim);
const orbit={az:0,el:.06,dist:3.4,target:new THREE.Vector3(0,-.08,0)};
let garment=null;const decalGroup=new THREE.Group();scene.add(decalGroup);
const frame=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xb8ff3d,depthTest:false,transparent:true}));frame.renderOrder=999;scene.add(frame);

function placeCamera(){const {az,el,dist,target}=orbit;camera.position.set(target.x+dist*Math.sin(az)*Math.cos(el),target.y+dist*Math.sin(el),target.z+dist*Math.cos(az)*Math.cos(el));camera.lookAt(target);}
// En pantallas angostas la cámara se aleja para que entren las mangas.
let userZoom=false;const fitDist=()=>3.4*Math.max(1,1/camera.aspect)**.85;
function resize(){const w=wrap.clientWidth,h=wrap.clientHeight;if(!w||!h)return;renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(!userZoom)orbit.dist=fitDist();draw();}
let pending=false;
function draw(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;placeCamera();updateFrame();renderer.setClearColor(state.background==='transparent'?0x000000:state.background,state.background==='transparent'?0:1);renderer.render(scene,camera);});}
new ResizeObserver(resize).observe(wrap);document.addEventListener('click',event=>{if(event.target.closest?.('.lz-mobile-switch'))requestAnimationFrame(resize);});

function setGarment(type){
 if(garment){scene.remove(garment.group);garment.group.traverse(o=>o.geometry?.dispose?.());}
 garment=buildGarment(type,state.color);state.garment=type;scene.add(garment.group);scene.updateMatrixWorld(true);
 // Al cambiar de prenda, los diseños vuelven a su zona (frente, espalda o manga) para no quedar flotando.
 for(const item of items)positionAt(item,item.zone||'front');
 for(const button of document.querySelectorAll('[data-garment]')){const on=button.dataset.garment===type;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));}
 rebuildAll();draw();
}

/* Diseños -------------------------------------------------------------- */
const raycaster=new THREE.Raycaster(),helper=new THREE.Object3D();
function targetMeshes(){return garment?[garment.meshes.body,garment.meshes.sleeveL,garment.meshes.sleeveR]:[];}
function hitGarment(from,to){from=from.clone();from.x+=1e-4;to=to.clone();to.x+=1e-4;raycaster.set(from,to.clone().sub(from).normalize());const hit=raycaster.intersectObjects(targetMeshes(),false)[0];return hit||null;}
function zoneFor(hit){if(hit.object.name!=='body')return hit.object.name;return hit.face.normal.z>=0||hit.point.z>=0?'front':'back';}
function applyHit(item,hit){const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);if(normal.dot(raycaster.ray.direction)>0)normal.negate();item.point=hit.point.clone();item.normal=normal;item.target=hit.object.name;item.zone=zoneFor(hit);}
function positionAt(item,where){const p=placements(garment.spec)[where]||placements(garment.spec).front;const hit=hitGarment(p.from,p.to);if(hit)applyHit(item,hit);item.zone=where;}
function sizeOf(item){const w=item.widthCm/UNIT_CM;return new THREE.Vector3(w,w/item.aspect,Math.max(.12,Math.min(.3,w*.8)));}
function orientation(item){helper.position.copy(item.point);helper.up.set(0,1,0);if(Math.abs(item.normal.y)>.95)helper.up.set(0,0,1);helper.lookAt(item.point.clone().add(item.normal));helper.rotateZ(THREE.MathUtils.degToRad(item.rotation));return helper.rotation.clone();}
function rebuild(item){
 if(item.mesh){decalGroup.remove(item.mesh);item.mesh.geometry.dispose();}
 const target=garment.meshes[item.target]||garment.meshes.body;
 const geometry=new DecalGeometry(target,item.point,orientation(item),sizeOf(item));
 item.material??=new THREE.MeshStandardMaterial({map:item.texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.86,metalness:0});
 item.mesh=new THREE.Mesh(geometry,item.material);item.mesh.renderOrder=10+item.order;item.mesh.userData.id=item.id;decalGroup.add(item.mesh);
}
function rebuildAll(){items.forEach((item,i)=>{item.order=i;rebuild(item);});renderList();}
function updateFrame(){
 const item=items.find(i=>i.id===selected);if(!item||!item.point){frame.visible=false;return;}
 // El marco solo se ve si el diseño está del lado que mira a la cámara.
 if(item.normal.dot(camera.position.clone().sub(item.point))<=0){frame.visible=false;return;}
 frame.visible=true;const s=sizeOf(item);helper.position.copy(item.point);helper.rotation.copy(orientation(item));helper.updateMatrixWorld(true);
 const hw=s.x/2,hh=s.y/2,lift=.006,c=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y])=>new THREE.Vector3(x,y,lift).applyMatrix4(helper.matrixWorld));
 frame.geometry.setFromPoints([c[0],c[1],c[1],c[2],c[2],c[3],c[3],c[0]]);
}
async function decode(file){const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height));if(scale===1)return bitmap;const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();return createImageBitmap(c);}
// Se usa un lienzo (no ImageBitmap) para que WebGL respete la orientación vertical de la imagen.
function textureFrom(image){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.needsUpdate=true;return t;}
function addItem(image,name,where){
 if(items.length>=MAX_ITEMS){status(`Máximo ${MAX_ITEMS} diseños por mockup.`,true);return null;}
 const item={id:nextId++,name,image,texture:textureFrom(image),aspect:image.width/image.height,widthCm:where.startsWith('sleeve')?8:where==='chestLeft'?9:26,rotation:0,order:items.length};
 positionAt(item,where);items.push(item);rebuild(item);select(item.id);record();return item;
}
async function addFiles(files){
 const list=[...files].filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type));if(!list.length){status('Usa archivos PNG, JPG o WebP.',true);return;}
 const order=['front','back','chestLeft','sleeveL','sleeveR'];let added=0;
 for(const file of list){try{const image=await decode(file);const where=order[(items.length)%order.length];if(addItem(image,file.name,items.length?where:'front'))added++;}catch{status('No se pudo abrir '+file.name,true);}}
 if(added){status(added===1?'Diseño agregado. Arrástralo sobre la prenda para moverlo.':`${added} diseños agregados. Selecciona cada uno para moverlo, escalarlo o rotarlo.`);showViewFor(items.find(i=>i.id===selected));}
 $('m3dFile').value='';draw();
}
function select(id){selected=id;renderList();syncControls();draw();}
function current(){return items.find(i=>i.id===selected)||null;}
function syncControls(){const item=current();$('m3dItemControls').hidden=!item;if(!item)return;$('m3dWidth').value=String(Math.round(item.widthCm*10)/10);$('m3dWidthOut').value=Math.round(item.widthCm*10)/10+' cm';$('m3dHeightOut').textContent=`Alto ${Math.round(item.widthCm/item.aspect*10)/10} cm`;$('m3dRotation').value=String(item.rotation);$('m3dRotationOut').value=item.rotation+'°';$('m3dSelectedName').textContent=item.name;}
const zoneNames={front:'Frente',back:'Espalda',chestLeft:'Pecho izquierdo',sleeveL:'Manga izquierda',sleeveR:'Manga derecha'};
function renderList(){
 const list=$('m3dList');list.replaceChildren();$('m3dCount').textContent=items.length?`${items.length} ${items.length===1?'diseño':'diseños'}`:'Sin diseños';
 for(const item of items){const b=document.createElement('button');b.type='button';b.className='m3d-item'+(item.id===selected?' active':'');b.setAttribute('aria-pressed',String(item.id===selected));
  const thumb=document.createElement('canvas');thumb.width=thumb.height=40;const tc=thumb.getContext('2d'),f=Math.min(40/item.image.width,40/item.image.height);tc.drawImage(item.image,(40-item.image.width*f)/2,(40-item.image.height*f)/2,item.image.width*f,item.image.height*f);
  const label=document.createElement('span');label.textContent=item.name;const small=document.createElement('small');small.textContent=`${zoneNames[item.zone]||'Prenda'} · ${Math.round(item.widthCm*10)/10} cm`;
  b.append(thumb,label,small);b.onclick=()=>{select(item.id);showViewFor(item);};list.append(b);}
}
function showViewFor(item){if(!item)return;const az={front:0,back:Math.PI,chestLeft:0,sleeveL:Math.PI/2.4,sleeveR:-Math.PI/2.4}[item.zone];if(az===undefined)return;animateTo(az);}

/* Vista y arrastre ---------------------------------------------------- */
let anim=null;
function animateTo(az,el=orbit.el){cancelAnimationFrame(anim);const from={az:orbit.az,el:orbit.el},to={az:normalizeTarget(az),el},start=performance.now(),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const step=t=>{const k=reduce?1:Math.min(1,(t-start)/320),e=1-(1-k)**3;orbit.az=from.az+(to.az-from.az)*e;orbit.el=from.el+(to.el-from.el)*e;draw();if(k<1)anim=requestAnimationFrame(step);};anim=requestAnimationFrame(step);
 for(const b of document.querySelectorAll('[data-view]')){const v={front:0,back:Math.PI,left:Math.PI/2,right:-Math.PI/2}[b.dataset.view];const on=Math.abs(normalizeAngle(az)-normalizeAngle(v))<.01;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}}
const normalizeAngle=a=>{a%=Math.PI*2;if(a>Math.PI)a-=Math.PI*2;if(a<-Math.PI)a+=Math.PI*2;return a;};
function normalizeTarget(az){let d=normalizeAngle(az-orbit.az);return orbit.az+d;}
// Solo cuentan los diseños del lado visible: los que quedan detrás de la tela no se pueden tomar.
function visibleDecalHit(){const cloth=raycaster.intersectObjects(targetMeshes(),false)[0],limit=cloth?cloth.distance+.02:Infinity;return raycaster.intersectObjects(items.map(i=>i.mesh).filter(Boolean),false).filter(h=>h.distance<=limit).sort((a,b)=>b.object.renderOrder-a.object.renderOrder||a.distance-b.distance)[0]||null;}
function ndc(event){const r=canvas.getBoundingClientRect();return new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-((event.clientY-r.top)/r.height)*2+1);}
let drag=null;const pointers=new Map();
canvas.addEventListener('pointerdown',event=>{
 if(event.button!==0&&event.pointerType==='mouse')return;canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(pointers.size===2){drag={type:'pinch',dist:pinchDistance(),start:orbit.dist};return;}
 raycaster.setFromCamera(ndc(event),camera);
 const hitDecal=visibleDecalHit();
 const panMode=$('m3dPan').getAttribute('aria-pressed')==='true';
 if(hitDecal&&!panMode){select(hitDecal.object.userData.id);drag={type:'move',item:current(),moved:false};canvas.classList.add('dragging');return;}
 drag={type:'orbit',x:event.clientX,y:event.clientY,az:orbit.az,el:orbit.el};canvas.classList.add('orbiting');
});
canvas.addEventListener('pointermove',event=>{
 if(pointers.has(event.pointerId))pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(!drag){raycaster.setFromCamera(ndc(event),camera);const over=visibleDecalHit()&&$('m3dPan').getAttribute('aria-pressed')!=='true';canvas.style.cursor=over?'move':'grab';return;}
 if(drag.type==='pinch'&&pointers.size===2){userZoom=true;orbit.dist=Math.max(1.6,Math.min(9,drag.start*drag.dist/pinchDistance()));draw();return;}
 if(drag.type==='orbit'){orbit.az=drag.az-(event.clientX-drag.x)*.008;orbit.el=Math.max(-.5,Math.min(.6,drag.el+(event.clientY-drag.y)*.005));draw();return;}
 if(drag.type==='move'){raycaster.setFromCamera(ndc(event),camera);const hit=raycaster.intersectObjects(targetMeshes(),false)[0];if(!hit)return;applyHit(drag.item,hit);rebuild(drag.item);drag.moved=true;draw();}
});
function endDrag(event){pointers.delete(event.pointerId);if(drag?.type==='move'&&drag.moved){renderList();record();}if(pointers.size<2)drag=null;canvas.classList.remove('dragging','orbiting');}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
function pinchDistance(){const [a,b]=[...pointers.values()];return Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));}
canvas.addEventListener('wheel',event=>{event.preventDefault();userZoom=true;orbit.dist=Math.max(1.6,Math.min(9,orbit.dist*(event.deltaY>0?1.08:1/1.08)));draw();},{passive:false});
canvas.addEventListener('keydown',event=>{const item=current();
 if(event.key==='Delete'||event.key==='Backspace'){if(item){event.preventDefault();removeItem(item);}return;}
 if(!item||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
 // Mover con flechas: se proyecta un punto desplazado sobre la tela.
 const step=(event.shiftKey?2:.5)/UNIT_CM,right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),item.normal).normalize(),up=new THREE.Vector3(0,1,0);
 const offset={ArrowLeft:right.clone().multiplyScalar(-step),ArrowRight:right.clone().multiplyScalar(step),ArrowUp:up.clone().multiplyScalar(step),ArrowDown:up.clone().multiplyScalar(-step)}[event.key];
 const goal=item.point.clone().add(offset),from=goal.clone().addScaledVector(item.normal,1);const hit=hitGarment(from,goal.clone().addScaledVector(item.normal,-.2));if(hit){applyHit(item,hit);rebuild(item);renderList();draw();clearTimeout(keyTimer);keyTimer=setTimeout(record,350);}
});
let keyTimer=null;

/* Controles ------------------------------------------------------------- */
function status(text,error=false){$('m3dStatus').textContent=text;$('m3dStatus').classList.toggle('error',error);}
function removeItem(item){decalGroup.remove(item.mesh);item.mesh.geometry.dispose();item.material?.dispose();item.texture.dispose();items=items.filter(i=>i!==item);selected=items.at(-1)?.id||null;rebuildAll();syncControls();draw();record();status('Diseño eliminado.');}
$('m3dFile').addEventListener('change',()=>addFiles($('m3dFile').files));
$('m3dWidth').addEventListener('input',()=>{const item=current();if(!item)return;item.widthCm=Number($('m3dWidth').value);rebuild(item);syncControls();renderList();draw();});
$('m3dRotation').addEventListener('input',()=>{const item=current();if(!item)return;item.rotation=Number($('m3dRotation').value);rebuild(item);syncControls();draw();});
for(const id of ['m3dWidth','m3dRotation'])$(id).addEventListener('change',()=>record());
for(const b of document.querySelectorAll('[data-place]'))b.addEventListener('click',()=>{const item=current();if(!item)return;if(b.dataset.place.startsWith('sleeve')&&item.widthCm>12)item.widthCm=9;positionAt(item,b.dataset.place);rebuild(item);syncControls();renderList();showViewFor(item);draw();record();});
$('m3dDuplicate').onclick=()=>{const item=current();if(!item)return;const copy=addItem(item.image,item.name+' copia',item.zone||'front');if(copy){copy.widthCm=item.widthCm;copy.rotation=item.rotation;rebuild(copy);syncControls();renderList();draw();}};
$('m3dDelete').onclick=()=>{const item=current();if(item)removeItem(item);};
$('m3dForward').onclick=()=>{const item=current();if(!item)return;const i=items.indexOf(item);if(i<items.length-1){items.splice(i,1);items.splice(i+1,0,item);rebuildAll();draw();record();}};
$('m3dBackward').onclick=()=>{const item=current();if(!item)return;const i=items.indexOf(item);if(i>0){items.splice(i,1);items.splice(i-1,0,item);rebuildAll();draw();record();}};
for(const b of document.querySelectorAll('[data-garment]'))b.addEventListener('click',()=>{setGarment(b.dataset.garment);record();});
function setColor(value){state.color=value;$('m3dColor').value=value;garment?.material.color.set(value);draw();}
$('m3dColor').addEventListener('input',()=>setColor($('m3dColor').value));$('m3dColor').addEventListener('change',()=>record());
for(const b of document.querySelectorAll('[data-color]'))b.addEventListener('click',()=>{setColor(b.dataset.color);record();});
$('m3dBackground').addEventListener('change',()=>{state.background=$('m3dBackground').value;wrap.classList.toggle('checker',state.background==='transparent');draw();});
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>animateTo({front:0,back:Math.PI,left:Math.PI/2,right:-Math.PI/2}[b.dataset.view]));
$('m3dPan').addEventListener('click',()=>{const on=$('m3dPan').getAttribute('aria-pressed')!=='true';$('m3dPan').setAttribute('aria-pressed',String(on));status(on?'Girar vista activado: arrastrar gira la prenda aunque toques un diseño.':'Arrastra un diseño para moverlo; arrastra fuera de él para girar.');});
$('m3dZoomIn').onclick=()=>{userZoom=true;orbit.dist=Math.max(1.6,orbit.dist/1.15);draw();};$('m3dZoomOut').onclick=()=>{userZoom=true;orbit.dist=Math.min(6,orbit.dist*1.15);draw();};$('m3dFit').onclick=()=>{userZoom=false;orbit.dist=fitDist();orbit.el=.06;draw();};

/* Exportar ---------------------------------------------------------------- */
function renderAt(az,size,dist=orbit.dist){const keep={az:orbit.az,el:orbit.el,dist:orbit.dist,w:renderer.domElement.width,h:renderer.domElement.height,pr:renderer.getPixelRatio(),aspect:camera.aspect},sel=frame.visible;
 frame.visible=false;renderer.setPixelRatio(1);renderer.setSize(size,size,false);camera.aspect=1;camera.updateProjectionMatrix();orbit.az=az;orbit.dist=dist;placeCamera();renderer.setClearColor(state.background==='transparent'?0x000000:state.background,state.background==='transparent'?0:1);renderer.render(scene,camera);
 const out=document.createElement('canvas');out.width=out.height=size;out.getContext('2d').drawImage(renderer.domElement,0,0);
 orbit.az=keep.az;orbit.el=keep.el;orbit.dist=keep.dist;renderer.setPixelRatio(keep.pr);camera.aspect=keep.aspect;camera.updateProjectionMatrix();frame.visible=sel;resize();return out;}
async function exportPng(){
 const mode=$('m3dExport').value,size=1600;let out;
 if(mode==='both'){const f=renderAt(0,size,3.6),b=renderAt(Math.PI,size,3.6);out=document.createElement('canvas');out.width=size*2;out.height=size;const c=out.getContext('2d');c.drawImage(f,0,0);c.drawImage(b,size,0);}
 else if(mode==='four'){const views=[0,Math.PI/2,Math.PI,-Math.PI/2].map(az=>renderAt(az,size,3.6));out=document.createElement('canvas');out.width=size*4;out.height=size;views.forEach((v,i)=>out.getContext('2d').drawImage(v,i*size,0));}
 else out=renderAt(orbit.az,size);
 const blob=await new Promise(r=>out.toBlob(r,'image/png'));if(!blob){status('No se pudo preparar la imagen.',true);return;}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`LZ_mockup3d_${state.garment}_${mode}_${state.color.slice(1)}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 status(`Mockup 3D descargado · ${out.width} × ${out.height} px.`);
}
$('m3dDownload').onclick=exportPng;

/* Historial ------------------------------------------------------------- */
let history=[],cursor=-1,restoring=false;
function snapshot(){return {garment:state.garment,color:state.color,items:items.map(i=>({id:i.id,widthCm:i.widthCm,rotation:i.rotation,zone:i.zone,target:i.target,point:i.point?.toArray(),normal:i.normal?.toArray()}))};}
function record(){if(restoring)return;const snap=snapshot(),k=JSON.stringify(snap);if(cursor>=0&&JSON.stringify(history[cursor])===k)return;history=history.slice(0,cursor+1);history.push(snap);if(history.length>50)history.shift();cursor=history.length-1;updateHistory();}
function updateHistory(){$('m3dUndo').disabled=cursor<=0;$('m3dRedo').disabled=cursor>=history.length-1;}
function restore(delta){const next=cursor+delta;if(next<0||next>=history.length)return;restoring=true;cursor=next;const snap=history[next];
 // Solo se restauran diseños que siguen cargados; los eliminados no vuelven a aparecer.
 const byId=new Map(items.map(i=>[i.id,i]));if(snap.garment!==state.garment)setGarment(snap.garment);setColor(snap.color);
 const kept=[];for(const s of snap.items){const item=byId.get(s.id);if(!item)continue;Object.assign(item,{widthCm:s.widthCm,rotation:s.rotation,zone:s.zone,target:s.target,point:new THREE.Vector3().fromArray(s.point),normal:new THREE.Vector3().fromArray(s.normal)});kept.push(item);}
 for(const item of items)if(!kept.includes(item)){decalGroup.remove(item.mesh);}items=kept;if(!items.some(i=>i.id===selected))selected=items[0]?.id||null;rebuildAll();syncControls();draw();restoring=false;updateHistory();status(delta<0?'Cambio deshecho.':'Cambio rehecho.');}
$('m3dUndo').onclick=()=>restore(-1);$('m3dRedo').onclick=()=>restore(1);
document.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;const k=event.key.toLowerCase();if(k==='z'){event.preventDefault();restore(event.shiftKey?1:-1);}else if(k==='y'){event.preventDefault();restore(1);}});

/* Inicio ----------------------------------------------------------------- */
try{setGarment('tee');setColor(state.color);resize();record();$('m3dLoading').hidden=true;status('Prenda lista. Agrega uno o varios diseños para comenzar.');}
catch(error){$('m3dLoading').textContent='Tu navegador no pudo iniciar la vista 3D (WebGL).';status('No se pudo iniciar la vista 3D. Prueba con Chrome, Edge o Safari actualizados.',true);}

registerStudioModule({id:'mockups3d',printMeasure:false,
 getDraft:()=>items.length?{images:Object.fromEntries(items.map(i=>[String(i.id),i.image])),data:{...snapshot(),names:Object.fromEntries(items.map(i=>[i.id,i.name]))}}:null,
 restoreDraft:async d=>{for(const item of [...items])removeItem(item);setGarment(d.data.garment||'tee');setColor(d.data.color||state.color);
  for(const s of d.data.items){const blob=d.images[String(s.id)];if(!blob)continue;const image=await createImageBitmap(blob);const item=addItem(image,d.data.names?.[s.id]||'Diseño recuperado',s.zone||'front');if(!item)continue;Object.assign(item,{widthCm:s.widthCm,rotation:s.rotation,zone:s.zone,target:s.target});if(s.point){item.point=new THREE.Vector3().fromArray(s.point);item.normal=new THREE.Vector3().fromArray(s.normal);}rebuild(item);}
  renderList();syncControls();draw();}});
