import {processPixels} from './processor.js';
self.onmessage=({data:m})=>{try{const pixels=new Uint8ClampedArray(m.buffer);processPixels(pixels,m.width,m.height,m.params,m.pixelsPerCm,m.offsetX||0,m.offsetY||0);self.postMessage({buffer:pixels.buffer},[pixels.buffer]);}catch(e){self.postMessage({error:e.message});}};
