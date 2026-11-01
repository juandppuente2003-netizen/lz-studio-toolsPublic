/* LZ Box · figura para vitrina: imagen → silueta de corte + grabado por umbral o tramado.
   El procesamiento es local (canvas del navegador); el resultado se guarda en memoria y
   la geometría lo usa de forma síncrona. */
import {simplifyRing,ccw} from './text-shapes.js?v=1';

const cache=new Map(),listeners=new Set();
export function onFigureReady(fn){listeners.add(fn);return()=>listeners.delete(fn);}
const hash=str=>{let h=2166136261;for(let i=0;i<str.length;i+=Math.max(1,str.length>>12))h=Math.imul(h^str.charCodeAt(i),16777619)>>>0;return h.toString(36)+str.length.toString(36);};
export const figureKey=s=>s.figure?.src?[hash(s.figure.src),+s.figThreshold,+s.figBackground,s.figMode].join('|'):null;
/** Resultado listo para la geometría o null si todavía se procesa (o no hay figura). */
export function getFigure(s){const k=figureKey(s);return k?cache.get(k)||null:null;}

/** Reduce la imagen subida (máx. 520 px) y la devuelve como PNG en data URL. */
export async function prepareFigureFile(file){
 if(!file||!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type))throw Error('Usa una imagen PNG, JPG, WEBP o SVG.');
 if(file.size>15e6)throw Error('La imagen debe pesar menos de 15 MB.');
 const url=URL.createObjectURL(file);try{const img=await loadImage(url),k=Math.min(1,520/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),w=Math.max(1,Math.round((img.naturalWidth||img.width)*k)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*k)),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return{name:file.name.slice(0,80),src:c.toDataURL('image/png')};}finally{URL.revokeObjectURL(url);}
}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo leer la imagen.'));img.src=src;});}

/** Procesa (asíncrono) la figura del estado; avisa a los oyentes cuando termina. */
export async function ensureFigure(s){
 const k=figureKey(s);if(!k||cache.has(k))return cache.get(k)||null;
 const img=await loadImage(s.figure.src),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
 const data=ctx.getImageData(0,0,c.width,c.height),r=processFigure(data,{threshold:+s.figThreshold,background:+s.figBackground,mode:s.figMode});
 if(r){const out=document.createElement('canvas');out.width=r.w;out.height=r.h;const o=out.getContext('2d'),px=o.createImageData(r.w,r.h);for(let i=0;i<r.ink.length;i++)if(r.ink[i]){px.data[i*4+3]=255;}o.putImageData(px,0,0);r.png=r.inkCount?out.toDataURL('image/png'):null;
  const pv=document.createElement('canvas');pv.width=r.w;pv.height=r.h;const p2=pv.getContext('2d'),pd=p2.createImageData(r.w,r.h);for(let i=0;i<r.ink.length;i++){const v=r.ink[i]?20:255,a=r.fg[i]?255:0;pd.data.set([v,v,v,a],i*4);}p2.putImageData(pd,0,0);r.preview=pv.toDataURL('image/png');}
 if(cache.size>12)cache.clear();cache.set(k,r);for(const fn of listeners)try{fn();}catch{}return r;
}

/**
 * imageData → {w,h,fg,ink,contour:[[x,y] px, y hacia abajo],inkCount}.
 * Fondo: transparente, o claro y conectado al borde (control «Quitar fondo»).
 * Grabado: luminancia < umbral (o tramado Floyd–Steinberg) dentro de la silueta.
 */
