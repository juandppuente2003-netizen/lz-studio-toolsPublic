// Catálogo DTF, acceso y contadores (v53).
// Reproduce los fallos de la v52: el catálogo dependía de studio-navigation.js (401 sin sesión) y de la
// cuenta; ahora los controles deben funcionar aunque esos módulos fallen.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const html=readFileSync('web/dtf.html','utf8');
const homeCode=readFileSync('web/home.js','utf8');
async function boot({total=null,remove=[]}={}){
 const dom=new JSDOM(html,{url:'https://www.lzstudiotools.com/dtf.html',runScripts:'outside-only',pretendToBeVisual:true});
 const {window}=dom,doc=window.document;
 for(const id of remove)doc.querySelector(`[data-tool="${id}"]`)?.remove();
 if(total)doc.getElementById('toolCatalog').dataset.toolsTotal=String(total);
 const warnings=[];window.console.warn=(...a)=>warnings.push(a.join(' '));
 // Las importaciones dinámicas fallan como lo haría un 401: el catálogo no debe depender de ellas.
 const code=homeCode.replace(/import\('\.\/studio-navigation\.js'\)/,"Promise.reject(new Error('HTTP 401'))").replace(/import\('\.\/account\/account-nav\.js'\)/,"Promise.reject(new Error('sin servicio de cuenta'))");
 assert.doesNotMatch(code,/^import /m,'home.js no debe tener importaciones estáticas');
 window.eval(code);await new Promise(r=>setTimeout(r,0));
 const $=id=>doc.getElementById(id),visible=()=>[...doc.querySelectorAll('.tool-card')].filter(c=>!c.hidden).map(c=>c.dataset.tool);
 const type=value=>{$('toolSearch').value=value;$('toolSearch').dispatchEvent(new window.Event('input'));};
 return {window,doc,$,visible,type,warnings};
}

