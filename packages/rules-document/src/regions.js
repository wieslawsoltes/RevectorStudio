import {entityBox,checkAbort} from '@revector/model';
import {insidePaths} from '@revector/geometry';
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const pointDistance=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],q=x*x+y*y,t=q?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/q)):0;return Math.hypot(p[0]-a[0]-x*t,p[1]-a[1]-y*t);};
const properCross=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
/** Geometric enclosure predicates, not merely axis-aligned bounding-box hits.
 * Polyline bulges and partial ellipses are intentionally excluded until exact predicates exist.
 */
export function diagramRegion(e,document,tolerance,spend=()=>{},signal){
    const box=entityBox(e,document),corners=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
    if(e.type==='CIRCLE'&&e.radius>tolerance){
        const radial=p=>Math.hypot(p[0]-e.center[0],p[1]-e.center[1]);
        return {e,box,area:Math.PI*e.radius**2,contains:b=>corners(b).every(p=>radial(p)<=e.radius+tolerance),boundary:p=>Math.abs(radial(p)-e.radius)};
    }
    if(e.type==='ELLIPSE'&&e.ratio>0&&Math.abs((e.endParam??2*Math.PI)-(e.startParam??0)-2*Math.PI)<1e-8){
        const a=Math.hypot(...e.major),b=a*e.ratio,ux=e.major[0]/a,uy=e.major[1]/a;
        if(Math.min(a,b)<=tolerance)return null;
        const radius=p=>{const x=p[0]-e.center[0],y=p[1]-e.center[1];return Math.hypot((x*ux+y*uy)/a,(-x*uy+y*ux)/b);};
        return {e,box,area:Math.PI*a*b,contains:r=>corners(r).every(p=>radius(p)<=1+tolerance/Math.max(a,b)),boundary:p=>Math.abs(radius(p)-1)*Math.max(a,b)};
    }
    if(e.type!=='LWPOLYLINE'||!e.closed||e.bulges?.some(Boolean)||e.points.length<3||e.points.length>128)return null;
    const points=e.points.map(p=>[...p]);if(pointDistance(points.at(-1),points[0],points[0])<=tolerance)points.pop();
    if(points.length<3)return null;
    const edges=points.map((p,i)=>[p,points[(i+1)%points.length]]);
    let area=0;
    for(let i=0;i<edges.length;i++){
        checkAbort(signal);const [a,b]=edges[i];area+=a[0]*b[1]-a[1]*b[0];if(pointDistance(a,b,b)<=tolerance)return null;
        for(let j=i+1;j<edges.length;j++){
            spend(1);if(j===i+1||i===0&&j===edges.length-1)continue;const [c,d]=edges[j];
            if(properCross(a,b,c,d)||Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b))<=tolerance)return null;
        }
    }
    area=Math.abs(area/2);if(area<=tolerance*tolerance)return null;
    const paths=[{start:points[0],closed:true,segments:points.slice(1).map(to=>({kind:'L',to}))}];
    const contains=r=>{
        spend(edges.length*8);const cs=corners(r);
        if(!cs.every(p=>insidePaths(p,paths,'nonzero')))return false;
        // All corners inside is insufficient for a concave contour: a notch can
        // cut through a box edge or be wholly enclosed by the text metric box.
        for(const [a,b] of edges){if(a[0]>r[0]+tolerance&&a[0]<r[2]-tolerance&&a[1]>r[1]+tolerance&&a[1]<r[3]-tolerance)return false;
            for(let i=0;i<4;i++)if(properCross(a,b,cs[i],cs[(i+1)%4]))return false;
        }return true;
    };
    return {e,box,area,contains,boundary:p=>{spend(edges.length);return Math.min(...edges.map(([a,b])=>pointDistance(p,a,b)));}};
}
