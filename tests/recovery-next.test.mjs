import test from 'node:test';
import assert from 'node:assert/strict';
import { planRasterTiles, estimateSkew, boundedRotation } from '@revector/raster';
import { deduplicateOcrWords, TesseractOcr, normalizeOcrOptions, wordToPaint } from '@revector/ocr';
import { detectTables, detectBorderlessTables, detectLists, documentRules } from '@revector/rules-document';
import { createDocument } from '@revector/model';
import { inverse, transform, compose } from '@revector/geometry';
import { RuleEngine } from '@revector/semantics';
import { auditColors } from '@revector/color';
import { readDxf, writeDxf } from '@revector/dxf';

const line=(id,start,end)=>({id,type:'LINE',start,end,layer:'0',color:[31,61,113]});
const text=(id,value,x,y,width=5)=>({id,type:'TEXT',text:value,position:[x,y],height:2,width,layer:'0',color:[31,61,113]});
const doc=entities=>createDocument({entities,pageBox:[0,0,120,100]});
function mergedTable() { return doc([
    line('left',[0,0],[0,20]),line('right',[20,0],[20,20]),
    line('bottom',[0,0],[20,0]),line('middle',[0,10],[20,10]),line('top',[0,20],[20,20]),
    line('split-bottom',[10,0],[10,10]),text('title','HEADER',2,14,14),text('a','A',2,4),text('b','B',12,4),
]); }
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mockWorker(value='word') { return {terminated:0,recognized:0,async setParameters(){},async recognize(){this.recognized++;return {data:{text:value,blocks:[]}};},async terminate(){this.terminated++;}}; }

