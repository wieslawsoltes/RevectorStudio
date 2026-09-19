import { entityBox, entityPaths } from '@revector/model';
import { stableHash, distance, containsBox, intersects, dot, sub, length, near, pathEdges, emptyBox, union } from '@revector/geometry';
import { SpatialIndex } from '@revector/topology';
const textTypes = new Set(['TEXT','MTEXT','ATTRIB']);
const median = a => a.length ? [...a].sort((a,b)=>a-b)[a.length>>1] : 1;
const expand=(b,d)=>[b[0]-d,b[1]-d,b[2]+d,b[3]+d];
const center=b=>[(b[0]+b[2])/2,(b[1]+b[3])/2];
const unique=es=>[...new Map(es.map(e=>[e.id,e])).values()];
function context(document,options={}) {
    if(document.entities.length>(options.maxAnalysisEntities??150000))throw new RangeError('Document analysis entity budget exceeded');
    const texts=document.entities.filter(e=>textTypes.has(e.type)&&String(e.text||'').trim()),h=median(texts.map(e=>e.height).filter(h=>h>0));
    const span=Math.hypot(document.pageBox[2]-document.pageBox[0],document.pageBox[3]-document.pageBox[1]);
    const tolerance=options.semanticTolerance??Math.max(1e-7,span*1e-6);
    if(!Number.isFinite(tolerance)||tolerance<=0)throw new RangeError('Invalid semantic tolerance');
    const index=new SpatialIndex(texts,e=>entityBox(e,document));return {document,texts,h,tolerance,index};
}
function proposal(kind,title,entities,metadata,confidence=.9,evidence=[]) {
    const members=unique(entities).map(e=>e.id);if(!members.length)return null;
    const name=kind+'_'+stableHash(members);
    return {title,members,confidence,exact:true,evidence:[{kind,...metadata},...evidence],proposal:{groups:[{name,description:title,members,semantic:{class:kind,confidence,geometryPreserved:true,...metadata}}]}};
}
function bounded(out,value,max=5000){if(value)out.push(value);if(out.length>max)throw new RangeError('Document feature budget exceeded');}
function segments(document){const out=[];for(const e of document.entities){if(!['LINE','LWPOLYLINE'].includes(e.type)||e.bulges?.some(Boolean))continue;for(const p of entityPaths(e))for(const edge of pathEdges(p))if(edge.kind==='L'&&distance(...edge.points)>1e-9)out.push({e,a:edge.points[0],b:edge.points[1],box:[Math.min(edge.points[0][0],edge.points[1][0]),Math.min(edge.points[0][1],edge.points[1][1]),Math.max(edge.points[0][0],edge.points[1][0]),Math.max(edge.points[0][1],edge.points[1][1])]});}return out;}
function cluster(values,tolerance){const result=[];for(const value of [...values].sort((a,b)=>a-b))if(!result.length||value-result.at(-1)>tolerance)result.push(value);return result;}
/** Connected, closed rectangular grids: actual line coverage is required at every border.
 * This deliberately does not call unrelated page-wide horizontal rules a table. */
