import {client,configured,syncServerSession,rememberSession,setRememberSession} from './account-client.js';

export function authError(error){
 const text=(error?.message||'')+' '+(error?.code||'');
 if(/invalid login credentials/i.test(text))return 'El correo o la contraseña son incorrectos.';
 if(/email not confirmed/i.test(text))return 'Tu cuenta está pendiente de confirmar el correo. Revisa tu bandeja y Spam.';
 if(/not authorized|email address not authorized|email_address_not_authorized/i.test(text))return 'El envío de correos aún está limitado a las cuentas de prueba. El administrador debe revisar la configuración del correo.';
 if(/rate limit|too many|over_email_send_rate_limit/i.test(text))return 'Se alcanzó el límite temporal de correos. Espera unos minutos antes de solicitar otro.';
 if(/already registered|user_already_exists/i.test(text))return 'Ese correo ya tiene una cuenta. Inicia sesión o pulsa «Olvidé mi contraseña».';
 if(/password/i.test(text))return 'La contraseña debe tener al menos 8 caracteres y cumplir los requisitos de seguridad.';
 if(/failed to fetch|network|timeout|timed out/i.test(text))return 'No pudimos confirmar la respuesta del servidor. Revisa tu conexión e intenta iniciar sesión antes de volver a registrarte.';
 return error?.message||'No pudimos completar la solicitud. Intenta de nuevo.';
}

