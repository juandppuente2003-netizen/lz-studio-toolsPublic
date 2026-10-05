import assert from 'node:assert/strict';
import {contentBounds,clampCrop} from './web/crop-engine.js';
const pixels=new Uint8ClampedArray(8*6*4);for(let y=1;y<=4;y++)for(let x=2;x<=5;x++)pixels[(y*8+x)*4+3]=255;
assert.deepEqual(contentBounds(pixels,8,6),{x:2,y:1,width:4,height:4});
pixels[(0*8+0)*4+3]=1;assert.deepEqual(contentBounds(pixels,8,6),{x:0,y:0,width:6,height:5},'even nearly transparent artwork is retained');
pixels.fill(0);pixels[0]=255;assert.equal(contentBounds(pixels,8,6),null,'transparent RGB does not produce fake artwork bounds');
for(let i=3;i<pixels.length;i+=4)pixels[i]=255;assert.deepEqual(contentBounds(pixels,8,6),{x:0,y:0,width:8,height:6},'opaque backgrounds require manual cropping');
assert.deepEqual(clampCrop({x:-20,y:-1,width:100,height:100},8,6),{x:0,y:0,width:8,height:6});assert.deepEqual(clampCrop({x:20,y:20,width:0,height:0},8,6),{x:7,y:5,width:1,height:1});assert.throws(()=>clampCrop({x:NaN,y:0,width:1,height:1},8,6));
console.log('PASS: transparent margins, faint edge pixels, invisible RGB, fully transparent images, opaque manual crop, edge clamping and minimum one-pixel selection.');
