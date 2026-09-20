import {checkAbort,yieldTask} from '@revector/model';

export const DEFAULT_TRACE_OPTIONS=Object.freeze({maxPixels:4_000_000,maxForeground:500_000,maxIterations:128,maxWork:150_000_000,maxPaths:25000,maxPoints:1_000_000,tolerance:.65});
const DIRS=Object.freeze([[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]);
function squaredDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;}
function simplify(points,tolerance,spend){
    if(points.length<3||tolerance===0)return points;
    const keep=new Uint8Array(points.length),todo=[[0,points.length-1]],limit=tolerance*tolerance;keep[0]=keep[points.length-1]=1;
    while(todo.length){const [a,b]=todo.pop();let far=-1,max=limit;spend(b-a);
        for(let i=a+1;i<b;i++){const d=squaredDistance(points[i],points[a],points[b]);if(d>max){far=i;max=d;}}
        if(far>=0){keep[far]=1;todo.push([a,far],[far,b]);}
    }
    return points.filter((_,i)=>keep[i]);
}
/** Bounded centerline inference, not recovery of the original engineering geometry.
 * Zhang-Suen thinning -> pixel adjacency graph -> junction/end/cycle paths -> RDP polylines.
 * Junctions are never traversed through. Every undirected graph edge is visited once.
 * Coordinates are pixel centers. The simplification bound concerns the sampled skeleton,
 * NOT the original stroke edges or drawing dimensions; closely spaced crossings remain ambiguous.
 */
