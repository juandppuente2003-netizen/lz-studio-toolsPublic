import {registerStudioModule} from './studio-shell.js';
import {decodeImageFile,validateImportSize} from './upscale-import.js';
import {canvasArtifact,requireTransferImage} from './transfer-export.js';
const $=id=>document.getElementById(id),tool=document.body.dataset.preflightTool,canvas=$('effectCanvas'),wrap=document.querySelector('.lab-canvas-wrap');
const MAX_PIXELS=16_000_000;
let source=null,result=null,resultDimensions=null,preview=null,overlay=null,markers=[],filename='diseno',busy=false,loading=false,worker=null,job=0,loadJob=0,fit=true,zoom=1,originalView=true,mode='manual',delta=0,selection=0;
function status(text,error=false){$('effectStatus').textContent=text;$('effectStatus').classList.toggle('error',error)}
function options(){return {minimumMm:Number($('auditMinimum')?.value||.5),mode,delta,alphaMethod:$('alphaMethod')?.value||'screen',sizeMm:Number($('effectSize')?.value||1),threshold:Number($('alphaThreshold')?.value||50)}}
function dimensions(){
  const widthCm=Number($('effectWidth').value),dpi=Number($('effectDpi').value);
  if(!Number.isFinite(widthCm)||widthCm<.5||widthCm>100||!Number.isFinite(dpi)||dpi<1||dpi>9600)throw Error('Revisa el ancho y la resolución de impresión.');
  const width=Math.max(1,Math.round(widthCm/2.54*dpi)),height=source?Math.max(1,Math.round(width*source.height/source.width)):0;
  if(width*height>MAX_PIXELS||Math.max(width,height)>8192)throw Error('Para analizar a resolución real, usa hasta 16 MP y 8192 px por lado. Reduce la medida o los ppp.');
  return {width,height,dpi,widthCm};
}
function controls(){
  for(const id of ['effectFile','effectWidth','effectDpi','advancedControls'])$(id).disabled=busy||loading;
  $('runPreflight').disabled=$('autoPreflight').disabled=!source||busy||loading;
  $('downloadEffect').disabled=!result||busy||loading;$('resetPreflight').disabled=!source||busy||loading;
  $('effectOriginal').disabled=!source;$('effectResult').disabled=!result;
  for(const id of ['dotGrow','dotShrink'])if($(id))$(id).disabled=!source||busy||loading||!selection;
  if($('dotDelta'))$('dotDelta').textContent=delta===0?(mode==='auto'?'Automático':'Sin ajuste'):`${mode==='auto'?'Auto ':''}${delta>0?'+':''}${delta} px`;
  try{const d=dimensions();$('effectHeight').value=source?(d.widthCm*source.height/source.width).toFixed(2):'';$('effectPixels').textContent=source?`${d.width.toLocaleString()} × ${d.height.toLocaleString()} px · ${d.dpi} ppp`:''}catch(error){$('effectPixels').textContent=error.message;$('runPreflight').disabled=$('autoPreflight').disabled=true}
}
function smallPreview(image){const c=document.createElement('canvas'),scale=Math.min(1,1100/Math.max(image.width,image.height));c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c}
function imageCanvas(buffer,width,height){const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buffer),width,height),0,0);return c}
function layout(){if(canvas.hidden)return;const scale=Math.max(.001,fit?Math.min((wrap.clientWidth-20)/canvas.width,(wrap.clientHeight-20)/canvas.height):zoom);canvas.style.width=canvas.width*scale+'px';canvas.style.height=canvas.height*scale+'px';if(fit)zoom=scale;$('effectZoomLabel').textContent=fit?'Ajustar':Math.round(scale*100)+' %'}
function show(){if(globalThis.Event)document.dispatchEvent?.(new Event('lz-work-changed'));
  if(!source)return;const shown=originalView?(overlay?.original&&preview?preview:smallPreview(source)):preview||smallPreview(result||source);canvas.width=shown.width;canvas.height=shown.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(shown,0,0);canvas.hidden=false;$('effectEmpty').hidden=true;layout();
  // Marks refer to the most recent scan, which selects the matching image.
  const marked=overlay&&$('showPreflightIssues').checked&&originalView===overlay.original;
  if(marked){ctx.drawImage(overlay.canvas,0,0,canvas.width,canvas.height);const unit=canvas.width/(parseFloat(canvas.style.width)||canvas.width);ctx.strokeStyle='#ff324a';ctx.lineWidth=1.5*unit;for(const dot of markers){ctx.beginPath();ctx.arc(dot.x*canvas.width,dot.y*canvas.height,6*unit,0,Math.PI*2);ctx.stroke()}}
  $('preflightLegend').hidden=!marked;$('effectOriginal').classList.toggle('active',originalView);$('effectResult').classList.toggle('active',!originalView);
  $('effectOriginal').setAttribute('aria-pressed',String(originalView));$('effectResult').setAttribute('aria-pressed',String(!originalView));
}
function highlight(mask,width,height,original){
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d'),image=ctx.createImageData(width,height);markers=[];
  const seen=new Uint8Array(mask.length),queue=[];
  for(let p=0;p<mask.length;p++)if(mask[p])image.data.set([255,50,74,190],p*4);
  for(let p=0;p<mask.length;p++){
    if(!mask[p]||seen[p])continue;seen[p]=1;queue.length=0;queue.push(p);let x0=p%width,x1=x0,y0=(p/width)|0,y1=y0;
    for(let i=0;i<queue.length;i++){const q=queue[i],x=q%width,y=(q/width)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const n of [x?q-1:-1,x<width-1?q+1:-1,y?q-width:-1,y<height-1?q+width:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;queue.push(n)}}
    if(x1-x0<12&&y1-y0<12&&markers.length<250)markers.push({x:(x0+x1+1)/2/width,y:(y0+y1+1)/2/height});
  }
  ctx.putImageData(image,0,0);overlay={canvas:c,original};
}
function clearResult(){job++;worker?.terminate();worker=null;busy=false;result=null;resultDimensions=null;preview=null;overlay=null;markers=[];mode='manual';delta=0;selection=0;originalView=true;$('effectBusy').hidden=true;$('preflightProgress').hidden=true;$('preflightSummary').textContent='Pulsa Analizar o Corregir automáticamente.';controls();show()}
async function upload(file){
  if(!file||busy||loading)return false;const id=++loadJob;loading=true;controls();let image;
  try{status('Cargando imagen…');image=await decodeImageFile(file);validateImportSize(image.width,image.height);if(id!==loadJob){image.close?.();return false}
    source?.close?.();source=image;filename=file.name;$('effectName').textContent=filename;$('effectSourceSize').textContent=`${image.width.toLocaleString()} × ${image.height.toLocaleString()} px`;fit=true;clearResult();status('Imagen lista. Indica la medida de impresión y pulsa Corregir automáticamente.');return true;
  }catch(error){if(image!==source)image?.close?.();status(error.message||'No se pudo cargar la imagen.',true);return false}
  finally{loading=false;controls();$('effectFile').value=''}
}
async function run(action='analyze'){
  if(!source||busy||loading)return;let d,o;try{d=dimensions();o=options();if(tool==='thickness'&&(!Number.isFinite(o.minimumMm)||o.minimumMm<.1||o.minimumMm>2))throw Error('El mínimo debe estar entre 0.1 y 2 mm.')}catch(error){status(error.message,true);return}
  busy=true;controls();overlay=null;markers=[];$('effectBusy').hidden=false;$('preflightProgress').hidden=false;status(action==='analyze'?'Analizando archivo…':'Corrigiendo archivo…');const id=++job;
  await new Promise(requestAnimationFrame);
  try{
    const input=action==='analyze'&&result?result:source,stage=document.createElement('canvas');stage.width=d.width;stage.height=d.height;stage.getContext('2d').drawImage(input,0,0,d.width,d.height);const pixels=stage.getContext('2d',{willReadFrequently:true}).getImageData(0,0,d.width,d.height);stage.width=stage.height=1;
    worker=new Worker('preflight-worker.js',{type:'module'});const current=worker;
    current.onmessage=({data})=>{
      if(id!==job)return;if(data.phase){status(data.phase);return}current.terminate();worker=null;busy=false;$('effectBusy').hidden=true;$('preflightProgress').hidden=true;
      if(data.error){status(data.error,true);controls();return}
      if(data.full){result=imageCanvas(data.full,data.width,data.height);resultDimensions={...d};originalView=false;selection=data.changes?.selected||0}else{originalView=!result;selection=tool==='thickness'?Math.max(selection,data.metrics.count):0}
      preview=imageCanvas(data.pixels,data.previewWidth,data.previewHeight);highlight(new Uint8Array(data.mask),data.previewWidth,data.previewHeight,originalView);
      const metrics=data.metrics,issue=tool==='thickness'?metrics.count:metrics.semi;
      $('preflightSummary').textContent=tool==='thickness'?`${metrics.count.toLocaleString()} puntos pequeños en riesgo · mínimo ${o.minimumMm} mm ≈ ${metrics.minimumPx.toFixed(2)} px`:`${metrics.semi.toLocaleString()} píxeles con semitransparencia${metrics.visible?` · ${(metrics.semi/metrics.visible*100).toFixed(2)} % de los visibles`:''}`;
      let text=action==='correct'?'Corrección lista. ':'Análisis terminado. ';text+=issue?'Revisa las marcas rojas.':'Sin problemas detectados con este mínimo.';
      if(data.changes?.removed)text+=` ${data.changes.removed} puntos desaparecieron al reducirlos.`;
      if(data.changes?.clipped)text+=' Hay puntos junto al borde: su crecimiento se recorta al límite del archivo.';
      status(text);controls();show();if(window.matchMedia?.('(max-width:700px)')?.matches)document.querySelector('.lz-mobile-switch [data-pane="view"]')?.click();
    };
    current.onerror=()=>{if(id!==job)return;current.terminate();worker=null;busy=false;$('effectBusy').hidden=$('preflightProgress').hidden=true;status('No se pudo procesar. Prueba de nuevo o reduce la resolución.',true);controls()};
    current.postMessage({buffer:pixels.data.buffer,width:d.width,height:d.height,pixelsPerCm:d.width/d.widthCm,tool,action,options:o},[pixels.data.buffer]);
  }catch(error){if(id===job){busy=false;$('effectBusy').hidden=$('preflightProgress').hidden=true;status(error.message,true);controls()}}
}
async function artifact(){if(!result)throw Error('Pulsa Corregir automáticamente antes de enviar o descargar el resultado.');requireTransferImage(result,busy||loading);return canvasArtifact(result,filename.replace(/\.[^.]+$/,'')+`_LZ_${tool==='thickness'?'grosor':'alfa'}.png`,resultDimensions.dpi,resultDimensions.widthCm)}
$('effectFile').onchange=()=>upload($('effectFile').files[0]);$('runPreflight').onclick=()=>run('analyze');$('autoPreflight').onclick=()=>{mode='auto';delta=0;run('correct')};
if(tool==='thickness')for(const [id,step] of [['dotGrow',1],['dotShrink',-1]])$(id).onclick=()=>{if(busy)return;delta=Math.max(-12,Math.min(12,delta+step));run('correct')};
$('resetPreflight').onclick=()=>{clearResult();status('Restaurado el original. Ningún cambio aplicado.')};
for(const id of ['effectWidth','effectDpi','auditMinimum','alphaMethod','effectSize','alphaThreshold'])if($(id))$(id).addEventListener('change',()=>{clearResult();status('Medida o método cambiado. Vuelve a analizar o corregir.')});
$('showPreflightIssues').onchange=show;$('effectOriginal').onclick=()=>{originalView=true;show()};$('effectResult').onclick=()=>{originalView=false;show()};
for(const [id,factor] of [['effectZoomIn',1.25],['effectZoomOut',.8]])$(id).onclick=()=>{fit=false;zoom=Math.max(.01,Math.min(8,zoom*factor));show()};$('effectFit').onclick=()=>{fit=true;wrap.scrollTo(0,0);show()};
wrap.addEventListener('wheel',event=>{if(!source)return;event.preventDefault();fit=false;zoom=Math.max(.01,Math.min(8,zoom*(event.deltaY<0?1.14:1/1.14)));show()},{passive:false});new ResizeObserver(()=>{if(fit)show()}).observe(wrap);
$('effectBackground').onchange=()=>{wrap.style.backgroundColor=$('effectBackground').value||'';wrap.classList.toggle('checker',$('effectBackground').value==='')};
$('downloadEffect').onclick=async()=>{try{const data=await artifact(),url=URL.createObjectURL(data.blob),a=document.createElement('a');a.href=url;a.download=data.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('PNG preparado a resolución completa, sin marcas rojas.')}catch(error){status(error.message,true)}};
function menu(open){$('moduleMenu').hidden=!open;$('menuBackdrop').hidden=!open;$('menuButton').setAttribute('aria-expanded',String(open))}$('menuButton').onclick=()=>menu($('moduleMenu').hidden);$('menuClose').onclick=()=>menu(false);$('menuBackdrop').onclick=()=>menu(false);document.addEventListener('keydown',event=>{if(event.key==='Escape')menu(false)});
window.addEventListener('pagehide',()=>worker?.terminate());controls();
registerStudioModule({id:tool==='thickness'?'thickness':'opacity',onFit:()=>{fit=true;layout();},getComparison:()=>[source,result],getDraft:()=>source?{images:{source,result},data:{filename,mode,delta,resultDimensions}}:null,restoreDraft:async d=>{await upload(new File([d.images.source],d.data.filename,{type:'image/png'}));if(d.images.result){result=await createImageBitmap(d.images.result);resultDimensions=d.data.resultDimensions;mode=d.data.mode;delta=d.data.delta;preview=smallPreview(result);originalView=false;}},afterRestore:()=>{controls();show();},onZoom:factor=>{if(!source)return;fit=false;zoom=Math.max(.01,Math.min(8,zoom*factor));show();},exportCurrent:artifact,importCurrent:async(blob,name)=>upload(new File([blob],name,{type:blob.type}))});
