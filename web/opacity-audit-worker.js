import {processDesignEffect} from './effects-engine.js';
import {auditDtfPixels,auditPreview} from './dtf-audit-engine.js';
self.onmessage=({data:m})=>{
  try{
    const data=new Uint8ClampedArray(m.buffer);
    if(m.target==='result'){
      self.postMessage({phase:'Preparando el resultado a resolución final…'});
      processDesignEffect(data,m.width,m.height,m.params,m.pixelsPerCm);
    }
    const report=auditDtfPixels(data,m.width,m.height,{...m.options,pixelsPerCm:m.pixelsPerCm,onPhase:phase=>self.postMessage({phase})});
    const {mask,...metrics}=report,preview=auditPreview(data,mask,m.width,m.height);
    self.postMessage({metrics,mask:preview.mask.buffer,pixels:preview.pixels.buffer,previewWidth:preview.width,previewHeight:preview.height,width:m.width,height:m.height},[preview.mask.buffer,preview.pixels.buffer]);
  }catch(error){self.postMessage({error:error.message||'No se pudo analizar el archivo.'})}
};
