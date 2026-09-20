import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,validateDocument} from '@revector/model';
import {RuleEngine,commitCandidate} from '@revector/semantics';
import {binarize,grayscale} from '@revector/raster';
import {detectTables} from '@revector/rules-document';

const line=(id,x=0)=>({id,type:'LINE',layer:'0',start:[x,0],end:[x+1,1]});
const c=(id,proposal,members=['e'])=>({id,rule:'r',title:id,confidence:1,exact:true,members,proposal});
const clean=doc=>{delete doc.ruleStats;return doc;};

async function compare(proposals,input=createDocument({entities:[line('e'),line('f',2)]})) {
    const before=structuredClone(input),expected=structuredClone(input);
    let current=expected;
    for(const proposal of proposals){const candidate={...structuredClone(proposal),ruleVersion:'1.0.0',status:'pending',evidence:[]};
        try{current=commitCandidate(current,candidate);candidate.status='accepted';candidate.result=(candidate.proposal.add||[]).map(e=>e.id);}
        catch(error){candidate.status='conflict';candidate.conflict=error.message;}
        current.candidates.push(candidate);
    }
    const actual=await new RuleEngine().register({id:'r',run:()=>proposals}).run(input);
    assert.deepEqual(clean(actual),current);assert.deepEqual(input,before);assert(validateDocument(actual).valid);
    return actual;
}

test('Indexed metadata transactions retain sequential revisions, before-images, layer first-wins and GROUP order',async()=>{
    const d=createDocument({entities:[line('e'),line('f',2)],groups:[{name:'empty',members:[]}]});
    await compare([
        c('one',{update:[{id:'e',patch:{semantic:{label:'A'},layer:'L'}}],layers:[{name:'L',color:[1,2,3],visible:false}]}),
        c('two',{update:[{id:'e',patch:{semantic:{label:'B'}}},{id:'e',patch:{semantic:{label:'C'}}}],layers:[{name:'L',color:[9,9,9]}]}),
        c('empty',{groups:[{name:'new-empty',members:[]}]}),
        c('noop',{}),
        c('group',{groups:[{name:'G',members:['e','f'],semantic:{value:42}}]})
    ],d);
});
test('Indexed preflight cannot leak staged updates or layers on canonical conflicts',async()=>{
    await compare([
        c('bad',{update:[{id:'e',patch:{semantic:{value:1},layer:'leak'}}],layers:[{name:'leak'}],groups:[{name:'bad',members:['missing']}]}),
        c('nan',{update:[{id:'e',patch:{semantic:{value:NaN}}}]}),
        c('layer',{update:[{id:'e',patch:{layer:'absent'}}]}),
        c('good',{update:[{id:'f',patch:{semantic:{value:3}}}]},['f'])
    ]);
});
test('A general geometry transaction invalidates fast indices without changing later metadata behavior',async()=>{
    await compare([
        c('first',{update:[{id:'e',patch:{semantic:{value:1}}}]}),
        c('replace',{remove:['e'],add:[line('new')],placements:{new:'e'}}),
        c('stale',{update:[{id:'e',patch:{semantic:{value:2}}}]}),
        c('next',{update:[{id:'new',patch:{semantic:{value:3}}}]},['new'])
    ]);
});
test('Transient invalid metadata and invalid source repaired by a proposal retain canonical behavior',async()=>{
    await compare([c('fix',{update:[{id:'e',patch:{semantic:{value:NaN}}},{id:'e',patch:{semantic:{value:2}}}]})]);
    await compare([c('repair',{layers:[{name:'missing'}]})],createDocument({entities:[{...line('e'),layer:'missing'}]}));
});
test('Metadata GROUP indices include model attributes and block-definition entities',async()=>{
    await compare([c('group',{groups:[{name:'G',members:['attr','child','child-attr']}]}),c('second',{update:[{id:'e',patch:{semantic:{a:1}}}]})],
        createDocument({entities:[{...line('e'),attributes:[{id:'attr',layer:'0',text:'a'}]}],blocks:[{name:'B',entities:[{...line('child'),attributes:[{id:'child-attr',layer:'0'}]}]}]}));
});
test('Frozen snapshots are refreshed after indexed batches and cannot alias returned entities',async()=>{
    const snapshots=[],engine=new RuleEngine();
    for(let stage=0;stage<3;stage++)engine.register({id:'r'+stage,stage,run:({document})=>{snapshots.push(document);return [c('p'+stage,{update:[{id:'e',patch:{semantic:{stage}}}]})];}});
    const result=await engine.run(createDocument({entities:[line('e')]}));
    assert.equal(snapshots[0].entities[0].semantic,undefined);
    assert.equal(snapshots[1].entities[0].semantic.stage,0);assert.equal(snapshots[2].entities[0].semantic.stage,1);
    result.entities[0].semantic.stage=9;
    assert.equal(snapshots[2].entities[0].semantic.stage,1);
    assert.throws(()=>{snapshots[1].entities[0].semantic.stage=42;},TypeError);
});
test('Timer cancellation can interrupt a single large rule before all candidates are consumed',async()=>{
    const abort=new AbortController(),input=createDocument({entities:[line('e')]}),original=structuredClone(input);
    let consumed=0;
    const engine=new RuleEngine().register({id:'r',run:()=> (function*(){for(let i=0;i<20000;i++){consumed++;yield c('p'+i,{update:[{id:'e',patch:{semantic:{i}}}]});}})()});
    const timer=setTimeout(()=>abort.abort(),0);
    try{await assert.rejects(engine.run(input,{signal:abort.signal}),{name:'AbortError'});}finally{clearTimeout(timer);}
    assert(consumed<20000,`Cancellation arrived only after ${consumed} candidates`);assert.deepEqual(input,original);
});

