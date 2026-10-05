import {readFile,readdir,mkdir,rm,copyFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import './build-accounts.mjs';
const publicScripts=new Set(['/home.js','/account/account-nav.js','/account/account-page.js']);
// Auth bundles use shared chunks; the app modules themselves remain protected.
const assets={};
async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const relative=prefix+'/'+entry.name;if(entry.isDirectory())await walk(dir+'/'+entry.name,relative);else{
 const ext=entry.name.split('.').pop();
 if(['html','js','mjs'].includes(ext)){
  const body=await readFile(dir+'/'+entry.name,'utf8');assets[relative]={body,type:ext==='html'?'text/html; charset=utf-8':'text/javascript; charset=utf-8',public:relative==='/index.html'||relative==='/account.html'||relative==='/auth-config.js'||relative.startsWith('/account/')||publicScripts.has(relative)};
 }else{await mkdir('dist/client'+prefix,{recursive:true});await copyFile(dir+'/'+entry.name,'dist/client'+relative);}
}}}
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await walk('web');
await writeFile('dist/server/asset-map.js','export const assets='+JSON.stringify(assets)+';\n');
await writeFile('dist/server/entry.js',"import {assets} from './asset-map.js'; import {createHandler} from '../../worker/account-worker.js'; export default createHandler({assets});\n");
await build({entryPoints:['dist/server/entry.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',minify:true,logLevel:'info'});
await rm('dist/server/entry.js');await rm('dist/server/asset-map.js');await mkdir('dist/.openai',{recursive:true});// Sites hosting metadata is optional for independent Vercel builds.
try {
 await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
} catch (error) {
 if (error.code !== 'ENOENT') throw error;
}

console.log('Built server-protected tools; public assets contain no tool HTML or processing scripts.');
