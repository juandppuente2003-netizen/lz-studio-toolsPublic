import {rectify,removeColor,edgeColor} from './extract-engine.js';
let base=null;
self.onmessage=({data:m})=>{
  try{
    if(m.seed)base={data:new Uint8ClampedArray(m.seed.buffer),width:m.seed.width,height:m.seed.height,reduced:m.seed.reduced};
    if(m.type==='rectify')base=rectify(new Uint8ClampedArray(m.buffer),m.width,m.height,m.points,m.ratio);
    if(!base)throw Error('Primero selecciona y extrae el diseño.');
    const color=m.autoColor?edgeColor(base.data,base.width,base.height):m.options.color;
    const result=removeColor(base.data,base.width,base.height,{...m.options,color});
    const reply={id:m.id,width:base.width,height:base.height,color,reduced:base.reduced,buffer:result.buffer};
    const transfers=[result.buffer];
    if(m.type==='rectify'){const raw=base.data.slice();reply.raw=raw.buffer;transfers.push(raw.buffer);}
    self.postMessage(reply,transfers);
  }catch(error){self.postMessage({id:m.id,error:error.message||'No se pudo extraer el diseño.'});}
};
