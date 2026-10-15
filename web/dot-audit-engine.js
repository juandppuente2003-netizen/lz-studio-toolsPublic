import {minimumDetailPixels} from './dtf-audit-engine.js';

// Eight-connected islands identify isolated dots, never edges within a large
// body. Work at final output pixels; no preview reduction participates.
export function findSmallDots(data,width,height,{minimumMm=.5,pixelsPerCm}={}){
  if(data.length!==width*height*4)throw Error('El archivo de análisis está incompleto.');
  const minimumPx=minimumDetailPixels(minimumMm,pixelsPerCm),n=width*height;
  const seen=new Uint8Array(n),queue=new Uint32Array(n),mask=new Uint8Array(n),dots=[];
  let visible=0,smallPixels=0;
  for(let p=0;p<n;p++)if(data[p*4+3])visible++;
  for(let start=0;start<n;start++){
    if(seen[start]||!data[start*4+3])continue;
    let head=0,tail=1,x0=start%width,x1=x0,y0=(start/width)|0,y1=y0;
    queue[0]=start;seen[start]=1;
    while(head<tail){const p=queue[head++],x=p%width,y=(p/width)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++){
        const q=yy*width+xx;if(!seen[q]&&data[q*4+3]){seen[q]=1;queue[tail++]=q}
      }
    }
    const diameter=2*Math.sqrt(tail/Math.PI),span=Math.max(x1-x0+1,y1-y0+1);
    // Compact dot-size components only; a long thin line is not a dot.
    if(diameter<minimumPx&&span<minimumPx*2){
      if(dots.length>=100000)throw Error('El archivo tiene más de 100,000 puntos pequeños. Divide el diseño para revisarlo.');
      const pixels=queue.slice(0,tail);for(const p of pixels)mask[p]=2;
      dots.push({pixels,diameter,x0,x1,y0,y1});smallPixels+=tail;
    }
  }
  return {mask,dots,count:dots.length,smallPixels,visible,minimumPx,minimumMm};
}

export function adjustSmallDots(data,width,height,options={}){
  const original=data.slice(),report=findSmallDots(original,width,height,options),out=original.slice();
  const delta=Number(options.delta||0);
  if(!Number.isInteger(delta)||delta< -12||delta>12)throw Error('El ajuste debe estar entre −12 y +12 píxeles.');
  let changed=0,removed=0,clipped=0;
  for(const dot of report.dots){
    const base=options.mode==='auto'?Math.max(1,Math.ceil((report.minimumPx-dot.diameter)/2)+1):0,radius=base+delta;
    if(!radius)continue;changed++;
    if(radius>0){
      for(const p of dot.pixels){const x=p%width,y=(p/width)|0;
        if(x-radius<0||y-radius<0||x+radius>=width||y+radius>=height)clipped++;
        out[p*4+3]=255;
        for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
          if(dx*dx+dy*dy>radius*radius)continue;
          const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;
          const q=(yy*width+xx)*4;if(original[q+3])continue;
          out[q]=original[p*4];out[q+1]=original[p*4+1];out[q+2]=original[p*4+2];out[q+3]=255;
        }
      }
    }else{
      const r=-radius;let left=0;
      for(const p of dot.pixels){const x=p%width,y=(p/width)|0;let keep=true;
        for(let dy=-r;dy<=r&&keep;dy++)for(let dx=-r;dx<=r;dx++){
          if(dx*dx+dy*dy>r*r)continue;
          const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height||!original[(yy*width+xx)*4+3]){keep=false;break}
        }
        if(keep)left++;else out.fill(0,p*4,p*4+4);
      }
      if(!left)removed++;
    }
  }
  return {data:out,changed,removed,clipped,selected:report.count};
}
