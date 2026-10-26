// Hands control back to the page without waiting for the next frame. Frames stop
// in background tabs, which used to pause long processes until the tab was visible.
export function yieldToPage(){return new Promise(resolve=>{if(typeof MessageChannel==='undefined'){setTimeout(resolve,0);return;}const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();resolve();};channel.port2.postMessage(0);});}
// Yield at most every `budget` ms so the page stays responsive without slowing the work.
export function yielder(budget=40){let last=performance.now();return async()=>{if(performance.now()-last<budget)return;await yieldToPage();last=performance.now();};}
