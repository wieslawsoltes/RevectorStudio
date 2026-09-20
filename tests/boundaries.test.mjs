import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCircularPolyline,fitCubicPolyline,cubicPoint,I} from '@revector/geometry';
import {detectJunctions,documentRules} from '@revector/rules-document';
import {cadRules,curveRecoveryRule} from '@revector/rules-cad';
import {createDocument,validateDocument} from '@revector/model';
import {ConversionEngine} from '@revector/engine';
import {captureAppearance} from '@revector/pdf';
import {readDxf,writeDxf,packageDxf} from '@revector/dxf';
import {createCanvas} from '@napi-rs/canvas';
const arc=(n=65,start=0,sweep=Math.PI/2,center=[0,0])=>Array.from({length:n},(_,i)=>[center[0]+10*Math.cos(start+sweep*i/(n-1)),center[1]+10*Math.sin(start+sweep*i/(n-1))]);
const line=(id,start,end)=>({id,type:'LINE',start,end,layer:'0',color:[0,0,0]});
const doc=entities=>createDocument({entities,pageBox:[0,0,100,100]});
const scene=()=>({schema:'revector.pdf/1',pageNumber:1,box:[0,0,10.25,5.25],pageSize:[10.25,5.25],pageTransform:[...I],source:{fingerprints:['a']},rotation:0,userUnit:1,ocgs:{},forms:[],fonts:{},patterns:[],items:[],diagnostics:[],annotations:[]});
function source({fail=false,aborted}={}){return {pdf:{getPage:async()=>({getViewport:({scale})=>({width:10.25*scale,height:5.25*scale})}),fingerprints:['a']},lib:{version:'test'},render:async(_,canvas,{scale})=>{if(fail)throw Error('render failed');if(aborted)aborted.abort();canvas.width=Math.ceil(10.25*scale);canvas.height=Math.ceil(5.25*scale);const c=canvas.getContext('2d');c.fillStyle='#28bca5';c.fillRect(0,0,canvas.width,canvas.height);return {transform:[scale,0,0,-scale,0,5.25*scale]};}};}
for(const [start,sweep] of [[0,Math.PI/2],[Math.PI*1.8,Math.PI/2],[0,-Math.PI/2]])test('Arc fitting handles orientation and wrap '+start+','+sweep,()=>{const c=fitCircularPolyline(arc(65,start,sweep),{tolerance:.01});assert.equal(c.type,'ARC');assert.ok(Math.abs(c.radius-10)<1e-9);assert.ok(c.evidence.errorBound<=.01);assert.equal(c.evidence.sourceDirection,Math.sign(sweep));});
test('Closed circle fit certifies chord error and rejects a loose six-sided polygon',()=>{assert.equal(fitCircularPolyline(arc(129,0,Math.PI*2),{closed:true,tolerance:.01}).type,'CIRCLE');assert.equal(fitCircularPolyline(arc(7,0,Math.PI*2),{closed:true,tolerance:.01}),null);});
test('Normalized circle fit remains stable at translated large coordinates',()=>{const c=fitCircularPolyline(arc(65,0,Math.PI/2,[1e9,-1e9]),{tolerance:.01});assert.ok(Math.abs(c.radius-10)<1e-5);});
test('Circle hypothesis rejects collinear and reversing observations',()=>{assert.equal(fitCircularPolyline(Array.from({length:9},(_,i)=>[i,0])),null);assert.equal(fitCircularPolyline([...arc(8),...arc(8).reverse()],{tolerance:.5}),null);});
test('Cubic fit certifies full chord intervals, not just sampled interpolation',()=>{
 const ps=Array.from({length:81},(_,i)=>[i/8,Math.sin(i/8)]),r=fitCubicPolyline(ps,{tolerance:.02});assert.ok(r.curves.length<20);
 for(const c of r.curves){const [lo,hi]=c.sourceRange,part=ps.slice(lo,hi+1),ts=[0];for(let i=1;i<part.length;i++)ts.push(ts.at(-1)+Math.hypot(part[i][0]-part[i-1][0],part[i][1]-part[i-1][1]));const l=ts.at(-1);for(let i=0;i<ts.length;i++)ts[i]/=l;
  for(let i=0;i<part.length-1;i++)for(let j=0;j<=20;j++){const u=j/20,p=cubicPoint(c.controlPoints,ts[i]+(ts[i+1]-ts[i])*u),q=part[i].map((v,k)=>v+(part[i+1][k]-v)*u);assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<=c.errorBound+1e-9);}
 }
 for(let i=1;i<r.curves.length;i++)assert.deepEqual(r.curves[i-1].controlPoints[3],r.curves[i].controlPoints[0]);
});
test('Cubic fitting preserves closed loops without inventing smoothness at joins',()=>{const r=fitCubicPolyline([[0,0],[10,0],[10,10],[0,10]],{closed:true});assert.deepEqual(r.curves[0].controlPoints[0],r.curves.at(-1).controlPoints[3]);assert.equal(r.evidence.continuity,'C0');});
test('Fitting rejects invalid data, budgets and cancelled jobs',()=>{for(const ps of [[],[[0,0]],[[0,0],[Infinity,0]]])assert.throws(()=>fitCubicPolyline(ps));assert.throws(()=>fitCubicPolyline(arc(),{tolerance:0}));assert.throws(()=>fitCubicPolyline(arc(),{maxWork:1}));assert.throws(()=>fitCubicPolyline(arc(),{tolerance:1e-12,maxSegments:1}));assert.throws(()=>fitCubicPolyline(arc(),{signal:AbortSignal.abort()}),{name:'AbortError'});});
test('Curve rule is opt-in inference with original geometry preserved until accepted',async()=>{const d=doc([{id:'p',type:'LWPOLYLINE',layer:'0',points:arc(),source:{rasterInference:{method:'skeleton'}}}]),c=curveRecoveryRule.run({document:d,options:{curveTolerance:.01},signal:null})[0];assert.equal(c.exact,false);assert.equal(c.proposal.add[0].type,'ARC');assert.equal(d.entities[0].type,'LWPOLYLINE');assert.equal(curveRecoveryRule.run({document:d,options:{profile:'exact'}}).length,0);const {commitCandidate}=await import('@revector/semantics');const next=commitCandidate(d,{...c,id:'fit',rule:'cad.sampled-curves'});assert.ok(validateDocument(next).valid);assert.deepEqual(next.history[0].removed[0].points,arc());});
test('Default plain X crossing does not assert engineering connectivity',()=>{const [c]=detectJunctions(doc([line('a',[0,5],[10,5]),line('b',[5,0],[5,10])]));assert.equal(c.evidence[0].connection,'unknown');assert.deepEqual(c.evidence[0].alternatives,['connected','not-connected']);assert.equal(c.proposal.remove,undefined);});
for(const policy of ['connect','cross'])test('Crossing policy is explicit provenance '+policy,()=>{const c=detectJunctions(doc([line('a',[0,5],[10,5]),line('b',[5,0],[5,10])]),{crossingPolicy:policy})[0];assert.equal(c.evidence[0].connection,policy==='connect'?'connected':'not-connected');assert.equal(c.evidence[0].evidence,'explicit-user-convention');});
test('Endpoint contacts and tees have distinct classifications',()=>{assert.equal(detectJunctions(doc([line('a',[0,0],[5,0]),line('b',[5,0],[5,10])]))[0].evidence[0].classification,'endpoint-join');assert.equal(detectJunctions(doc([line('a',[0,5],[10,5]),line('b',[5,5],[5,10])]))[0].evidence[0].classification,'tee-contact');});
test('Filled disk marker supports a junction, a stroked circle does not',()=>{const ps=arc(33,0,2*Math.PI).map(p=>p.map(v=>v/20+5));const dot={id:'dot',type:'HATCH',solid:true,layer:'0',paths:[{start:ps[0],segments:ps.slice(1).map(to=>({kind:'L',to})),closed:true}]};const d=doc([line('a',[0,5],[10,5]),line('b',[5,0],[5,10]),dot]);assert.equal(detectJunctions(d)[0].evidence[0].classification,'dot-junction');d.entities[2]={id:'outline',type:'CIRCLE',layer:'0',center:[5,5],radius:.5};assert.equal(detectJunctions(d)[0].evidence[0].connection,'unknown');});
test('Junction evidence survives serialization in every DXF generation',()=>{const d=doc([line('a',[0,5],[10,5]),line('b',[5,0],[5,10])]);d.groups=detectJunctions(d)[0].proposal.groups;for(const version of ['2000','2004','2007','2010','2013','2018'])assert.equal(readDxf(writeDxf(d,{version})).groups[0].semantic.connection,'unknown');});
test('Junction limits and cancellation are enforced',()=>{assert.throws(()=>detectJunctions(doc([line('a',[0,0],[5,5])]),{maxJunctionChecks:0}));assert.throws(()=>detectJunctions(doc([]),{crossingPolicy:'guess'}));assert.throws(()=>detectJunctions(doc([line('a',[0,0],[5,5])]),{signal:AbortSignal.abort()}),{name:'AbortError'});});
test('Rule registry keeps old ordering and has no duplicate identities',()=>{assert.equal(documentRules[0].id,'document.table-grids');const rules=[...cadRules,...documentRules];assert.equal(rules.length,20);assert.equal(new Set(rules.map(r=>r.id)).size,20);});
test('Appearance capture does not mutate scene and releases its canvas',async()=>{const s=scene(),before=structuredClone(s),made=[];const out=await captureAppearance(source(),s,{canvasFactory:(w,h)=>{const c=createCanvas(w,h);made.push(c);return c;}});assert.deepEqual(s,before);assert.equal(out.appearance.width,21);assert.equal(out.appearance.height,11);assert.ok(made.every(c=>c.width===1&&c.height===1));});
test('Appearance allocations are released on failure and cancellation',async()=>{for(const mode of ['failure','abort']){const c=createCanvas(1,1),controller=new AbortController();await assert.rejects(captureAppearance(source(mode==='failure'?{fail:true}:{aborted:controller}),scene(),{canvasFactory:()=>c,signal:controller.signal}));assert.equal(c.width,1);assert.equal(c.height,1);}});
test('Appearance rejects excess resolution before allocating and rejects pure XFA',async()=>{let made=0;await assert.rejects(captureAppearance(source(),scene(),{maxPixels:1,canvasFactory:()=>{made++;}}));assert.equal(made,0);const s=source();s.pdf.isPureXfa=true;await assert.rejects(captureAppearance(s,scene()),/XFA/);});
test('Appearance layers preserve native entities, off flags, measured mapping and integrity',async()=>{const s=scene();s.items.push({id:'l',kind:'path',operator:1,stroke:true,fill:false,paths:[{start:[1,1],segments:[{kind:'L',to:[9,4]}],closed:false}],style:{stroke:[20,40,60],lineWidth:1}});s.diagnostics.push({code:'SOFT_MASK',message:'Test mask',severity:'error'});const captured=await captureAppearance(source(),s,{canvasFactory:createCanvas});const engine=new ConversionEngine();
 for(const version of ['2000','2004','2007','2010','2013','2018']){const r=await engine.convertScene(captured,{profile:'exact',units:'pt',version,strict:true});assert.equal(r.document.entities.filter(e=>e.type==='LINE').length,1);assert.equal(r.preview.entities.filter(e=>e.type==='IMAGE').length,1);assert.ok(r.preview.layers.filter(l=>l.name!==r.report.appearance.layer).every(l=>l.visible===false));assert.deepEqual(r.preview.entities.find(e=>e.type==='IMAGE').position,[0,-.25]);assert.equal(r.report.appearance.nativeSemanticsComplete,false);assert.ok(packageDxf(r.document,{version,strict:true}).manifest.assets.length===1);}
 await assert.rejects(engine.convertScene(captured,{strict:true,strictSemantics:true}),/strict|Strict|SOFT_MASK|error/i);
 const semantics=await engine.convertScene(captured,{appearanceView:'semantic'});assert.equal(semantics.preview.layers.find(l=>l.name===semantics.report.appearance.layer).visible,false);
 const stale=structuredClone(captured);stale.ocgs.new={name:'changed',visible:true};await assert.rejects(engine.convertScene(stale),/Stale/);
});
test('Appearance never masks structural failures',async()=>{const s=scene();s.diagnostics.push({code:'GRAPHICS_STACK_UNDERFLOW',message:'bad restore',severity:'error'});const captured=await captureAppearance(source(),s,{canvasFactory:createCanvas});await assert.rejects(new ConversionEngine().convertScene(captured,{strict:true}),/strict|Strict|error/i);});
test('Original PDF archival is opt-in, byte-preserving, checksummed and budgeted',()=>{
 const bytes=new TextEncoder().encode('%PDF-1.7\noriginal hidden streams\n%%EOF'),d=doc([line('a',[0,0],[1,1])]);
 assert.equal(packageDxf(d).manifest.sourceArchive,undefined);
 const pack=packageDxf(d,{sourcePdf:bytes});assert.deepEqual(pack.files.find(f=>f.name.endsWith('.source.pdf')).data,bytes);
 const before=pack.files.find(f=>f.name.endsWith('.source.pdf')).data[0];bytes[0]=0;assert.equal(pack.files.find(f=>f.name.endsWith('.source.pdf')).data[0],before);
 assert.match(pack.manifest.sourceArchive.sha256,/^[0-9a-f]{64}$/);assert.match(pack.manifest.sourceArchive.warning,/hidden/);
 assert.throws(()=>packageDxf(d,{sourcePdf:bytes}),/original PDF/);assert.throws(()=>packageDxf(d,{sourcePdf:new TextEncoder().encode('%PDF-1.7'),maxBytes:1}),/budget/);
});
test('Cubic filled-dot geometry does not throw or create a RULE_FAILURE',()=>{const k=.552284749831,center=[5,5],r=.5;const p={start:[5.5,5],closed:true,segments:[{kind:'C',c1:[5.5,5+k*r],c2:[5+k*r,5.5],to:[5,5.5]},{kind:'C',c1:[5-k*r,5.5],c2:[4.5,5+k*r],to:[4.5,5]},{kind:'C',c1:[4.5,5-k*r],c2:[5-k*r,4.5],to:[5,4.5]},{kind:'C',c1:[5+k*r,4.5],c2:[5.5,5-k*r],to:[5.5,5]}]};const d=doc([line('a',[0,5],[10,5]),line('b',[5,0],[5,10]),{id:'dot',type:'HATCH',solid:true,paths:[p],layer:'0'}]);assert.equal(detectJunctions(d)[0].evidence[0].classification,'dot-junction');});

test('Fitting rejects numeric overflow and invalid point budgets instead of returning NaN certificates',()=>{
 for(const fit of [fitCubicPolyline,fitCircularPolyline]){
  assert.throws(()=>fit([[1e308,0],[-1e308,0]],{tolerance:1}),/overflow/);
  assert.throws(()=>fit([[0,0],[1,1]],{tolerance:1,maxPoints:NaN}),/budget/);
 }
});

test('Unrepresentable two-point tolerance is rejected instead of weakening the certificate',()=>{assert.throws(()=>fitCubicPolyline([[0,100000000000000],[90929742682568.17,-98999249660044.55]],{tolerance:1e-9}),/representable coordinate precision/);});
