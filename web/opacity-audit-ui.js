const MAX_AUDIT_PIXELS=16_000_000;
export function createOpacityAudit({getSource,getParams,getDimensions,selectTarget,redraw}){
  const $=id=>document.getElementById(id);
  let worker=null,job=0,scanning=false,overlay=null,preview=null,markers=[],reportTarget=null;
  const message=(text,error=false)=>{$('opacityAuditStatus').textContent=text;$('opacityAuditStatus').classList.toggle('error',error)};
  function refresh(){$('runOpacityAudit').disabled=!getSource()||scanning;$('showOpacityIssues').disabled=!overlay}
  function invalidate(){job++;worker?.terminate();worker=null;scanning=false;overlay=null;preview=null;markers=[];reportTarget=null;$('opacityAuditProgress').hidden=true;$('opacityAuditLegend').hidden=true;message(getSource()?'Archivo o ajustes actualizados. Pulsa Analizar archivo.':'Carga una imagen para analizarla.');refresh()}
  function highlight(mask,w,h){
    const scale=Math.min(1,1100/Math.max(w,h)),ow=Math.max(1,Math.round(w*scale)),oh=Math.max(1,Math.round(h*scale)),flags=new Uint8Array(ow*oh);
    for(let y=0;y<h;y++){const oy=Math.min(oh-1,Math.floor(y*oh/h));for(let x=0;x<w;x++)if(mask[y*w+x])flags[oy*ow+Math.min(ow-1,Math.floor(x*ow/w))]=1}
    overlay=document.createElement('canvas');overlay.width=ow;overlay.height=oh;
    const ctx=overlay.getContext('2d'),pixels=ctx.createImageData(ow,oh);
    for(let p=0;p<flags.length;p++)if(flags[p])pixels.data.set([255,50,74,195],p*4);
    ctx.putImageData(pixels,0,0);markers=[];
    // Add screen-sized rings around tiny groups so even a one-pixel issue is
    // visible while zoomed out. These marks are never part of an exported PNG.
    const seen=new Uint8Array(flags.length),queue=[];
    for(let p=0;p<flags.length;p++){
      if(!flags[p]||seen[p])continue;seen[p]=1;queue.length=0;queue.push(p);let x0=p%ow,x1=x0,y0=(p/ow)|0,y1=y0;
      for(let k=0;k<queue.length;k++){
        const q=queue[k],x=q%ow,y=(q/ow)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
        for(const n of [x?q-1:-1,x<ow-1?q+1:-1,y?q-ow:-1,y<oh-1?q+ow:-1])if(n>=0&&flags[n]&&!seen[n]){seen[n]=1;queue.push(n)}
      }
      if(x1-x0<12&&y1-y0<12&&markers.length<200)markers.push({x:(x0+x1+1)/2/ow,y:(y0+y1+1)/2/oh});
    }
  }
  async function analyze(){
    if(!getSource()||scanning)return;
    const options={transparency:$('auditTransparency').checked,thickness:$('auditThickness').checked,minimumMm:Number($('auditMinimum').value)};
    if(!options.transparency&&!options.thickness){message('Selecciona Semitransparencias, Auditor de grosor o ambas opciones.',true);return}
    const id=++job,target=$('opacityAuditTarget').value;scanning=true;overlay=null;preview=null;markers=[];reportTarget=null;refresh();redraw();
    $('opacityAuditProgress').hidden=false;$('opacityAuditProgress').removeAttribute('value');message('Analizando archivo…');
    await new Promise(requestAnimationFrame);
    try{
      const source=getSource(),params=getParams(),d=getDimensions(params);
      if(d.width*d.height>MAX_AUDIT_PIXELS)throw Error('Para analizar a resolución final, reduce la medida o los PPP a 16 MP como máximo. La descarga admite tamaños mayores.');
      if(id!==job)return;
      const stage=document.createElement('canvas');stage.width=d.width;stage.height=d.height;
      const ctx=stage.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,d.width,d.height);
      const pixels=ctx.getImageData(0,0,d.width,d.height);stage.width=stage.height=1;
      worker=new Worker('opacity-audit-worker.js',{type:'module'});const current=worker;
      current.onmessage=({data})=>{
        if(id!==job)return;
        if(data.phase){message(data.phase);return}
        current.terminate();worker=null;scanning=false;$('opacityAuditProgress').hidden=true;
        if(data.error){message(data.error,true);refresh();return}
        preview=document.createElement('canvas');preview.width=data.previewWidth;preview.height=data.previewHeight;
        preview.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),data.previewWidth,data.previewHeight),0,0);
        highlight(new Uint8Array(data.mask),data.previewWidth,data.previewHeight);reportTarget=target;
        const {semi,thin,visible,minimumPx}=data.metrics,parts=[];
        if(options.transparency)parts.push(`Semitransparencias: ${semi.toLocaleString()} píxeles${visible?` (${(semi/visible*100).toFixed(2)} % de los visibles)`:''}`);
        if(options.thickness)parts.push(`Grosor: ${thin.toLocaleString()} píxeles en detalles de riesgo · mínimo ${options.minimumMm} mm ≈ ${minimumPx.toFixed(2)} px`);
        message(`Análisis terminado · ${target==='original'?'Original':'Resultado'} · ${data.width.toLocaleString()} × ${data.height.toLocaleString()} px. ${parts.join('. ')}. ${semi||thin?'Revisa las marcas rojas.':'Sin riesgos detectados con estos ajustes.'}`);
        $('opacityAuditLegend').textContent=`Rojo: problemas en ${target==='original'?'el original':'el resultado'}. Las marcas no se descargan.`;
        $('showOpacityIssues').checked=true;refresh();selectTarget(target);
      };
      current.onerror=()=>{if(id!==job)return;current.terminate();worker=null;scanning=false;$('opacityAuditProgress').hidden=true;message('No se pudo completar el análisis. Prueba de nuevo o reduce la resolución.',true);refresh()};
      current.postMessage({buffer:pixels.data.buffer,width:d.width,height:d.height,pixelsPerCm:d.width/params.widthCm,params,target,options},[pixels.data.buffer]);
    }catch(error){if(id===job){scanning=false;worker?.terminate();worker=null;$('opacityAuditProgress').hidden=true;message(error.message||'No se pudo analizar.',true);refresh()}}
  }
  function draw(ctx,canvas,target){
    const active=overlay&&target===reportTarget&&$('showOpacityIssues').checked;$('opacityAuditLegend').hidden=!active;
    if(!active)return;ctx.save();ctx.drawImage(overlay,0,0,canvas.width,canvas.height);
    const unit=canvas.width/(parseFloat(canvas.style.width)||canvas.width);ctx.strokeStyle='#ff324a';ctx.lineWidth=1.5*unit;
    for(const p of markers){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,6*unit,0,Math.PI*2);ctx.stroke()}
    ctx.restore();
  }
  $('runOpacityAudit').onclick=analyze;$('showOpacityIssues').onchange=redraw;
  for(const id of ['auditTransparency','auditThickness','opacityAuditTarget'])$(id).onchange=()=>{invalidate();redraw()};
  window.addEventListener('pagehide',()=>worker?.terminate());invalidate();
  return {invalidate,refresh,draw,previewFor:target=>reportTarget===target?preview:null};
}
