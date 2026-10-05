import {COLOR_DEFAULTS,COLOR_STYLES,processColorAdjustments} from './color-engine.js';
import {processPixels} from './processor.js';
export const PREMIUM_SETTINGS=Object.freeze({lpi:25,halftoneRange:30,minimumMm:.5});
export function applyPremiumVivid(data,width,height,widthCm){return processColorAdjustments(data,width,height,{widthCm,colorAspect:width/height,colorAdjustments:{...COLOR_DEFAULTS,...COLOR_STYLES.vivid}},width/widthCm);}
export function premiumParams(color,widthCm,dpi){
 if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('Elige el color que quieres eliminar.');
 return {widthCm,dpi,removeOn:false,removeColor:color,removeTolerance:12,softness:10,cleanupOn:false,cleanupSize:.3,recolorOn:false,fromColor:'#ffffff',toColor:'#20b66a',recolorTolerance:15,keepShading:false,halftoneOn:true,halftoneMode:'color',halftoneColor:color,halftoneRange:30,shape:'circle',lpi:25,angle:45,coverage:100,dualHalftone:false,lpi2:25,angle2:105};
}
export function validatePremiumZone(zone){
 if(zone===null)return null;
 if(!zone||!['x','y','width','height'].every(k=>Number.isFinite(zone[k]))||zone.x<0||zone.y<0||zone.width<=0||zone.height<=0||zone.x+zone.width>1.000001||zone.y+zone.height>1.000001)throw Error('Selecciona una zona válida en la imagen.');
 return {...zone};
}
// Normalized selection survives a change of print size. Global offsets keep
// the same physical screen across bands and across selection boundaries.
export function premiumHalftone(data,width,rows,y,fullHeight,params,zone=null){
 validatePremiumZone(zone);if(!zone)return processPixels(data,width,rows,params,width/params.widthCm,0,y);
 const original=data.slice();processPixels(data,width,rows,params,width/params.widthCm,0,y);
 const x0=Math.floor(zone.x*width),x1=Math.ceil((zone.x+zone.width)*width),y0=Math.floor(zone.y*fullHeight),y1=Math.ceil((zone.y+zone.height)*fullHeight);
 for(let row=0;row<rows;row++)for(let x=0;x<width;x++)if(x<x0||x>=x1||y+row<y0||y+row>=y1){const i=(row*width+x)*4;data.set(original.subarray(i,i+4),i);}
 return data;
}
