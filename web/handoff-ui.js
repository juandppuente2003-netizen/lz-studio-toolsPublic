import {DESTINATIONS,saveTransfer,readTransfer,removeTransfer} from './handoff-store.js';

export function setupImageHandoff(config,controls){
  const dialog=document.createElement('dialog');dialog.className='lz-transfer-dialog';
  dialog.innerHTML='<form method="dialog"><button class="lz-transfer-close" aria-label="Cerrar">×</button></form><span class="eyebrow">SIGUE CREANDO</span><h2>Continuar en otra herramienta</h2><p>Envía el resultado con transparencia, sin descargarlo.</p><label>Herramienta de destino<select class="lz-transfer-target"></select></label><p class="lz-transfer-status" role="status" aria-live="polite"></p><div class="lz-transfer-actions"><button class="primary lz-transfer-send">Enviar imagen</button></div>';
  document.body.append(dialog);
  const select=dialog.querySelector('select'),status=dialog.querySelector('.lz-transfer-status'),send=dialog.querySelector('.lz-transfer-send');
  for(const d of DESTINATIONS){if(d[0]===config.id)continue;const option=document.createElement('option');option.value=d[0];option.textContent=d[1];select.append(option)}
  let busy=false;
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
  if(config.exportCurrent){const button=document.createElement('button');button.type='button';button.className='lz-continue';button.textContent='Continuar en…';controls.append(button);button.onclick=()=>{status.textContent=config.id==='sheet'?'Se enviará el diseño seleccionado, sin la cuadrícula del pliego.':config.id==='mockups'?'Se enviará el mockup terminado.':'Se enviará el resultado con los ajustes actuales a resolución de salida.';dialog.showModal()};
    send.onclick=async()=>{
      if(busy)return;busy=true;send.disabled=select.disabled=true;dialog.querySelector('.lz-transfer-close').disabled=true;
      try{status.textContent='Preparando imagen a resolución completa…';const destination=DESTINATIONS.find(d=>d[0]===select.value),artifact=await config.exportCurrent(value=>{status.textContent=`Preparando imagen · ${Math.round(value*100)} %`});
        const token=await saveTransfer(artifact,destination),url=new URL(destination[2],location.href);url.searchParams.set('transfer',token);location.assign(url.href);
      }catch(error){status.textContent=error.message||'No se pudo enviar la imagen. Intenta de nuevo.'}
      finally{busy=false;send.disabled=select.disabled=false;dialog.querySelector('.lz-transfer-close').disabled=false}
    };
  }
  const url=new URL(location.href),token=url.searchParams.get('transfer');
  if(!token||!config.importCurrent)return;
  const target=config.id==='editor'&&['halftone','recolor'].includes(url.searchParams.get('tool'))?url.searchParams.get('tool'):config.id;
  const notice=document.createElement('div');notice.className='lz-transfer-notice';notice.setAttribute('role','status');controls.parentElement.before(notice);
  const receive=async()=>{notice.textContent='Recibiendo imagen…';try{
    const packet=await readTransfer(token,target),image=await createImageBitmap(packet.blob);
    const matches=image.width===packet.width&&image.height===packet.height;image.close();if(!matches)throw Error('El tamaño recibido no coincide con el resultado. Vuelve a enviarlo.');
    applyTransferMeasure(config.id,packet);
    if(await config.importCurrent(packet.blob,packet.name,packet)!==true)throw Error('No se pudo cargar la imagen en esta herramienta. Intenta recibirla de nuevo.');
    // Only consume after the target confirms successful decoding/adoption.
    try{await removeTransfer(token)}catch{}url.searchParams.delete('transfer');history.replaceState(null,'',url.href);
    notice.textContent=`Imagen recibida · ${packet.width.toLocaleString()} × ${packet.height.toLocaleString()} px. Continúa con tus ajustes.`;
    document.querySelector('.lz-mobile-switch [data-pane="view"]')?.click();
  }catch(error){notice.textContent=error.message;const retry=document.createElement('button');retry.textContent='Reintentar';retry.onclick=receive;notice.append(retry)}};
  void receive();
}
export function applyTransferMeasure(id,packet){
  const pairs=id==='editor'?['widthCm','dpi']:['color','opacity','texture','thickness'].includes(id)?['effectWidth','effectDpi']:id==='analyzer'?['printWidth']:id==='upscale'?['upscaleDpi']:[];
  for(const field of pairs){const element=document.getElementById(field);if(!element)continue;const value=/Dpi|^dpi$/.test(field)?packet.dpi:packet.widthCm;
    if(element.tagName==='SELECT'){
      if(![...element.options].some(o=>Number(o.value)===value)){const option=document.createElement('option');option.value=String(value);option.textContent=`${Math.round(value*100)/100} ppp · recibido`;element.append(option)}
    }else if(value<Number(element.min||0)||value>Number(element.max||Infinity))throw Error('La medida recibida supera el rango de esta herramienta. Ajusta la salida y vuelve a enviarla.');
    element.value=String(value);
  }
}