export function detectTables(document,options={}) {
    const c=context(document,options),tol=c.tolerance,out=[],lines=segments(document),axis=lines.filter(s=>Math.abs(s.a[0]-s.b[0])<=tol||Math.abs(s.a[1]-s.b[1])<=tol);
    const index=new SpatialIndex(axis,s=>expand(s.box,tol)),seen=new Set();let checks=0;
    for(const seed of axis){if(seen.has(seed))continue;const queue=[seed],component=[];seen.add(seed);while(queue.length){const s=queue.pop();component.push(s);if(component.length>1024)break;for(const t of index.search(expand(s.box,tol))){if(++checks>2_000_000)throw new RangeError('Table intersection budget exceeded');if(!seen.has(t)){seen.add(t);queue.push(t);}}}
        if(component.length>1024||component.length<6)continue;
        const hs=component.filter(s=>Math.abs(s.a[1]-s.b[1])<=tol),vs=component.filter(s=>Math.abs(s.a[0]-s.b[0])<=tol),xs=cluster(vs.map(s=>s.a[0]),tol),ys=cluster(hs.map(s=>s.a[1]),tol);
        if(xs.length<2||ys.length<2||xs.length*ys.length>4096)continue;
        const covers=(ss,coord,lo,hi,horizontal)=>{const ranges=ss.filter(s=>Math.abs(s.a[horizontal?1:0]-coord)<=tol).map(s=>[Math.min(s.a[horizontal?0:1],s.b[horizontal?0:1]),Math.max(s.a[horizontal?0:1],s.b[horizontal?0:1])]).sort((a,b)=>a[0]-b[0]);let end=lo;for(const [a,b] of ranges){if(a>end+tol)break;if(b>end)end=b;}return end>=hi-tol;};
        if(!xs.every(x=>covers(vs,x,ys[0],ys.at(-1),false))||!ys.every(y=>covers(hs,y,xs[0],xs.at(-1),true)))continue;
        const box=[xs[0],ys[0],xs.at(-1),ys.at(-1)];if(component.some(s=>!containsBox(box,s.box,tol)))continue;const inside=c.index.search(box).filter(e=>containsBox(box,entityBox(e,document),tol));if(!inside.length)continue;
        const cells=[];for(let y=ys.length-2;y>=0;y--)for(let x=0;x<xs.length-1;x++){const b=[xs[x],ys[y],xs[x+1],ys[y+1]],texts=inside.filter(e=>{const p=center(entityBox(e,document));return p[0]>=b[0]&&p[0]<b[2]&&p[1]>=b[1]&&p[1]<b[3];}).sort((a,b)=>b.position[1]-a.position[1]||a.position[0]-b.position[0]);cells.push({row:ys.length-2-y,column:x,bounds:b,text:texts.map(e=>e.text).join(' '),entities:texts.map(e=>e.id)});}
        bounded(out,proposal('table-grid',`Table grid · ${ys.length-1} rows × ${xs.length-1} columns`,[...component.map(s=>s.e),...inside],{bounds:box,rows:ys.length-1,columns:xs.length-1,cells},.94));
    }return out;
}
/** Baseline bucketing with spatial neighborhood queries; preserve every original text run. */
export function detectTextFlows(document,options={}) {
    const c=context(document,options),out=[],visited=new Set();
    for(const seed of c.texts){if(visited.has(seed.id))continue;const angle=(seed.rotation||0)*Math.PI/180,u=[Math.cos(angle),Math.sin(angle)],n=[-u[1],u[0]],height=seed.height||c.h,items=[seed],queue=[seed];visited.add(seed.id);
        while(queue.length&&items.length<=256){const e=queue.pop(),b=entityBox(e,document);for(const next of c.index.search(expand(b,height*1.6))){if(visited.has(next.id)||Math.abs(Math.sin(((next.rotation||0)-(seed.rotation||0))*Math.PI/180))>.025||Math.abs(next.height-height)>height*.3)continue;const delta=sub(next.position,seed.position);if(Math.abs(dot(delta,n))>height*.25)continue;visited.add(next.id);items.push(next);queue.push(next);}}
        if(items.length<2||items.length>256)continue;items.sort((a,b)=>dot(a.position,u)-dot(b.position,u));bounded(out,proposal('text-flow',`Text flow · ${items.length} runs`,items,{rotation:seed.rotation||0,text:items.map(e=>e.text).join(' '),readingOrder:items.map(e=>e.id)},.96));
    }return out;
}
const quantities=[
 ['diameter',/^(?:[⌀Øø]|DIA\.?\s*)\s*\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|in))?$/i],
 ['radius',/^R\s*\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|in))?$/i],
 ['thread',/^M\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?(?:\s*-\s*\d[HhGg])?$/],
 ['tolerance',/^[±]\s*\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|in|°))?$/],
 ['quantity',/^[+-]?\d+(?:[.,]\d+)?\s*(?:mm|cm|m|in|ft|°|kPa|MPa|bar|psi|V|mV|kV|A|mA|Hz|kHz|MHz|Ω|kΩ|MΩ|W|kW|rpm|kg|N|Nm|°C|°F)$/],
 ['scale',/^(?:SCALE\s*)?1\s*:\s*\d+(?:[.,]\d+)?$/i],
 ['reference-designator',/^(?:R|C|L|D|Q|U|J|P|TB|FU|K|SW)\d{1,5}[A-Z]?$/],
 ['instrument-tag',/^(?:P|T|F|L|A)(?:I|T|C|S|V|D|R){1,3}[- ]?\d{2,6}[A-Z]?$/],
];
export function classifyTechnicalText(text){const s=String(text).trim();if(s.length>160)return [];return quantities.filter(([,re])=>re.test(s)).map(([kind])=>kind);}
export function detectTechnicalText(document,options={}){const c=context(document,options),out=[];for(const e of c.texts){const classes=classifyTechnicalText(e.text);if(classes.length)bounded(out,proposal('technical-notation',`${classes.join(' / ')} · ${e.text}`,[e],{classes,text:e.text,interpretation:'lexical candidate, not verified engineering meaning'},.9));}return out;}
export function detectFields(document,options={}) {
    const c=context(document,options),out=[];const vocabulary=/^(?:DATE|DRAWN|CHECKED|APPROVED|REV(?:ISION)?|TITLE|SHEET|DWG|DRAWING|PART|ITEM|QTY|QUANTITY|MATERIAL|NAME|ADDRESS|TOTAL|DESCRIPTION|PROJECT|NUMER|DATA|TYTUŁ)\s*[:#.]?$/i;
    for(const e of c.texts){if(!vocabulary.test(String(e.text).trim()))continue;const b=entityBox(e,document),h=e.height||c.h,candidates=c.index.search([b[2]-h*.2,b[1]-h*.5,b[2]+h*18,b[3]+h*.5]).filter(t=>t.id!==e.id&&!vocabulary.test(t.text)).sort((a,b)=>distance(e.position,a.position)-distance(e.position,b.position));const value=candidates[0];if(value)bounded(out,proposal('labeled-field',`${e.text} → ${value.text}`,[e,value],{label:e.text,value:value.text,relation:'nearest right-hand baseline field'},.86));}
    return out;
}
function shapes(document,tolerance){return document.entities.filter(e=>e.type==='CIRCLE'||e.type==='ELLIPSE'||e.type==='LWPOLYLINE'&&e.closed&&e.points.length>=3&&e.points.length<=8).map(e=>({e,box:entityBox(e,document)})).filter(s=>s.box[2]-s.box[0]>tolerance&&s.box[3]-s.box[1]>tolerance);}
export function detectDiagram(document,options={}) {
    const c=context(document,options),nodes=shapes(document,c.tolerance),out=[],index=new SpatialIndex(nodes,n=>n.box),links=[];
    const classified=new Set();for(const n of nodes){const texts=c.index.search(n.box).filter(e=>containsBox(n.box,entityBox(e,document),c.tolerance));if(texts.length&&texts.length<64){classified.add(n.e.id);bounded(out,proposal('diagram-node',`Labeled ${n.e.type.toLowerCase()}`,[n.e,...texts],{label:texts.map(e=>e.text).join(' '),bounds:n.box},.90));}}
    const endpoints=e=>e.type==='LINE'?[e.start,e.end]:e.type==='LWPOLYLINE'&&!e.closed?[e.points[0],e.points.at(-1)]:null;
    for(const e of document.entities){const ends=endpoints(e);if(!ends)continue;const match=p=>index.search(expand([...p,...p],Math.max(c.tolerance,c.h*.12))).filter(n=>n.e.id!==e.id&&classified.has(n.e.id)).sort((a,b)=>(a.box[2]-a.box[0])*(a.box[3]-a.box[1])-(b.box[2]-b.box[0])*(b.box[3]-b.box[1]))[0];const a=match(ends[0]),b=match(ends[1]);if(a&&b&&a.e.id!==b.e.id){links.push({from:a.e.id,to:b.e.id,connector:e.id});bounded(out,proposal('diagram-connection','Diagram connection',[a.e,b.e,e],{from:a.e.id,to:b.e.id,connector:e.id,directed:false},.91));}}
    if(links.length&&links.length<=512)bounded(out,proposal('diagram-graph',`Diagram graph · ${classified.size} labeled nodes`,document.entities.filter(e=>classified.has(e.id)||links.some(l=>l.connector===e.id)),{nodes:[...classified],edges:links},.90));return out;
}
export function detectParallelBoundaries(document,options={}) {
    const c=context(document,options),ss=segments(document),index=new SpatialIndex(ss,s=>s.box),out=[],visited=new Set();let work=0;
    for(const s of ss){const v=sub(s.b,s.a),len=length(v);if(len<c.h*4)continue;const u=v.map(x=>x/len),n=[-u[1],u[0]];for(const t of index.search(expand(s.box,Math.min(len*.15,c.h*5)))){if(++work>1_000_000)throw new RangeError('Parallel boundary budget exceeded');if(s.e.id===t.e.id||s.e.layer!==t.e.layer)continue;const key=[s.e.id,t.e.id].sort().join('|');if(visited.has(key))continue;const tv=sub(t.b,t.a),tl=length(tv);if(tl<1e-9||Math.abs((u[0]*tv[1]-u[1]*tv[0])/tl)>.005)continue;const d=Math.abs(dot(sub(t.a,s.a),n));if(d<=c.tolerance||d>Math.min(len*.15,c.h*5))continue;const ts=[dot(sub(t.a,s.a),u),dot(sub(t.b,s.a),u)].sort((a,b)=>a-b),overlap=Math.max(0,Math.min(len,ts[1])-Math.max(0,ts[0]));if(overlap/Math.max(len,tl)<.85)continue;visited.add(key);bounded(out,proposal('parallel-boundaries','Parallel wall / pipe / border candidate',[s.e,t.e],{separation:d,overlap,orientation:Math.atan2(u[1],u[0])*180/Math.PI,alternatives:['wall','pipe','border','dimension-extension']},.83));}}
    return out;
}
export function detectConcentric(document,options={}) {
    const c=context(document,options),circles=document.entities.filter(e=>e.type==='CIRCLE'),index=new SpatialIndex(circles,e=>[...e.center,...e.center]),seen=new Set(),out=[];
    for(const e of circles){if(seen.has(e.id))continue;const tolerance=Math.max(c.tolerance,e.radius*1e-4),group=index.search(expand([...e.center,...e.center],tolerance)).filter(t=>distance(e.center,t.center)<=tolerance);group.forEach(t=>seen.add(t.id));if(group.length>=2&&group.length<=64)bounded(out,proposal('concentric-feature','Concentric hole / ring candidate',group,{center:e.center,radii:group.map(e=>e.radius).sort((a,b)=>a-b),alternatives:['hole','ring','bearing','target']},.95));}return out;
}
export function detectLeaders(document,options={}) {
    const c=context(document,options),ss=segments(document),index=new SpatialIndex(ss,s=>s.box),out=[],seen=new Set();let work=0;
    for(const s of ss){if(distance(s.a,s.b)<c.h*2)continue;for(const tip of [s.a,s.b]){const tail=tip===s.a?s.b:s.a,shaft=sub(tail,tip),sl=length(shaft),nearby=index.search(expand([...tip,...tip],c.tolerance*4)).filter(t=>t.e.id!==s.e.id&&(near(t.a,tip,c.tolerance*4)||near(t.b,tip,c.tolerance*4)));
            const wings=[];for(const t of nearby){if(++work>1_000_000)throw new RangeError('Leader budget exceeded');const p=near(t.a,tip,c.tolerance*4)?t.b:t.a,v=sub(p,tip),vl=length(v),cos=dot(v,shaft)/(vl*sl);if(vl<sl*.4&&vl>c.tolerance&&cos>.5&&cos<.98)wings.push({t,sign:Math.sign(v[0]*shaft[1]-v[1]*shaft[0]),len:vl});}
            const a=wings.find(w=>w.sign>0),b=wings.find(w=>w.sign<0);if(!a||!b||a.len/b.len<.6||a.len/b.len>1.67)continue;const texts=c.index.search(expand([...tail,...tail],c.h*3)),label=texts.sort((a,b)=>distance(center(entityBox(a,document)),tail)-distance(center(entityBox(b,document)),tail))[0];if(!label)continue;const key=[s.e.id,a.t.e.id,b.t.e.id,label.id].sort().join('|');if(seen.has(key))continue;seen.add(key);bounded(out,proposal('leader-callout',`Leader → ${label.text}`,[s.e,a.t.e,b.t.e,label],{tip,tail,text:label.text},.91));}}
    return out;
}
const definitions=[['table-grids','Tables and schedules',detectTables],['text-flows','Text reading flows',detectTextFlows],['notations','Engineering and electrical notation',detectTechnicalText],['fields','Labeled document fields',detectFields],['diagram','Diagram nodes and connectivity',detectDiagram],['parallel','Parallel boundaries',detectParallelBoundaries],['concentric','Concentric mechanical features',detectConcentric],['leaders','Leader callouts',detectLeaders]];
export const documentRules=definitions.map(([id,title,detect],i)=>({id:'document.'+id,title,version:'1.0.0',stage:60+i,description:'Evidence-bearing, geometry-preserving grouping; ambiguous meaning requires review.',run:({document,options,checkAbort})=>{checkAbort();return options.profile==='exact'?[]:detect(document,options);}}));
