import { checkAbort } from '@revector/model';

/** Disjoint ownership rectangles plus overlapping OCR halos. Each allocated tile is
 * at most tileSize²; reject the entire plan before allocating any tile over budget. */
export function planRasterTiles(width, height, {tileSize=2048, overlap=96, maxTiles=256}={}) {
    for (const [name,value,min,max] of [['width',width,1,1000000],['height',height,1,1000000],['tileSize',tileSize,256,8192],['overlap',overlap,0,2048],['maxTiles',maxTiles,1,4096]])
        if (!Number.isInteger(value)||value<min||value>max) throw new RangeError('Invalid tile '+name);
    if (overlap*2>=tileSize) throw new RangeError('Tile overlap must be less than half tile size');
    if (width<=tileSize&&height<=tileSize) return [{x:0,y:0,width,height,core:[0,0,width,height]}];
    const stride=tileSize-2*overlap,columns=Math.ceil(width/stride),rows=Math.ceil(height/stride);
    if (columns*rows>maxTiles) throw new RangeError('OCR tile budget exceeded');
    const out=[];
    for(let y=0;y<height;y+=stride)for(let x=0;x<width;x+=stride){
        const x0=Math.max(0,x-overlap),y0=Math.max(0,y-overlap),x1=Math.min(width,x+stride+overlap),y1=Math.min(height,y+stride+overlap);
        out.push({x:x0,y:y0,width:x1-x0,height:y1-y0,core:[x,y,Math.min(width,x+stride),Math.min(height,y+stride)]});
    }
    return out;
}

/** Bounded projection-profile skew estimator. Returns the detected clockwise text
 * angle in image coordinates; correction rotates by its negative. Not an OSD engine.
 * Sparse pages, drawings, or scores without a pronounced peak retain angle zero. */
export function estimateSkew(binary,width,height,{maxAngle=12,step=.5,maxSamples=40000,signal}={}) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||binary.length!==width*height)throw new RangeError('Invalid skew raster');
    if(!Number.isFinite(maxAngle)||maxAngle<0||maxAngle>20||!Number.isFinite(step)||step<.1||step>2||!Number.isInteger(maxSamples)||maxSamples<100||maxSamples>100000)throw new RangeError('Invalid skew budget');
    checkAbort(signal);
    let count=0;for(let i=0;i<binary.length;i++)if(binary[i])count++;
    if(count<100||maxAngle===0)return {angle:0,confidence:0,samples:count,reason:'insufficient-ink'};
    const stride=Math.max(1,Math.ceil(count/maxSamples)),xs=[],ys=[];let seen=0;
    for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++)if(binary[y*width+x]&&seen++%stride===0){xs.push(x);ys.push(y);}}
    const bins=new Uint32Array(Math.ceil(Math.hypot(width,height)*2)+8),offset=bins.length>>1;
    function score(angle){
        checkAbort(signal);bins.fill(0);const a=angle*Math.PI/180,s=Math.sin(a),c=Math.cos(a);
        for(let i=0;i<xs.length;i++)bins[Math.round(-xs[i]*s+ys[i]*c)+offset]++;
        let value=0;for(const n of bins)value+=n*n;return value;
    }
    const scores=[];let best={angle:0,value:score(0)};
    for(let a=-maxAngle;a<=maxAngle+1e-8;a+=step){const value=score(a);scores.push(value);if(value>best.value)best={angle:a,value};}
    const median=[...scores].sort((a,b)=>a-b)[scores.length>>1],confidence=Math.max(0,Math.min(1,(best.value/Math.max(1,median)-1)/2));
    if(confidence<.12||Math.abs(best.angle)>=maxAngle-.01)return {angle:0,confidence,samples:xs.length,reason:'ambiguous-projection'};
    const center=best.angle;
    for(let a=center-step;a<=center+step+1e-8;a+=step/5)if(Math.abs(a)<=maxAngle){const value=score(a);if(value>best.value)best={angle:a,value};}
    return {angle:Math.abs(best.angle)<.15?0:Math.round(best.angle*1000)/1000,confidence,samples:xs.length,reason:'projection-peak'};
}

/** Rotate an image without clipping, with an allocation cap and explicit affine map. */
export function boundedRotation(angle,width,height,maxPixels=24000000) {
    if(!Number.isFinite(angle)||!Number.isFinite(maxPixels)||maxPixels<1||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new RangeError('Invalid rotation');
    const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),corners=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>[c*x-s*y,s*x+c*y]);
    const minX=Math.min(...corners.map(p=>p[0])),minY=Math.min(...corners.map(p=>p[1]));
    const w=Math.max(...corners.map(p=>p[0]))-minX,h=Math.max(...corners.map(p=>p[1]))-minY;
    const scale=Math.min(1,Math.sqrt(maxPixels/((w+1)*(h+1))));
    return {width:Math.max(1,Math.ceil(w*scale-1e-7)),height:Math.max(1,Math.ceil(h*scale-1e-7)),scale,matrix:[c*scale,s*scale,-s*scale,c*scale,-minX*scale,-minY*scale]};
}
