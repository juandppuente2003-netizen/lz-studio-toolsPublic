import {client,configured,syncServerSession,parseReturn} from './account-client.js';
import {mountAuth} from './auth-ui.js';
// Botón de cuenta y acceso a herramientas. Este módulo nunca debe bloquear los controles públicos:
// la sesión se consulta en segundo plano y cualquier fallo deja el botón en «Iniciar sesión».
if(!document.querySelector('link[href="account.css"],link[href="../account.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../account.css',import.meta.url).href;document.head.append(css);}
const nav=document.querySelector('[data-account-slot]')||document.querySelector('.topbar');
const current=parseReturn(location.pathname.replace(/^\//,'')+location.search);
if(nav){
 const button=document.createElement('button');button.type='button';button.className='account-link';button.textContent='Iniciar sesión';button.setAttribute('aria-haspopup','dialog');nav.append(button);
 const dialog=document.createElement('dialog');dialog.className='auth-dialog';dialog.setAttribute('aria-labelledby','authDialogTitle');
 dialog.innerHTML='<button class="auth-close" type="button" aria-label="Cerrar">×</button><div class="auth-request" hidden><span class="auth-request-label">Herramienta solicitada</span><strong id="authDialogTitle"></strong><p>Esta herramienta requiere una cuenta gratuita. Inicia sesión o regístrate y continuarás en ella.</p></div><div class="auth-content"></div>';
 document.body.append(dialog);
 let opener=null,pending=null,signedIn=false,ready=!configured;
 const close=()=>dialog.close();
 dialog.querySelector('.auth-close').onclick=close;
 dialog.addEventListener('close',()=>{pending=null;opener?.focus?.();opener=null;});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 const open=(target,source)=>{pending=target;opener=source||document.activeElement;const request=dialog.querySelector('.auth-request');request.hidden=!target;dialog.querySelector('#authDialogTitle').textContent=target?target.name:'Acceso a LZ Studio Tools';if(!target)dialog.setAttribute('aria-label','Acceso a LZ Studio Tools');else dialog.removeAttribute('aria-label');dialog.showModal();};
 mountAuth(dialog.querySelector('.auth-content'),{onSuccess:async()=>{const target=pending;pending=null;if(target){location.href=new URL(target.href,location.origin+'/').href;return;}dialog.close();location.reload();}});
 button.onclick=()=>{if(signedIn)location.href=new URL('/account.html',location.origin).href;else open(null,button);};
 const setSignedIn=value=>{signedIn=value;button.textContent=value?'Mi cuenta':'Iniciar sesión';button.classList.toggle('signed-in',value);};
 const leaveTool=()=>{if(current)location.replace('/account.html?return='+encodeURIComponent(current.href));};
 // Solo salimos de una herramienta si no hay sesión o el servidor la rechaza; un fallo de red no interrumpe el trabajo.
 const update=async session=>{setSignedIn(Boolean(session));if(!configured)return;try{await syncServerSession(session);}catch(error){if(error.status===401||error.status===403)setSignedIn(false);}if(!signedIn)leaveTool();};
 // Interceptar enlaces a herramientas protegidas para explicar antes de pedir la cuenta.
 document.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(!a||signedIn||!ready||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;let url;try{url=new URL(a.href,location.href);}catch{return;}if(url.origin!==location.origin)return;const target=parseReturn(url.pathname.replace(/^\//,'')+url.search);if(!target)return;event.preventDefault();open(target,a);});
 if(configured){
  (async()=>{try{const {data}=await client.auth.getSession();await update(data.session);}catch{setSignedIn(false);}ready=true;client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>update(session),0);});if(current)setInterval(async()=>{try{const {data}=await client.auth.getSession();await update(data.session);}catch{}},60000);})();
 }
}
