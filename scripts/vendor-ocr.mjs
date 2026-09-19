/** Self-host runtime and language assets: never send PDF bytes to a remote OCR service. */
import { createRequire } from 'node:module';
import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),target=path.join(root,'vendor/ocr');
await mkdir(target,{recursive:true});const manifest={engine:'tesseract.js',version:'7.0.0',languages:['eng','deu','pol'],files:{},packages:{}};
async function put(from,to){const dest=path.join(target,to);await mkdir(path.dirname(dest),{recursive:true});await copyFile(from,dest);const bytes=await readFile(dest);manifest.files[to]={size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
async function packageRoot(name){const file=require.resolve(name+'/package.json'),data=JSON.parse(await readFile(file,'utf8'));manifest.packages[name]={version:data.version,license:data.license};return path.dirname(file);}
async function notices(from,prefix){for(const file of await readdir(from))if(/^(LICENSE|NOTICE|COPYING)/i.test(file))await put(path.join(from,file),path.join('licenses',prefix+'-'+file));}
const js=await packageRoot('tesseract.js'),core=await packageRoot('tesseract.js-core');
for(const name of ['tesseract.esm.min.js','tesseract.min.js','worker.min.js'])await put(path.join(js,'dist',name),name);
for(const name of await readdir(core))if(/^tesseract-core.*\.(wasm|js)$/.test(name))await put(path.join(core,name),path.join('core',name));
await notices(js,'tesseract');await notices(core,'core');
for(const name of await readdir(path.join(js,'dist')))if(name.endsWith('.LICENSE.txt'))await put(path.join(js,'dist',name),name);
await put(path.join(js,'LICENSE.md'),'licenses/tessdata-Apache-2.0.txt');
async function find(dir,file){for(const entry of await readdir(dir,{withFileTypes:true}).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e))){const p=path.join(dir,entry.name);if(entry.isFile()&&entry.name===file)return p;if(entry.isDirectory()){const found=await find(p,file);if(found)return found;}}}
for(const lang of manifest.languages){const dir=await packageRoot('@tesseract.js-data/'+lang),file=await find(path.join(dir,'4.0.0_best_int'),lang+'.traineddata.gz')||await find(dir,lang+'.traineddata.gz');if(!file)throw Error('Missing language data: '+lang);await put(file,'lang/'+lang+'.traineddata.gz');await notices(dir,lang);}
await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Vendored Tesseract.js 7.0.0 and eng/deu/pol language data with SHA-256 inventory.');