export function processFigure({width:w,height:h,data},{threshold=133,background=40,mode='threshold'}={}){
 const n=w*h,lum=new Float32Array(n),alpha=new Uint8Array(n);
 for(let i=0;i<n;i++){const a=data[i*4+3];alpha[i]=a;lum[i]=a<8?255:(.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2])*(a/255)+255*(1-a/255);}
 const light=255-Math.max(0,Math.min(120,background))*1.6,bg=new Uint8Array(n),queue=[];
 const seed=i=>{if(!bg[i]&&(alpha[i]<128||lum[i]>=light)){bg[i]=1;queue.push(i);}};
 for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);}for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
 while(queue.length){const i=queue.pop(),x=i%w,y=(i-x)/w;if(x>0)seed(i-1);if(x<w-1)seed(i+1);if(y>0)seed(i-w);if(y<h-1)seed(i+w);}
 // Componente principal (la figura); los islotes chicos se descartan.
 const label=new Int32Array(n).fill(-1);let best=-1,bestSize=0,comp=0;
 for(let i=0;i<n;i++){if(bg[i]||label[i]>=0)continue;let size=0;const st=[i];label[i]=comp;while(st.length){const j=st.pop();size++;const x=j%w,y=(j-x)/w;for(const k of[x>0?j-1:-1,x<w-1?j+1:-1,y>0?j-w:-1,y<h-1?j+w:-1])if(k>=0&&!bg[k]&&label[k]<0){label[k]=comp;st.push(k);}}if(size>bestSize){bestSize=size;best=comp;}comp++;}
 if(bestSize<50)return null;
 // Se conservan las partes significativas (gorro, manos sueltas…) y se unen con un borde alrededor de la figura.
 const sizes=new Int32Array(comp);for(let i=0;i<n;i++)if(label[i]>=0)sizes[label[i]]++;
 const keep=new Uint8Array(n);for(let i=0;i<n;i++)keep[i]=label[i]>=0&&sizes[label[i]]>=bestSize*.01?1:0;
 const r=Math.max(3,Math.round(.018*Math.max(w,h))),grown=dilate(keep,w,h,r);
 const lab2=new Int32Array(n).fill(-1);let best2=-1,size2=0,c2=0;
 for(let i=0;i<n;i++){if(!grown[i]||lab2[i]>=0)continue;let size=0;const st=[i];lab2[i]=c2;while(st.length){const j=st.pop();size++;const x=j%w,y=(j-x)/w;for(const k of[x>0?j-1:-1,x<w-1?j+1:-1,y>0?j-w:-1,y<h-1?j+w:-1])if(k>=0&&grown[k]&&lab2[k]<0){lab2[k]=c2;st.push(k);}}if(size>size2){size2=size;best2=c2;}c2++;}
 const fg=new Uint8Array(n),shape=new Uint8Array(n);for(let i=0;i<n;i++){shape[i]=lab2[i]===best2?1:0;fg[i]=keep[i]&&shape[i];}
 const ink=new Uint8Array(n);let inkCount=0;
 if(mode==='dither'){const e=Float32Array.from(lum);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!fg[i])continue;const old=e[i],nv=old<128?0:255,err=old-nv;if(!nv){ink[i]=1;inkCount++;}const spread=(dx,dy,f)=>{const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy<h)e[yy*w+xx]+=err*f;};spread(1,0,7/16);spread(-1,1,3/16);spread(0,1,5/16);spread(1,1,1/16);}}
 else if(mode!=='outline')for(let i=0;i<n;i++)if(fg[i]&&lum[i]<threshold){ink[i]=1;inkCount++;}
 return{w,h,fg,ink,inkCount,contour:traceOuter(shape,w,h)};
}
/** Dilatación cuadrada de radio r (dos pasadas separables). */
function dilate(mask,w,h,r){const a=new Uint8Array(w*h),b=new Uint8Array(w*h);for(let y=0;y<h;y++){let last=-1e9;for(let x=0;x<w;x++){if(mask[y*w+x])last=x;if(x-last<=r)a[y*w+x]=1;}last=1e9;for(let x=w-1;x>=0;x--){if(mask[y*w+x])last=x;if(last-x<=r)a[y*w+x]=1;}}for(let x=0;x<w;x++){let last=-1e9;for(let y=0;y<h;y++){if(a[y*w+x])last=y;if(y-last<=r)b[y*w+x]=1;}last=1e9;for(let y=h-1;y>=0;y--){if(a[y*w+x])last=y;if(last-y<=r)b[y*w+x]=1;}}return b;}
/** Contorno exterior (esquinas de píxel) de la máscara, simplificado. */
function traceOuter(mask,w,h){
 // Marcha sobre bordes de píxel: arista orientada entre dentro (izquierda) y fuera (derecha).
 const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x]===1;let sx=-1,sy=-1;
 for(let y=0;y<h&&sx<0;y++)for(let x=0;x<w;x++)if(inside(x,y)){sx=x;sy=y;break;}
 if(sx<0)return[];
 // Empieza en la esquina superior izquierda del primer píxel, recorriendo hacia la izquierda por arriba (sentido que deja la figura a la izquierda en y hacia abajo).
 let x=sx,y=sy,dir=0;const pts=[];const dx=[1,0,-1,0],dy=[0,1,0,-1];// 0 der,1 abajo,2 izq,3 arriba
 const start=[x,y];let guard=0;
 do{pts.push([x,y]);
  // Celdas a la izquierda/derecha del avance en la dirección dir desde el vértice (x,y).
  const cell=(d,side)=>{// side: 0 = izquierda del avance, 1 = derecha
   if(d===0)return side?[x,y-1]:[x,y];if(d===1)return side?[x,y]:[x-1,y];if(d===2)return side?[x-1,y]:[x-1,y-1];return side?[x-1,y-1]:[x,y-1];};
  // Gira a la derecha si puede, si no sigue recto, si no a la izquierda (seguidor de muro).
  for(const turn of[1,0,3,2]){const d=(dir+turn)%4,[lx,ly]=cell(d,0),[rx,ry]=cell(d,1);if(inside(lx,ly)&&!inside(rx,ry)){dir=d;break;}}
  x+=dx[dir];y+=dy[dir];
 }while((x!==start[0]||y!==start[1])&&++guard<4*w*h+8);
 return simplifyRing(pts,.9);
}
/** Silueta en mm (y hacia arriba), ancho dado; devuelve anillo antihorario y el rectángulo de la imagen. */
export function figureOutline(r,widthMm){const minX=Math.min(...r.contour.map(p=>p[0])),maxX=Math.max(...r.contour.map(p=>p[0])),minY=Math.min(...r.contour.map(p=>p[1])),maxY=Math.max(...r.contour.map(p=>p[1])),k=widthMm/Math.max(1,maxX-minX),ring=ccw(r.contour.map(([x,y])=>[(x-minX)*k,(maxY-y)*k]));return{ring,k,height:(maxY-minY)*k,image:{x:-minX*k,y:-(r.h-maxY)*k,w:r.w*k,h:r.h*k}};}
