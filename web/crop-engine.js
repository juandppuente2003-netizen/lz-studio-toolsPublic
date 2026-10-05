export function contentBounds(data,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length!==width*height*4)throw Error('Imagen inválida.');
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 return right<0?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function clampCrop(rect,width,height){
 if(!rect||![rect.x,rect.y,rect.width,rect.height,width,height].every(Number.isFinite)||width<1||height<1)throw Error('Recorte inválido.');
 const x=Math.max(0,Math.min(width-1,Math.round(rect.x))),y=Math.max(0,Math.min(height-1,Math.round(rect.y)));
 return {x,y,width:Math.max(1,Math.min(width-x,Math.round(rect.width))),height:Math.max(1,Math.min(height-y,Math.round(rect.height)))};
}
