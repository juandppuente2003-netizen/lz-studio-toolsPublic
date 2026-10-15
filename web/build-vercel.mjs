import './build-site.mjs';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('api',{recursive:true});
await writeFile('api/site-entry.js',"import handler from '../dist/server/index.js';import {vercelHandler} from '../server/vercel-adapter.js';export default vercelHandler(handler);\n");
try{await build({entryPoints:['api/site-entry.js'],bundle:true,format:'esm',platform:'node',target:'node22',outfile:'api/site.js',minify:true,logLevel:'info'});}finally{await rm('api/site-entry.js',{force:true});}
console.log('Built Vercel Function with protected tool pages and public CSS/binary assets.');
