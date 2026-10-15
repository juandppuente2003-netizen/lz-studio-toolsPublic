import {findSmallDots,adjustSmallDots} from './dot-audit-engine.js';
import {auditDtfPixels,auditPreview} from './dtf-audit-engine.js';
import {processDesignEffect} from './effects-engine.js';
self.onmessage=({data:m})=>{
  try{
    self.postMessage({phase:m.action==='analyze'?'Analizando archivo…':'Aplicando corrección automática…'});
    let pixels=new Uint8ClampedArray(m.buffer),changes=null;
    if(m.action==='correct'){
      if(m.tool==='thickness'){changes=adjustSmallDots(pixels,m.width,m.height,{...m.options,pixelsPerCm:m.pixelsPerCm});pixels=changes.data}
      else processDesignEffect(pixels,m.width,m.height,{effectTool:'opacity',alphaMethod:m.options.alphaMethod,effectSizeMm:m.options.sizeMm,alphaThreshold:m.options.threshold},m.pixelsPerCm);
    }
    self.postMessage({phase:m.tool==='thickness'?'Localizando puntos pequeños…':'Revisando semitransparencias…'});
    const report=m.tool==='thickness'?findSmallDots(pixels,m.width,m.height,{...m.options,pixelsPerCm:m.pixelsPerCm}):auditDtfPixels(pixels,m.width,m.height,{pixelsPerCm:m.pixelsPerCm,transparency:true,thickness:false});
    const preview=auditPreview(pixels,report.mask,m.width,m.height);
    const metrics=m.tool==='thickness'?{count:report.count,smallPixels:report.smallPixels,minimumPx:report.minimumPx}:{semi:report.semi,visible:report.visible};
    const response={metrics,changes:changes?{changed:changes.changed,removed:changes.removed,clipped:changes.clipped,selected:changes.selected}:null,width:m.width,height:m.height,previewWidth:preview.width,previewHeight:preview.height,pixels:preview.pixels.buffer,mask:preview.mask.buffer,full:m.action==='correct'?pixels.buffer:null};
    const buffers=[response.pixels,response.mask];if(response.full)buffers.push(response.full);self.postMessage(response,buffers);
  }catch(error){self.postMessage({error:error.message||'No se pudo procesar el archivo.'})}
};
