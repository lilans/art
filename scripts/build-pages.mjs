// Only publish website assets. Never upload Worker source, private config or Git metadata.
import {cpSync, mkdirSync, readdirSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=join(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out);
for(const name of readdirSync(root)){
 if(name.endsWith('.html')||name==='favicon.ico'||name==='assets'||name==='narod'){
  cpSync(join(root,name),join(out,name),{recursive:true,filter:p=>!p.split(/[\\/]/).some(n=>n.startsWith('.')||n==='node_modules'||n==='__pycache__')});
 }
}
console.log('Pages static output: dist/');
