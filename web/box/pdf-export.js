/* LZ Studio · PDF técnico (v3.4). Vectorial: resumen, lista de piezas,
   armado, un dibujo acotado por pieza y cada hoja de corte. La imagen 3D
   es solo de referencia. jsPDF se carga localmente al exportar. */
let loading=null;
function loadJsPDF(){
 if(globalThis.jspdf?.jsPDF)return Promise.resolve(globalThis.jspdf.jsPDF);
 if(!loading)loading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('./vendor/jspdf.umd.min.js',import.meta.url).href;s.onload=()=>globalThis.jspdf?.jsPDF?resolve(globalThis.jspdf.jsPDF):reject(Error('No se pudo cargar el generador de PDF.'));s.onerror=()=>reject(Error('No se pudo cargar el generador de PDF.'));document.head.append(s);});
 return loading;
}
const f1=n=>(Math.round(n*10)/10).toLocaleString('es-MX');
const bounds=r=>r.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[Infinity,Infinity,-Infinity,-Infinity]);
function ring(doc,r,ox,oy,k,flip){if(r.length<2)return;const P=r.map(([x,y])=>[ox+x*k,flip?oy-y*k:oy+y*k]),seg=[];for(let i=1;i<P.length;i++)seg.push([P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]]);doc.lines(seg,P[0][0],P[0][1],[1,1],'S',true);}
function dim(doc,x1,y1,x2,y2,txt,vertical){doc.setDrawColor(110);doc.setLineWidth(.15);doc.line(x1,y1,x2,y2);const a=1.2;if(vertical){doc.line(x1-a,y1,x1+a,y1);doc.line(x2-a,y2,x2+a,y2);}else{doc.line(x1,y1-a,x1,y1+a);doc.line(x2,y2-a,x2,y2+a);}doc.setFontSize(7);doc.setTextColor(50);if(vertical)doc.text(txt,x1-1.6,(y1+y2)/2,{angle:90,align:'center'});else doc.text(txt,(x1+x2)/2,y1-1.3,{align:'center'});}

/**
 * info: {state, panels, packed, title, modelName, outer:{W,D,H,t}, inner:{w,d,h}, steps:[], note, image}
 * Returns a Blob.
 */
