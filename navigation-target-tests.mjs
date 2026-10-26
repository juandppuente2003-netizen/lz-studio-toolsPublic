import assert from 'node:assert/strict';
import {safeNavigationTarget,canReturnToTarget} from './src/navigation-target.js';
const routes={editor:'editor.html',remove:'editor.html?tool=remove'},state={profile:{blocked:false},tools:[{id:'editor',enabled:true}]};
for(const target of ['box/index.html','box/index.html?celular=1','dtf.html','editor.html?tool=remove']){assert.equal(safeNavigationTarget(target,routes),target);assert.equal(canReturnToTarget(target,state,routes),true);}
for(const value of ['https://evil.example','//evil.example','../admin','javascript:alert(1)'])assert.equal(safeNavigationTarget(value,routes),'dtf.html');
assert.equal(canReturnToTarget('box/index.html',{...state,profile:{blocked:true}},routes),false);assert.equal(canReturnToTarget('box/index.html',null,routes),false);
assert.equal(canReturnToTarget('editor.html',{...state,tools:[{id:'editor',enabled:false}]},routes),false);
console.log('PASS: Box/catalog/tool returns, blocked accounts, disabled tools and redirect allowlist');
