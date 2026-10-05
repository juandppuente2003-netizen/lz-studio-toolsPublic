import {canvasArtifact,processedArtifact,requireTransferImage} from './transfer-export.js';
import {registerStudioModule} from './studio-shell.js';
import {createOnnxSuperResolution} from './ai-engine.js';
import {enhanceImage,upscaleWorkingSize} from './upscale-runner.js';
import {decodeImageFile,validateImportSize} from './upscale-import.js';
import {pngDensity} from './png.js';
const $=id=>document.getElementById(id),canvas=$('upscaleCanvas'),wrap=document.querySelector('.lab-canvas-wrap');
let source=null,workingSource=null,result=null,filename='imagen',running=false,loading=false,originalView=true,fit=true,zoom=1,controller=null,loadRevision=0;
const engines={webgpu:null,wasm:null};
function status(message,error=false){for(const id of ['upscaleStatus','upscaleImportStatus']){$(id).textContent=message;$(id).classList.toggle('error',error)}}
function controls(){ $('runUpscale').disabled=!workingSource||running||loading;$('prepareUpscale').disabled=!source||running||loading;$('cancelUpscale').hidden=!running;$('upscaleFile').disabled=running||loading;$('downloadUpscale').disabled=!result||running||loading;$('upscaleOriginal').disabled=!source||running||loading;$('upscaleResult').disabled=!result||running||loading;document.querySelector('label[for="upscaleFile"]').classList.toggle('upload-disabled',running||loading) }
function layout(){if(canvas.hidden)return;const scale=Math.max(.03,Math.min(5,fit?Math.min((wrap.clientWidth-20)/canvas.width,(wrap.clientHeight-20)/canvas.height):zoom));canvas.style.width=canvas.width*scale+'px';canvas.style.height=canvas.height*scale+'px';$('upscaleZoomLabel').textContent=fit?'Ajustar':Math.round(scale*100)+' %';if(fit)zoom=scale}
function show(){if(globalThis.Event)document.dispatchEvent?.(new Event('lz-work-changed'));const image=originalView?source:result||source;if(!image)return;const scale=Math.min(1,1400/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);canvas.hidden=false;$('upscaleEmpty').hidden=true;for(const [id,on] of [['upscaleOriginal',originalView],['upscaleResult',!originalView]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on))}layout()}
async function upload(file){
  if(!file||running||loading)return;
  const id=++loadRevision;let bitmap;
  loading=true;controls();status('Cargando imagen…');
  try{
    bitmap=await decodeImageFile(file);validateImportSize(bitmap.width,bitmap.height);
    if(id!==loadRevision){bitmap.close?.();return}
    const size=upscaleWorkingSize(bitmap.width,bitmap.height),needsCopy=size.width!==bitmap.width||size.height!==bitmap.height;
    // A rejected or undecodable file never replaces the previous original.
    source?.close?.();source=bitmap;workingSource=needsCopy?null:source;result=null;filename=file.name;originalView=true;fit=true;
    $('upscaleName').textContent=file.name;$('upscaleSourceSize').textContent=`${source.width.toLocaleString()} × ${source.height.toLocaleString()} px · original`;
    $('upscaleOutputSize').textContent=needsCopy?'Prepara una copia para IA':`${(source.width*2).toLocaleString()} × ${(source.height*2).toLocaleString()} px`;
    $('upscalePreparation').hidden=!needsCopy;$('prepareUpscale').hidden=!needsCopy;
    $('upscalePreparationText').textContent=needsCopy?`Original cargado. Para procesar esta imagen grande en el dispositivo, puedes preparar una copia de ${size.width.toLocaleString()} × ${size.height.toLocaleString()} px. La IA duplicará esa copia, no el original. Tu archivo original no se modifica.`:'';
    $('upscaleProgress').hidden=true;$('upscaleProgress').value=0;show();
    status(needsCopy?'Imagen cargada. Prepara la copia para IA para continuar.':'Imagen lista. Pulsa Mejorar imagen ×2 para comenzar.');return true;
  }catch(error){if(bitmap!==source)bitmap?.close?.();status(error.message||'No se pudo abrir la imagen.',true)}
  finally{loading=false;controls();$('upscaleFile').value=''}
}
$('prepareUpscale').onclick=()=>{
  if(!source||running||loading)return;
  try{
    const size=upscaleWorkingSize(source.width,source.height),copy=document.createElement('canvas');copy.width=size.width;copy.height=size.height;
    copy.getContext('2d').drawImage(source,0,0,copy.width,copy.height);workingSource=copy;
    $('upscaleOutputSize').textContent=`${(copy.width*2).toLocaleString()} × ${(copy.height*2).toLocaleString()} px · de la copia`;
    $('prepareUpscale').hidden=true;controls();status('Copia preparada. Pulsa Mejorar imagen ×2. El original sigue intacto.');
  }catch{status('No se pudo preparar la copia. Prueba una imagen más pequeña.',true)}
};
$('upscaleFile').onchange=()=>upload($('upscaleFile').files[0]);
async function engine(backend){if(engines[backend])return engines[backend];status(backend==='webgpu'?'Preparando IA en GPU…':'Preparando IA en CPU…');engines[backend]=await createOnnxSuperResolution(backend,(value,phase)=>{status(phase==='optimizing'?'Preparando el modelo de IA…':phase==='ready'?'Motor de IA listo.':`Cargando IA · ${Math.round(value)} %`)});return engines[backend]}
$('runUpscale').onclick=async()=>{if(!workingSource||running||loading)return;running=true;controller=new AbortController();controls();$('upscaleProgress').hidden=false;$('upscaleProgress').value=0;let backend='wasm';
  const progress=({percent,done,total,remaining})=>{ $('upscaleProgress').value=percent;status(`Mejorando · ${Math.round(percent)} % · bloque ${done}/${total}${remaining>1000?` · ~${Math.ceil(remaining/1000)} s restantes`:''}`) };
  try{
    if(navigator.gpu)try{if(await navigator.gpu.requestAdapter({powerPreference:'high-performance'}))backend='webgpu'}catch{}
    let improved;try{improved=await enhanceImage(workingSource,await engine(backend),{onProgress:progress,signal:controller.signal})}
    catch(error){if(backend!=='webgpu'||controller.signal.aborted)throw error;try{await engines.webgpu?.dispose?.()}catch{}engines.webgpu=null;status('La GPU no fue compatible. Reintentando en CPU…');improved=await enhanceImage(workingSource,await engine('wasm'),{onProgress:progress,signal:controller.signal})}
    if(controller.signal.aborted)throw new DOMException('Mejora cancelada.','AbortError');
    result=improved;originalView=false;$('upscaleProgress').value=100;show();status(`Mejora lista${workingSource!==source?' · desde la copia para IA':''} · ${result.width.toLocaleString()} × ${result.height.toLocaleString()} px. Compara y descarga.`);
  }catch(error){status(error.name==='AbortError'?'Mejora cancelada. Tu original sigue intacto.':'No se pudo terminar la mejora. Tu original sigue intacto. '+String(error.message||'').slice(0,150),error.name!=='AbortError')}
  finally{running=false;controller=null;controls()}
};
$('cancelUpscale').onclick=()=>{controller?.abort();status('Cancelando al terminar el bloque actual…')};
$('upscaleOriginal').onclick=()=>{originalView=true;show()};$('upscaleResult').onclick=()=>{originalView=false;show()};
$('upscaleZoomIn').onclick=()=>{fit=false;zoom=Math.min(5,zoom*1.25);layout()};$('upscaleZoomOut').onclick=()=>{fit=false;zoom=Math.max(.03,zoom/1.25);layout()};$('upscaleFit').onclick=()=>{fit=true;wrap.scrollTo(0,0);layout()};
wrap.addEventListener('wheel',event=>{if(!source)return;event.preventDefault();fit=false;zoom=Math.max(.03,Math.min(5,zoom*(event.deltaY<0?1.14:1/1.14)));layout()},{passive:false});new ResizeObserver(()=>{if(fit)layout()}).observe(wrap);
$('downloadUpscale').onclick=async()=>{if(!result||running)return;try{const blob=await new Promise(resolve=>result.toBlob(resolve,'image/png'));if(!blob)throw Error('No se pudo preparar el PNG.');const density=pngDensity(new Uint8Array(await blob.arrayBuffer()),Number($('upscaleDpi').value)),url=URL.createObjectURL(new Blob([density],{type:'image/png'})),a=document.createElement('a');a.href=url;a.download=filename.replace(/\.[^.]+$/,'').replace(/[^a-z0-9áéíóúñ _-]/gi,'').slice(0,80)+'_LZ_mejorada_x2.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('PNG mejorado ×2 descargado; transparencia conservada.')}catch(error){status(error.message,true)}};
function menu(open){$('moduleMenu').hidden=!open;$('menuBackdrop').hidden=!open;$('menuButton').setAttribute('aria-expanded',String(open))}$('menuButton').onclick=()=>menu($('moduleMenu').hidden);$('menuClose').onclick=()=>menu(false);$('menuBackdrop').onclick=()=>menu(false);document.addEventListener('keydown',event=>{if(event.key==='Escape')menu(false)});
window.addEventListener('pagehide',()=>controller?.abort());controls();
registerStudioModule({id:'upscale',onFit:()=>{fit=true;layout();},getComparison:()=>[source,result],getDraft:()=>source?{images:{source,result},data:{filename}}:null,restoreDraft:async d=>{await upload(new File([d.images.source],d.data.filename,{type:'image/png'}));if(d.images.result){const bitmap=await createImageBitmap(d.images.result);result=document.createElement('canvas');result.width=bitmap.width;result.height=bitmap.height;result.getContext('2d').drawImage(bitmap,0,0);bitmap.close();originalView=false;show();controls();}},onZoom:factor=>{if(!source)return;fit=false;zoom=Math.max(.03,Math.min(5,zoom*factor));layout();},exportCurrent:async()=>{requireTransferImage(result,running||loading);return canvasArtifact(result,filename.replace(/\.[^.]+$/,'')+'_LZ_mejorada_x2.png',Number($('upscaleDpi').value))},importCurrent:async(blob,name)=>upload(new File([blob],name,{type:blob.type}))});
