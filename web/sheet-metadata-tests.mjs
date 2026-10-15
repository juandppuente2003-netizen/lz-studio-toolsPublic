import assert from 'node:assert/strict';
import {imagePrintSize} from './web/image-print-size.js';
import {pngBlobDensity} from './web/png.js';
import {createRequire} from 'node:module';
const native=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('@napi-rs/canvas');
const canvas=native.createCanvas(300,600),png=new Blob([canvas.toBuffer('image/png')]);
const physical=await imagePrintSize(await pngBlobDensity(png,300),300,600);
assert.ok(Math.abs(physical.widthCm-2.54)<.001);assert.ok(Math.abs(physical.heightCm-5.08)<.001);
assert.equal(await imagePrintSize(png,300,600),null,'pixels alone do not invent cm');
const chunk=new Uint8Array(21);new DataView(chunk.buffer).setUint32(0,9);chunk.set(new TextEncoder().encode('pHYs'),4);new DataView(chunk.buffer).setUint32(8,300);new DataView(chunk.buffer).setUint32(12,300);
const unitless=new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk]);assert.equal(await imagePrintSize(unitless,300,600),null,'PNG density unit zero is aspect only');
function jpeg(segment,marker=0xe0){const length=segment.length+2;return new Blob([new Uint8Array([255,216,255,marker,length>>8,length&255]),segment,new Uint8Array([255,217])]);}
const jfif=new Uint8Array([74,70,73,70,0,1,2,1,1,44,1,44,0,0]);const jp=await imagePrintSize(jpeg(jfif),300,600);assert.equal(jp.widthCm,2.54);assert.equal(jp.heightCm,5.08);jfif[7]=0;assert.equal(await imagePrintSize(jpeg(jfif),300,600),null);
function tiff(le,unit,orientation){const b=new Uint8Array(78),v=new DataView(b.buffer);b[0]=b[1]=le?73:77;v.setUint16(2,42,le);v.setUint32(4,8,le);v.setUint16(8,4,le);const tags=[[0x11a,5,62],[0x11b,5,70],[0x128,3,unit],[0x112,3,orientation]];tags.forEach(([tag,type,value],i)=>{const p=10+i*12;v.setUint16(p,tag,le);v.setUint16(p+2,type,le);v.setUint32(p+4,1,le);if(type===3)v.setUint16(p+8,value,le);else v.setUint32(p+8,value,le);});v.setUint32(62,300,le);v.setUint32(66,1,le);v.setUint32(70,150,le);v.setUint32(74,1,le);return b;}
for(const le of [false,true]){const b=tiff(le,2,1),exif=await imagePrintSize(jpeg(new Uint8Array([...new TextEncoder().encode('Exif\0\0'),...b]),0xe1),300,600);assert.equal(exif.widthCm,2.54);assert.equal(exif.heightCm,10.16);}
const rotated=await imagePrintSize(jpeg(new Uint8Array([...new TextEncoder().encode('Exif\0\0'),...tiff(true,2,6)]),0xe1),600,300);assert.equal(rotated.widthCm,10.16);assert.equal(rotated.heightCm,2.54);
const webpHeader=new Uint8Array(20);webpHeader.set(new TextEncoder().encode('RIFF'));new DataView(webpHeader.buffer).setUint32(4,90,true);webpHeader.set(new TextEncoder().encode('WEBPEXIF'),8);new DataView(webpHeader.buffer).setUint32(16,78,true);const webp=await imagePrintSize(new Blob([webpHeader,tiff(true,3,1)]),300,600);assert.equal(webp.widthCm,1);assert.equal(webp.heightCm,4);
assert.equal(await imagePrintSize(jpeg(new Uint8Array([1,2,3]),0xe1),300,600),null,'malformed optional EXIF falls back to explicit size');
console.log('PASS physical-size metadata: PNG pHYs, unitless/missing density, JPEG JFIF, little/big-endian EXIF, rotation, centimetre units, WebP EXIF and malformed data.');
