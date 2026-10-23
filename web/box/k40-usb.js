// Compatibility probe only: no vendor requests, EGV or laser commands.
export const M2_USB_FILTER={vendorId:0x1a86,productId:0x5512};
export async function probeM2USB(usb){
 if(!usb?.requestDevice)throw Error('Este navegador no ofrece WebUSB. Abre esta página HTTPS en Chrome o Edge de escritorio.');
 let device,claimed=false,iface;
 try{
  device=await usb.requestDevice({filters:[{...M2_USB_FILTER}]});
  if(device.vendorId!==M2_USB_FILTER.vendorId||device.productId!==M2_USB_FILTER.productId)throw Error('El dispositivo seleccionado no es el CH341 esperado.');
  await device.open();
  if(!device.configuration){const config=device.configurations?.[0];if(!config)throw Error('El USB no expone una configuración accesible.');await device.selectConfiguration(config.configurationValue);}
  iface=device.configuration.interfaces.find(i=>i.alternates?.some(a=>a.endpoints?.some(e=>e.type==='bulk'&&e.direction==='out')&&a.endpoints.some(e=>e.type==='bulk'&&e.direction==='in')));
  if(!iface)throw Error('No se encontró la interfaz USB de datos esperada.');
  await device.claimInterface(iface.interfaceNumber);claimed=true;
  return {name:device.productName||'CH341',vendorId:device.vendorId,productId:device.productId,interfaceNumber:iface.interfaceNumber};
 }catch(error){
  if(error.name==='NotFoundError')throw Error('No seleccionaste un USB. Comprueba el cable y que la máquina esté encendida; vuelve a pulsar Probar USB directo.');
  if(error.name==='SecurityError'||error.name==='NetworkError'||error.name==='InvalidStateError')throw Error('El navegador no pudo abrir el USB. Cierra Sagaon y el conector local. En Windows WebUSB requiere un driver compatible con WinUSB; esta prueba no instala ni cambia controladores.');
  throw error;
 }finally{
  // Leave the device available to the user's existing applications even on error.
  if(claimed)await device.releaseInterface(iface.interfaceNumber).catch(()=>{});
  if(device?.opened)await device.close();
 }
}
