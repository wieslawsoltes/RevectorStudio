import {cubicPoint,subCubic} from './index.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const abort=s=>{if(s?.aborted)throw Object.assign(Error('Curve fitting cancelled'),{name:'AbortError'});};
function solve(matrix,rhs){
    const n=rhs.length,a=matrix.map((r,i)=>[...r,rhs[i]]);
    for(let c=0;c<n;c++){
        let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
        if(Math.abs(a[pivot][c])<1e-12)return null;
        [a[c],a[pivot]]=[a[pivot],a[c]];const q=a[c][c];for(let k=c;k<=n;k++)a[c][k]/=q;
        for(let r=0;r<n;r++)if(r!==c){const f=a[r][c];for(let k=c;k<=n;k++)a[r][k]-=f*a[c][k];}
    }return a.map(r=>r[n]);
}
function prepare(points,o){
    abort(o.signal);
    if(!Number.isFinite(o.tolerance)||o.tolerance<=0)throw new RangeError('Positive finite fitting tolerance required');
    if(!Number.isSafeInteger(o.maxPoints??20000)||(o.maxPoints??20000)<2)throw new RangeError('Invalid fitting point budget');
    if(!Array.isArray(points)||points.length<2||points.length>(o.maxPoints??20000))throw new RangeError('Curve fitting point budget');
    if(points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw new TypeError('Finite 2D points required');
    const result=points.filter((p,i)=>!i||distance(p,points[i-1])>1e-12).map(p=>[...p]);
    if(result.length<2)throw new RangeError('Degenerate fitting points');
    if(result.some((p,i)=>i&&!Number.isFinite(distance(p,result[i-1]))))throw new RangeError('Curve coordinate range overflow');
    return result;
}
/** Circle/arc hypothesis. The error certificate covers each straight source chord against its
 * corresponding monotone circular arc (endpoint radial error plus maximum chord sagitta).
 * This is a bound relative to the supplied polyline, not the unknown original drawing.
 */
export function fitCircularPolyline(points,options={}) {
    const o={tolerance:.01,closed:false,...options},ps=prepare(points,o);
    if(o.closed&&distance(ps[0],ps.at(-1))<1e-12)ps.pop();
    if(ps.length<6)return null;
    const center=[0,0];for(const p of ps){center[0]+=p[0]/ps.length;center[1]+=p[1]/ps.length;}
    const scale=Math.max(...ps.map(p=>distance(p,center)));if(!Number.isFinite(scale))throw new RangeError('Circle coordinate range overflow');if(!scale)return null;
    const m=Array.from({length:3},()=>[0,0,0]),rhs=[0,0,0];
    for(const p of ps){abort(o.signal);const x=(p[0]-center[0])/scale,y=(p[1]-center[1])/scale,v=[x,y,1],r=-(x*x+y*y);for(let i=0;i<3;i++){rhs[i]+=v[i]*r;for(let j=0;j<3;j++)m[i][j]+=v[i]*v[j];}}
    const q=solve(m,rhs);if(!q)return null;
    const c=[center[0]-q[0]*scale/2,center[1]-q[1]*scale/2],radius=Math.sqrt((q[0]*q[0]+q[1]*q[1])/4-q[2])*scale;
    if(!Number.isFinite(radius)||radius<=o.tolerance)return null;
    const angles=ps.map(p=>Math.atan2(p[1]-c[1],p[0]-c[0]));
    let sign=0,total=0,bound=0,maxRadialError=0;
    for(let i=0;i<ps.length-(o.closed?0:1);i++){
        const j=(i+1)%ps.length;let delta=angles[j]-angles[i];delta=Math.atan2(Math.sin(delta),Math.cos(delta));
        if(Math.abs(delta)>Math.PI/2||Math.abs(delta)<1e-10)return null;
        if(sign&&sign!==Math.sign(delta))return null;sign=Math.sign(delta);total+=delta;
        const radial=Math.max(Math.abs(distance(ps[i],c)-radius),Math.abs(distance(ps[j],c)-radius));
        maxRadialError=Math.max(maxRadialError,radial);bound=Math.max(bound,radial+radius*(1-Math.cos(Math.abs(delta)/2)));
    }
    if(Math.abs(total)<Math.PI/12||Math.abs(total)>2*Math.PI+1e-6||(o.closed&&Math.abs(Math.abs(total)-2*Math.PI)>1e-6)||bound>o.tolerance)return null;
    const degree=a=>(a*180/Math.PI+360)%360;
    return {type:o.closed?'CIRCLE':'ARC',center:c,radius,...(o.closed?{}:{startAngle:degree(sign>0?angles[0]:angles.at(-1)),endAngle:degree(sign>0?angles.at(-1):angles[0])}),
        evidence:{method:'normalized-least-squares-circle',sourceDirection:sign,errorBound:bound,maxRadialError,sweep:total,samples:ps.length,metric:'continuous-source-chord-to-arc-bound'}};
}
function fitCubic(ps,parameters){
    const first=ps[0],last=ps.at(-1),m=[[0,0],[0,0]],x=[0,0],y=[0,0];
    for(let i=1;i<ps.length-1;i++){
        const t=parameters[i],u=1-t,b=[3*u*u*t,3*u*t*t],p=[ps[i][0]-u*u*u*first[0]-t*t*t*last[0],ps[i][1]-u*u*u*first[1]-t*t*t*last[1]];
        for(let j=0;j<2;j++){x[j]+=b[j]*p[0];y[j]+=b[j]*p[1];for(let k=0;k<2;k++)m[j][k]+=b[j]*b[k];}
    }
    const cx=solve(m,x),cy=solve(m,y);
    return cx&&cy?[first,[cx[0],cy[0]],[cx[1],cy[1]],last]:[first,lerp(first,last,1/3),lerp(first,last,2/3),last];
}
/** Piecewise cubic least squares with a CONTINUOUS error certificate.
 * On each chord-length parameter interval, subtract the degree-elevated source line
 * from the restricted cubic. The convex-hull property bounds the norm by the maximum
 * difference of the four Bernstein control points. Failure to meet the budget splits
 * the interval; unresolved recursion/budget limits throw instead of weakening tolerance.
 * Joins preserve endpoints (C0). This routine makes no G1/G2 or intersection-free promise.
 */
export function fitCubicPolyline(points,options={}) {
    const o={tolerance:.01,maxSegments:4096,maxWork:4_000_000,closed:false,...options},ps=prepare(points,o);
    for(const k of ['maxSegments','maxWork'])if(!Number.isSafeInteger(o[k])||o[k]<1)throw new RangeError('Invalid fitting '+k);
    if(o.closed&&distance(ps[0],ps.at(-1))>1e-12)ps.push([...ps[0]]);
    const stack=[[0,ps.length-1]],result=[];let work=0,maxError=0;
    while(stack.length){
        abort(o.signal);const [lo,hi]=stack.pop(),part=ps.slice(lo,hi+1);
        work+=part.length;if(work>o.maxWork)throw new RangeError('Curve fitting work budget exceeded');
        const ts=[0];for(let i=1;i<part.length;i++)ts.push(ts.at(-1)+distance(part[i-1],part[i]));const length=ts.at(-1);if(!Number.isFinite(length)||length<=0)throw new RangeError('Curve length overflow');for(let i=1;i<ts.length;i++)ts[i]/=length;
        const curve=fitCubic(part,ts);if(!curve.flat().every(Number.isFinite))throw new RangeError('Curve coefficient overflow');let bound=0,worst=1;
        for(let i=0;i<part.length-1;i++){
            const restricted=subCubic(curve,ts[i],ts[i+1]);
            for(let j=0;j<4;j++){const error=distance(restricted[j],lerp(part[i],part[i+1],j/3));if(error>bound){bound=error;worst=Math.min(part.length-2,Math.max(1,i+1));}}
        }
        if(bound<=o.tolerance){
            maxError=Math.max(maxError,bound);result.push({controlPoints:curve.map(p=>[...p]),errorBound:bound,sourceRange:[lo,hi]});
            if(result.length+stack.length>o.maxSegments)throw new RangeError('Curve fitting segment budget exceeded');
        }else{
            if(part.length===2)throw new RangeError('Fitting tolerance is below representable coordinate precision');
            if(stack.length+result.length+2>o.maxSegments)throw new RangeError('Curve fitting segment budget exceeded');
            const cut=lo+worst;stack.push([cut,hi],[lo,cut]);
        }
    }
    return {curves:result,evidence:{method:'bounded-piecewise-cubic-least-squares',errorBound:maxError,tolerance:o.tolerance,metric:'continuous-synchronized-polyline-distance',samples:ps.length,work,continuity:'C0',closed:o.closed}};
}