export async function technicalPDF(info){
 const JsPDF=await loadJsPDF();const doc=new JsPDF({unit:'mm',format:'a4'});const s=info.state;
 doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text(info.title,15,18);
 doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(95);doc.text(`LZ Studio · Box Studio · ${info.modelName} · ${new Date().toLocaleString('es-MX')}`,15,24);doc.setTextColor(0);
 const {W,D,H,t}=info.outer,rows=[['Medida exterior',`${f1(W)} × ${f1(D)} × ${f1(H)} mm`],['Interior útil',info.inner?`${f1(info.inner.w)} × ${f1(info.inner.d)} × ${f1(info.inner.h)} mm`:'—'],['Espesor real del MDF',`${f1(t)} mm`],['Unión',s.jointMode==='internal'?'Pestañas en ranuras interiores':'Peines en el borde'],['Largo de diente',`${f1(+s.finger)} mm`],['Holgura de unión',`${(+s.clearance).toFixed(2)} mm`],['Kerf',`${(+s.kerf).toFixed(2)} mm (aplicado en SVG/DXF)`],['Puente mínimo',`${f1(+s.minWeb)} mm`],['Piezas',`${info.panels.length} en ${info.packed?.count||1} hoja(s) de ${s.sheetW} × ${s.sheetH} mm`]];
 let y=33;doc.setFontSize(9.5);for(const[k,v]of rows){doc.setTextColor(105);doc.text(k,15,y);doc.setTextColor(0);const lines=doc.splitTextToSize(String(v),info.image?52:120);doc.text(lines,58,y);y+=4.6*lines.length+.8;}
 if(info.image){try{doc.addImage(info.image,info.image.startsWith('data:image/jpeg')?'JPEG':'PNG',115,30,82,52);}catch{}}
 y=Math.max(y,86)+4;doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.text('Lista de piezas',15,y);doc.setFont('helvetica','normal');y+=5;doc.setFontSize(8);doc.setTextColor(105);
 const cols=[15,24,92,124,140];['N.º','Pieza','Medida nominal','Huecos','Hoja'].forEach((h,i)=>doc.text(h,cols[i],y));doc.setTextColor(0);y+=4.2;
 info.panels.forEach((p,i)=>{if(y>282){doc.addPage();y=18;}const q=info.packed?.panels.find(x=>x.id===p.id);doc.text(String(i+1),cols[0],y);doc.text(doc.splitTextToSize(p.name,64)[0],cols[1],y);doc.text(`${f1(p.w)} × ${f1(p.h)} × ${f1(t)}`,cols[2],y);doc.text(String((p.holes||[]).length),cols[3],y);doc.text(q?String(q.sheet+1):'No cabe',cols[4],y);y+=4.2;});
 y+=3;if(y>255){doc.addPage();y=18;}doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.text('Ensamble sin pegamento',15,y);doc.setFont('helvetica','normal');doc.setFontSize(9);y+=5;
 if(info.note){const l=doc.splitTextToSize(info.note,180);doc.text(l,15,y);y+=4.4*l.length+2;}
 info.steps.forEach((st,i)=>{const l=doc.splitTextToSize(`${i+1}. ${st}`,180);if(y+4.4*l.length>285){doc.addPage();y=18;}doc.text(l,15,y);y+=4.4*l.length+.6;});
 y+=2;const warn=doc.splitTextToSize('Prueba primero la probeta de encaje en tu MDF. Las comprobaciones geométricas no sustituyen una prueba física de corte ni certifican carga.',180);doc.setTextColor(95);doc.text(warn,15,Math.min(y,285));doc.setTextColor(0);

 // ---- one dimensioned drawing per piece (nominal geometry, kerf not applied)
 const cw=90,ch=80;info.panels.forEach((p,i)=>{if(i%6===0){doc.addPage();doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Piezas · geometría nominal (sin kerf)',15,13);doc.setFont('helvetica','normal');}
  const c=i%6,cx=15+(c%2)*(cw+5),cy=19+Math.floor(c/2)*(ch+6);doc.setDrawColor(205);doc.setLineWidth(.1);doc.rect(cx,cy,cw,ch);doc.setFontSize(8.5);doc.setTextColor(0);doc.text(`${i+1}. ${doc.splitTextToSize(p.name,cw-26)[0]}`,cx+3,cy+5);
  const b=bounds(p.p),w=b[2]-b[0],h=b[3]-b[1],k=Math.min((cw-22)/w,(ch-24)/h,1);doc.setFontSize(7);doc.setTextColor(115);doc.text(`Escala 1:${(1/k).toFixed(k===1?0:2)}`,cx+cw-3,cy+5,{align:'right'});
  const ox=cx+14+((cw-22)-w*k)/2-b[0]*k,oy=cy+16+((ch-24)-h*k)/2-b[1]*k;doc.setDrawColor(200,0,0);doc.setLineWidth(.2);ring(doc,p.p,ox,oy,k,false);for(const hole of p.holes||[])ring(doc,hole,ox,oy,k,false);
  dim(doc,ox+b[0]*k,oy+b[1]*k-3,ox+b[2]*k,oy+b[1]*k-3,`${f1(w)} mm`,false);dim(doc,ox+b[0]*k-3,oy+b[1]*k,ox+b[0]*k-3,oy+b[3]*k,`${f1(h)} mm`,true);
  doc.setFontSize(6.5);doc.setTextColor(95);doc.text(`${(p.holes||[]).length} huecos · ${(p.connections||[]).length} uniones`,cx+3,cy+ch-2.5);});

 // ---- cutting sheets exactly as exported (kerf applied)
 if(info.packed)for(let i=0;i<info.packed.count;i++){doc.addPage();doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(0);doc.text(`Hoja ${i+1} de ${info.packed.count} · ${s.sheetW} × ${s.sheetH} mm`,15,13);doc.setFont('helvetica','normal');
  const k=Math.min(180/+s.sheetW,255/+s.sheetH),ox=15,oy=19;doc.setDrawColor(150);doc.setLineWidth(.2);doc.rect(ox,oy,+s.sheetW*k,+s.sheetH*k);doc.setDrawColor(200,0,0);doc.setLineWidth(.15);
  const items=info.packed.panels.filter(p=>p.sheet===i);for(const p of items){ring(doc,p.points,ox,oy,k,false);for(const h of p.holePoints||[])ring(doc,h,ox,oy,k,false);}
  doc.setFontSize(6.5);doc.setTextColor(40);for(const p of items)doc.text(doc.splitTextToSize(p.name,Math.max(10,p.bw*k))[0],ox+(p.x+p.bw/2)*k,oy+(p.y+p.bh/2)*k,{align:'center'});
  doc.setFontSize(7.5);doc.setTextColor(95);doc.text(`Escala 1:${(1/k).toFixed(2)} · contornos con kerf compensado. Usa SVG o DXF para cortar; este PDF es una referencia.`,15,oy+(+s.sheetH)*k+6,{maxWidth:180});}
 return doc.output('blob');
}
