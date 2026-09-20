import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument, validateDocument, createImmutableDocumentValidator} from '@revector/model';
import {RuleEngine, commitCandidate} from '@revector/semantics';
import {ConversionWorker} from '@revector/engine';
import {SpatialIndex} from '@revector/topology';
import {rectPath, preparePathQuery, pathWinding, insidePaths, clipCurveToPaths, booleanPaths} from '@revector/geometry';
import {readDxf, exportDxf} from '@revector/dxf';
import {PdfSource, OPS} from '@revector/pdf';
import {binaryRgba} from '@revector/raster';
const line=(id,x=0)=>({id,type:'LINE',layer:'0',start:[x,0],end:[x+5,5],color:[1,2,3]});
const candidate=(id,proposal,members=['a'])=>({id,title:id,rule:'test',confidence:1,exact:true,members,proposal});
const doc=()=>createDocument({entities:[line('a'),line('b',10)]});

test('Public transactions detach unchanged entities, assets, history, and candidate metadata',()=>{
    const d=doc();d.assets.push({id:'asset',path:'a.png',width:1,height:1,dataBase64:'AAAA'});d.candidates.push({id:'existing',evidence:[{v:1}]});
    const original=structuredClone(d),n=commitCandidate(d,candidate('update',{update:[{id:'a',patch:{start:[4,4]}}]}));
    n.entities[1].start[0]=999;n.candidates[0].evidence[0].v=9;n.assets[0].dataBase64='changed';n.history[0].updated[0].before.end[0]=100;
    assert.deepEqual(d,original);
});
test('Rule snapshots are deeply immutable, detached and reused only while geometry is unchanged',async()=>{
    const d=doc(),snapshots=[],rules=new RuleEngine();
    rules.register({id:'a',stage:0,run:({document})=>{snapshots.push(document);assert.throws(()=>document.entities[0].start[0]=8,TypeError);return [];}});
    rules.register({id:'b',stage:1,run:({document})=>{snapshots.push(document);return [candidate('update',{update:[{id:'a',patch:{start:[2,3]}}]})];}});
    rules.register({id:'c',stage:2,run:({document})=>{snapshots.push(document);return [];}});
    const out=await rules.run(d);
    assert.strictEqual(snapshots[0].entities,snapshots[1].entities);
    assert.notStrictEqual(snapshots[1].entities,snapshots[2].entities);
    assert.strictEqual(snapshots[1].entities[1],snapshots[2].entities[1]);
    assert.deepEqual(snapshots[0].entities[0].start,[0,0]);assert.deepEqual(snapshots[2].entities[0].start,[2,3]);
    out.entities[1].start[0]=9;assert.deepEqual(snapshots[2].entities[1].start,[10,0]);assert.deepEqual(d,doc());
});
test('Conflicting copy-on-write transaction leaves no partial entity, layer, block or group changes',async()=>{
    const d=doc(),original=structuredClone(d),rules=new RuleEngine();
    rules.register({id:'test',run:()=>[
        candidate('invalid',{update:[{id:'a',patch:{start:[NaN,1]}}],layers:[{name:'leaked'}],blocks:[{name:'leaked',entities:[]}],groups:[{name:'invalid',members:['absent']}]}),
        candidate('valid',{update:[{id:'b',patch:{end:[42,3]}}]},['b'])
    ]});
    const out=await rules.run(d);assert.deepEqual(d,original);assert.equal(out.revision,1);
    assert.deepEqual(out.entities[0],d.entities[0]);assert.deepEqual(out.entities[1].end,[42,3]);
    assert.equal(out.candidates[0].status,'conflict');assert.equal(out.candidates[1].status,'accepted');
    assert.equal(out.blocks.length,0);assert.equal(out.layers.length,1);assert.equal(out.groups.length,0);
});
test('Sequential patches to the same ID retain intermediate history and public transaction behavior',async()=>{
    const d=doc(),proposal=candidate('multi',{update:[{id:'a',patch:{text:'first'}},{id:'a',patch:{text:'last'}}]});
    const out=await new RuleEngine().register({id:'test',run:()=>[proposal]}).run(d);
    const direct=commitCandidate(d,proposal);
    assert.deepEqual(out.entities,direct.entities);assert.deepEqual(out.history,direct.history);
    assert.equal(out.history[0].updated[1].before.text,'first');
});
test('Multiple replacements anchored before one entity preserve proposal and paint order',()=>{
    const d=doc();d.groups=[{name:'g',members:['a','b']}];
    const out=commitCandidate(d,candidate('replace',{remove:['a'],add:[line('x'),line('y')],placements:{x:'a',y:'a'}}));
    assert.deepEqual(out.entities.map(e=>e.id),['x','y','b']);assert.deepEqual(out.groups[0].members,['x','y','b']);
    assert.deepEqual(d.groups[0].members,['a','b']);
});
test('Candidate IDs are deduplicated without changing candidate budget failures',async()=>{
    const r=new RuleEngine().register({id:'test',run:()=>[candidate('same',{}),candidate('same',{}),candidate('next',{})]});
    const a=await r.run(doc());assert.equal(a.candidates.length,2);
    const b=await r.run(doc(),{maxCandidates:1});assert.equal(b.candidates.length,1);assert.equal(b.diagnostics.at(-1).code,'RULE_FAILURE');
});
test('Public validation never caches mutable inputs; immutable sessions recheck cross-references',()=>{
    const d=doc(),session=createImmutableDocumentValidator();assert(session(d).valid);assert(validateDocument(d).valid);
    const next={...d,entities:[...d.entities,line('a')]};assert(!session(next).valid);
    assert(!session({...d,layers:[]}).valid);assert(!session({...d,groups:[{name:'missing',members:['absent']}]}).valid);
    d.entities[0].start[0]=Infinity;assert(!validateDocument(d).valid);
});
test('Shared block dependency tails do not conceal a cycle',()=>{
    const d=doc();d.blocks=[{name:'root',entities:[{...line('r1'),type:'INSERT',name:'tail'}]},{name:'second',entities:[{...line('r2'),type:'INSERT',name:'tail'}]},{name:'tail',entities:[]}];
    assert(validateDocument(d).valid);d.blocks[2].entities.push({...line('cycle'),type:'INSERT',name:'root'});assert(!validateDocument(d).valid);
});
// Independent retained median-sort reference, including the exact stable traversal order.
class SortReference {
    constructor(items){this.root=this.build(items.map((item,index)=>({item,index,box:item.bounds})));}
    build(items){if(!items.length)return null;const box=[Infinity,Infinity,-Infinity,-Infinity];for(const {box:b}of items){for(let j=0;j<2;j++){box[j]=Math.min(box[j],b[j]);box[j+2]=Math.max(box[j+2],b[j+2]);}}if(items.length<=12)return {box,items};const axis=box[2]-box[0]>=box[3]-box[1]?0:1;items.sort((a,b)=>(a.box[axis]+a.box[axis+2])-(b.box[axis]+b.box[axis+2])||a.index-b.index);const mid=items.length>>1;return {box,left:this.build(items.slice(0,mid)),right:this.build(items.slice(mid))};}
    search(box){const out=[],stack=[this.root],hit=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];while(stack.length){const n=stack.pop();if(!n||!hit(n.box,box))continue;if(n.items){for(const i of n.items)if(hit(i.box,box))out.push(i.item);}else stack.push(n.left,n.right);}return out;}
}
let seed=0x17321;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const mode of ['random','equal','grid','ordered','reverse'])test('BVH selection preserves exact legacy membership and traversal: '+mode,()=>{
    for(const n of [0,1,12,13,24,25,31,64,257,1000]){
        const items=Array.from({length:n},(_,i)=>{const x=mode==='equal'?0:mode==='random'?random()*100:mode==='grid'?i%16:mode==='reverse'?n-i:i,y=mode==='random'?random()*100:mode==='grid'?Math.floor(i/16):0;return {id:i,bounds:[x,y,x+3,y+2]};});
        const before=items.slice(),a=new SpatialIndex(items),b=new SortReference(items);assert.deepEqual(a.root,b.root);assert.deepEqual(items,before);
        for(let i=0;i<20;i++){const x=random()*100,y=random()*20,box=[x,y,x+10,y+5];assert.deepEqual(a.search(box),b.search(box));}
    }
});
test('Prepared ray predicates exactly match unprepared polynomials with holes, tangencies and mutation isolation',()=>{
    const paths=[rectPath([-12,-12,12,12]),rectPath([-5,-5,5,5]),{start:[-10,0],segments:[{kind:'C',c1:[-10,15],c2:[10,15],to:[10,0]},{kind:'C',c1:[10,-15],c2:[-10,-15],to:[-10,0]}],closed:true}];
    // More than 24 edges exercises indexed queries; the smaller list exercises its fast leaf path.
    for(const list of [paths,[...paths,...Array.from({length:20},(_,i)=>rectPath([30+i*4,0,32+i*4,3]))]]){
        const snapshot=structuredClone(list),query=preparePathQuery(list);list[0].start[0]+=1;
        for(let i=0;i<300;i++){const p=i<3?[[12,12],[0,11.25],[0,-11.25]][i]:[random()*120-20,random()*40-20];assert.equal(query.winding(p),pathWinding(p,snapshot));for(const rule of ['evenodd','nonzero'])assert.equal(query.contains(p,rule),insidePaths(p,snapshot,rule));}
    }
});
test('Prepared shared clipping remains cubic, deterministic and bounded',()=>{
    const paths=Array.from({length:12},(_,i)=>rectPath([i*3,0,i*3+2,4])),query=preparePathQuery(paths);
    const edge={kind:'C',points:[[-5,2],[8,1],[18,3],[40,2]]};
    assert.deepEqual(query.clip(edge),clipCurveToPaths(edge,paths));assert(query.clip(edge).every(e=>e.kind==='C'));
    assert.throws(()=>booleanPaths(paths,paths,{maxPairs:1}),/budget/);
});
test('Streaming DXF reader preserves BOM, CRLF and final-line behavior',()=>{
    const text=exportDxf(doc()).text,expected=readDxf(text);
    for(const source of [text.trimEnd(),text.replaceAll('\r\n','\n'),'\ufeff'+text])assert.deepEqual(readDxf(source),expected);
    assert.throws(()=>readDxf('0\n'),/pair|Odd|Truncated/i);
    assert.throws(()=>readDxf(text,{maxPairs:2}),/budget/i);
});
test('DXF string fast paths retain control sanitization and surrogate escape fidelity',()=>{
    const d=doc();d.entities=[{id:'text',type:'TEXT',layer:'0',text:'ASCII\t\r\n\x7f Żółć 𐀀',position:[0,0],height:3,width:40,color:[1,0,0]}];
    for(const version of ['2000','2004','2007','2010','2013','2018']){
        const s=exportDxf(d,{version}).text,r=readDxf(s);assert.equal(r.entities[0].text,'ASCII   \x7f Żółć 𐀀');
        assert.equal(r.entities.length,1);
    }
});
test('Indexed group membership retains order, multiple memberships and Unicode evidence',()=>{
    const d=doc();d.groups=[{name:'one',members:['a','a','b'],semantic:{v:'Żółć'}},{name:'two',members:['a']}];
    const out=readDxf(exportDxf(d).text);assert.equal(out.groups.length,2);assert.deepEqual(out.groups.map(g=>g.name),['one','two']);
});
test('Binary RGBA conversion agrees for every byte channel without mutating source',()=>{
    const b=Uint8Array.of(0,1,1,0);assert.deepEqual(Array.from(binaryRgba(b,2,2).data),[255,255,255,255,0,0,0,255,0,0,0,255,255,255,255,255]);assert.deepEqual(Array.from(b),[0,1,1,0]);
});
class FakeWorker {
    static instances=[];
    constructor(){FakeWorker.instances.push(this);this.terminated=0;}
    postMessage(message){this.message=structuredClone(message);if(this.failPost)throw Error('post failure');}
    terminate(){this.terminated++;}
    result(result){this.onmessage?.({data:{id:this.message.id,kind:'result',result}});}
}
const withWorker=async fn=>{const original=globalThis.Worker;globalThis.Worker=FakeWorker;FakeWorker.instances=[];try{await fn();}finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}};
test('Idle workers reuse code, but every conversion gets a fresh input scene snapshot',()=>withWorker(async()=>{
    const w=new ConversionWorker('test'),scene={value:1},p=w.convert(scene);const first=FakeWorker.instances[0];first.result('first');assert.equal(await p,'first');assert.equal(first.terminated,0);
    scene.value=2;const p2=w.convert(scene);assert.equal(FakeWorker.instances.length,1);assert.equal(first.message.scene.value,2);first.result('second');assert.equal(await p2,'second');w.dispose();assert.equal(first.terminated,1);
}));
test('Cancelling a busy worker terminates exactly once and isolates stale callbacks',()=>withWorker(async()=>{
    const w=new ConversionWorker('test'),first=w.convert({}),old=FakeWorker.instances[0],handler=old.onmessage,id=old.message.id;
    const rejection=assert.rejects(first,{name:'AbortError'});const second=w.convert({});await rejection;assert.equal(old.terminated,1);
    handler({data:{id,kind:'result',result:'stale'}});const next=FakeWorker.instances[1];assert.strictEqual(w.worker,next);next.result('fresh');assert.equal(await second,'fresh');w.dispose();
}));
test('Old abort signals cannot cancel a reused worker; post errors and callback errors retire it',()=>withWorker(async()=>{
    const w=new ConversionWorker('test'),c=new AbortController(),p=w.convert({}, {}, {signal:c.signal});let instance=FakeWorker.instances[0];instance.result(1);await p;
    const p2=w.convert({});c.abort();assert.equal(instance.terminated,0);instance.result(2);await p2;
    instance.failPost=true;await assert.rejects(w.convert({}),/post failure/);assert.equal(instance.terminated,1);
    const p3=w.convert({}, {}, {onProgress:()=>{throw Error('callback failure');}});instance=FakeWorker.instances[1];instance.onmessage({data:{id:instance.message.id,kind:'progress',progress:{}}});await assert.rejects(p3,/callback failure/);assert.equal(instance.terminated,1);w.dispose();
}));
const fakePdf=(ids,options={})=>{
    const state={active:0,peak:0,calls:0},page={view:[0,0,100,100],userUnit:1,rotate:0,
        getViewport:()=>({width:100,height:100,transform:[1,0,0,-1,0,100]}),
        getOperatorList:async()=>({fnArray:ids.map(()=>OPS.setFont),argsArray:ids.map(id=>[id,12])}),
        commonObjs:{get(id,callback){state.calls++;state.peak=Math.max(state.peak,++state.active);if(options.never)return;setTimeout(()=>{state.active--;callback({name:id});},Number(id.slice(1))%3+1);}},getStructTree:async()=>null,getAnnotations:async()=>[]};
    const source=new PdfSource({OPS,AnnotationMode:{DISABLE:0,ENABLE:1},version:'6.4.172'},{destroy:async()=>{}},{numPages:1,getPage:async()=>page,fingerprints:['test']},{name:'test',...options});source.ocgs={};return {source,state};
};
test('PDF font waits are bounded concurrent and deterministic; cached pages do not fetch fonts again',async()=>{
    const ids=Array.from({length:19},(_,i)=>'f'+i),{source,state}=fakePdf(ids,{fontConcurrency:4});const scene=await source.extract(1);assert.equal(state.peak,4);assert.deepEqual(Object.keys(scene.fonts),ids);await source.extract(1);assert.equal(state.calls,ids.length);await source.dispose();
});
test('PDF resource cancellation remains AbortError and does not populate a missing-font cache',async()=>{
    const {source,state}=fakePdf(['f1','f2','f3'],{never:true,fontConcurrency:2,resourceTimeoutMs:500}),controller=new AbortController();
    const p=source.extract(1,{signal:controller.signal});setTimeout(()=>controller.abort(),10);await assert.rejects(p,{name:'AbortError'});assert.equal(state.calls,2);await source.dispose();
});
test('Timed-out independent fonts retain fallback entries, and invalid concurrency fails explicitly',async()=>{
    const {source}=fakePdf(['f1','f2','f3'],{never:true,resourceTimeoutMs:5});const scene=await source.extract(1);assert(scene.fonts.f2.missingFile);await source.dispose();
    const bad=fakePdf(['f1'],{fontConcurrency:0});await assert.rejects(bad.source.extract(1),RangeError);await bad.source.dispose();
});

