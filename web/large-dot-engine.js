// Exact eight-connected components scanned one row at a time. Large shapes
// retain only bounds/count; only small compact islands retain their runs.
export class DotScanner{
 constructor(width,height,minimumPx){this.width=width;this.height=height;this.minimumPx=minimumPx;this.previous=[];this.dots=[];this.visible=0;this.smallPixels=0;}
 root(c){let r=c;while(r.parent)r=r.parent;while(c.parent){const p=c.parent;c.parent=r;c=p;}return r;}
 trim(c){if(c.count>=Math.PI*(this.minimumPx/2)**2||Math.max(c.x1-c.x0+1,c.y1-c.y0+1)>=this.minimumPx*2)c.runs=null;}
 merge(a,b){a=this.root(a);b=this.root(b);if(a===b)return a;if(a.count<b.count)[a,b]=[b,a];b.parent=a;a.count+=b.count;a.x0=Math.min(a.x0,b.x0);a.x1=Math.max(a.x1,b.x1);a.y0=Math.min(a.y0,b.y0);a.y1=Math.max(a.y1,b.y1);a.runs=a.runs&&b.runs?a.runs.concat(b.runs):null;b.runs=null;this.trim(a);return a;}
 finish(c){if(!c.runs)return;if(this.dots.length>=1_000_000)throw Error('Se detectaron más de un millón de puntos. Divide el diseño para revisarlo.');this.smallPixels+=c.count;this.dots.push({x0:c.x0,x1:c.x1,y0:c.y0,y1:c.y1,diameter:2*Math.sqrt(c.count/Math.PI),runs:c.runs});}
 band(data,rows,offsetY){const w=this.width;for(let row=0;row<rows;row++){
  const y=row+offsetY,current=[];let cursor=0;
  for(let x=0;x<w;){if(!data[(row*w+x)*4+3]){x++;continue;}const x0=x;while(x<w&&data[(row*w+x)*4+3])x++;const x1=x-1,count=x-x0;this.visible+=count;
   let component={count,x0,x1,y0:y,y1:y,runs:[[y,x0,x1]]};this.trim(component);
   while(cursor<this.previous.length&&this.previous[cursor].x1<x0-1)cursor++;
   for(let j=cursor;j<this.previous.length&&this.previous[j].x0<=x1+1;j++)component=this.merge(component,this.previous[j].component);
   current.push({x0,x1,component});
  }
  const active=new Set(current.map(run=>this.root(run.component))),old=new Set(this.previous.map(run=>this.root(run.component)));
  for(const c of old)if(!active.has(c))this.finish(c);
  for(const run of current)run.component=this.root(run.component);this.previous=current;
 }}
 end(){for(const c of new Set(this.previous.map(r=>this.root(r.component))))this.finish(c);this.previous=[];return {count:this.dots.length,smallPixels:this.smallPixels,minimumPx:this.minimumPx,visible:this.visible};}
}
export function dotRadius(dot,minimumPx,options){return (options.mode==='auto'?Math.max(1,Math.ceil((minimumPx-dot.diameter)/2)+1):0)+Number(options.delta||0);}
export function correctDotBand(data,width,rows,y,dots,minimumPx,options){
 const original=data.slice();let removed=0,changed=0,clipped=0;
 for(const dot of dots){const radius=dotRadius(dot,minimumPx,options);if(!radius)continue;changed++;let remaining=0;
  for(const [runIndex,[yy,x0,x1]] of dot.runs.entries())for(let x=x0;x<=x1;x++){
   const p=((yy-y)*width+x)*4;
   if(radius>0){if(yy>=y&&yy<y+rows)data[p+3]=255;if(x-radius<0||x+radius>=width)clipped++;
    // RGB supplied from the original row when a dot spans adjacent bands.
    const color=dot.colors?.[runIndex]?.subarray((x-x0)*4,(x-x0)*4+4)||original.subarray(p,p+4);
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){if(dx*dx+dy*dy>radius*radius)continue;const xx=x+dx,yyy=yy+dy;if(xx<0||xx>=width||yyy<y||yyy>=y+rows)continue;const q=((yyy-y)*width+xx)*4;if(original[q+3])continue;data[q]=color[0];data[q+1]=color[1];data[q+2]=color[2];data[q+3]=255;}
   }else if(yy>=y&&yy<y+rows){const r=-radius;let keep=true;for(let dy=-r;dy<=r&&keep;dy++)for(let dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r*r)continue;const xx=x+dx,yyy=yy+dy;if(!dot.runs.some(([ry,a,b])=>ry===yyy&&xx>=a&&xx<=b)){keep=false;break;}}if(keep)remaining++;else data.fill(0,p,p+4);}
  }if(radius<0&&!remaining)removed++;
 }return {changed,removed,clipped};
}
