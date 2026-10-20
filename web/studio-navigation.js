// Reorder existing links without changing routes or tool access controls.
export function groupStudioNavigation(){
 const menu=document.querySelector('.module-menu');if(!menu||menu.dataset.grouped)return;menu.dataset.grouped='true';
 const version=menu.querySelector('.menu-head .eyebrow');if(version)version.textContent='LZ_STUDIO_TOOLS · v49';
 const groups=[['Preparar',['crop','extract','remove','recolor','upscale','color-enhance']],['Diseñar',['editor','premium','text-creator','textures','vectorize']],['Producir',['opacity','thickness','analyzer','gang-sheet']],['Presentar',['mockups']]];
 const links=[...menu.querySelectorAll('a.module')];
 const id=link=>{const url=new URL(link.getAttribute('href'),document.baseURI);return url.searchParams.get('tool')||url.pathname.split('/').pop().replace('.html','');};
 for(const [name,ids] of groups){const section=document.createElement('section');section.className='lz-nav-group';const heading=document.createElement('h3');heading.textContent=name;section.append(heading);for(const key of ids){const link=links.find(a=>id(a)===key);if(!link)continue;link.querySelector('span')?.setAttribute('hidden','');section.append(link);}if(section.children.length>1)menu.append(section);}
}
export function setupWorkSummary(config){
 const workspace=document.querySelector('.workspace,.lab-workspace,.text-workspace,.mockup-workspace');if(!workspace||!config.getExportInfo)return;
 const bar=document.createElement('div');bar.className='lz-work-summary';bar.setAttribute('aria-label','Datos del trabajo');
 const dimensions=document.createElement('strong'),state=document.createElement('span');dimensions.textContent='Carga un archivo para ver su medida';state.textContent='Comprobación final al descargar';bar.append(dimensions,state);const toolbar=workspace.querySelector('.canvas-toolbar,.lab-toolbar,.text-toolbar,.mockup-toolbar');if(toolbar)toolbar.after(bar);else workspace.prepend(bar);
 let timer,generation=0,last='';
 const refresh=()=>{clearTimeout(timer);const request=++generation;timer=setTimeout(async()=>{try{const p=await config.getExportInfo(config.id==='vectorize');if(request!==generation||!p)return;const next=`${Number(p.widthCm).toFixed(2)} × ${(p.widthCm/p.aspect).toFixed(2)} cm · ${Math.round(p.dpi)} ppp`;dimensions.textContent=next;if(next!==last){state.textContent='Medida de trabajo · comprobación final al descargar';last=next;}}catch{dimensions.textContent='Carga o prepara un resultado para ver su medida';state.textContent='Aún no hay salida preparada';}},180);};
 document.addEventListener('lz-work-changed',refresh);document.addEventListener('change',refresh);document.addEventListener('input',refresh);document.addEventListener('lz-export-verified',()=>{state.textContent='Última descarga comprobada · consulta el informe de salida';});refresh();
}