test('Shallow-frozen external detector inputs never qualify for internal immutable caches',async()=>{
    const {detectTextFlows}=await import('@revector/rules-document');
    const a={id:'a',type:'TEXT',layer:'0',text:'A',position:[0,10],height:3,width:2},b={...a,id:'b',text:'B',position:[4,10]};
    const d=Object.freeze(createDocument({entities:Object.freeze([a,b])}));assert.equal(detectTextFlows(d).length,1);
    b.position[0]=1000;assert.equal(detectTextFlows(d).length,0);
});
test('Worker errors during idle cause replacement instead of reusing a crashed worker',()=>withWorker(async()=>{
    const w=new ConversionWorker('test'),p=w.convert({}),old=FakeWorker.instances[0];old.result(1);await p;old.onerror({message:'idle crash'});assert.equal(old.terminated,1);assert.equal(w.worker,null);
    const next=w.convert({});FakeWorker.instances[1].result(2);assert.equal(await next,2);w.dispose();
}));

test('Validation handles deeply nested block DAGs without recursive stack growth',()=>{
    const d=createDocument();for(let i=0;i<12000;i++)d.blocks.push({name:'b'+i,entities:i===11999?[]:[{id:'i'+i,type:'INSERT',layer:'0',name:'b'+(i+1)}]});
    assert(validateDocument(d).valid);d.blocks.at(-1).entities.push({id:'last',type:'INSERT',layer:'0',name:'b0'});assert(!validateDocument(d).valid);
});
