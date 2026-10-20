import assert from 'node:assert/strict';
import {processPixels,printableLimits,limitCoverage} from './web/processor.js';

// Uniform gray patch in luminosity mode: coverage equals the gray level.
const W=240,H=240,ppcm=118.11; // 300 ppp
const patch=gray=>{const d=new Uint8ClampedArray(W*H*4);for(let i=0;i<d.length;i+=4){d[i]=d[i+1]=d[i+2]=gray;d[i+3]=255}return d};
const base={removeColor:'#000000',fromColor:'#ffffff',toColor:'#ffffff',halftoneColor:'#000000',removeTolerance:0,softness:0,recolorTolerance:0,removeOn:false,cleanupOn:false,recolorOn:false,keepShading:false,halftoneOn:true,halftoneMode:'luma',halftoneRange:45,shape:'circle',lpi:25,angle:45,coverage:100,dualHalftone:false,lpi2:25,angle2:105};
const coverage=d=>{let on=0;for(let i=3;i<d.length;i+=4)on+=d[i]/255;return on/(W*H)};

// Defaults leave the screen untouched.
const neutral=printableLimits(base);assert.equal(neutral.minCov,0);assert.equal(neutral.maxCov,1);assert.equal(limitCoverage(.03,neutral),.03);

// 25 LPI → 1.016 mm cell; a 0.5 mm dot is ~19 % coverage.
const limits=printableLimits({...base,minDotMm:.5,minHoleMm:.3});assert.ok(Math.abs(limits.cellMm-1.016)<1e-9);assert.ok(Math.abs(limits.minCov-.19)<.01);assert.ok(Math.abs(limits.maxCov-(1-.0684))<.01);

const light=30; // ~12 % coverage, below the 0.5 mm minimum
const plain=coverage(processPixels(patch(light),W,H,base,ppcm));assert.ok(plain>.08&&plain<.16,'baseline keeps small dots: '+plain);
const dropped=coverage(processPixels(patch(light),W,H,{...base,minDotMm:.5,minDotMode:'drop'},ppcm));assert.equal(dropped,0,'dots under the minimum are removed');
const grown=coverage(processPixels(patch(light),W,H,{...base,minDotMm:.5,minDotMode:'grow'},ppcm));assert.ok(Math.abs(grown-limits.minCov)<.03,'dots grow to the minimum printable size: '+grown);
const dark=245; // ~96 % coverage → holes smaller than 0.3 mm
const filled=coverage(processPixels(patch(dark),W,H,{...base,minHoleMm:.3},ppcm));assert.equal(filled,1,'holes under the minimum become solid');
const keep=coverage(processPixels(patch(128),W,H,{...base,minDotMm:.5,minHoleMm:.3},ppcm));assert.ok(Math.abs(keep-.5)<.04,'mid tones are not affected: '+keep);

// Export stays binary; the reduced preview shows partial coverage per pixel.
const binary=processPixels(patch(128),W,H,base,30);assert.ok([...binary].every((v,i)=>i%4!==3||v===0||v===255));
const smooth=processPixels(patch(128),W,H,{...base,previewSamples:3},30);assert.ok([...smooth].some((v,i)=>i%4===3&&v>0&&v<255),'preview anti-aliasing');
assert.ok(Math.abs(coverage(smooth)-coverage(binary))<.03,'anti-aliasing preserves tone');
console.log('PASS: printable dot/hole limits in mm (drop, grow, fill), neutral defaults, binary export and tone-preserving anti-aliased preview.');

// Premium: configurable screen with the tested defaults (25 LPI · circles · range 30) and strict whitelisting.
const {premiumParams}=await import('./web/premium-engine.js');
const def=premiumParams('#000000',28,300);assert.deepEqual([def.lpi,def.shape,def.halftoneRange,def.angle],[25,'circle',30,45]);
const custom=premiumParams('#000000',28,300,{lpi:'35',shape:'diamond',halftoneRange:'40',angle:'22.5'});assert.deepEqual([custom.lpi,custom.lpi2,custom.shape,custom.halftoneRange,custom.angle],[35,35,'diamond',40,22.5]);
const junk=premiumParams('#000000',28,300,{lpi:'7',shape:'star',halftoneRange:'500',angle:'33'});assert.deepEqual([junk.lpi,junk.shape,junk.halftoneRange,junk.angle],[25,'circle',30,45],'unknown values fall back to defaults');
console.log('PASS: Premium screen options keep the 25/30 defaults and reject unsupported values.');
