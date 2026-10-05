import {reinforceDtfDetails} from './dtf-audit-engine.js';
const clamp=n=>Math.max(0,Math.min(1,n));
function hash(x,y,seed){let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(seed|0,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296}
function noise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return (hash(ix,iy,seed)*(1-sx)+hash(ix+1,iy,seed)*sx)*(1-sy)+(hash(ix,iy+1,seed)*(1-sx)+hash(ix+1,iy+1,seed)*sx)*sy}
function circleSpot(x,y){const r=Math.hypot(x,y);if(r<=.5)return Math.PI*r*r;const cap=r*r*Math.acos(.5/r)-.5*Math.sqrt(r*r-.25);return clamp(Math.PI*r*r-4*cap)}
const fract=n=>n-Math.floor(n);

// Absolute physical coordinates keep textures and opacity screens continuous
// across export tiles, independent of the preview and output pixel density.
export function processDesignEffect(data,w,h,p,pixelsPerCm,offsetX=0,offsetY=0){
  if(!Number.isFinite(pixelsPerCm)||pixelsPerCm<=0)throw Error('Medida de impresión inválida.');
  // Recover faint tiny source details before the screen can drop them; then
  // reinforce the resulting solid halftone dots below, using the same minimum.
  if(p.effectTool==='opacity'&&p.effectMinDetailMm)reinforceDtfDetails(data,w,h,Number(p.effectMinDetailMm),pixelsPerCm,{solidifyDetails:true});
  const size=Math.max(.15,Number(p.effectSizeMm)||.5),pitch=size*pixelsPerCm/10;
  const amount=clamp((Number(p.effectAmount)||0)/100),seed=Number(p.effectSeed)||1;
  const angle=(Number(p.effectAngle)||0)*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
  const cutoff=Math.max(1,Math.round(clamp((Number(p.alphaThreshold)||50)/100)*255));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=data[i+3];
    if(!a)continue;
    const gx=x+offsetX+.5,gy=y+offsetY+.5,u=(gx*co+gy*si)/pitch,v=(-gx*si+gy*co)/pitch;
    let alpha=a;
    if(p.effectTool==='opacity'){
      if(p.alphaMethod==='solid')alpha=255;
      else if(p.alphaMethod==='threshold')alpha=a>=cutoff?255:0;
      else alpha=a===255?255:circleSpot(fract(u)-.5,fract(v)-.5)<a/255?255:0;
    }else if(p.effectTool==='texture'){
      let mask=1;
      switch(p.textureType){
        case 'grain':{const ix=Math.floor(u),iy=Math.floor(v),radius=.16+.24*hash(ix,iy,seed+1),cx=.25+.5*hash(ix,iy,seed+2),cy=.25+.5*hash(ix,iy,seed+3);mask=hash(ix,iy,seed)<amount&&Math.hypot(fract(u)-cx,fract(v)-cy)<radius?0:1;break}
        case 'scratches':mask=noise(u*.2,v*4,seed)<amount*.75?0:1;break;
        case 'dots':mask=circleSpot(fract(u)-.5,fract(v)-.5)<amount?0:1;break;
        case 'stripes':mask=fract(v)<amount?0:1;break;
        case 'grid':mask=fract(u)<amount*.5||fract(v)<amount*.5?0:1;break;
        default:{const n=.65*noise(u*.35,v*.35,seed)+.35*noise(u*1.6,v*1.6,seed+4);mask=n<amount*.88?0:1}
      }
      alpha=mask?(p.effectSolidAlpha?(a>=128?255:0):a):0;
    }
    data[i+3]=alpha;
    // Keep hidden color from producing fringes in subsequent editing.
    if(!alpha)data[i]=data[i+1]=data[i+2]=0;
  }
  if(p.effectTool==='opacity'&&p.effectMinDetailMm)reinforceDtfDetails(data,w,h,Number(p.effectMinDetailMm),pixelsPerCm);
  return data;
}
