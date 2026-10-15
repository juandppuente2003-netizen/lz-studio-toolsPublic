import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
await rm('web/account',{recursive:true,force:true});
await build({entryPoints:['src/account-page.js','src/account-nav.js','src/workspace.js'],bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',outdir:'web/account',entryNames:'[name]',chunkNames:'shared-[hash]',minify:true,logLevel:'info'});