export async function traceRasterPaths(binary,width,height,input={}) {
    const o={...DEFAULT_TRACE_OPTIONS,...input};
    for(const k of ['maxPixels','maxForeground','maxIterations','maxWork','maxPaths','maxPoints'])if(!Number.isSafeInteger(o[k])||o[k]<1)throw new RangeError('Invalid trace budget: '+k);
    if(!Number.isFinite(o.tolerance)||o.tolerance<0||o.tolerance>8)throw new RangeError('Trace tolerance must be 0..8 pixels');
    if(!(binary instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>o.maxPixels||binary.length!==width*height)throw new RangeError('Invalid trace raster or pixel budget exceeded');
    let work=0;const spend=n=>{work+=n;if(work>o.maxWork)throw new RangeError('Raster trace work budget exceeded');checkAbort(o.signal);};
    spend(binary.length);const stride=width+2,grid=new Uint8Array(stride*(height+2));let foreground=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=binary[y*width+x];if(v!==0&&v!==1)throw new TypeError('Trace binary values must be 0 or 1');if(v){grid[(y+1)*stride+x+1]=1;foreground++;}}
    if(foreground>o.maxForeground)throw new RangeError('Raster trace foreground budget exceeded');
    // Foreground index list avoids scanning blank margins on every thinning iteration.
    const pixels=new Uint32Array(foreground);for(let p=0,i=0;p<grid.length;p++)if(grid[p])pixels[i++]=p;
    const offsets=DIRS.map(([dx,dy])=>dy*stride+dx),remove=new Uint32Array(foreground);
    let iterations=0,converged=false;
    for(;iterations<o.maxIterations;iterations++){
        let changed=0;
        for(let phase=0;phase<2;phase++){
            spend(foreground);let count=0;
            for(const p of pixels){if(!grid[p])continue;
                const n=grid[p-stride],ne=grid[p-stride+1],e=grid[p+1],se=grid[p+stride+1],s=grid[p+stride],sw=grid[p+stride-1],w=grid[p-1],nw=grid[p-stride-1];
                const countInk=n+ne+e+se+s+sw+w+nw;if(countInk<2||countInk>6)continue;
                const transitions=(!n&&ne)+(!ne&&e)+(!e&&se)+(!se&&s)+(!s&&sw)+(!sw&&w)+(!w&&nw)+(!nw&&n);
                if(transitions!==1)continue;
                if(phase===0?(n*e*s===0&&e*s*w===0):(n*e*w===0&&n*s*w===0))remove[count++]=p;
            }
            for(let i=0;i<count;i++)grid[remove[i]]=0;changed+=count;
            await yieldTask();checkAbort(o.signal);
        }
        if(!changed){converged=true;iterations++;break;}
    }
    if(!converged)throw new RangeError('Raster thinning did not converge within its iteration budget');
    const adjacency=new Uint8Array(grid.length),degree=new Uint8Array(grid.length),visited=new Uint8Array(grid.length);
    let skeletonPixels=0,junctionPixels=0,endpoints=0,isolatedPixels=0,graphEdges=0;
    spend(foreground*8);
    for(const p of pixels){if(!grid[p])continue;skeletonPixels++;
        for(let d=0;d<8;d++){if(!grid[p+offsets[d]])continue;
            // Diagonal links are necessary for diagonal strokes, but are redundant
            // shortcuts when an orthogonal step already joins the two pixels.
            if((d&1)&&(grid[p+offsets[(d+7)%8]]||grid[p+offsets[(d+1)%8]]))continue;
            adjacency[p]|=1<<d;degree[p]++;
        }
        graphEdges+=degree[p];if(degree[p]>2)junctionPixels++;else if(degree[p]===1)endpoints++;else if(degree[p]===0)isolatedPixels++;
    }
    graphEdges/=2;
    const point=p=>[(p%stride)-.5,Math.floor(p/stride)-.5],paths=[];
    let tracedEdges=0,totalPoints=0;
    const walk=(start,direction)=>{
        if(paths.length>=o.maxPaths)throw new RangeError('Raster trace path budget exceeded');
        const points=[point(start)];let p=start,d=direction,closed=false;
        for(;;){spend(1);if(visited[p]&(1<<d))throw new Error('Internal raster graph edge visited twice');
            const q=p+offsets[d];visited[p]|=1<<d;visited[q]|=1<<((d+4)%8);tracedEdges++;points.push(point(q));
            if(++totalPoints>o.maxPoints)throw new RangeError('Raster trace point budget exceeded');
            if(q===start){closed=true;break;}if(degree[q]!==2)break;
            let next=-1;for(let k=0;k<8;k++)if((adjacency[q]&(1<<k))&&!(visited[q]&(1<<k))){next=k;break;}
            if(next<0)throw new Error('Raster path ended without a graph vertex');p=q;d=next;
        }
        let reduced;
        if(closed){let split=1,max=0;for(let i=1;i<points.length-1;i++){const d=squaredDistance(points[i],points[0],points[0]);if(d>max){max=d;split=i;}}
            reduced=[...simplify(points.slice(0,split+1),o.tolerance,spend).slice(0,-1),...simplify(points.slice(split),o.tolerance,spend)];
            reduced.pop();if(reduced.length<3)reduced=points.slice(0,-1);
        }else reduced=simplify(points,o.tolerance,spend);
        paths.push({points:reduced,closed,samples:points.length,maxDeviationPixels:o.tolerance,
            startDegree:degree[start],endDegree:closed?degree[start]:degree[p+offsets[d]],touchesBorder:points.some(([x,y])=>x<1||y<1||x>width-1||y>height-1)});
    };
    for(const p of pixels){if(!grid[p]||degree[p]===2)continue;for(let d=0;d<8;d++)if((adjacency[p]&(1<<d))&&!(visited[p]&(1<<d)))walk(p,d);}
    for(const p of pixels){if(!grid[p])continue;for(let d=0;d<8;d++)if((adjacency[p]&(1<<d))&&!(visited[p]&(1<<d)))walk(p,d);}
    if(tracedEdges!==graphEdges)throw new Error('Raster graph edge coverage mismatch');
    return {paths,stats:{foreground,skeletonPixels,iterations,junctionPixels,endpoints,isolatedPixels,graphEdges,tracedEdges,work},method:'zhang-suen/pixel-graph/rdp',inferred:true};
}