export function mountAuth(container,{onSuccess=()=>{},mode='login'}={}){
 container.innerHTML=`<div class="auth-tabs" role="tablist" aria-label="Acceso"><button type="button" role="tab" data-mode="login">Iniciar sesión</button><button type="button" role="tab" data-mode="register">Registrarse</button></div><h2 class="auth-title"></h2><p class="auth-intro"></p><form class="auth-form"><div class="auth-name"><label>Nombre<input name="full_name" autocomplete="name" maxlength="120"></label></div><label class="auth-email">Correo electrónico<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="tu@correo.com"></label><label class="auth-password">Contraseña<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><label class="auth-confirm">Confirmar contraseña<input name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128"></label><label class="auth-remember"><input name="remember" type="checkbox" checked> Mantener sesión iniciada</label><p class="account-hint auth-password-hint">Usa al menos 8 caracteres.</p><button class="account-primary auth-submit" type="submit">Iniciar sesión</button></form><button type="button" class="auth-forgot">Olvidé mi contraseña</button><button type="button" class="auth-back" hidden>Volver a iniciar sesión</button><p class="auth-message" role="status" aria-live="polite" tabindex="-1"></p><div class="auth-delivery" hidden><p class="account-hint">La cuenta necesita confirmar su correo antes de entrar. Si no llega el mensaje, revisa Spam. Reenviar una confirmación no crea otra cuenta.</p><button type="button" class="auth-resend">Reenviar confirmación</button><button type="button" class="auth-check-login">Ya confirmé mi correo</button></div><p class="account-hint auth-free">Cuenta gratuita. Todas las herramientas están incluidas.</p>`;
 const $=s=>container.querySelector(s),form=$('.auth-form'),fields=form.elements;
 let current,working=false,pendingEmail='',lastEmailRequest=0;
 const notify=text=>{$('.auth-message').textContent=text;$('.auth-message').focus();};
 const busy=value=>{working=value;for(const button of container.querySelectorAll('button'))button.disabled=value;};
 function setMode(next){
  current=next;pendingEmail='';$('.auth-message').textContent='';$('.auth-delivery').hidden=true;form.hidden=false;form.reset();
  $('.auth-remember').hidden=!['login','register'].includes(next);fields.remember.checked=rememberSession();
  $('.auth-tabs').hidden=next==='update';$('.auth-name').hidden=next!=='register';fields.full_name.required=next==='register';
  $('.auth-email').hidden=next==='update';fields.email.required=next!=='update';$('.auth-password').hidden=next==='reset';fields.password.required=next!=='reset';
  fields.password.autocomplete=next==='login'?'current-password':'new-password';fields.password.minLength=next==='login'?1:8;
  $('.auth-confirm').hidden=!['register','update'].includes(next);fields.confirm.required=['register','update'].includes(next);
  $('.auth-password-hint').hidden=!['register','update'].includes(next);$('.auth-forgot').hidden=next!=='login';$('.auth-back').hidden=!['reset','update'].includes(next);$('.auth-free').hidden=next==='update';
  $('.auth-title').textContent={login:'Iniciar sesión',register:'Crea tu cuenta gratis',reset:'Recuperar contraseña',update:'Elige una nueva contraseña'}[next];
  $('.auth-intro').textContent={login:'Entra con tu correo y contraseña.',register:'Regístrate para usar todas las herramientas.',reset:'Te enviaremos un enlace para elegir una nueva contraseña.',update:'Guarda tu contraseña para volver a entrar a tu cuenta.'}[next];
  $('.auth-submit').textContent={login:'Iniciar sesión',register:'Crear cuenta gratis',reset:'Enviar enlace',update:'Guardar contraseña'}[next];
  for(const tab of container.querySelectorAll('[data-mode]')){tab.setAttribute('aria-selected',String(tab.dataset.mode===next));tab.tabIndex=tab.dataset.mode===next?0:-1;}
 }
 for(const tab of container.querySelectorAll('[data-mode]')){
  tab.onclick=()=>setMode(tab.dataset.mode);
  tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=current==='login'?'register':'login';setMode(next);$(`[data-mode="${next}"]`).focus();}};
 }
 $('.auth-forgot').onclick=()=>setMode('reset');$('.auth-back').onclick=()=>setMode('login');
 $('.auth-check-login').onclick=()=>{const email=pendingEmail;setMode('login');fields.email.value=email;fields.password.focus();};
 form.addEventListener('invalid',event=>{const field=event.target;notify(field.name==='password'&&field.validity.tooShort?'La contraseña debe tener al menos 8 caracteres.':field.validationMessage||'Revisa los campos antes de continuar.');},true);
 $('.auth-resend').onclick=async()=>{
  if(working||!pendingEmail)return;
  const remaining=Math.ceil((60000-(Date.now()-lastEmailRequest))/1000);
  if(remaining>0){notify(`Espera ${remaining} segundos antes de reenviar la confirmación.`);return;}
  busy(true);notify('Solicitando otro correo…');
  try{const {error}=await client.auth.resend({type:'signup',email:pendingEmail,options:{emailRedirectTo:new URL('account.html',location.href).href}});if(error)throw error;lastEmailRequest=Date.now();notify('Solicitamos otro correo de confirmación para '+pendingEmail+'. Si tampoco llega, el administrador debe revisar el servicio de correo.');}catch(error){notify(authError(error));}finally{busy(false);}
 };
 form.onsubmit=async event=>{
  event.preventDefault();if(working)return;
  const email=fields.email.value.trim(),password=fields.password.value;
  if(['register','update'].includes(current)&&password!==fields.confirm.value){notify('Las contraseñas no coinciden.');return;}
  if(!configured){notify('Las cuentas no están disponibles en este momento.');return;}
  busy(true);const active=current;notify('Procesando…');
  try{
   let result;const callback=new URL('account.html',location.href);
   if(['login','register'].includes(active))setRememberSession(fields.remember.checked);
   if(active==='login')result=await client.auth.signInWithPassword({email,password});
   else if(active==='register')result=await client.auth.signUp({email,password,options:{data:{full_name:fields.full_name.value.trim()},emailRedirectTo:callback.href}});
   else if(active==='reset')result=await client.auth.resetPasswordForEmail(email,{redirectTo:callback.href});
   else result=await client.auth.updateUser({password});
   if(result.error)throw result.error;
   fields.password.value='';fields.confirm.value='';
   if(active==='reset')notify('Si ese correo tiene una cuenta, solicitamos un enlace para recuperar la contraseña. Revisa también Spam.');
   else if(active==='register'&&!result.data.session){
    if(Array.isArray(result.data.user?.identities)&&result.data.user.identities.length===0){setMode('login');fields.email.value=email;notify('Ese correo ya tiene una cuenta. Inicia sesión o pulsa «Olvidé mi contraseña» para establecer tu contraseña.');}
    else{pendingEmail=email;lastEmailRequest=Date.now();form.hidden=true;$('.auth-title').textContent='Confirma tu correo';$('.auth-intro').textContent=email;$('.auth-delivery').hidden=false;notify('Solicitud de registro recibida. Falta confirmar tu correo para activar el acceso.');}
   }else{
    const {data}=await client.auth.getSession();await syncServerSession(data.session);notify(active==='update'?'Contraseña guardada.':'Sesión iniciada.');await onSuccess();
   }
  }catch(error){notify(authError(error));}finally{busy(false);}
 };
 setMode(mode);return {setMode};
}
