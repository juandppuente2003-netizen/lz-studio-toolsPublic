// Presentation only. Processing, dimensions and export stay with each tool.
export function setupInterfacePolish(config){
 const doc=document,win=doc.defaultView||window;
 const names={premium:"Semitonos Premium",editor:'Semitonos',remove:'Quitar fondo color',recolor:'Reemplazar color',extract:'Extraer diseño',crop:'Recortar imagen',color:'Mejorar colores',upscale:'Mejorar imágenes',thickness:'Auditor de grosor',opacity:'Semitransparencias',texture:'Texturas',text:'Creador de textos',mockups:'Mockups',vectorize:'Vectorizar',analyzer:'Preparar para impresión',sheet:'Pliego DTF'};
 const header=doc.querySelector('.topbar');
 if(header){const context=doc.createElement('div');context.className='lz-tool-context';const caption=doc.createElement('span');caption.textContent='MESA DE TRABAJO';const title=doc.createElement('strong');title.textContent=names[config.id]||'LZ Studio';context.append(caption,title);header.querySelector('.brand')?.after(context);}
 for(const status of doc.querySelectorAll('.status,[id$="Status"]')){status.setAttribute('role','status');status.setAttribute('aria-live','polite');}
 const colors=[...doc.querySelectorAll('input[type="color"]')].map(input=>{const output=doc.createElement('output');output.className='lz-color-value';output.setAttribute('for',input.id);input.after(output);return {input,output};});
 const workspace=doc.querySelector('.workspace,.lab-workspace');let banner,label;
 if(['editor','remove','recolor','extract','premium'].includes(config.id)&&workspace){banner=doc.createElement('div');banner.className='lz-picker-notice';banner.hidden=true;banner.setAttribute('role','status');label=doc.createElement('span');const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>{if(config.id==='extract')doc.getElementById('pickSource')?.click();else doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));refresh();};banner.append(label,cancel);workspace.prepend(banner);}
 function refresh(){for(const {input,output} of colors){output.textContent=input.value.toUpperCase();output.style.setProperty('--selected-color',input.value);}
  if(banner){const active=config.id==='extract'?doc.getElementById('pickSource')?.getAttribute('aria-pressed')==='true':doc.body.classList.contains('picking');banner.hidden=!active;if(doc.body.classList.contains('lz-picker-active')!==active)doc.body.classList.toggle('lz-picker-active',active);label.textContent=config.id==='premium'&&doc.body.classList.contains('premium-selecting')?'Arrastra en la imagen para seleccionar la zona a eliminar.':config.id==='recolor'?'Selecciona en la imagen el color que quieres reemplazar.':config.id==='extract'?'Selecciona el color de la prenda en la foto original.':'Selecciona en la imagen el color que quieres quitar.';}}
 const update=()=>win.requestAnimationFrame?win.requestAnimationFrame(refresh):queueMicrotask(refresh);
 doc.addEventListener('input',update);doc.addEventListener('change',update);doc.addEventListener('click',update);doc.addEventListener('lz-work-changed',update);doc.addEventListener('keydown',update);
 const Observer=win.MutationObserver;if(Observer)new Observer(update).observe(doc.body,{attributes:true,attributeFilter:['class']});
 refresh();
}
