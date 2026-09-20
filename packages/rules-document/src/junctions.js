import {SpatialIndex} from '@revector/topology';
import {checkAbort,entityBox} from '@revector/model';
import {cubicPoint,stableHash} from '@revector/geometry';
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const expand=(b,t)=>[b[0]-t,b[1]-t,b[2]+t,b[3]+t];
function dotMarker(e,doc){
    if(e.type!=='HATCH'||e.solid===false||e.paths?.length!==1)return null;
    const b=entityBox(e,doc);
    if(e.paths[0].segments.length>128)return null;
    const path=e.paths[0],points=[path.start];let at=path.start;
    for(const s of path.segments){if(s.kind==='C'){for(let i=1;i<=12;i++)points.push(cubicPoint([at,s.c1,s.c2,s.to],i/12));}else points.push(s.to);at=s.to;}
    if(points.length<9||points.length>512)return null;
    const c=[(b[0]+b[2])/2,(b[1]+b[3])/2],radius=(b[2]-b[0]+b[3]-b[1])/4;
    if(radius<=0||Math.abs((b[2]-b[0])-(b[3]-b[1]))>.08*radius)return null;
    if(points.some(p=>Math.abs(dist(c,p)-radius)>radius*.08))return null;
    return {e,center:c,radius,box:b};
}
/** Describe junction HYPOTHESES without connecting unrelated CAD entities destructively.
 * Plain X crossings remain unknown unless a drawing convention or filled-dot evidence exists.
 * Geometry-preserving GROUP evidence carries alternatives, incident ports and convention source.
 */
export function detectJunctions(document,options={}) {
    const tol=options.semanticTolerance??Math.max(1e-7,Math.hypot(document.pageBox[2]-document.pageBox[0],document.pageBox[3]-document.pageBox[1])*1e-6),policy=options.crossingPolicy??'unknown';
    if(!Number.isFinite(tol)||tol<=0||!['unknown','connect','cross'].includes(policy))throw new RangeError('Invalid junction options');
    const segments=[],dots=[];
    if(document.entities.length>(options.maxAnalysisEntities??150000))throw new RangeError('Junction entity budget exceeded');
    for(const e of document.entities){checkAbort(options.signal);
        const pts=e.type==='LINE'?[e.start,e.end]:e.type==='LWPOLYLINE'&&!e.bulges?.some(Boolean)?e.closed?[...e.points,e.points[0]]:e.points:null;
        if(pts)for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],v=sub(b,a),length=Math.hypot(...v);if(length<=tol)continue;
            segments.push({e,i,a,b,v,length,box:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],index:segments.length});
            if(segments.length>100000)throw new RangeError('Junction segment budget exceeded');
        }
        const dot=dotMarker(e,document);if(dot)dots.push(dot);
    }
    const index=new SpatialIndex(segments,s=>s.box),markers=new SpatialIndex(dots,d=>d.box),events=[],cells=new Map();let work=0;
    const key=(x,y)=>x+','+y;
    const eventAt=p=>{
        const x=Math.floor(p[0]/tol),y=Math.floor(p[1]/tol);let found;
        for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const e of cells.get(key(x+i,y+j))||[])if(dist(e.point,p)<=tol)found=e;
        if(found)return found;
        const e={point:p,ports:new Map()},k=key(x,y);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(e);events.push(e);
        if(events.length>5000)throw new RangeError('Junction event budget exceeded');return e;
    };
    for(const a of segments){checkAbort(options.signal);
        for(const b of index.search(expand(a.box,tol))){
            if(++work>(options.maxJunctionChecks??1_000_000))throw new RangeError('Junction neighborhood budget exceeded');
            if(b.index<=a.index||a.e.id===b.e.id&&Math.abs(a.i-b.i)<=1)continue;
            const den=cross(a.v,b.v);if(Math.abs(den)<1e-10*a.length*b.length)continue;
            const diff=sub(b.a,a.a),t=cross(diff,b.v)/den,u=cross(diff,a.v)/den;
            if(t< -tol/a.length||t>1+tol/a.length||u< -tol/b.length||u>1+tol/b.length)continue;
            const p=[a.a[0]+a.v[0]*t,a.a[1]+a.v[1]*t],event=eventAt(p);
            for(const [s,f] of [[a,t],[b,u]])event.ports.set(s.index,{entity:s.e.id,segment:s.i-1,parameter:Math.max(0,Math.min(1,f)),endpoint:Math.min(Math.abs(f),Math.abs(1-f))*s.length<=tol,direction:s.v.map(v=>v/s.length),length:s.length});
        }
    }
    const out=[];
    for(const event of events){
        checkAbort(options.signal);const ports=[...event.ports.values()],members=[...new Set(ports.map(p=>p.entity))].sort();if(members.length<2)continue;
        const near=markers.search(expand([...event.point,...event.point],tol)).filter(d=>dist(d.center,event.point)<=Math.max(tol,d.radius*.35)&&ports.every(p=>d.radius<p.length/4));
        const ends=ports.filter(p=>p.endpoint).length;
        let classification=ends===ports.length?'endpoint-join':ends?'tee-contact':'unmarked-crossing',connection=ends?'connected':'unknown',evidence='geometric-contact',confidence=ends?.9:.5;
        if(near.length===1){classification='dot-junction';connection='connected';evidence='filled-round-marker';confidence=.97;members.push(near[0].e.id);}
        else if(near.length>1){connection='unknown';classification='ambiguous-markers';confidence=.5;}
        else if(!ends&&policy!=='unknown'){connection=policy==='connect'?'connected':'not-connected';evidence='explicit-user-convention';confidence=.96;}
        const metadata={class:'junction-hypothesis',classification,point:event.point,ports,connection,alternatives:connection==='unknown'?['connected','not-connected']:[],convention:policy,evidence,geometryPreserved:true};
        const name='JUNCTION_'+stableHash([members,event.point]);
        out.push({title:`${classification} · ${members.length} members`,members,confidence,exact:true,evidence:[{kind:'junction-hypothesis',...metadata}],proposal:{groups:[{name,description:'Reviewable junction hypothesis',members,semantic:metadata}]}});
    }
    return out;
}
export const junctionRule={id:'document.junctions',version:'1.0.0',title:'Crossing and junction hypotheses',stage:79,
    description:'Distinguishes filled-dot junctions, endpoint/tee contacts and unresolved crossings; never silently connects a plain X.',
    run:({document,options})=>options.profile==='exact'?[]:detectJunctions(document,options)};
