export const COLOR_DEFAULTS={exposure:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,temperature:0,tint:0,vibrance:0,saturation:0,clarity:0,vignette:0,grain:0};
export const COLOR_STYLES={
  vivid:{contrast:14,vibrance:34,saturation:8,clarity:12},
  natural:{contrast:5,highlights:-12,shadows:12,vibrance:12},
  bw:{contrast:18,saturation:-100,clarity:12},
  portrait:{contrast:3,highlights:-16,shadows:15,temperature:5,vibrance:10,clarity:-12},
  vintage:{contrast:-10,blacks:16,temperature:20,saturation:-25,grain:12,vignette:12},
  cinema:{contrast:22,highlights:-20,shadows:8,temperature:-12,saturation:-16,vignette:20}
};
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n)};
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
function hash(x,y){let n=Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296}
export function clarityRadius(pixelsPerCm){return Math.max(1,Math.min(4,Math.round(pixelsPerCm*.015)))}
export function processColorAdjustments(data,w,h,p,pixelsPerCm,offsetX=0,offsetY=0){
  const a={...COLOR_DEFAULTS,...p.colorAdjustments};
  if(Object.keys(COLOR_DEFAULTS).every(key=>a[key]===0))return data;
  const source=a.clarity?data.slice():null,radius=clarityRadius(pixelsPerCm);
  const fullWidth=pixelsPerCm*p.widthCm,fullHeight=fullWidth/(p.colorAspect||1),grainPitch=Math.max(.01,pixelsPerCm*.01);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;if(!data[i+3])continue;
    let r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,L=luma(r,g,b);
    if(source){
      let sum=0,weight=0;
      for(const dy of [-radius,0,radius])for(const dx of [-radius,0,radius]){const xx=Math.max(0,Math.min(w-1,x+dx)),yy=Math.max(0,Math.min(h-1,y+dy)),j=(yy*w+xx)*4,alpha=source[j+3]/255;sum+=luma(source[j]/255,source[j+1]/255,source[j+2]/255)*alpha;weight+=alpha}
      const detail=weight?L-sum/weight:0,amount=detail*a.clarity/100*1.8;r+=amount;g+=amount;b+=amount;
    }
    const exposure=2**a.exposure;r*=exposure;g*=exposure;b*=exposure;L=clamp(luma(r,g,b));
    const adjustment=a.shadows/100*.28*(1-smooth(L/.65))+a.highlights/100*.28*smooth((L-.35)/.65)+a.blacks/100*.18*(1-smooth(L/.28))+a.whites/100*.18*smooth((L-.72)/.28);
    const contrast=2**(a.contrast/70);
    r=(r+adjustment-.5)*contrast+.5;g=(g+adjustment-.5)*contrast+.5;b=(b+adjustment-.5)*contrast+.5;
    r+=a.temperature/100*.15+a.tint/100*.055;g-=a.tint/100*.11;b-=a.temperature/100*.15-a.tint/100*.055;
    L=luma(r,g,b);const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max>0?clamp((max-min)/max):0;
    const amount=Math.max(0,(1+a.saturation/100)*(1+a.vibrance/100*(1-sat)*.8));
    r=L+(r-L)*amount;g=L+(g-L)*amount;b=L+(b-L)*amount;
    const gx=x+offsetX+.5,gy=y+offsetY+.5,nx=(gx/fullWidth-.5)*2,ny=(gy/fullHeight-.5)*2;
    const vignette=1-a.vignette/100*.7*smooth((Math.hypot(nx,ny)-.35)/1.05);
    const grain=(hash(Math.floor(gx/grainPitch),Math.floor(gy/grainPitch))-.5)*a.grain/100*.14;
    data[i]=Math.round(clamp(r*vignette+grain)*255);data[i+1]=Math.round(clamp(g*vignette+grain)*255);data[i+2]=Math.round(clamp(b*vignette+grain)*255);
  }
  return data;
}
export function autoColorAdjustments(data){
  const histogram=new Float64Array(256);let total=0,sat=0,avg=0;
  for(let i=0;i<data.length;i+=4){const alpha=data[i+3]/255;if(!alpha)continue;const L=luma(data[i],data[i+1],data[i+2]);histogram[Math.round(L)]+=alpha;total+=alpha;avg+=L/255*alpha;const max=Math.max(data[i],data[i+1],data[i+2]),min=Math.min(data[i],data[i+1],data[i+2]);sat+=(max?(max-min)/max:0)*alpha}
  if(!total)return {...COLOR_DEFAULTS};
  function percentile(p){let sum=0;for(let i=0;i<256;i++){sum+=histogram[i];if(sum>=total*p)return i/255}return 1}
  const mean=avg/total,low=percentile(.02),high=percentile(.98);
  return {...COLOR_DEFAULTS,exposure:Math.round(Math.max(-.7,Math.min(.7,Math.log2(.48/Math.max(.02,mean))))*20)/20,contrast:high-low<.55?12:4,highlights:high>.92?-18:0,shadows:low<.12?14:0,vibrance:sat/total<.3?24:12};
}
