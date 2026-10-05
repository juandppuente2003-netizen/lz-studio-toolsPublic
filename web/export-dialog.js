import {outputDimensions,resizedArtifact} from './image-output.js';
import {trackTool} from './account/workspace.js';
export function setupExportDialog(config){
 const buttons=[...document.querySelectorAll('button[id^="download"]')];if(!buttons.length)return;
 const dialog=document.createElement('dialog');dialog.className='lz-export-dialog';dialog.setAttribute('aria-labelledby','lz-export-title');
 dialog.innerHTML='<h2 id="lz-export-title">Medida de descarga</h2><p id="lz-export-current" class="hint"></p><label class="lz-export-choice"><input type="radio" name="lz-output-choice" value="current" checked> Usar la medida actual</label><label class="lz-export-choice"><input type="radio" name="lz-output-choice" value="custom"> Elegir otra medida</label><div class="lz-export-presets">'+[25,28,30,35].map(w=>`<button type="button" data-width="${w}">${w} cm</button>`).join('')+'</div><div class="pair"><label>Ancho (cm)<input id="lz-export-width" type="number" min="0.5" max="500" step="0.01"></label><label>Alto (cm)<input id="lz-export-height" readonly></label></div><label id="lz-export-dpi-label">Resolución<select id="lz-export-dpi"><option value="150">150 ppp</option><option value="300">300 ppp</option><option value="600">600 ppp</option><option value="native">Conservar resolución actual</option></select></label><p class="hint">Se conserva la proporción. Esta elección solo cambia la descarga.</p><p id="lz-export-info" role="status"></p><progress id="lz-export-progress" max="100" hidden></progress><div class="lz-options-buttons"><button id="lz-export-cancel" type="button">Cancelar</button><button id="lz-export-confirm" class="download-action" type="button">Descargar</button></div>';
 document.body.append(dialog);const $=id=>dialog.querySelector('#lz-export-'+id);let info,prepared,svg,opening=false,exporting=false,trigger;
 const custom=()=>dialog.querySelector('[value="custom"]').checked;
 function options(){return {widthCm:custom()?Number($('width').value):info.widthCm,dpi:$('dpi').value==='native'?info.dpi:Number($('dpi').value)};}
 function dimensions(){const o=options();return outputDimensions(o.widthCm,o.dpi,info.aspect,info.maxPixels||140e6,info.maxSide||24000);}
 function refresh(){if(!info)return;$('width').disabled=!custom();$('dpi-label').hidden=svg;try{const d=dimensions();$('height').value=(d.widthCm/info.aspect).toFixed(2);$('info').textContent=svg?'SVG editable · medidas en centímetros':`${d.width.toLocaleString()} × ${d.height.toLocaleString()} px · ${Math.round(d.dpi)} ppp`;$('confirm').disabled=false;}catch(error){$('info').textContent=error.message;$('confirm').disabled=true;}}
 const choose=()=>{dialog.querySelector('[value="custom"]').checked=true;refresh();};
 for(const button of dialog.querySelectorAll('[data-width]'))button.onclick=()=>{$('width').value=button.dataset.width;choose();};
 $('width').oninput=choose;$('dpi').onchange=refresh;for(const radio of dialog.querySelectorAll('[name="lz-output-choice"]'))radio.onchange=()=>{$('width').value=custom()?$('width').value:info.widthCm;refresh();};
 $('cancel').onclick=()=>{if(exporting)config.cancelExport?.();else dialog.close();};dialog.addEventListener('cancel',event=>{if(exporting){event.preventDefault();config.cancelExport?.();}});dialog.addEventListener('close',()=>trigger?.focus());
 async function open(button){if(opening||exporting||button.disabled)return;opening=true;trigger=button;prepared=null;svg=/Svg|Vector/.test(button.id);
  try{
   info=await config.getExportInfo?.(svg);if(svg&&!config.exportSvg)throw Error('Genera el SVG antes de descargar.');
   if(!info){prepared=await (svg?config.exportSvg():config.exportCurrent());info={widthCm:prepared.widthCm||prepared.width/(prepared.dpi||300)*2.54,dpi:prepared.dpi||300,aspect:prepared.width/prepared.height};}
   if(!info.aspect&&info.width&&info.height)info.aspect=info.width/info.height;
   $('current').textContent=`Actual: ${Number(info.widthCm).toFixed(2)} × ${(info.widthCm/info.aspect).toFixed(2)} cm${config.id==='sheet'?' · Cambiar el ancho escala todo el pliego.':''}${config.id==='mockups'?' · La medida corresponde a la imagen del mockup.':''}`;
   dialog.querySelector('[value="current"]').checked=true;$('width').value=Number(info.widthCm).toFixed(2);$('dpi').value=[150,300,600].includes(info.dpi)?String(info.dpi):'native';$('progress').hidden=true;$('confirm').textContent='Descargar';refresh();dialog.showModal();
  }catch(error){const status=document.querySelector('#status,#premiumStatus,#effectStatus,#extractStatus,#textStatus,#vectorStatus,#analyzerStatus,#cropStatus,#upscaleStatus,#mockupStatus,#sheetStatus');if(status)status.textContent=error.message;}finally{opening=false;}
 }
 $('confirm').onclick=async()=>{if(exporting)return;let d;try{d=dimensions();}catch(error){$('info').textContent=error.message;return;}exporting=true;$('confirm').disabled=true;$('cancel').disabled=!config.cancelExport;$('cancel').textContent=config.cancelExport?'Cancelar proceso':'Cancelar';$('progress').hidden=false;$('progress').value=0;
  const progress=value=>{$('progress').value=Math.round(value*100);$('info').textContent=`Preparando descarga · ${Math.round(value*100)} %`;};
  try{
   let artifact;if(svg){artifact=await config.exportSvg();const text=await artifact.blob.text();const root=text.match(/<svg\b[^>]*>/)?.[0];if(!root)throw Error('El SVG no es válido.');const sized=root.replace(/\s(?:width|height)="[^"]*"/g,'').replace(/>$/,` width="${d.widthCm}cm" height="${d.widthCm/info.aspect}cm">`);artifact={...artifact,blob:new Blob([text.replace(root,sized)],{type:'image/svg+xml'})};}
   else if(config.exportAtSize)artifact=await config.exportAtSize(d,progress);
   else artifact=await resizedArtifact(prepared||await config.exportCurrent(progress),d,progress);
   const url=URL.createObjectURL(artifact.blob),a=document.createElement('a');a.href=url;a.download=artifact.name.replace(/\.(png|svg)$/i,`_${Number(d.widthCm.toFixed(2))}cm${svg?'':'_'+Math.round(d.dpi)+'ppp'}.$1`);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);trackTool(config.id==='remove'?'editor':config.id,'export');dialog.close();
   const status=document.querySelector('#status,#premiumStatus,#effectStatus,#extractStatus,#textStatus,#vectorStatus,#analyzerStatus,#cropStatus,#upscaleStatus,#mockupStatus,#sheetStatus');if(status)status.textContent=`Descarga preparada · ${d.widthCm} × ${(d.widthCm/info.aspect).toFixed(2)} cm${svg?'':' · '+Math.round(d.dpi)+' ppp'}.`;
  }catch(error){$('info').textContent=error.message||'No se pudo exportar. Prueba en una computadora o reduce la resolución.';}finally{exporting=false;$('cancel').disabled=false;$('cancel').textContent='Cancelar';$('confirm').disabled=false;$('progress').hidden=true;}
 };
 for(const button of buttons)button.addEventListener('click',event=>{if(button.disabled)return;event.preventDefault();event.stopImmediatePropagation();open(button);},true);
}