// 16 tarjetas configuradas; el servidor quitó 3 desactivadas.
let t=await boot({total:16,remove:['analyzer','extract','vectorize']});
assert.equal(t.visible().length,13);
assert.match(t.$('searchStatus').textContent,/13 herramientas disponibles · 16 en total, 3 desactivadas/);
assert.equal(t.warnings.length,2,'los fallos de módulos secundarios solo se registran');
// Búsqueda «pliego»
t.type('pliego');assert.deepEqual(t.visible(),['sheet']);assert.equal(t.$('clearSearch').hidden,false);assert.equal(t.$('resetFilters').hidden,false);assert.match(t.$('searchStatus').textContent,/^1 de 13/);
// Sin acentos y con sinónimos
t.type('grosor');assert.deepEqual(t.visible(),['thickness']);
t.type('gang sheet');assert.deepEqual(t.visible(),['sheet']);
// Búsqueda inexistente → estado sin resultados
t.type('zzzz');assert.equal(t.visible().length,0);assert.equal(t.$('noTools').hidden,false);assert.match(t.$('noToolsTerm').textContent,/zzzz/);
for(const s of t.doc.querySelectorAll('.tool-section'))assert.equal(s.hidden,true);
// Limpiar búsqueda
t.$('clearSearch').click();assert.equal(t.$('toolSearch').value,'');assert.equal(t.visible().length,13);assert.equal(t.$('noTools').hidden,true);
// Filtros «Creación» y «Pliegos y mockups»
const filter=g=>t.doc.querySelector(`[data-category="${g}"]`);
filter('group-02').click();assert.equal(filter('group-02').getAttribute('aria-pressed'),'true');assert.equal(filter('all').getAttribute('aria-pressed'),'false');assert.deepEqual(t.visible(),['text','texture','recolor']);
filter('group-03').click();assert.deepEqual(t.visible(),['sheet','mockups']);assert.equal(filter('group-02').getAttribute('aria-pressed'),'false');
// Contadores de filtros calculados con las herramientas habilitadas
assert.equal(filter('group-02').querySelector('.filter-count').textContent,'3');assert.equal(filter('all').querySelector('.filter-count').textContent,'13');
// Búsqueda + filtro juntos y restablecer
t.type('semitono');assert.equal(t.visible().length,0);assert.match(t.$('noToolsTerm').textContent,/en esta categoría/);
t.$('noToolsReset').click();assert.equal(t.$('toolSearch').value,'');assert.equal(filter('all').getAttribute('aria-pressed'),'true');assert.equal(t.visible().length,13);assert.equal(t.$('resetFilters').hidden,true);
// Las desactivadas no aparecen en búsquedas
t.type('vectorizar');assert.equal(t.visible().length,0);t.type('');
// Menú «Módulos»: abre, cierra con Escape y devuelve el foco
t.$('menuButton').focus();t.$('menuButton').click();assert.equal(t.$('moduleMenu').hidden,false);assert.equal(t.$('menuButton').getAttribute('aria-expanded'),'true');assert.equal(t.doc.activeElement,t.$('menuClose'));
t.doc.dispatchEvent(new t.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(t.$('moduleMenu').hidden,true);assert.equal(t.doc.activeElement,t.$('menuButton'));
t.$('menuButton').click();t.$('menuBackdrop').click();assert.equal(t.$('moduleMenu').hidden,true);
// Escape en el buscador limpia
t.type('pliego');t.$('toolSearch').dispatchEvent(new t.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(t.$('toolSearch').value,'');
// Recientes: se guarda al abrir y se muestra
t.doc.querySelector('[data-tool="sheet"] .open-tool').addEventListener('click',e=>e.preventDefault());t.doc.querySelector('[data-tool="sheet"] .open-tool').click();
assert.deepEqual(JSON.parse(t.window.localStorage.getItem('lz-recent-tools')),['gang-sheet.html']);
t=await boot();assert.match(t.$('searchStatus').textContent,/^16 herramientas disponibles$/,'sin desactivadas no menciona total');

// Tarjetas: cada una explica qué acepta y qué entrega; las rutas siguen siendo podables por el servidor.
const cards=[...html.matchAll(/<article\b[^>]*class="tool-card"[^>]*>[\s\S]*?<\/article>/g)].map(m=>m[0]);
assert.equal(cards.length,16);for(const c of cards){assert.match(c,/<dt>Acepta<\/dt><dd>[^<]+<\/dd>/);assert.match(c,/<dt>Entrega<\/dt><dd>[^<]+<\/dd>/);assert.match(c,/class="open-tool" href="[^"]+"/);}
assert.equal((html.match(/class="topbar/g)||[]).length,1,'una sola barra superior');assert.doesNotMatch(html,/lz-suite-nav/);

// Destinos después de iniciar sesión: conservan parámetros y Box Studio; rechazan externos.
const clientCode=readFileSync('src/account-client.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const ctx={location:{origin:'https://www.lzstudiotools.com'},URL,AUTH_CONFIG:{},createClient(){},localStorage:{getItem(){return null}},sessionStorage:{}};
const {runInNewContext}=await import('node:vm');runInNewContext(clientCode+';globalThis.api={parseReturn,safeReturn};',ctx);
const {parseReturn,safeReturn}=ctx.api;
assert.equal(parseReturn('editor.html?tool=remove').name,'Quitar fondo color');assert.equal(parseReturn('editor.html?tool=remove').href,'editor.html?tool=remove');
assert.equal(parseReturn('box/index.html').id,'box');assert.equal(parseReturn('gang-sheet.html?x=1#a').href,'gang-sheet.html?x=1#a');
for(const bad of ['https://evil.test/crop.html','//evil.test/crop.html','javascript:alert(1)','account.html','../crop.html?','x'.repeat(700)])assert.equal(safeReturn(bad)==='index.html'||parseReturn(bad)?.page==='crop.html',true,bad);
assert.equal(parseReturn('https://evil.test/crop.html'),null);assert.equal(parseReturn('account.html'),null);

// Servidor: navegación pública, herramientas protegidas y contador de portada desde el panel.
const {createHandler}=await import('./worker/account-worker.js');
const assets={'/dtf.html':{body:html,type:'text/html; charset=utf-8',public:true},'/index.html':{body:readFileSync('web/index.html','utf8'),type:'text/html; charset=utf-8',public:true},'/studio-navigation.js':{body:'',type:'text/javascript',public:true},'/crop-app.js':{body:'',type:'text/javascript',public:false}};
const catalog=[{id:'analyzer',enabled:false},{id:'extract',enabled:false},{id:'vectorize',enabled:false},...['color','crop','editor','mockups','opacity','recolor','sheet','text','texture','thickness','upscale'].map(id=>({id,enabled:true}))];
const app=createHandler({assets,fetchUpstream:async url=>{if(String(url).includes('/lz_tools'))return Response.json(catalog);return new Response('{}',{status:401});}});
let res=await app.fetch(new Request('https://x.test/dtf.html'));let body=await res.text();
assert.equal((body.match(/class="tool-card"/g)||[]).length,13);assert.match(body,/data-tools-total="16"/);assert.doesNotMatch(body,/href="vectorize.html"/);assert.doesNotMatch(body,/href="analyzer.html"/);
res=await app.fetch(new Request('https://x.test/index.html'));body=await res.text();assert.match(body,/13 de 16 herramientas activas/);
res=await app.fetch(new Request('https://x.test/studio-navigation.js'));assert.equal(res.status,200,'navegación pública sin sesión');
res=await app.fetch(new Request('https://x.test/crop-app.js'));assert.equal(res.status,401,'motores siguen protegidos');
console.log('PASS: catálogo sin dependencias bloqueantes, búsqueda, sin resultados, filtros, restablecer, menú con Escape y foco, contadores totales/disponibles, recientes, retorno seguro tras iniciar sesión y contador de portada desde el panel.');
