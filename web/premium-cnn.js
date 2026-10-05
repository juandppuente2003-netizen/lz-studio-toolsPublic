import {enhanceImage} from './upscale-runner.js';
// Same visible-content bounds, alpha threshold and 16px margin as Semitonos.
// Run the existing CNN only over this area; restore the original canvas size.
export function premiumContentBounds(canvas){
 const {width,height}=canvas,data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 if(right<left)return {x:0,y:0,w:width,h:height};
 const x=Math.max(0,left-16),y=Math.max(0,top-16);
 return {x,y,w:Math.min(width,right+17)-x,h:Math.min(height,bottom+17)-y};
}
export async function enhancePremiumCnn(source,engine,{onProgress,signal}={}){
 signal?.throwIfAborted();const bounds=premiumContentBounds(source),input=document.createElement('canvas');input.width=bounds.w;input.height=bounds.h;let improved;
 try{
  const ctx=input.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,input.width,input.height);ctx.drawImage(source,bounds.x,bounds.y,bounds.w,bounds.h,0,0,bounds.w,bounds.h);
  improved=await enhanceImage(input,engine,{onProgress,signal});signal?.throwIfAborted();
  const out=document.createElement('canvas');out.width=source.width*2;out.height=source.height*2;const output=out.getContext('2d');output.drawImage(improved,bounds.x*2,bounds.y*2);output.globalCompositeOperation='destination-in';output.drawImage(source,0,0,out.width,out.height);output.globalCompositeOperation='source-over';return out;
 }finally{input.width=input.height=1;if(improved)improved.width=improved.height=1;}
}