/** Independent slow local-window reference, used only on small fixture rasters. */
function referenceSauvola(raster,{window=31,k=.2,invert=false}={}){
    const g=grayscale(raster),w=raster.width,h=raster.height,r=window>>1,out=new Uint8Array(g.length);
    if(invert)for(let i=0;i<g.length;i++)g[i]=255-g[i];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        let s=0,q=0,n=0;
        for(let yy=Math.max(0,y-r);yy<Math.min(h,y+r+1);yy++)for(let xx=Math.max(0,x-r);xx<Math.min(w,x+r+1);xx++){const v=g[yy*w+xx];s+=v;q+=v*v;n++;}
        const m=s/n,variance=q/n-m*m;
        out[y*w+x]=g[y*w+x]<m*(1+k*(Math.sqrt(Math.max(0,variance))/128-1))?1:0;
    }
    return out;
}
for(const [width,height]of [[1,1],[1,17],[19,1],[3,5],[13,29],[42,33]])test(`Rolling Sauvola agrees with direct sums at ${width}×${height}`,()=>{
    const raster={width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>(i*67+(i*i%73))%256)};
    for(const window of [3,4,7,31,201])for(const k of [0,.2,1])for(const invert of [false,true]){
        const options={method:'sauvola',window,k,invert};assert.deepEqual(binarize(raster,options),referenceSauvola(raster,options));
    }
});
test('Rolling Sauvola retains allocation/settings budgets and cancellation contracts',()=>{
    const raster={width:1,height:1,data:new Uint8Array(4)};
    for(const window of [2,202,NaN,3.5])assert.throws(()=>binarize(raster,{method:'sauvola',window}),RangeError);
    assert.throws(()=>binarize(raster,{method:'sauvola',signal:AbortSignal.abort()}),{name:'AbortError'});
    assert.throws(()=>binarize({width:8000001,height:1,data:{length:8000001*4}},{method:'sauvola',maxPixels:1}),RangeError);
});
function grid(){
    const entities=[];for(let i=0;i<=2;i++){entities.push({id:'h'+i,type:'LINE',start:[0,i*10],end:[20,i*10],layer:'0'});entities.push({id:'v'+i,type:'LINE',start:[i*10,0],end:[i*10,20],layer:'0'});}
    return createDocument({entities,pageBox:[0,0,20,20]});
}
test('Table text assignment retains half-open cell boundaries and coincident-label ordering',()=>{
    const d=grid();
    for(const [id,cx,cy]of [['a',10,10],['b',10,10],['edge',20,5],['outside',-1,5]])d.entities.push({id,type:'TEXT',layer:'0',height:1,text:id,position:[cx,cy],bounds:[cx-1,cy-1,cx+1,cy+1]});
    const tables=detectTables(d);assert.equal(tables.length,1);
    const cells=tables[0].evidence[0].cells;assert.deepEqual(cells.find(c=>c.row===0&&c.column===1).entities,['a','b']);
    assert.equal(cells.flatMap(c=>c.entities).length,2);
});


test('Cooperative scheduling uses normal task priority rather than boosted continuations', async () => {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'scheduler');
    let options,called=0;
    Object.defineProperty(globalThis,'scheduler',{configurable:true,value:{
        yield(){throw Error('Boosted continuations must not starve pending cancellation');},
        postTask(callback,input){called++;options=input;return Promise.resolve().then(callback);}
    }});
    try {
        const {yieldTask}=await import('@revector/model');
        assert.equal(await yieldTask(),undefined);
        assert.equal(called,1);assert.deepEqual(options,{priority:'user-visible'});
    } finally {
        if(descriptor)Object.defineProperty(globalThis,'scheduler',descriptor);else delete globalThis.scheduler;
    }
});
test('Cancellation during the final rule scheduling boundary rejects instead of returning stale output', async () => {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'scheduler');
    const abort=new AbortController(),input=createDocument({entities:[line('e')]}),original=structuredClone(input);
    Object.defineProperty(globalThis,'scheduler',{configurable:true,value:{postTask:async callback=>{abort.abort();callback();}}});
    try {
        const engine=new RuleEngine().register({id:'final',run:()=>[c('one',{update:[{id:'e',patch:{semantic:{value:1}}}]})]});
        await assert.rejects(engine.run(input,{signal:abort.signal}),{name:'AbortError'});
        assert.deepEqual(input,original);
    } finally {
        if(descriptor)Object.defineProperty(globalThis,'scheduler',descriptor);else delete globalThis.scheduler;
    }
});
