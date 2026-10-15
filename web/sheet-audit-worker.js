import {DotScanner} from './large-dot-engine.js';
let scanner,semi,checkAlpha;
self.onmessage=({data:m})=>{try{
 if(m.type==='init'){semi=0;checkAlpha=m.alpha;scanner=m.thickness?new DotScanner(m.width,m.height,m.minimumPx):null;self.postMessage({ok:true});}
 if(m.type==='band'){const data=new Uint8ClampedArray(m.buffer);if(checkAlpha)for(let i=3;i<data.length;i+=4)if(data[i]>0&&data[i]<255)semi++;scanner?.band(data,m.rows,m.y);self.postMessage({ok:true});}
 if(m.type==='finish')self.postMessage({semi,dots:scanner?scanner.end().count:0});
 }catch(error){self.postMessage({error:error.message});}};
