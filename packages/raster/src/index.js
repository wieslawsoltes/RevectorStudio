import { compose, transform, transformBox, I, inverse, insidePaths, mapPaths, rectPath, pathBox, intersects, union } from '@revector/geometry';
import { checkAbort } from '@revector/model';
export function validateRaster(raster, maxPixels = 24_000_000) {
    const {width:w,height:h,data}=raster;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0||w*h>maxPixels||!data||data.length!==w*h*4)throw new RangeError('Invalid raster dimensions or pixel budget exceeded');
    return raster;
}
/** Alpha is composited onto paper before thresholding; transparent black is not ink. */
export function grayscale(raster,maxPixels=24_000_000) {
    validateRaster(raster,maxPixels);const out=new Uint8Array(raster.width*raster.height);
    for(let i=0;i<out.length;i++){const j=i*4,a=raster.data[j+3]/255;out[i]=Math.round(255*(1-a)+a*(.2126*raster.data[j]+.7152*raster.data[j+1]+.0722*raster.data[j+2]));}return out;
}
export function otsu(gray) {
    const histogram=new Uint32Array(256);let sum=0;for(const v of gray){histogram[v]++;sum+=v;}let below=0,moment=0,best=-1,threshold=127;
    for(let t=0;t<255;t++){below+=histogram[t];moment+=t*histogram[t];const above=gray.length-below;if(!below||!above)continue;const d=moment/below-(sum-moment)/above,v=below*above*d*d;if(v>best){best=v;threshold=t;}}
    return threshold;
}
/** O(pixels) local Sauvola threshold, with O(width) rolling sums. 1 denotes ink. */
export function binarize(raster, {method='otsu',window=31,k=.2,invert=false,maxPixels=24_000_000,signal}={}) {
    validateRaster(raster,maxPixels);checkAbort(signal);const g=grayscale(raster,maxPixels);if(invert)for(let i=0;i<g.length;i++)g[i]=255-g[i];const w=raster.width,h=raster.height,out=new Uint8Array(w*h);
    if(method==='otsu'){const t=otsu(g);for(let i=0;i<g.length;i++)out[i]=g[i]<=t?1:0;return out;}
    if(method!=='sauvola')throw new RangeError('Unknown binarization method');
    if(w*h>8_000_000)throw new RangeError('Sauvola integral images exceed the 8 megapixel budget; select Otsu or a smaller region');
    if(!Number.isInteger(window)||window<3||window>201||!Number.isFinite(k)||k<0||k>1)throw new RangeError('Invalid Sauvola settings');
    // All accumulators contain integer byte sums and squared-byte sums, exactly
    // representable in Float64 under the unchanged 8MP/window budgets. This is
    // the same rectangle sum as the integral-image implementation, without two
    // full-page Float64 buffers. Keep the arithmetic of mean/variance unchanged.
    const sum=new Float64Array(w),squares=new Float64Array(w),r=window>>1;
    for(let y=0;y<Math.min(h,r+1);y++){
        checkAbort(signal);const row=y*w;
        for(let x=0;x<w;x++){const v=g[row+x];sum[x]+=v;squares[x]+=v*v;}
    }
    for(let y=0;y<h;y++){
        checkAbort(signal);
        if(y){
            const before=y-r-1,after=y+r;
            if(before>=0){const row=before*w;for(let x=0;x<w;x++){const v=g[row+x];sum[x]-=v;squares[x]-=v*v;}}
            if(after<h){const row=after*w;for(let x=0;x<w;x++){const v=g[row+x];sum[x]+=v;squares[x]+=v*v;}}
        }
        const rows=Math.min(h,y+r+1)-Math.max(0,y-r),row=y*w;
        let s=0,q=0;
        for(let x=0;x<Math.min(w,r+1);x++){s+=sum[x];q+=squares[x];}
        for(let x=0;x<w;x++){
            if(x){if(x-r-1>=0){s-=sum[x-r-1];q-=squares[x-r-1];}if(x+r<w){s+=sum[x+r];q+=squares[x+r];}}
            const n=(Math.min(w,x+r+1)-Math.max(0,x-r))*rows,m=s/n,variance=q/n-m*m;
            out[row+x]=g[row+x]<m*(1+k*(Math.sqrt(Math.max(0,variance))/128-1))?1:0;
        }
    }
    return out;
}
export function binaryRgba(binary,width,height){if(binary.length!==width*height)throw new RangeError('Binary size mismatch');const data=new Uint8ClampedArray(binary.length*4);for(let i=0;i<binary.length;i++){const v=binary[i]?0:255;const j=i*4;data[j]=data[j+1]=data[j+2]=v;data[j+3]=255;}return {data,width,height};}
/** Plan disjoint rectangular crops around visible raster marks in displayed-page coordinates.
 * Shape/clip masks are applied later, not approximated by these bounding boxes. */
