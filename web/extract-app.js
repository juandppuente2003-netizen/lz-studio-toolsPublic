import {canvasArtifact,requireTransferImage} from './transfer-export.js';
import {decodeImageFile,validateImportSize} from './upscale-import.js';
import {setupViewport} from './viewport.js';
import {registerStudioModule} from './studio-shell.js';
import {pngDensity} from './png.js';
import {alphaBounds,validateQuad} from './extract-engine.js';
const $=id=>document.getElementById(id),selection=$('selectionCanvas'),result=$('resultCanvas');
const selectionBox=$('selectionBox'),resultBox=$('resultBox');
let source=null,sourcePixels=null,points=[],raw=null,pixels=null,fileName='diseno',worker=null,revision=0,busy=false,loading=false,exporting=false,tool='corners',drag=null,zoom=1,selectionZoom=1,undo=[],painted=false,sourceScaled=false,manualFabric=false;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function status(message,error=false){$('extractStatus').textContent=message;$('extractStatus').classList.toggle('error',error);}
function sync(){
  const blocked=busy||loading||exporting;
  $('extractFile').disabled=blocked;$('cropControls').disabled=!source||blocked;$('backgroundControls').disabled=!source||blocked;$('autoFabric').disabled=!raw||blocked;$('brushControls').disabled=!pixels||blocked;$('exportControls').disabled=!pixels||blocked;
  $('downloadExtract').disabled=!pixels||blocked;$('undoBrush').disabled=!undo.length||blocked;$('restoreAll').disabled=!pixels||blocked;
  for(const id of ['selectAll','resetSelection','pickSource'])$(id).disabled=!source||blocked;
  $('cancelExtraction').hidden=!busy;$('extractButton').textContent=busy?'Procesando…':'Extraer diseño';
  for(const id of ['tolerance','softness','minArea','brushSize'])$(id+'Out').value=$(id).value;
  $('manualRatio').hidden=$('ratio').value!=='custom';
  for(const [id,value] of [['pickSource','pick'],['eraseBrush','erase'],['restoreBrush','restore']]){$(id).classList.toggle('active-tool',tool===value);$(id).setAttribute('aria-pressed',String(tool===value));}
  $('brushMessage').textContent=painted?'Cambiar el color o la tolerancia reinicia los retoques con pincel.':'El pincel recupera píxeles de la foto; no inventa detalles.';
}
function resetPoints(all=false){if(!source)return;const w=source.width-1,h=source.height-1,left=all?0:w*.22,top=all?0:h*.17,right=all?w:w*.78,bottom=all?h:h*.80;points=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];tool='corners';drawSelection();sync();}
function scaleCanvas(canvas,box,natural=false){if(canvas.hidden)return;const fit=Math.max(.04,Math.min((box.clientWidth-24)/canvas.width,(box.clientHeight-24)/canvas.height));const scale=fit*(natural?zoom:selectionZoom);canvas.style.width=canvas.width*scale+'px';canvas.style.height=canvas.height*scale+'px';}
function layout(){scaleCanvas(selection,selectionBox);scaleCanvas(result,resultBox,true);$('extractZoomLabel').textContent=zoom===1?'Ajustar':Math.round(zoom*100)+' %';}
function drawSelection(){
  if(!source)return;const s=Math.min(1,1400/Math.max(source.width,source.height));selection.width=Math.round(source.width*s);selection.height=Math.round(source.height*s);
  const ctx=selection.getContext('2d');ctx.drawImage(source,0,0,selection.width,selection.height);const sx=selection.width/source.width,sy=selection.height/source.height;
  ctx.fillStyle='#0008';ctx.beginPath();ctx.rect(0,0,selection.width,selection.height);ctx.moveTo(points[0].x*sx,points[0].y*sy);for(let i=3;i>=0;i--)ctx.lineTo(points[i].x*sx,points[i].y*sy);ctx.closePath();ctx.fill('evenodd');
  const displayScale=Math.max(.08,Math.min((selectionBox.clientWidth-24)/selection.width,(selectionBox.clientHeight-24)/selection.height)),r=12/displayScale;
  ctx.strokeStyle='#b8ff3d';ctx.lineWidth=2/displayScale;ctx.beginPath();points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*sx,p.y*sy);else ctx.moveTo(p.x*sx,p.y*sy);});ctx.closePath();ctx.stroke();
  points.forEach((p,i)=>{ctx.fillStyle='#b8ff3d';ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#10130c';ctx.font=`bold ${13/displayScale}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p.x*sx,p.y*sy);});
  selection.hidden=false;$('selectionEmpty').hidden=true;layout();
}
function drawResult(){if(globalThis.Event)document.dispatchEvent?.(new Event('lz-work-changed'));if(!pixels)return;result.width=pixels.width;result.height=pixels.height;result.getContext('2d').putImageData(pixels,0,0);result.hidden=false;$('resultEmpty').hidden=true;layout();updateMeta();}
function updateMeta(){
  if(!pixels)return;const trim=$('trimOutput').checked,bounds=trim?alphaBounds(pixels.data,pixels.width,pixels.height):{width:pixels.width,height:pixels.height};
  if(!bounds){$('resultInfo').textContent='El resultado está vacío. Baja la tolerancia o recupera el diseño con el pincel.';return;}
  const dpi=Number($('extractDpi').value);$('resultInfo').textContent=`${bounds.width.toLocaleString()} × ${bounds.height.toLocaleString()} px · ${(bounds.width/dpi*2.54).toFixed(2)} × ${(bounds.height/dpi*2.54).toFixed(2)} cm a ${dpi} ppp`;
}
async function upload(file,preserveSettings=false){
  if(!file||busy||loading||exporting)return;loading=true;sync();let image;
  try{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>150*1024*1024)throw Error('Carga PNG, JPG o WebP de hasta 150 MB.');
    status('Cargando foto…');image=await decodeImageFile(file);
    validateImportSize(image.width,image.height);
    if(Math.min(image.width,image.height)<24)throw Error('La imagen es demasiado pequeña para extraer un diseño.');
    source=document.createElement('canvas');const scale=Math.min(1,6000/Math.max(image.width,image.height),Math.sqrt(20e6/(image.width*image.height)));sourceScaled=scale<1;source.width=Math.round(image.width*scale);source.height=Math.round(image.height*scale);source.getContext('2d').drawImage(image,0,0,source.width,source.height);sourcePixels=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height);
    fileName=file.name||'diseno';$('extractName').textContent=fileName;$('sourceInfo').textContent=`${image.width.toLocaleString()} × ${image.height.toLocaleString()} px${sourceScaled?' · copia de trabajo reducida a '+source.width+' × '+source.height+' px':''}`;
    worker?.terminate();worker=null;revision++;raw=null;pixels=null;undo=[];painted=false;manualFabric=false;if(!preserveSettings){$('removeMode').value='none';$('fabricColor').value='#000000';}zoom=1;selectionZoom=1;result.hidden=true;$('resultEmpty').hidden=false;$('resultInfo').textContent='Sin extracción';resetPoints();
    status('Ajusta las cuatro esquinas alrededor del estampado y pulsa Extraer diseño.');
  }catch(error){status(error.message||'No se pudo abrir la foto.',true);}finally{image?.close?.();loading=false;$('extractFile').value='';sync();}
}
function options(){const hex=$('fabricColor').value;return {color:[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),tolerance:Number($('tolerance').value),softness:Number($('softness').value),mode:$('removeMode').value,minArea:Number($('minArea').value)};}
function setColor(color){$('fabricColor').value='#'+color.map(v=>v.toString(16).padStart(2,'0')).join('');}
function ratio(){const value=$('ratio').value;if(value!=='custom')return Number(value);const w=Number($('ratioWidth').value),h=Number($('ratioHeight').value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w/h<.1||w/h>10)throw Error('Indica una proporción entre 1:10 y 10:1.');return w/h;}
function markStale(){if(raw)status('La selección cambió. Pulsa Extraer diseño para actualizar el resultado.');}
function run(type='rectify',autoColor=false){
  if(busy||loading||exporting||!source)return;
  try{
    let message={type,id:++revision,options:options(),autoColor};
    if(type==='rectify'){validateQuad(points,source.width,source.height);message={...message,points,width:source.width,height:source.height,ratio:ratio()};}
    if(!worker){if(type!=='rectify'&&raw)message.seed={buffer:raw.data.slice().buffer,width:raw.width,height:raw.height,reduced:false};worker=new Worker('extract-worker.js',{type:'module'});worker.onmessage=receive;worker.onerror=()=>{worker?.terminate();worker=null;busy=false;status('No se pudo procesar la foto. Vuelve a pulsar Extraer diseño.',true);sync();};}
    busy=true;tool='corners';status(type==='rectify'?'Extrayendo el área seleccionada…':'Actualizando transparencia…');sync();
    if(type==='rectify'){const copy=sourcePixels.data.slice();message.buffer=copy.buffer;worker.postMessage(message,[copy.buffer]);}else worker.postMessage(message);
  }catch(error){busy=false;status(error.message,true);sync();}
}
function receive({data:m}){
  if(m.id!==revision)return;busy=false;
  if(m.error){status(m.error,true);sync();return;}
  if(m.raw)raw=new ImageData(new Uint8ClampedArray(m.raw),m.width,m.height);
  pixels=new ImageData(new Uint8ClampedArray(m.buffer),m.width,m.height);undo=[];painted=false;setColor(m.color);drawResult();sync();
  const bounds=alphaBounds(pixels.data,pixels.width,pixels.height);
  status(bounds?`Diseño extraído. Revisa los detalles sobre fondo claro y oscuro.${m.reduced?' La salida se redujo al límite de 8 MP / 4,096 px.':''}`:'El color elegido eliminó toda la imagen. Baja la tolerancia o cambia el modo a Conservar fondo.',!bounds);
}
function canvasPoint(event,canvas){const rect=canvas.getBoundingClientRect();return {x:clamp((event.clientX-rect.left)/rect.width*canvas.width,0,canvas.width-1),y:clamp((event.clientY-rect.top)/rect.height*canvas.height,0,canvas.height-1)};}
selection.addEventListener('pointerdown',event=>{
  if(!source||busy||loading||exporting||event.button!==0)return;const p=canvasPoint(event,selection),sx=source.width/selection.width,sy=source.height/selection.height,sp={x:p.x*sx,y:p.y*sy};
  if(tool==='pick'){const x=Math.floor(sp.x),y=Math.floor(sp.y),colors=[[],[],[]];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const o=(clamp(y+dy,0,source.height-1)*source.width+clamp(x+dx,0,source.width-1))*4;for(let c=0;c<3;c++)colors[c].push(sourcePixels.data[o+c]);}setColor(colors.map(a=>a.sort((a,b)=>a-b)[12]));manualFabric=true;$('removeMode').value=$('removeMode').value==='none'?'edges':$('removeMode').value;tool='corners';sync();if(raw)run('adjust');else status('Color de la prenda elegido. Ajusta las esquinas y extrae el diseño.');return;}
  const r=selection.getBoundingClientRect();let closest=-1,best=35;points.forEach((point,i)=>{const d=Math.hypot((point.x-sp.x)/source.width*r.width,(point.y-sp.y)/source.height*r.height);if(d<best){best=d;closest=i;}});
  if(closest<0)return;drag={kind:'corner',index:closest};selection.setPointerCapture(event.pointerId);event.preventDefault();
});
selection.addEventListener('pointermove',event=>{if(!drag||drag.kind!=='corner')return;const p=canvasPoint(event,selection);points[drag.index]={x:p.x/selection.width*source.width,y:p.y/selection.height*source.height};points[drag.index].x=clamp(points[drag.index].x,0,source.width-1);points[drag.index].y=clamp(points[drag.index].y,0,source.height-1);drawSelection();markStale();});
function saveUndo(){undo.push(pixels.data.slice());if(undo.length>3)undo.shift();}
function stroke(a,b){
  const radius=Number($('brushSize').value)/2,steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/Math.max(1,radius/2))),width=pixels.width,height=pixels.height;
  for(let i=0;i<=steps;i++){const x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps;
    for(let py=Math.max(0,Math.floor(y-radius));py<=Math.min(height-1,Math.ceil(y+radius));py++)for(let px=Math.max(0,Math.floor(x-radius));px<=Math.min(width-1,Math.ceil(x+radius));px++){
      if(Math.hypot(px-x,py-y)>radius)continue;const o=(py*width+px)*4;if(tool==='erase')pixels.data[o+3]=0;else for(let c=0;c<4;c++)pixels.data[o+c]=raw.data[o+c];
    }
  }
  painted=true;result.getContext('2d').putImageData(pixels,0,0);
}
result.addEventListener('pointerdown',event=>{if(!pixels||busy||loading||exporting||!['erase','restore'].includes(tool)||event.button!==0)return;saveUndo();const p=canvasPoint(event,result);drag={kind:'brush',last:p};result.setPointerCapture(event.pointerId);stroke(p,p);event.preventDefault();});
result.addEventListener('pointermove',event=>{if(drag?.kind!=='brush')return;const p=canvasPoint(event,result);stroke(drag.last,p);drag.last=p;});
function endDrag(){if(drag?.kind==='brush'){updateMeta();sync();}drag=null;}
for(const canvas of [selection,result]){canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);}
function selectTool(value){tool=tool===value?'corners':value;result.style.cursor=['erase','restore'].includes(tool)?'crosshair':'default';sync();if(tool==='pick')status('Haz clic en una zona de la prenda, fuera del estampado, en la foto original.');}
$('extractFile').onchange=()=>upload($('extractFile').files[0]);
$('extractButton').onclick=()=>run('rectify');
$('selectAll').onclick=()=>{resetPoints(true);markStale();};$('resetSelection').onclick=()=>{resetPoints();markStale();};
$('pickSource').onclick=()=>selectTool('pick');$('autoFabric').onclick=()=>{manualFabric=false;run('adjust',true);};
$('eraseBrush').onclick=()=>selectTool('erase');$('restoreBrush').onclick=()=>selectTool('restore');
$('undoBrush').onclick=()=>{if(!undo.length||busy)return;pixels.data.set(undo.pop());drawResult();sync();};
$('restoreAll').onclick=()=>run('adjust');
$('cancelExtraction').onclick=()=>{worker?.terminate();worker=null;revision++;busy=false;status('Proceso cancelado. Puedes ajustar la selección y volver a extraer.');sync();};
for(const id of ['removeMode','fabricColor','tolerance','softness','minArea'])$(id).addEventListener('change',()=>{if(id==='fabricColor')manualFabric=true;sync();if(raw)run('adjust');});
for(const id of ['tolerance','softness','minArea','brushSize'])$(id).addEventListener('input',sync);
$('ratio').onchange=()=>{sync();markStale();};for(const id of ['ratioWidth','ratioHeight'])$(id).onchange=markStale;
for(const id of ['extractDpi','trimOutput'])$(id).onchange=updateMeta;
$('resultBackground').onchange=()=>resultBox.dataset.background=$('resultBackground').value;
$('extractZoomOut').onclick=()=>{zoom=Math.max(.5,zoom/1.4);layout();};$('extractZoomIn').onclick=()=>{zoom=Math.min(8,zoom*1.4);layout();};$('extractFit').onclick=()=>{zoom=1;selectionZoom=1;layout();};
$('downloadExtract').onclick=async()=>{
  if(!pixels||busy||loading||exporting)return;exporting=true;sync();
  try{
    const bounds=$('trimOutput').checked?alphaBounds(pixels.data,pixels.width,pixels.height):{x:0,y:0,width:pixels.width,height:pixels.height};if(!bounds)throw Error('No hay píxeles visibles para descargar. Baja la tolerancia o recupera el diseño.');
    status('Preparando PNG…');const canvas=document.createElement('canvas');canvas.width=bounds.width;canvas.height=bounds.height;canvas.getContext('2d').drawImage(result,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('No se pudo crear el PNG.');const final=new Blob([pngDensity(new Uint8Array(await blob.arrayBuffer()),Number($('extractDpi').value))],{type:'image/png'}),url=URL.createObjectURL(final),a=document.createElement('a');a.href=url;a.download=fileName.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_')+'_extraido.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);status('PNG descargado. El fondo de vista previa no se incluye en el archivo.');
  }catch(error){status(error.message,true);}finally{exporting=false;sync();}
};
function menu(open){$('moduleMenu').hidden=!open;$('menuBackdrop').hidden=!open;$('menuButton').setAttribute('aria-expanded',String(open));if(open)$('menuClose').focus();else $('menuButton').focus();}
$('menuButton').onclick=()=>menu($('moduleMenu').hidden);$('menuClose').onclick=()=>menu(false);$('menuBackdrop').onclick=()=>menu(false);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('moduleMenu').hidden)menu(false);});
for(const box of [selectionBox,$('photoUpload')]){box.addEventListener('dragover',e=>e.preventDefault());box.addEventListener('drop',e=>{e.preventDefault();upload(e.dataTransfer.files[0]);});}
document.addEventListener('paste',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();upload(item.getAsFile());}});
window.addEventListener('resize',()=>{if(source)drawSelection();else layout();});
document.addEventListener('click',event=>{if(event.target.closest('.lz-mobile-switch'))requestAnimationFrame(()=>{if(source)drawSelection();else layout();});});
const oldZoomControls=$('extractZoomIn').closest('.zoom-controls, .lab-toolbar-actions');if(oldZoomControls)oldZoomControls.hidden=true;const selectionControls=document.createElement('div');selectionControls.className='zoom-controls';selectionBox.previousElementSibling.append(selectionControls);const resultControls=document.createElement('div');resultControls.className='zoom-controls';resultBox.previousElementSibling.append(resultControls);
setupViewport({wrap:selectionBox,controls:selectionControls,editable:true,isPicking:()=>tool==='pick',onZoom:factor=>{selectionZoom=clamp(selectionZoom*factor,.1,8);layout();},onFit:()=>{selectionZoom=1;layout();},zoomButtons:true});setupViewport({wrap:resultBox,controls:resultControls,editable:true,onZoom:factor=>{zoom=clamp(zoom*factor,.1,8);layout();},onFit:()=>{zoom=1;layout();},zoomButtons:true});registerStudioModule({id:'extract',getExportInfo:()=>{requireTransferImage(pixels,busy||loading||exporting);const b=$('trimOutput').checked?alphaBounds(pixels.data,pixels.width,pixels.height):pixels;if(!b)throw Error('No hay píxeles visibles para descargar.');return {widthCm:b.width/Number($('extractDpi').value)*2.54,dpi:Number($('extractDpi').value),aspect:b.width/b.height};},exportCurrent:async()=>{requireTransferImage(pixels,busy||loading||exporting);const b=$('trimOutput').checked?alphaBounds(pixels.data,pixels.width,pixels.height):{x:0,y:0,width:pixels.width,height:pixels.height};if(!b)throw Error('No hay píxeles visibles.');const c=document.createElement('canvas');c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(result,b.x,b.y,b.width,b.height,0,0,b.width,b.height);return canvasArtifact(c,fileName.replace(/\.[^.]+$/,'')+'_extraido.png',Number($('extractDpi').value));},getComparison:()=>{if(!raw||result.hidden)return null;const before=document.createElement('canvas');before.width=raw.width;before.height=raw.height;before.getContext('2d').putImageData(raw,0,0);return [before,result];},getDraft:()=>source?{images:{source,raw,pixels},data:{fileName,points,painted,manualFabric}}:null,restoreDraft:async d=>{await upload(new File([d.images.source],d.data.fileName,{type:'image/png'}),true);points=d.data.points;painted=d.data.painted;manualFabric=d.data.manualFabric;for(const key of ['raw','pixels'])if(d.images[key]){const bitmap=await createImageBitmap(d.images[key]),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);const image=c.getContext('2d').getImageData(0,0,c.width,c.height);if(key==='raw')raw=image;else pixels=image;bitmap.close();}drawSelection();drawResult();sync();},afterRestore:()=>{drawSelection();drawResult();sync();}});sync();
