import {CNN_TILE_SIZE} from './ai-engine.js';
export const UPSCALE_MAX_PIXELS=1_500_000,UPSCALE_MAX_SIDE=1400;
export function upscaleWorkingSize(width,height){
  const scale=Math.min(1,UPSCALE_MAX_SIDE/Math.max(width,height),Math.sqrt(UPSCALE_MAX_PIXELS/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export function validateUpscaleSize(width,height){if(width*height>UPSCALE_MAX_PIXELS||Math.max(width,height)>UPSCALE_MAX_SIDE)throw Error('Usa una imagen de hasta 1.5 MP y 1,400 px por lado para esta versión del mejorador.');}
export function upscaleTiles(width,height){const pad=10,core=CNN_TILE_SIZE-pad*2,tiles=[];for(let y=0;y<height;y+=core)for(let x=0;x<width;x+=core)tiles.push({x,y,w:Math.min(core,width-x),h:Math.min(core,height-y),pad});return tiles}
const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
export async function enhanceImage(source,engine,{onProgress,signal}={}){
  validateUpscaleSize(source.width,source.height);
  const out=make(source.width*2,source.height*2),ctx=out.getContext('2d'),tiles=upscaleTiles(source.width,source.height),started=performance.now();
  for(let index=0;index<tiles.length;index++){
    if(signal?.aborted)throw new DOMException('Mejora cancelada.','AbortError');
    const part=tiles[index],sx=part.x-part.pad,sy=part.y-part.pad,left=Math.max(0,sx),top=Math.max(0,sy),right=Math.min(source.width,sx+CNN_TILE_SIZE),bottom=Math.min(source.height,sy+CNN_TILE_SIZE),tile=make(CNN_TILE_SIZE,CNN_TILE_SIZE),tc=tile.getContext('2d');
    tc.fillStyle='#ffffff';tc.fillRect(0,0,tile.width,tile.height);tc.drawImage(source,left,top,right-left,bottom-top,left-sx,top-sy,right-left,bottom-top);
    let raw=await engine(tile);if(Array.isArray(raw))raw=raw[0];
    if(!raw||raw.width!==CNN_TILE_SIZE*2||raw.height!==CNN_TILE_SIZE*2||raw.data.length!==raw.width*raw.height*(raw.channels||3))throw Error('El motor de IA devolvió un bloque incompleto.');
    const improved=make(raw.width,raw.height),ic=improved.getContext('2d'),pixels=ic.createImageData(raw.width,raw.height),channels=raw.channels||3;
    for(let i=0,j=0;i<pixels.data.length;i+=4,j+=channels){pixels.data[i]=raw.data[j];pixels.data[i+1]=raw.data[j+1];pixels.data[i+2]=raw.data[j+2];pixels.data[i+3]=255}
    ic.putImageData(pixels,0,0);ctx.drawImage(improved,part.pad*2,part.pad*2,part.w*2,part.h*2,part.x*2,part.y*2,part.w*2,part.h*2);raw.dispose?.();
    const done=index+1;onProgress?.({done,total:tiles.length,percent:done/tiles.length*100,remaining:(performance.now()-started)/done*(tiles.length-done)});
    await new Promise(requestAnimationFrame);
  }
  // Use the original alpha mask. Do not add a white background to the PNG.
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(source,0,0,out.width,out.height);ctx.globalCompositeOperation='source-over';
  return out;
}
