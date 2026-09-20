/** Same-machine before/after acceptance with output equality as a mandatory gate. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),get=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const root=path.resolve(import.meta.dirname,'..'),baseline=get('--baseline');
if(!baseline)throw Error('--baseline must name an isolated checkout');
const out=path.resolve(get('--output','artifacts/performance-comparison'));
await fs.mkdir(out,{recursive:true});
for(const name of ['before.json','after.json','comparison.json']){try{await fs.stat(path.join(out,name));throw Error('Refusing stale benchmark output: '+out);}catch(e){if(e.code!=='ENOENT')throw e;}}
const repeats=get('--repeats','3'),warmups=get('--warmups','1');
for(const [name,checkout]of [['before',path.resolve(baseline)],['after',root]]){
    const command=['--expose-gc',...(args.includes('--profile')?['--cpu-prof','--cpu-prof-dir='+out,'--cpu-prof-name='+name+'.cpuprofile']:[]),path.join(root,'scripts/benchmark-performance.mjs'),'--root',checkout,'--repeats',repeats,'--warmups',warmups,'--label',name,'--case',get('--case','all'),'--output',path.join(out,name+'.json')];
    const result=spawnSync(process.execPath,command,{cwd:root,stdio:'inherit',timeout:600000});
    if(result.error||result.status!==0)throw result.error||Error(name+' benchmark failed');
}
const before=JSON.parse(await fs.readFile(path.join(out,'before.json'))),after=JSON.parse(await fs.readFile(path.join(out,'after.json')));
if(before.cases.length!==after.cases.length||before.node!==after.node)throw Error('Benchmark environments differ');
const cases=before.cases.map((a,i)=>{const b=after.cases[i];if(a.name!==b.name||a.digest!==b.digest||a.count!==b.count||a.rawDigest!==b.rawDigest)throw Error('Output equality failed: '+a.name);return {name:a.name,beforeMs:a.medianMs,afterMs:b.medianMs,speedup:a.medianMs/b.medianMs,digest:a.digest,rawDigest:b.rawDigest,count:a.count,beforeSamplesMs:a.samplesMs,afterSamplesMs:b.samplesMs};});
const report={schema:'revector.performance-comparison/1',passed:true,comparedAt:new Date().toISOString(),node:before.node,cpu:before.cpu,platform:before.platform,repeats:before.repeats,warmups:before.warmups,cases,qualification:'Authored fixed workloads; no user-supplied slow PDFs and no OCR invoked. Full correctness hashing is inside each timing. Raw PDF SHA-256 matches across checkouts; stable per-repeat digests normalize only PDF.js per-instance source.ref hashes. RSS is cumulative per process, not per-case retained memory. Timing ratios are reported, not fragile CI assertions.'};
await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(out,'comparison.md'),'# Same-machine conversion performance\n\n| Workload | Before (ms) | After (ms) | Speedup |\n|---|---:|---:|---:|\n'+cases.map(c=>`| ${c.name} | ${c.beforeMs.toFixed(1)} | ${c.afterMs.toFixed(1)} | ${c.speedup.toFixed(2)}× |`).join('\n')+'\n\n'+report.qualification+'\n');
console.log('PASS:',cases.length,'before/after output hashes and counts match');
