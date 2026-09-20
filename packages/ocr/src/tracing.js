import {inverse,compose,mapPaths,transform,transformBox} from '@revector/geometry';
import {traceRasterPaths,binarize} from '@revector/raster';
import {checkAbort} from '@revector/model';
function path(ctx,paths){ctx.beginPath();for(const p of paths){ctx.moveTo(...p.start);for(const s of p.segments)s.kind==='C'?ctx.bezierCurveTo(...s.c1,...s.c2,...s.to):ctx.lineTo(...s.to);if(p.closed)ctx.closePath();}}
/** Conservative native-paint exclusion. Any overlap in this mask wins over inference.
 * Text excludes its metric box; vector strokes use their known paths, dashes and clip stack.
 * This may remove obscured raster fragments rather than inventing connections behind native ink.
 */
function excludeNative(binary,width,height,scene,pdfToPixels,make,signal){
    const canvas=make(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
    try {
        const scale=Math.sqrt(Math.abs(pdfToPixels[0]*pdfToPixels[3]-pdfToPixels[1]*pdfToPixels[2]));
        for(const item of scene.items){checkAbort(signal);if(item.visible===false||item.invisibleText||item.ocr||item.rasterInference||!['path','text'].includes(item.kind))continue;
            ctx.save();ctx.strokeStyle=ctx.fillStyle='#fff';
            for(const clip of item.clips||[])if(!clip.text){path(ctx,mapPaths(clip.paths||[],pdfToPixels));ctx.clip(clip.rule==='evenodd'?'evenodd':'nonzero');}
            if(item.kind==='text'&&item.matrix){
                const first=item.matrix,last=item.glyphs?.at(-1),widthText=last?Math.hypot(last.matrix[4]+last.matrix[0]*last.width-first[4],last.matrix[5]+last.matrix[1]*last.width-first[5])/Math.max(1e-9,Math.hypot(first[0],first[1])):String(item.text||'').length*.55;
                const b=transformBox([0,-.25,widthText,item.capHeight||.85],compose(pdfToPixels,first));ctx.fillRect(b[0]-1,b[1]-1,b[2]-b[0]+2,b[3]-b[1]+2);
            }else if(item.kind==='path'){
                path(ctx,mapPaths(item.paths||[],pdfToPixels));
                if(item.fill&&(item.style?.fillAlpha??1)>0)ctx.fill(item.fillRule==='evenodd'?'evenodd':'nonzero');
                if(item.stroke&&(item.style?.strokeAlpha??1)>0){ctx.lineWidth=Math.max(1,(item.style?.lineWidth||0)*scale)+2;ctx.lineCap=['butt','round','square'][item.style?.lineCap||0];ctx.lineJoin=['miter','round','bevel'][item.style?.lineJoin||0];ctx.setLineDash((item.style?.dash||[]).map(v=>v*scale));ctx.lineDashOffset=-(item.style?.dashPhase||0)*scale;ctx.stroke();}
            }
            ctx.restore();
        }
        const mask=ctx.getImageData(0,0,width,height).data;let removed=0;
        for(let i=0;i<binary.length;i++)if(binary[i]&&mask[4*i+3]){binary[i]=0;removed++;}return removed;
    }finally{canvas.width=canvas.height=1;}
}
/** Trace a complete bounded region after OCR, avoiding tile seam fragmentation.
 * This is separately reusable with an empty word list; no OCR engine is called here.
 */
export async function recoverRasterPaths(raster,pixelToPdf,scene,{words=[],regionId='0',imageIds=[],canvasFactory,maxPixels=4_000_000,tolerance=.65,invert=false,signal}={}){
    if(!canvasFactory)throw new TypeError('Raster path recovery requires a canvasFactory');
    const binary=binarize(raster,{maxPixels,signal,invert});
    for(const word of words){const b=word.bbox;if(!b)continue;for(let y=Math.max(0,Math.floor(b.y0)-2);y<Math.min(raster.height,Math.ceil(b.y1)+2);y++)for(let x=Math.max(0,Math.floor(b.x0)-2);x<Math.min(raster.width,Math.ceil(b.x1)+2);x++)binary[y*raster.width+x]=0;}
    const nativePixelsExcluded=excludeNative(binary,raster.width,raster.height,scene,inverse(pixelToPdf),canvasFactory,signal);
    const traced=await traceRasterPaths(binary,raster.width,raster.height,{maxPixels,tolerance,signal});
    const items=traced.paths.map((p,index)=>{
        const points=p.points.map(v=>transform(pixelToPdf,v));
        const colors=p.points.map(([x,y])=>{const j=(Math.floor(y)*raster.width+Math.floor(x))*4;return Array.from(raster.data.subarray(j,j+3));});
        const color=[0,1,2].map(k=>{const v=colors.map(c=>c[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];});
        return {id:`raster-path-${regionId}-${index}`,kind:'path',operator:-1,visible:true,layerId:'REVECTOR_RASTER_PATHS',
            paths:[{start:points[0],segments:points.slice(1).map(to=>({kind:'L',to})),closed:p.closed}],stroke:true,fill:false,clips:[],formPath:[],
            style:{stroke:color,lineWidth:0,strokeAlpha:1,dash:[]},
            rasterInference:{method:traced.method,confidence:.65,geometry:'estimated centerline',color:'median skeleton samples',imageIds,regionId,pixelToPdf:[...pixelToPdf],maxDeviationPixels:p.maxDeviationPixels,samples:p.samples,startDegree:p.startDegree,endDegree:p.endDegree,touchesBorder:p.touchesBorder}};
    });
    return {items,stats:{...traced.stats,paths:items.length,nativePixelsExcluded,regionId,method:traced.method}};
}
