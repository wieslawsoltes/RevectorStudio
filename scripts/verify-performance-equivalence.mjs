/** Differential regression against an explicit, isolated pre-optimization checkout. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const argv=process.argv.slice(2),option=(n,d)=>{const i=argv.indexOf(n);return i<0?d:argv[i+1];};
const baseline=option('--baseline');if(!baseline)throw Error('--baseline checkout is required');
const current=path.resolve(import.meta.dirname,'..'),load=(root,name)=>import(pathToFileURL(path.join(root,'packages',name,'src/index.js')));
const A=await Promise.all(['geometry','model','semantics','cad','dxf','raster'].map(n=>load(baseline,n))),B=await Promise.all(['geometry','model','semantics','cad','dxf','raster'].map(n=>load(current,n)));
const [ga,ma,sa,ca,da,ra]=A,[gb,mb,sb,cb,db,rb]=B;let count=0,seed=19531;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const check=(name,a,b)=>{assert.deepEqual(b,a,name);count++;};
const line=(id,x=0,y=0)=>({id,type:'LINE',layer:'0',start:[x,y],end:[x+4,y+2],color:[1,2,3]});
const outcome=fn=>{try{return {value:fn()};}catch(e){return {error:e.name,message:e.message};}};
const style={stroke:[24,103,151],fill:[40,90,140],lineWidth:1,strokeAlpha:1,fillAlpha:1,dash:[],dashPhase:0};
for(let i=0;i<35;i++){
    const rectangles=Array.from({length:3+i%7},()=>{const x=random()*30,y=random()*30;return ga.rectPath([x,y,x+3+random()*10,y+3+random()*10]);}),clip=[ga.rectPath([5,4,28,25])];
    for(const operation of ['normalize','intersection','union','difference','xor'])for(const subjectRule of ['nonzero','evenodd'])check('Boolean '+i+' '+operation+' '+subjectRule,outcome(()=>ga.booleanPaths(rectangles,clip,{operation,subjectRule})),outcome(()=>gb.booleanPaths(rectangles,clip,{operation,subjectRule})));
}
for(const scale of [1e-5,1,1e5])for(let i=0;i<35;i++){
    const paths=Array.from({length:9},(_,n)=>({start:[n*scale*3,0],segments:[{kind:'C',c1:[n*scale*3+scale,5*scale],c2:[n*scale*3+2*scale,-3*scale],to:[n*scale*3+2*scale,0]}],closed:true}));
    const edge={kind:'C',points:[[0,0],[10*scale,(random()*10-5)*scale],[20*scale,(random()*10-5)*scale],[30*scale,0]]};
    for(const rule of ['evenodd','nonzero'])check('Cubic clipping '+scale+' '+i+' '+rule,outcome(()=>ga.clipCurveToPaths(edge,paths,rule)),outcome(()=>gb.clipCurveToPaths(edge,paths,rule)));
}
for(let trial=0;trial<12;trial++){
    const source=ma.createDocument({entities:Array.from({length:60},(_,i)=>line('e'+i,i,trial))});
    const rules=[{id:'classify',stage:0,run:({document})=>document.entities.map((e,i)=>({id:'p'+i,title:'Classify',members:[e.id],confidence:1,exact:true,proposal:{update:[{id:e.id,patch:{semantic:{value:i}}}],layers:[{name:'L'+i%3,color:[i,1,2]}]}}))},
        {id:'replace',stage:1,run:({document})=>document.entities.slice(0,8).map((e,i)=>({id:'replace'+i,title:'Replace',members:[e.id],confidence:1,exact:true,proposal:{remove:[e.id],add:[line('new'+i,i)],placements:{['new'+i]:e.id},groups:[{name:'g'+i,members:['new'+i] }]}}))},
        {id:'conflict',stage:2,run:()=>[{id:'bad',title:'Bad',members:['new0'],confidence:1,exact:true,proposal:{update:[{id:'new0',patch:{start:[NaN,0]}}]}},{id:'reject',title:'Rejected',members:['new1'],confidence:1,exact:true,proposal:{remove:['new1']}}]}];
    const run=async module=>{const engine=new module.RuleEngine();rules.forEach(r=>engine.register(r));const d=await engine.run(source,{decisions:{reject:'reject'}});delete d.ruleStats;return d;};
    check('Semantic transactions '+trial,await run(sa),await run(sb));
}
for(let trial=0;trial<15;trial++){
    const items=[],forms=[],parent='outer',base=[1,0,0,1,trial,0];
    forms.push({id:parent,transform:base,start:0,end:99});
    for(let i=0;i<12;i++){
        const x=10*i+trial,id='inner'+i;forms.push({id,transform:[1,0,0,1,x,0],start:i*2,end:i*2+1});
        for(let j=0;j<2;j++)items.push({id:'p'+(i*2+j),kind:'path',paths:[{start:[x+j,1],segments:[{kind:'L',to:[x+j,4]}]}],style,clips:[],stroke:true,fill:false,formPath:[parent,id],operator:i*2+j});
    }
    const scene={schema:'revector.pdf/1',pageNumber:1,box:[0,0,500,500],pageSize:[500,500],pageTransform:base,items,forms,diagnostics:[],source:{name:'nested'},operatorCount:items.length,ocgs:{}};
    check('Nested form paint order '+trial,await ca.lowerScene(scene,{units:'pt'}),await cb.lowerScene(scene,{units:'pt'}));
}
for(let i=0;i<12;i++){
    const d=ma.createDocument();for(let j=0;j<50;j++){const e=line('e'+j,random()*1e4,random()*1e4);e.color=[Math.floor(random()*256),Math.floor(random()*256),Math.floor(random()*256)];e.source={kind:'test',ids:['a','b'],value:'A\tŻółć 𐀀 — '+j};d.entities.push(e);}d.groups=[{name:'all',members:d.entities.map(e=>e.id)}];
    for(const version of ['2000','2004','2007','2010','2013','2018']){const a=da.exportDxf(d,{version}),b=db.exportDxf(d,{version});check('DXF byte equality '+i+' '+version,a,b);check('DXF parse equality '+i+' '+version,da.readDxf(a.text),db.readDxf(a.text));}
}
for(let i=0;i<15;i++){
    const w=60,h=50,pixels=new Uint8Array(w*h);for(let j=0;j<120;j++)pixels[Math.floor(random()*pixels.length)]=1;
    for(let x=5;x<55;x++)pixels[(5+i%30)*w+x]=1;
    check('Raster graph '+i,await ra.traceRasterPaths(pixels,w,h),await rb.traceRasterPaths(pixels,w,h));
}
const result={schema:'revector.performance-equivalence/1',passed:true,checks:count,seed:19531,baseline,current,coverage:['Boolean operations and winding rules','Cubic clipping at multiple scales','accepted/conflicting/rejected semantic transactions','nested form ordering','six DXF versions with Unicode, colors, groups and source metadata','raster graph paths and logical work budgets']};
const output=path.resolve(option('--output','artifacts/performance/equivalence.json'));await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');console.log('PASS',count,'differential equivalence checks');
