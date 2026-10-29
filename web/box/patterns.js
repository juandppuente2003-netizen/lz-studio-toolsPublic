import {materialWeb} from './models.js?v=3.5';
import {ringDistance} from './structure.js?v=3.5';
export const patterns=['legacy','diamond','quatrefoil','petals','arches'];
export const patternedModels=['bridge','caddy','petal','floral','bag','drawer','heart','altar'];
const inside=(r,[x,y])=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
const bounds=r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))];
function fits(p,h,m){if(!inside(p.p,h[0])||ringDistance(p.p,h)<m-1e-5)return false;const a=bounds(h);for(const old of p.holes){const b=bounds(old);if(Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]))>=m)continue;if(inside(old,h[0])||inside(h,old[0])||ringDistance(old,h)<m-1e-5)return false;}return true;}
export function applyPattern(p,s,{x0=0,y0=0,x1=p.w,y1=p.h}={}){
 if(!s.decoration)return;const m=materialWeb(s),style=s.pattern==='legacy'?'quatrefoil':s.pattern||'quatrefoil',w=x1-x0,h=y1-y0,R=Math.max(m,Math.min(18,(Math.min(w,h)-m)/4)),pitch=2*R+m,nx=Math.max(0,Math.min(8,Math.floor((w-m)/pitch))),ny=Math.max(0,Math.min(8,Math.floor((h-m)/pitch)));
 p.decorationStart??=p.holes.length;let count=0;
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const cx=x0+w/2+(x-(nx-1)/2)*pitch,cy=y0+h/2+(y-(ny-1)/2)*pitch;let ring;
  if(style==='diamond')ring=[[cx,cy-R],[cx+R,cy],[cx,cy+R],[cx-R,cy]];
  else ring=Array.from({length:32},(_,i)=>{const a=i*2*Math.PI/32,r=style==='quatrefoil'?R*(.79+.21*Math.cos(4*a)):style==='petals'?R*(.90+.10*Math.cos(6*a)):R,angle=style==='arches'?((x+y)%2?Math.PI/4:-Math.PI/4):0,u=r*Math.cos(a),v=r*Math.sin(a)*(style==='arches'?.48:1);return[cx+u*Math.cos(angle)-v*Math.sin(angle),cy+u*Math.sin(angle)+v*Math.cos(angle)];});
  if(fits(p,ring,m)){p.holes.push(ring);count++;}
 }
 p.decorativeCount=(p.decorativeCount||0)+count;return count;
}
