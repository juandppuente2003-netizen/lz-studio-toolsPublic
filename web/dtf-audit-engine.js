const INF=65535;
// Two-pass 3/4 chamfer distances approximate local physical thickness. The
// ridge test avoids treating every outer edge of a thick shape as a thin line.
function propagate(distance,w,h,labels){
  const relax=(p,q,cost)=>{const next=distance[q]+cost;if(next<distance[p]){distance[p]=next;if(labels)labels[p]=labels[q]}};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(x)relax(p,p-1,3);
    if(y){relax(p,p-w,3);if(x)relax(p,p-w-1,4);if(x<w-1)relax(p,p-w+1,4)}
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
    const p=y*w+x;if(x<w-1)relax(p,p+1,3);
    if(y<h-1){relax(p,p+w,3);if(x)relax(p,p+w-1,4);if(x<w-1)relax(p,p+w+1,4)}
  }
}
function seedDistances(data,w,h,minimumPx,withLabels=false){
  const n=w*h,inside=new Uint16Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x;inside[p]=data[p*4+3]?(x===0||y===0||x===w-1||y===h-1?3:INF):0}
  propagate(inside,w,h);
  const distance=new Uint16Array(n);distance.fill(INF);
  const labels=withLabels?new Uint32Array(n):null;let seeds=0;
  if(minimumPx>1)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x,d=inside[p];if(!d||2*d/3-1>=minimumPx)continue;
    let ridge=true;
    for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1)&&ridge;yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++)if(inside[yy*w+xx]>d){ridge=false;break}
    if(ridge){distance[p]=0;if(labels)labels[p]=p+1;seeds++}
  }
  if(seeds)propagate(distance,w,h,labels);
  return {distance,labels,seeds};
}
export function minimumDetailPixels(minimumMm,pixelsPerCm){
  if(!Number.isFinite(minimumMm)||minimumMm<.1||minimumMm>2||!Number.isFinite(pixelsPerCm)||pixelsPerCm<=0)throw Error('Indica un mínimo entre 0.1 y 2 mm y una medida de impresión válida.');
  return minimumMm*pixelsPerCm/10;
}
export function detailMargin(minimumMm,pixelsPerCm){return Math.ceil(minimumDetailPixels(minimumMm,pixelsPerCm)*2)+4}
export function auditDtfPixels(data,w,h,{minimumMm=.5,pixelsPerCm,transparency=true,thickness=true,onPhase}={}){
  const n=w*h;if(data.length!==n*4)throw Error('El archivo de análisis está incompleto.');
  const minimumPx=minimumDetailPixels(minimumMm,pixelsPerCm),mask=new Uint8Array(n);
  let visible=0,semi=0,thin=0;
  onPhase?.('Analizando semitransparencias…');
  for(let p=0;p<n;p++){const a=data[p*4+3];if(a)visible++;if(transparency&&a>0&&a<255){mask[p]|=1;semi++}}
  if(thickness){
    onPhase?.('Analizando grosor de puntos y trazos…');
    const {distance,seeds}=seedDistances(data,w,h,minimumPx),radius=Math.max(0,Math.ceil((minimumPx-1)/2));
    if(seeds)for(let p=0;p<n;p++)if(data[p*4+3]&&distance[p]<=radius*3){mask[p]|=2;thin++}
  }
  return {mask,visible,semi,thin,minimumPx,minimumMm};
}
// Only dilate the small ridges. Wide bodies and their colors are preserved.
// Tile callers supply a halo of detailMargin and crop it after processing.
export function reinforceDtfDetails(data,w,h,minimumMm,pixelsPerCm,{solidifyDetails=false}={}){
  const minimumPx=minimumDetailPixels(minimumMm,pixelsPerCm);if(minimumPx<=1)return data;
  const {distance,labels,seeds}=seedDistances(data,w,h,minimumPx,true);if(!seeds)return data;
  // Include one pixel of conservative clearance for the raster/chamfer
  // estimate; growing only to a nominal diameter leaves diagonal dots weak.
  const radius=Math.ceil((minimumPx+1)/2),original=data.slice();
  for(let p=0;p<w*h;p++){
    if(distance[p]>radius*3||!labels[p])continue;
    if(original[p*4+3]){if(solidifyDetails)data[p*4+3]=255;continue}
    const from=(labels[p]-1)*4,i=p*4;
    data[i]=original[from];data[i+1]=original[from+1];data[i+2]=original[from+2];data[i+3]=255;
  }
  return data;
}
export function auditPreview(data,mask,w,h,maxSide=1100){
  const scale=Math.min(1,maxSide/Math.max(w,h)),width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale)),pixels=new Uint8ClampedArray(width*height*4),flags=new Uint8Array(width*height);
  // Box reduction in premultiplied alpha: include every final-output pixel,
  // even tiny dots that would disappear with nearest-neighbor sampling.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const x0=Math.floor(x*w/width),x1=Math.floor((x+1)*w/width),y0=Math.floor(y*h/height),y1=Math.floor((y+1)*h/height);let a=0,r=0,g=0,b=0,flag=0;
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const p=yy*w+xx,i=p*4,alpha=data[i+3];a+=alpha;r+=data[i]*alpha;g+=data[i+1]*alpha;b+=data[i+2]*alpha;flag|=mask[p]}
    const p=y*width+x,i=p*4;if(a){pixels[i]=r/a;pixels[i+1]=g/a;pixels[i+2]=b/a;pixels[i+3]=a/((x1-x0)*(y1-y0))}flags[p]=flag;
  }
  return {width,height,pixels,mask:flags};
}
