import {diagramRegion} from './regions.js';
import { checkAbort as abortAnalysis, entityBox, entityPaths } from '@revector/model';
import { stableHash, distance, containsBox, intersects, dot, sub, length, near, pathEdges, emptyBox, union } from '@revector/geometry';
import { DisjointSet, SpatialIndex } from '@revector/topology';
const textTypes = new Set(['TEXT','MTEXT','ATTRIB']);
const median = a => a.length ? [...a].sort((a,b)=>a-b)[a.length>>1] : 1;
const expand=(b,d)=>[b[0]-d,b[1]-d,b[2]+d,b[3]+d];
const center=b=>[(b[0]+b[2])/2,(b[1]+b[3])/2];
const unique=es=>[...new Map(es.map(e=>[e.id,e])).values()];
function context(document,options={}) {
    abortAnalysis(options.signal);
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
    for(const seed of axis){abortAnalysis(options.signal);if(seen.has(seed))continue;const queue=[seed],component=[];seen.add(seed);while(queue.length){const s=queue.pop();component.push(s);if(component.length>1024)throw new RangeError('Table component budget exceeded');for(const t of index.search(expand(s.box,tol))){if(++checks>2_000_000)throw new RangeError('Table intersection budget exceeded');if(!seen.has(t)){seen.add(t);queue.push(t);}}}
        if(component.length>1024||component.length<6)continue;
        const hs=component.filter(s=>Math.abs(s.a[1]-s.b[1])<=tol),vs=component.filter(s=>Math.abs(s.a[0]-s.b[0])<=tol),xs=cluster(vs.map(s=>s.a[0]),tol),ys=cluster(hs.map(s=>s.a[1]),tol);
        if(xs.length<2||ys.length<2||xs.length*ys.length>4096)continue;
        // Missing internal separators join elementary cells. Partial separators are
        // ambiguous: reject rather than fabricate a cell edge or truncate a stroke.
        const coverage=(ss,coord,lo,hi,horizontal)=>{
            const ranges=ss.filter(s=>Math.abs(s.a[horizontal?1:0]-coord)<=tol)
                .map(s=>[Math.max(lo,s.box[horizontal?0:1]),Math.min(hi,s.box[horizontal?2:3])])
                .filter(([a,b])=>b>a+tol).sort((a,b)=>a[0]-b[0]);
            let end=lo,covered=0;
            for(const [a,b] of ranges){covered+=Math.max(0,b-Math.max(end,a));end=Math.max(end,b);}
            return covered<=tol?'absent':covered>=hi-lo-tol?'complete':'partial';
        };
        if(coverage(vs,xs[0],ys[0],ys.at(-1),false)!=='complete'||
           coverage(vs,xs.at(-1),ys[0],ys.at(-1),false)!=='complete'||
           coverage(hs,ys[0],xs[0],xs.at(-1),true)!=='complete'||
           coverage(hs,ys.at(-1),xs[0],xs.at(-1),true)!=='complete')continue;
        const box=[xs[0],ys[0],xs.at(-1),ys.at(-1)];
        if(component.some(s=>!containsBox(box,s.box,tol)))continue;
        const inside=c.index.search(box).filter(e=>containsBox(box,entityBox(e,document),tol));
        if(!inside.length)continue;
        const columns=xs.length-1,rows=ys.length-1,sets=new DisjointSet(columns*rows),barriers=[];
        let ambiguous=false;
        for(let y=0;y<rows;y++)for(let x=1;x<columns;x++){
            const a=y*columns+x-1,b=a+1,status=coverage(vs,xs[x],ys[y],ys[y+1],false);
            if(status==='partial')ambiguous=true;else if(status==='absent')sets.union(a,b);else barriers.push([a,b]);
        }
        for(let y=1;y<rows;y++)for(let x=0;x<columns;x++){
            const a=(y-1)*columns+x,b=y*columns+x,status=coverage(hs,ys[y],xs[x],xs[x+1],true);
            if(status==='partial')ambiguous=true;else if(status==='absent')sets.union(a,b);else barriers.push([a,b]);
        }
        if(ambiguous||barriers.some(([a,b])=>sets.find(a)===sets.find(b)))continue;
        const regions=new Map();
        for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
            const key=sets.find(y*columns+x),r=regions.get(key)||{x0:x,y0:y,x1:x+1,y1:y+1,count:0};
            r.x0=Math.min(r.x0,x);r.x1=Math.max(r.x1,x+1);r.y0=Math.min(r.y0,y);r.y1=Math.max(r.y1,y+1);r.count++;regions.set(key,r);
        }
        if([...regions.values()].some(r=>(r.x1-r.x0)*(r.y1-r.y0)!==r.count))continue;
        const cells=[...regions.values()].map(r=>{
            const b=[xs[r.x0],ys[r.y0],xs[r.x1],ys[r.y1]],texts=inside.filter(e=>{
                const p=center(entityBox(e,document));return p[0]>=b[0]&&p[0]<b[2]&&p[1]>=b[1]&&p[1]<b[3];
            }).sort((a,b)=>b.position[1]-a.position[1]||a.position[0]-b.position[0]);
            return {row:rows-r.y1,column:r.x0,rowSpan:r.y1-r.y0,columnSpan:r.x1-r.x0,bounds:b,text:texts.map(e=>e.text).join(' '),entities:texts.map(e=>e.id)};
        }).sort((a,b)=>a.row-b.row||a.column-b.column);
        bounded(out,proposal('table-grid',`Table grid · ${rows} rows × ${columns} columns`,[...component.map(s=>s.e),...inside],
            {bounds:box,rows,columns,cells,mergedCells:cells.filter(c=>c.rowSpan>1||c.columnSpan>1).length},.94));
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
/** Label ownership and connector endpoint matching use actual contour geometry.
 * Ties and multiple matching boundaries are ambiguous, not permission to fabricate a graph.
 */
export function detectDiagram(document,options={}) {
    const c=context(document,options),out=[],links=[];let work=0;
    const spend=n=>{work+=n;if(work>2_000_000)throw new RangeError('Diagram geometry budget exceeded');abortAnalysis(options.signal);};
    const nodes=[];
    for(const e of document.entities){if(!['CIRCLE','ELLIPSE','LWPOLYLINE'].includes(e.type))continue;
        const region=diagramRegion(e,document,c.tolerance,spend,options.signal);if(region)nodes.push(region);
    }
    const index=new SpatialIndex(nodes,n=>n.box),labels=new Map();
    for(const text of c.texts){spend(1);const box=entityBox(text,document);
        const possible=index.search(box).filter(n=>{spend(1);return containsBox(n.box,box,c.tolerance)&&n.contains(box);}).sort((a,b)=>a.area-b.area);
        if(!possible.length||possible[1]&&Math.abs(possible[1].area-possible[0].area)<=c.tolerance*c.tolerance)continue;
        const n=possible[0],members=labels.get(n.e.id)||[];members.push(text);labels.set(n.e.id,members);
    }
    const classified=new Set();
    for(const n of nodes){const texts=labels.get(n.e.id);if(!texts?.length||texts.length>=64)continue;texts.sort((a,b)=>b.position[1]-a.position[1]||a.position[0]-b.position[0]);classified.add(n.e.id);
        bounded(out,proposal('diagram-node',`Labeled ${n.e.type.toLowerCase()}`,[n.e,...texts],{label:texts.map(e=>e.text).join(' '),bounds:n.box,labelContainment:'full metric box inside contour',ownership:'smallest unambiguous region'},.90));
    }
    const endpoints=e=>e.type==='LINE'?[e.start,e.end]:e.type==='LWPOLYLINE'&&!e.closed?[e.points[0],e.points.at(-1)]:null;
    const tolerance=Math.max(c.tolerance,c.h*.12);
    for(const e of document.entities){const ends=endpoints(e);if(!ends)continue;
        const match=p=>{const found=index.search(expand([...p,...p],tolerance)).filter(n=>{spend(1);return n.e.id!==e.id&&classified.has(n.e.id)&&n.boundary(p)<=tolerance;});return found.length===1?found[0]:null;};
        const a=match(ends[0]),b=match(ends[1]);if(a&&b&&a.e.id!==b.e.id){links.push({from:a.e.id,to:b.e.id,connector:e.id});bounded(out,proposal('diagram-connection','Diagram connection',[a.e,b.e,e],{from:a.e.id,to:b.e.id,connector:e.id,directed:false,endpointEvidence:'contour boundary proximity'},.91));}
    }
    if(links.length&&links.length<=512){const connected=new Set(links.flatMap(l=>[l.from,l.to,l.connector]));bounded(out,proposal('diagram-graph',`Diagram graph · ${new Set(links.flatMap(l=>[l.from,l.to])).size} connected nodes`,document.entities.filter(e=>connected.has(e.id)),{nodes:[...new Set(links.flatMap(l=>[l.from,l.to]))],edges:links},.90));}
    return out;
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
/** Conservative borderless schedules: repeated aligned columns, whitespace gutters,
 * at least three rows and two columns. This is a hypothesis, never table reconstruction
 * by text content alone; original TEXT entities and reading direction remain intact. */
export function detectBorderlessTables(document, options={}) {
    const c=context(document,options),out=[],rows=[];
    const source=c.texts.filter(e=>Math.abs(((e.rotation||0)%360+360)%360)<.5)
        .map(e=>({e,box:entityBox(e,document)})).sort((a,b)=>b.e.position[1]-a.e.position[1]||a.box[0]-b.box[0]);
    for(const item of source){
        abortAnalysis(options.signal);
        const last=rows.at(-1),h=item.e.height||c.h;
        if(last&&Math.abs(item.e.position[1]-last.y)<=Math.min(h,last.h)*.25)last.items.push(item);
        else rows.push({y:item.e.position[1],h,items:[item]});
    }
    const candidates=[];
    for(const row of rows){
        row.items.sort((a,b)=>a.box[0]-b.box[0]);const cells=[];
        for(const item of row.items){
            const cell=cells.at(-1),gap=cell?item.box[0]-cell.box[2]:Infinity;
            if(cell&&gap<row.h*1.5){cell.items.push(item);union(cell.box,item.box);}
            else cells.push({items:[item],box:[...item.box]});
        }
        candidates.push({...row,cells});
    }
    let start=0;
    while(start<candidates.length){
        const first=candidates[start];
        if(first.cells.length<2||first.cells.length>32){start++;continue;}
        let end=start+1;
        while(end<candidates.length){
            const row=candidates[end],prev=candidates[end-1],gap=prev.y-row.y;
            if(row.cells.length!==first.cells.length||gap<Math.min(row.h,prev.h)*.8||gap>Math.max(row.h,prev.h)*4||
               row.cells.some((cell,i)=>Math.abs(cell.box[0]-first.cells[i].box[0])>c.h*.5))break;
            end++;
        }
        if(end-start>=3){
            if((end-start)*first.cells.length>4096)throw new RangeError('Borderless table cell budget exceeded');
            const chunk=candidates.slice(start,end),columns=first.cells.length;
            // A real whitespace gutter must remain across ALL rows, not just one.
            let gutters=true;
            for(let x=0;x<columns-1;x++)if(Math.min(...chunk.map(r=>r.cells[x+1].box[0]))-
                Math.max(...chunk.map(r=>r.cells[x].box[2]))<c.h*1.25)gutters=false;
            const entities=chunk.flatMap(r=>r.cells.flatMap(cell=>cell.items.map(i=>i.e))),bounds=emptyBox();
            for(const e of entities)union(bounds,entityBox(e,document));
            if(gutters)bounded(out,proposal('borderless-table',`Unruled schedule · ${chunk.length} rows × ${columns} columns`,entities,
                {bounds,rows:chunk.length,columns,cells:chunk.flatMap((r,row)=>r.cells.map((cell,column)=>({row,column,rowSpan:1,columnSpan:1,bounds:cell.box,
                    text:cell.items.map(i=>i.e.text).join(' '),entities:cell.items.map(i=>i.e.id)}))),
                 interpretation:'Repeated alignment and whitespace; may also be multi-column prose.'},.84));
        }
        start=end;
    }
    return out;
}
/** Numeric or bullet list markers must occupy a shared gutter and descend in page
 * order. Numeric lists must be consecutive; drawings' isolated item numbers do not qualify. */
export function detectLists(document, options={}) {
    const c=context(document,options),out=[],rows=[];let work=0;
    for(const e of c.texts){
        const match=String(e.text).trim().match(/^(?:(\d{1,4})[.)]|([•●▪◦]))(?:\s+(.+))?$/u);
        if(!match||Math.abs(e.rotation||0)>.5)continue;
        const box=entityBox(e,document),h=e.height||c.h;
        const companions=match[3]?[]:c.index.search([box[2],box[1]-h*.2,box[2]+h*24,box[3]+h*.2])
            .filter(t=>t!==e&&Math.abs(t.position[1]-e.position[1])<h*.25)
            .sort((a,b)=>a.position[0]-b.position[0]);
        if(!match[3]&&!companions.length)continue;
        rows.push({e,number:match[1]?Number(match[1]):null,marker:match[2]||null,body:match[3]||companions.map(t=>t.text).join(' '),members:[e,...companions]});
    }
    rows.sort((a,b)=>b.e.position[1]-a.e.position[1]||a.e.position[0]-b.e.position[0]);
    const used=new Set();
    for(const row of rows){
        abortAnalysis(options.signal);if(used.has(row.e.id))continue;
        const chain=[row];
        for(const next of rows){
            if(++work>1000000)throw new RangeError('List neighborhood budget exceeded');
            const prev=chain.at(-1),h=prev.e.height||c.h,gap=prev.e.position[1]-next.e.position[1];
            if(used.has(next.e.id)||gap<h*.8||gap>h*4||Math.abs(next.e.position[0]-row.e.position[0])>h*.5)continue;
            if(row.number===null?next.marker!==row.marker:next.number!==prev.number+1)continue;
            chain.push(next);
            if(chain.length>256)throw new RangeError('List length budget exceeded');
        }
        if(chain.length<3)continue;
        chain.forEach(r=>used.add(r.e.id));
        bounded(out,proposal('document-list',`${row.number===null?'Bullet':'Numbered'} list · ${chain.length} items`,chain.flatMap(r=>r.members),
            {ordered:row.number!==null,items:chain.map(r=>({number:r.number,text:r.body,entities:r.members.map(e=>e.id)}))},.9));
    }
    return out;
}
const definitions=[['table-grids','Tables and schedules',detectTables],['text-flows','Text reading flows',detectTextFlows],['notations','Engineering and electrical notation',detectTechnicalText],['fields','Labeled document fields',detectFields],['diagram','Diagram nodes and connectivity',detectDiagram],['parallel','Parallel boundaries',detectParallelBoundaries],['concentric','Concentric mechanical features',detectConcentric],['leaders','Leader callouts',detectLeaders],['borderless-tables','Unruled schedules',detectBorderlessTables],['lists','Numbered and bullet lists',detectLists]];
export const documentRules=definitions.map(([id,title,detect],i)=>({id:'document.'+id,title,version:['table-grids','diagram'].includes(id)?'1.1.0':'1.0.0',stage:60+i,description:'Evidence-bearing, geometry-preserving grouping; ambiguous meaning requires review.',run:({document,options,checkAbort})=>{checkAbort();return options.profile==='exact'?[]:detect(document,options);}}));