export function rasterRegions(scene,{scope='raster',padding=2,maxRegions=256}={}) {
    const box=[0,0,...scene.pageSize];if(scope==='page')return [{box,items:[],wholePage:true}];if(scope!=='raster')throw new RangeError('Invalid OCR scope');
    const regions=[];
    for(const item of scene.items){if(item.kind!=='image'||item.visible===false)continue;const m=compose(scene.pageTransform||I,item.transform),b=transformBox([0,0,1,1],m);b[0]=Math.max(0,b[0]-padding);b[1]=Math.max(0,b[1]-padding);b[2]=Math.min(box[2],b[2]+padding);b[3]=Math.min(box[3],b[3]+padding);if(b[2]<=b[0]||b[3]<=b[1])continue;
        let region={box:b,items:[item]};for(let i=regions.length-1;i>=0;i--)if(intersects(regions[i].box,region.box)){union(region.box,regions[i].box);region.items.push(...regions[i].items);regions.splice(i,1);i=regions.length;}
        regions.push(region);if(regions.length>maxRegions)throw new RangeError('Raster region budget exceeded');
    }return regions.sort((a,b)=>b.box[3]-a.box[3]||a.box[0]-b.box[0]);
}
export function rasterMaskPaths(scene,region) {
    return region.items.map(item=>({outline:mapPaths([rectPath([0,0,1,1])],compose(scene.pageTransform||I,item.transform)),clips:(item.clips||[]).filter(c=>!c.text).map(c=>({paths:mapPaths(c.paths||[],scene.pageTransform||I),rule:c.rule}))}));
}
/** Non-destructive detection of axis-aligned ruled lines. OCR glyph boxes should be masked first.
 * These are hypotheses, not general-purpose illustration tracing. */
export function detectRasterLines(binary,width,height,{minLength=60,maxThickness=12,maxGap=2,maxLines=4096,signal}={}){
    if(binary.length!==width*height||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)throw new RangeError('Binary dimensions mismatch');
    if(minLength<2||maxThickness<1||maxGap<0)throw new RangeError('Invalid line detector options');const result=[];
    for(const vertical of [false,true]){let active=[];const across=vertical?width:height,along=vertical?height:width;
        const finish=track=>{if(track.last-track.first+1<=maxThickness){const mid=(track.first+track.last)/2;result.push({start:vertical?[mid,track.lo]:[track.lo,mid],end:vertical?[mid,track.hi]:[track.hi,mid],thickness:track.last-track.first+1,confidence:.80});if(result.length>maxLines)throw new RangeError('Raster line budget exceeded');}};
        for(let row=0;row<=across;row++){checkAbort(signal);const runs=[];if(row<across){let start=-1,last=-1;for(let col=0;col<=along;col++){const ink=col<along&&binary[vertical?col*width+row:row*width+col];if(ink){if(start<0)start=col;last=col;}if(start>=0&&(!ink&&col-last>maxGap||col===along)){if(last-start+1>=minLength)runs.push([start,last]);start=-1;}}}
            const next=[];for(const [lo,hi] of runs){const i=active.findIndex(t=>Math.abs(t.lo-lo)<=maxThickness&&Math.abs(t.hi-hi)<=maxThickness);const t=i<0?{lo,hi,first:row,last:row}:active.splice(i,1)[0];t.last=row;t.lo=Math.min(t.lo,lo);t.hi=Math.max(t.hi,hi);next.push(t);}for(const t of active)finish(t);active=next;
        }
    }return result;
}
export {planRasterTiles,estimateSkew,boundedRotation} from './analysis.js';
export {traceRasterPaths,DEFAULT_TRACE_OPTIONS} from './tracing.js';
