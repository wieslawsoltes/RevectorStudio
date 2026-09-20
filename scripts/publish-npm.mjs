#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const ROOT=path.resolve(import.meta.dirname,'..');
const REGISTRY='https://registry.npmjs.org';
/** Validate every tarball before any publication, then order local dependencies first. */
export async function publicationPlan(root=ROOT){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'release/npm/manifest.json'),'utf8'));
 const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
 if(!Array.isArray(manifest)||manifest.length!==16)throw Error('Expected sixteen package archives');
 const names=new Set(),records=[];
 for(const r of manifest){
  if(!/^@revector\/[a-z][a-z-]*$/.test(r.name)||names.has(r.name)||r.version!==version||!/^revector-[a-z-]+-[0-9]+\.[0-9]+\.[0-9]+\.tgz$/.test(r.file))throw Error('Invalid publication manifest');
  names.add(r.name);const bytes=await fs.readFile(path.join(root,'release/npm',r.file));
  if(createHash('sha256').update(bytes).digest('hex')!==r.sha256||'sha512-'+createHash('sha512').update(bytes).digest('base64')!==r.integrity)throw Error('Tarball integrity mismatch: '+r.name);
  const p=JSON.parse(await fs.readFile(path.join(root,'packages',r.name.split('/')[1],'package.json'),'utf8'));
  if(p.name!==r.name||p.version!==version||p.private||p.repository?.url!=='git+https://github.com/wieslawsoltes/RevectorStudio.git')throw Error('Package identity/repository mismatch: '+r.name);
  records.push({...r,dependencies:p.dependencies||{}});
 }
 const order=[],pending=new Map(records.map(r=>[r.name,r]));
 while(pending.size){let progress=false;for(const [name,r] of pending){
  for(const [dep,v] of Object.entries(r.dependencies))if(dep.startsWith('@revector/')&&(!names.has(dep)||v!==version))throw Error('Inconsistent local dependency: '+dep);
  if(Object.keys(r.dependencies).some(d=>pending.has(d)))continue;
  order.push(r);pending.delete(name);progress=true;
 }if(!progress)throw Error('Cyclic package dependencies');}
 return order;
}
async function registryRecord(name,version){
 const response=await fetch(REGISTRY+'/'+encodeURIComponent(name)+'/'+encodeURIComponent(version),{signal:AbortSignal.timeout(30000)});
 if(response.status===404)return null;
 if(!response.ok)throw Error('Registry preflight HTTP '+response.status);
 return await response.json();
}
function npm(args){
 const prefix=process.env.npm_execpath?[process.env.npm_execpath]:[];
 const executable=prefix.length?process.execPath:'npm';
 return new Promise((resolve,reject)=>{const child=spawn(executable,[...prefix,...args],{cwd:ROOT,stdio:'inherit',shell:false});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('npm command failed with exit '+code)));});
}
async function main(){
 const args=process.argv.slice(2);if(args.some(a=>!['--publish','--dry-run'].includes(a))||args.includes('--publish')&&args.includes('--dry-run'))throw Error('Use --dry-run or --publish');
 const publish=args.includes('--publish'),report={schema:'revector.npm-release/1',mode:publish?'publish':'dry-run',registry:REGISTRY,tag:'next',commit:process.env.GITHUB_SHA||null,packages:[],complete:false};
 const destination=path.join(ROOT,'artifacts/npm-publication');await fs.mkdir(destination,{recursive:true});
 try{
  const plan=await publicationPlan();
  // A missing trusted publisher/token will fail at the registry. No credential guessing or fallback scope.
  for(const r of plan){
   const item={name:r.name,version:r.version,integrity:r.integrity,status:'pending'};report.packages.push(item);
   try{
    if(publish){const old=await registryRecord(r.name,r.version);if(old){if(old.dist?.integrity!==r.integrity)throw Error('Immutable registry version differs from verified tarball');item.status='already-published-identical';continue;}}
    await npm(['publish',path.join(ROOT,'release/npm',r.file),'--registry',REGISTRY,'--access','public','--tag','next','--ignore-scripts',...(publish?['--provenance']:['--dry-run'])]);
    if(publish){let found;for(let i=0;i<6;i++){found=await registryRecord(r.name,r.version);if(found?.dist?.integrity===r.integrity)break;await new Promise(r=>setTimeout(r,2500));}if(found?.dist?.integrity!==r.integrity)throw Error('Registry has not confirmed the published tarball integrity');}
    item.status=publish?'published-and-verified':'dry-run-passed';
   }catch(error){item.status='failed';item.error=error.message;throw error;}
  }
  report.complete=true;
 }finally{await fs.writeFile(path.join(destination,'validation.json'),JSON.stringify(report,null,2)+'\n');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error('publication:',error.message);process.exitCode=1;});
