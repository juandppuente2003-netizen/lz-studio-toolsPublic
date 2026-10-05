// Scroll the preview only: no image coordinates or export data are changed.
export function setupViewport({wrap,controls,editable=false,canPan=()=>false,onZoom,onFit,zoomButtons=false}) {
  if (!wrap || !controls) return;
  let enabled=!editable,space=false,gesture=null,suppressClick=false,pinch=null;
  const touches=new Map();
  const button=document.createElement('button');
  button.type='button';button.className='viewport-pan';button.textContent='Mover vista';
  button.title='Arrastra con clic izquierdo para recorrer la vista. También puedes mantener Espacio.';
  controls.prepend(button);
  wrap.classList.add('viewport');
  if(onZoom){
    wrap.style.touchAction='none';
    const zoomAt=(factor,x,y)=>{const image=wrap.querySelector('canvas:not([hidden]),img:not([hidden])'),before=image?.getBoundingClientRect(),anchor=before?.width&&before.height?{x:(x-before.left)/before.width,y:(y-before.top)/before.height}:null;onZoom(factor);const after=image?.getBoundingClientRect();if(anchor&&after){wrap.scrollLeft+=after.left+anchor.x*after.width-x;wrap.scrollTop+=after.top+anchor.y*after.height-y;}};
    wrap.addEventListener('wheel',event=>{event.preventDefault();event.stopImmediatePropagation();zoomAt(Math.exp(Math.max(-.3,Math.min(.3,-event.deltaY*.002))),event.clientX,event.clientY);},{capture:true,passive:false});
    if(zoomButtons){for(const [label,factor] of [['−',.8],['+',1.25],['Ajustar',null]]){const zoomButton=document.createElement('button');zoomButton.type='button';zoomButton.textContent=label;zoomButton.setAttribute('aria-label',factor===null?'Ajustar imagen':factor>1?'Acercar imagen':'Alejar imagen');zoomButton.onclick=()=>{if(factor===null)onFit?.();else{const rect=wrap.getBoundingClientRect();zoomAt(factor,rect.left+rect.width/2,rect.top+rect.height/2);}};controls.append(zoomButton);}}
  }
  const geometry=()=>{const [a,b]=[...touches.values()];return {distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
  const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
  const cancelEdits=()=>{for(const [id,p] of touches){if(p.target!==wrap&&typeof PointerEvent!=='undefined')p.target.dispatchEvent(new PointerEvent('pointercancel',{pointerId:id,pointerType:'touch',bubbles:true}));if(p.target.hasPointerCapture?.(id))p.target.releasePointerCapture(id);wrap.setPointerCapture(id);}};

  const refresh=()=>{
    button.setAttribute('aria-pressed',String(enabled));
    wrap.classList.toggle('viewport-hand',enabled||space);
  };
  button.onclick=()=>{enabled=!enabled;refresh()};refresh();
  document.addEventListener('keydown',event=>{
    if(event.code!=='Space'||event.repeat||event.target.closest('input,textarea,select,button,[contenteditable]'))return;
    event.preventDefault();space=true;refresh();
  });
  document.addEventListener('keyup',event=>{if(event.code==='Space'){space=false;refresh()}});
  wrap.addEventListener('pointerdown',event=>{
    if(onZoom&&event.pointerType==='touch'){
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY,target:event.target});
      if(touches.size>=2){if(!pinch){gesture=null;wrap.classList.remove('viewport-panning');cancelEdits();pinch=geometry();}suppressClick=true;consume(event);return;}
    }
    suppressClick=false;
    if(gesture||event.isPrimary===false||![0,1].includes(event.button)||event.target.closest('button,input,select,a'))return;
    // The eyedropper keeps its existing click interaction.
    if(document.body.classList.contains('picking')&&!space&&event.button!==1)return;
    if(!(enabled||space||event.button===1||canPan(event)))return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,left:wrap.scrollLeft,top:wrap.scrollTop,moved:false};
    wrap.setPointerCapture(event.pointerId);wrap.classList.add('viewport-panning');
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  wrap.addEventListener('pointermove',event=>{
    if(touches.has(event.pointerId)){const p=touches.get(event.pointerId);p.x=event.clientX;p.y=event.clientY;}
    if(pinch){
      if(touches.size>=2){const next=geometry(),image=wrap.querySelector('canvas:not([hidden]),img:not([hidden])'),before=image?.getBoundingClientRect();const anchor=before?{x:(pinch.x-before.left)/before.width,y:(pinch.y-before.top)/before.height}:null;
        onZoom(next.distance/pinch.distance);
        const after=image?.getBoundingClientRect();if(anchor&&after&&before.width&&before.height){wrap.scrollLeft+=after.left+anchor.x*after.width-next.x;wrap.scrollTop+=after.top+anchor.y*after.height-next.y;}
        pinch=next;
      }
      consume(event);return;
    }
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(Math.hypot(dx,dy)>3)gesture.moved=true;
    wrap.scrollLeft=gesture.left-dx;wrap.scrollTop=gesture.top-dy;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  const stop=event=>{
    if(event.isTrusted===false&&event.type==='pointercancel')return;
    touches.delete(event.pointerId);
    if(pinch){suppressClick=true;if(wrap.hasPointerCapture(event.pointerId))wrap.releasePointerCapture(event.pointerId);if(touches.size===0)pinch=null;consume(event);return;}
    if(!gesture||event.pointerId!==gesture.id)return;
    suppressClick=gesture.moved;gesture=null;wrap.classList.remove('viewport-panning');
    if(wrap.hasPointerCapture(event.pointerId))wrap.releasePointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  };
  wrap.addEventListener('pointerup',stop,true);wrap.addEventListener('pointercancel',stop,true);
  wrap.addEventListener('lostpointercapture',event=>{if(gesture?.id===event.pointerId){gesture=null;wrap.classList.remove('viewport-panning')}});
  wrap.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation()}},true);
  window.addEventListener('blur',()=>{for(const id of touches.keys())if(wrap.hasPointerCapture(id))wrap.releasePointerCapture(id);touches.clear();pinch=null;space=false;if(gesture){const id=gesture.id;gesture=null;if(wrap.hasPointerCapture(id))wrap.releasePointerCapture(id)}wrap.classList.remove('viewport-panning');refresh()});
}
