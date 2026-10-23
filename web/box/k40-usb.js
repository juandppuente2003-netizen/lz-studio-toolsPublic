// Open/claim a CH341 session without vendor requests, EGV or laser commands.
export const M2_USB_FILTER={vendorId:0x1a86,productId:0x5512};
export async function connectM2USB(usb){
 if(!usb?.requestDevice)throw Error('Este navegador no ofrece WebUSB. Abre esta página HTTPS en Chrome o Edge de escritorio.');
 let device,claimed=false,iface,selected=false;
 async function disconnect(){if(claimed){await device.releaseInterface(iface.interfaceNumber).catch(()=>{});claimed=false;}if(device?.opened)await device.close();}
 try{
  device=await usb.requestDevice({filters:[{...M2_USB_FILTER}]});selected=true;
  if(device.vendorId!==M2_USB_FILTER.vendorId||device.productId!==M2_USB_FILTER.productId)throw Error('El dispositivo seleccionado no es el CH341 esperado.');
  await device.open();
  if(!device.configuration){const config=device.configurations?.[0];if(!config)throw Error('El USB no expone una configuración accesible.');await device.selectConfiguration(config.configurationValue);}
  iface=device.configuration.interfaces.find(i=>i.alternates?.some(a=>a.endpoints?.some(e=>e.type==='bulk'&&e.direction==='out')&&a.endpoints.some(e=>e.type==='bulk'&&e.direction==='in')));
  if(!iface)throw Error('No se encontró la interfaz USB de datos esperada.');
  await device.claimInterface(iface.interfaceNumber);claimed=true;
  return {device,disconnect,info:{name:device.productName||'CH341',vendorId:device.vendorId,productId:device.productId,interfaceNumber:iface.interfaceNumber}};
 }catch(error){
  await disconnect().catch(()=>{});
  if(error.name==='NotFoundError'&&!selected)throw Error('No seleccionaste un USB. Comprueba el cable y que la máquina esté encendida; selecciona su nombre en la ventana de Chrome y pulsa Conectar.');
  if(error.name==='NotFoundError'||error.name==='SecurityError'||error.name==='NetworkError'||error.name==='InvalidStateError')throw Error('El navegador no pudo abrir el USB. Cierra Sagaon y el conector local. En Windows WebUSB requiere un driver compatible con WinUSB; esta prueba no instala ni cambia controladores.');
  throw error;
 }
}
export async function probeM2USB(usb){
 const session=await connectM2USB(usb);
 try{return session.info;}finally{await session.disconnect();}
}