test('Merged table headers have column spans without changing source geometry',async()=>{
    const d=mergedTable(),original=structuredClone(d.entities),[candidate]=detectTables(d),m=candidate.evidence[0];
    assert.equal(m.rows,2);assert.equal(m.columns,2);assert.equal(m.cells.length,3);assert.equal(m.mergedCells,1);
    assert.deepEqual(m.cells.map(c=>[c.row,c.column,c.rowSpan,c.columnSpan]),[[0,0,1,2],[1,0,1,1],[1,1,1,1]]);
    assert.equal(m.cells[0].text,'HEADER');
    const engine=new RuleEngine();engine.register(documentRules[0]);const out=await engine.run(d,{minConfidence:0});
    assert.deepEqual(out.entities,original);
    for(const version of ['2000','2004','2007','2010','2013','2018'])assert.equal(readDxf(writeDxf(out,{version})).groups[0].semantic.cells[0].columnSpan,2);
});
test('Merged first-column cells recover row spans in top-down page order',()=>{
    const d=mergedTable();d.entities=d.entities.filter(e=>e.id!=='middle'&&e.id!=='split-bottom');
    d.entities.push(line('vertical',[10,0],[10,20]),line('horizontal-right',[10,10],[20,10]));
    const m=detectTables(d)[0].evidence[0];assert.equal(m.cells.length,3);assert.ok(m.cells.some(c=>c.row===0&&c.column===0&&c.rowSpan===2));
});
test('Partial internal table separators are rejected rather than completed',()=>{
    const d=mergedTable();d.entities.find(e=>e.id==='split-bottom').end=[10,7];assert.deepEqual(detectTables(d),[]);
});
test('L-shaped merged table regions are rejected',()=>{
    const d=mergedTable();d.entities=d.entities.filter(e=>e.id!=='middle'&&e.id!=='split-bottom');
    d.entities.push(line('top-v',[10,10],[10,20]),line('right-h',[10,10],[20,10]));assert.deepEqual(detectTables(d),[]);
});
test('Repeated aligned text columns produce a borderless schedule with cell provenance',()=>{
    const entities=[];for(let r=0;r<4;r++){entities.push(text('a'+r,'ITEM'+r,5,36-r*7),text('b'+r,String(r),35,36-r*7));}
    const [p]=detectBorderlessTables(doc(entities));assert.equal(p.evidence[0].rows,4);assert.equal(p.evidence[0].columns,2);
    assert.equal(p.evidence[0].cells[3].text,'1');assert.equal(p.members.length,8);assert.equal(p.exact,true);
});
test('Two rows, irregular columns and missing whitespace do not become schedules',()=>{
    const es=[text('a','A',0,30),text('b','B',30,30),text('c','C',0,23),text('d','D',30,23)];
    assert.equal(detectBorderlessTables(doc(es)).length,0);
    assert.equal(detectBorderlessTables(doc([...es,text('e','E',0,16),text('f','F',34,16)])).length,0);
    for(const e of es.filter(e=>e.position[0]===0))e.width=30;
    assert.equal(detectBorderlessTables(doc([...es,text('e','E',0,16,30),text('f','F',30,16)])).length,0);
});
test('Consecutive inline numbered lists retain item content and source entity IDs',()=>{
    const es=['1. Open valve','2. Inspect seal','3. Record result'].map((s,i)=>text('t'+i,s,5,40-i*7,25));
    const [p]=detectLists(doc(es));assert.equal(p.evidence[0].ordered,true);assert.equal(p.evidence[0].items[1].text,'Inspect seal');assert.deepEqual(p.members,['t0','t1','t2']);
});
test('Separated bullet markers and bodies are grouped without inventing numbering',()=>{
    const es=[];for(let r=0;r<3;r++)es.push(text('m'+r,'•',4,40-r*7,1),text('b'+r,'Check '+r,8,40-r*7,15));
    const [p]=detectLists(doc(es));assert.equal(p.evidence[0].ordered,false);assert.equal(p.members.length,6);
});
test('Isolated nonconsecutive callout numbers do not qualify as a list',()=>{
    assert.equal(detectLists(doc([text('a','1. A',4,40),text('b','3. B',4,33),text('c','5. C',4,26)])).length,0);
});
test('Document detection responds to already-aborted analyses',()=>{
    const c=new AbortController();c.abort();for(const detector of [detectTables,detectBorderlessTables,detectLists])assert.throws(()=>detector(mergedTable(),{signal:c.signal}),{name:'AbortError'});
});
test('Tile cores cover every pixel once, halos overlap, allocations stay bounded',()=>{
    const width=777,height=451,tiles=planRasterTiles(width,height,{tileSize:256,overlap:32,maxTiles:20});
    const pixels=new Uint8Array(width*height);assert.ok(tiles.length>1);
    for(const tile of tiles){assert.ok(tile.width<=256&&tile.height<=256);assert.ok(tile.x<=tile.core[0]&&tile.y<=tile.core[1]);
        for(let y=tile.core[1];y<tile.core[3];y++)for(let x=tile.core[0];x<tile.core[2];x++)pixels[y*width+x]++;
    }assert.ok(pixels.every(v=>v===1));assert.ok(tiles[0].x+tiles[0].width>tiles[1].x);
});
test('Tile planner rejects excessive work and inconsistent halo settings before allocation',()=>{
    assert.throws(()=>planRasterTiles(4000,4000,{tileSize:512,maxTiles:2}),/budget/);
    assert.throws(()=>planRasterTiles(800,600,{tileSize:256,overlap:128}),/overlap/);
    assert.throws(()=>planRasterTiles(NaN,600));assert.throws(()=>normalizeOcrOptions({tileSize:512.5}));
    assert.equal(planRasterTiles(100,80).length,1);
});
test('Projection skew estimator recovers positive and negative small-angle text baselines',()=>{
    const width=800,height=300;
    for(const angle of [-6,4]){
        const pixels=new Uint8Array(width*height),slope=Math.tan(angle*Math.PI/180);
        for(let row=0;row<6;row++)for(let x=60;x<700;x++)if(x%17<11){const y=Math.round(75+row*24+(x-400)*slope);for(let h=0;h<4;h++)pixels[(y+h)*width+x]=1;}
        const result=estimateSkew(pixels,width,height);assert.ok(Math.abs(result.angle-angle)<=.3,JSON.stringify(result));assert.ok(result.confidence>.12);assert.ok(result.samples<=40000);
    }
});
test('Skew estimation does not rotate empty or sparse pages and honors cancellation',()=>{
    assert.equal(estimateSkew(new Uint8Array(100),10,10).angle,0);
    const c=new AbortController();c.abort();assert.throws(()=>estimateSkew(new Uint8Array(100),10,10,{signal:c.signal}),{name:'AbortError'});
});
test('Arbitrary deskew transforms preserve every corner and roundtrip within the allocation cap',()=>{
    for(const angle of [-13,-5,0,6,90]){
        const r=boundedRotation(angle,1200,800,700000);assert.ok(r.width*r.height<=700000);
        for(const p of [[0,0],[1200,0],[1200,800],[0,800],[54,275]]){
            const q=transform(r.matrix,p);assert.ok(q[0]>=-1e-8&&q[1]>=-1e-8&&q[0]<=r.width+1e-8&&q[1]<=r.height+1e-8);
            const back=transform(inverse(r.matrix),q);assert.ok(Math.hypot(back[0]-p[0],back[1]-p[1])<1e-8);
        }
    }
});
test('OCR tile duplicate suppression prefers confidence and preserves repeated labels elsewhere',()=>{
    const word=(text,confidence,x0,x1)=>({text,confidence,bbox:{x0,y0:10,x1,y1:30}});
    const a=word('P-101',80,10,90),b=word('p-101',97,11,91),c=word('P-101',95,160,240);
    assert.deepEqual(deduplicateOcrWords([a,b,c]),[b,c]);
    const disagreement=word('P-I01',70,11,91);assert.deepEqual(deduplicateOcrWords([b,disagreement]),[b]);
    assert.throws(()=>deduplicateOcrWords([a,b],{maxComparisons:0}),/budget/);
});
test('Deskew and tile translation compose into PDF provenance, not nominal DPI estimates',()=>{
    const r=boundedRotation(-5,1200,800),pixelToPdf=[.24,0,0,-.24,20,220],tile=[1,0,0,1,350,150];
    const mapping=compose(pixelToPdf,compose(inverse(r.matrix),tile)),word={text:'V-1',confidence:97,bbox:{x0:30,y0:15,x1:90,y1:45}};
    const item=wordToPaint(word,mapping),expected=transform(mapping,[30,45]);
    assert.ok(Math.hypot(item.matrix[4]-expected[0],item.matrix[5]-expected[1])<1e-8);assert.deepEqual(item.ocr.pixelToPdf,mapping);
});
test('Late cancelled OCR initialization cannot terminate a newer session worker',async()=>{
    const first=deferred(),old=mockWorker('old'),current=mockWorker('new');let calls=0;
    const session=new TesseractOcr({provider:{createWorker:()=>++calls===1?first.promise:Promise.resolve(current)}}),c=new AbortController();
    const job=session.recognize({},{signal:c.signal});c.abort();await assert.rejects(job,{name:'AbortError'});
    assert.equal((await session.recognize({})).text,'new');first.resolve(old);await tick();
    assert.equal(old.terminated,1);assert.equal(current.terminated,0);assert.equal(session.worker,current);assert.equal((await session.recognize({})).text,'new');
    await session.dispose();assert.equal(current.terminated,1);
});
test('Cancelling setParameters never starts recognition and releases exactly once',async()=>{
    const ready=deferred(),worker=mockWorker();worker.setParameters=()=>ready.promise;
    const session=new TesseractOcr({provider:{createWorker:async()=>worker}}),c=new AbortController();
    const job=session.recognize({},{signal:c.signal});await tick();c.abort();await assert.rejects(job,{name:'AbortError'});ready.resolve();await tick();
    assert.equal(worker.recognized,0);assert.equal(worker.terminated,1);await session.dispose();assert.equal(worker.terminated,1);
});
test('OCR initialization deadlines release late workers without unhandled completion',async()=>{
    const pending=deferred(),worker=mockWorker(),session=new TesseractOcr({provider:{createWorker:()=>pending.promise}});
    await assert.rejects(session.recognize({},{timeoutMs:10}),/deadline/);pending.resolve(worker);await tick();assert.equal(worker.terminated,1);assert.equal(session.busy,false);
});
test('Disposing a busy OCR session rejects its result and permits clean reuse',async()=>{
    const worker=mockWorker();worker.recognize=()=>new Promise(()=>{});
    const session=new TesseractOcr({provider:{createWorker:async()=>worker}}),job=session.recognize({});await tick();
    const rejected=assert.rejects(job,{name:'AbortError'});await session.dispose();await rejected;assert.equal(worker.terminated,1);assert.equal(session.busy,false);
});
test('RGBA audit cannot claim exactness when target entities are missing or colors are inherited',()=>{
    const source=doc([line('l',[0,0],[2,2])]),empty=doc([]),missing=auditColors(source,empty);
    assert.equal(missing.missing,1);assert.equal(missing.exact,false);assert.equal(missing.complete,false);
    const inherited=structuredClone(source);delete inherited.entities[0].color;
    const audit=auditColors(inherited,inherited);assert.equal(audit.unresolved,1);assert.equal(audit.rgbExact,false);
});
test('RGBA audit distinguishes RGB fidelity from opacity quantization and legacy alpha loss',()=>{
    const d=doc([{...line('l',[0,0],[2,2]),opacity:.5}]);
    const modern=auditColors(d,readDxf(writeDxf(d,{version:'2018'})));
    assert.equal(modern.rgbExact,true);assert.equal(modern.opacityExact,false);assert.equal(modern.opacityChanged,1);
    assert.ok(modern.maxOpacityError>0&&modern.maxOpacityError<1/255);
    const legacy=auditColors(d,readDxf(writeDxf(d,{version:'2000'})));assert.equal(legacy.maxOpacityError,.5);assert.equal(legacy.exact,false);
});
test('RGBA audit reports malformed numerical values rather than normalizing them silently',()=>{
    const d=doc([line('l',[0,0],[2,2])]),bad=structuredClone(d);bad.entities[0].color=[NaN,0,0];
    assert.equal(auditColors(d,bad).invalid,1);assert.equal(auditColors(d,bad).exact,false);
    bad.entities[0].color=[31,61,113];bad.entities[0].opacity=2;assert.equal(auditColors(d,bad).invalid,1);
});

test('All canvases are released when PDF rendering fails before worker creation',async()=>{
    const {recoverPdfRaster}=await import('@revector/ocr'),allocated=[];
    const scene={pageNumber:1,pageSize:[100,100],pageTransform:[1,0,0,1,0,0],items:[{id:'image',kind:'image',visible:true,transform:[100,0,0,100,0,0]}],ocgs:{},diagnostics:[]};
    const source={pdf:{getPage:async()=>({getViewport:()=>({width:100,height:100})})},render:async()=>{throw Error('Render failure');}};
    await assert.rejects(recoverPdfRaster(source,scene,{canvasFactory:(width,height)=>{const c={width,height};allocated.push(c);return c;}}),/Render failure/);
    assert.equal(allocated.length,1);assert.ok(allocated.every(c=>c.width===1&&c.height===1));
});
