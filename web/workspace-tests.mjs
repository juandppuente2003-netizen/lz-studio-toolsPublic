import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectSettings,applySettings} from './web/draft-store.js';
// Restoring settings silently must not trigger destructive recalculation of a recovered result.
let changes=0;const fields=[{id:'widthCm',type:'number',value:'28',closest:()=>null,dispatchEvent:()=>changes++},{id:'enabled',type:'checkbox',checked:true,closest:()=>null,dispatchEvent:()=>changes++},{id:'file',type:'file',closest:()=>null}];
const root={querySelectorAll:()=>fields,getElementById:id=>fields.find(f=>f.id===id)};
assert.deepEqual(collectSettings(root),{widthCm:'28',enabled:true});applySettings({widthCm:'7',enabled:false},root,false);assert.equal(fields[0].value,'7');assert.equal(fields[1].checked,false);assert.equal(changes,0);applySettings({widthCm:'30'},root);assert.equal(changes,2);
for(const name of ['app','analyzer','color-app','effects-app','upscale-app','preflight-app','text-creator','mockups','gang-sheet','vectorize']){const code=readFileSync('web/'+name+'.js','utf8');assert.match(code,/onZoom:/,name+' zoom');assert.match(code,/onFit:/,name+' fit');assert.match(code,/getDraft:/,name+' save');assert.match(code,/restoreDraft:/,name+' recover');}
const extract=readFileSync('web/extract-app.js','utf8');assert.equal((extract.match(/zoomButtons:true/g)||[]).length,2,'both extraction panes have visible zoom controls');assert.match(extract,/getDraft:/);assert.match(extract,/restoreDraft:/);
const sql=readFileSync('supabase/usage-statistics.sql','utf8');assert.match(sql,/enable row level security/);assert.match(sql,/security invoker/);assert.match(sql,/if not public.lz_is_admin\(\)/);assert.match(sql,/events_admin_read/);
console.log('PASS: silent settings restoration preserves recovered results, every workspace has zoom and recovery hooks, both extraction views have controls, statistics use admin-only RLS and invoker permissions.');
