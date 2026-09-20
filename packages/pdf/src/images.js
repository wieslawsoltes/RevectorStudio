import {compose,inverse,mapPaths,rectPath} from '@revector/geometry';
import {diagnostic,checkAbort,sha256Bytes} from '@revector/model';

export const DEFAULT_IMAGE_OPTIONS=Object.freeze({maxPixels:16_000_000,maxTotalPixels:32_000_000,maxBytes:64*1024*1024,maxImages:512});
const defaultCanvas=(w,h)=>{const c=globalThis.document?.createElement('canvas')||new OffscreenCanvas(w,h);c.width=w;c.height=h;return c;};
function makePath(ctx,paths){ctx.beginPath();for(const p of paths){ctx.moveTo(...p.start);for(const s of p.segments)s.kind==='C'?ctx.bezierCurveTo(...s.c1,...s.c2,...s.to):ctx.lineTo(...s.to);ctx.closePath();}}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
async function png(canvas){
    if(typeof canvas.toBuffer==='function')return new Uint8Array(canvas.toBuffer('image/png'));
    const blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoder failed')),'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
}
/** Paint only the decoded resource: no page screenshot, hidden native text, or duplicate vector paint. */
function paintDecoded(ctx,resource,w,h){
    if(resource.bitmap){ctx.drawImage(resource.bitmap,0,0,w,h);return;}
    const data=resource.data;
    if(!data)throw new Error('Decoded PDF image pixels are unavailable');
    const pixels=ctx.createImageData(w,h),out=pixels.data,kind=resource.kind;
    if(kind===3&&data.length===w*h*4)out.set(data);
    else if(kind===2&&data.length===w*h*3){for(let i=0,j=0;i<out.length;i+=4,j+=3){out[i]=data[j];out[i+1]=data[j+1];out[i+2]=data[j+2];out[i+3]=255;}}
    else if(kind===1&&data.length>=Math.ceil(w/8)*h){const stride=Math.ceil(w/8);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=data[y*stride+(x>>3)]&(128>>(x&7))?255:0;const j=(y*w+x)*4;out[j]=out[j+1]=out[j+2]=v;out[j+3]=255;}}
    else throw new Error('Unsupported decoded PDF image representation');
    ctx.putImageData(pixels,0,0);
}
/** Retain native-resolution PDF image paint as self-contained PNG sidecars.
 * Supported clipping and constant alpha are baked once into PNG pixels. Geometry stays affine.
 * External soft masks and non-Normal blends are rejected, never replaced by a misleading screenshot.
 * The source PDF scene and PDF.js-owned bitmaps are borrowed, not mutated or closed.
 */
export async function preserveRasterImages(source,scene,input={}){
    const o={...DEFAULT_IMAGE_OPTIONS,...input},make=o.canvasFactory||defaultCanvas;
    for(const key of ['maxPixels','maxTotalPixels','maxBytes','maxImages'])if(!Number.isSafeInteger(o[key])||o[key]<1)throw new RangeError('Invalid raster image budget: '+key);
    checkAbort(o.signal);
    const out=structuredClone(scene),stats={retained:0,skipped:0,assets:0,bytes:0,pixels:0,complete:true,mode:'decoded-image-resources',colorSpace:'sRGB',clips:'baked PNG alpha at native resolution'};
    const assets=new Map();
    const items=out.items.filter(i=>i.kind==='image');
    if(items.length>o.maxImages)throw new RangeError('Raster image count budget exceeded');
    out.diagnostics=out.diagnostics.filter(d=>!d.code.startsWith('RASTER_IMAGE_'));
    for(const item of items){
        checkAbort(o.signal);delete item.rasterAsset;
        if(item.visible===false)continue;
        if(!['paintImageXObject','paintInlineImageXObject','paintImageXObjectRepeat'].includes(item.imageType)||item.softMask||item.transferFunction||item.nonNormalGroup||(item.style?.blend&&!['Normal','source-over'].includes(item.style.blend))||item.clips?.some(c=>c.text)){
            stats.skipped++;out.diagnostics.push(diagnostic('RASTER_IMAGE_UNSUPPORTED','Raster paint needs unsupported stencil/group/mask/blend handling; it was not exported as an incorrect image.','error',{sourceId:item.id,imageType:item.imageType}));continue;
        }
        let canvas;
        try{
            const resource=await source.rasterResource(scene,item);checkAbort(o.signal);
            const w=resource.width,h=resource.height;
            if(![w,h].every(n=>Number.isInteger(n)&&n>0&&n<=65535)||w*h>o.maxPixels||stats.pixels+w*h>o.maxTotalPixels)throw new RangeError('Raster image pixel budget exceeded');
            stats.pixels+=w*h;
            canvas=make(w,h);const ctx=canvas.getContext('2d',{alpha:true,colorSpace:'srgb',willReadFrequently:true});
            paintDecoded(ctx,resource,w,h);
            // Use destination-in to apply a stack of PDF clipping paths without painting twice.
            const clips=[{paths:[rectPath(scene.box)],rule:'nonzero'},...(item.clips||[])];
            const pdfToPixels=compose([w,0,0,-h,0,h],inverse(item.transform));
            for(const clip of clips){
                const paths=mapPaths(clip.paths||[],pdfToPixels);
                // Canvas clip does not clear existing paint; clear the outside via an alpha mask.
                const mask=make(w,h);
                try{const mc=mask.getContext('2d');mc.fillStyle='#fff';makePath(mc,paths);mc.fill(clip.rule==='evenodd'?'evenodd':'nonzero');ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);}
                finally{mask.width=mask.height=1;}
            }
            ctx.globalCompositeOperation='source-over';
            const alpha=item.style?.fillAlpha??1;
            if(!Number.isFinite(alpha)||alpha<0||alpha>1)throw Error('Invalid PDF image opacity');
            if(alpha<1){const pixels=ctx.getImageData(0,0,w,h);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.round(pixels.data[i]*alpha);ctx.putImageData(pixels,0,0);}
            const bytes=await png(canvas);checkAbort(o.signal);
            const hash=sha256Bytes(bytes);
            let asset=assets.get(hash);
            if(!asset){
                if(stats.bytes+bytes.length>o.maxBytes)throw new RangeError('Raster image encoded-byte budget exceeded');
                asset={id:'IMG_'+hash,path:'images/'+hash+'.png',width:w,height:h,mimeType:'image/png',sha256:hash,dataBase64:base64(bytes),
                    source:{kind:'pdf-raster',colorEngine:'PDF.js',colorSpace:'sRGB',pixelResolution:'native',clipBaked:true,constantAlpha:alpha,losslessSourceEncoding:false}};
                assets.set(hash,asset);stats.bytes+=bytes.length;
            }
            item.rasterInterpolate=!!resource.interpolate;item.rasterAsset=asset;stats.retained++;
        }catch(error){
            if(error.name==='AbortError'||error instanceof RangeError)throw error;
            stats.skipped++;out.diagnostics.push(diagnostic('RASTER_IMAGE_RESOURCE',error.message,'error',{sourceId:item.id}));
        }finally{if(canvas)canvas.width=canvas.height=1;}
    }
    stats.assets=assets.size;stats.complete=stats.skipped===0;out.rasterImages=stats;
    if(stats.complete&&stats.retained)out.diagnostics=out.diagnostics.filter(d=>d.code!=='RASTER_CONTENT');
    if(stats.retained)out.diagnostics.push(diagnostic('RASTER_IMAGE_RETAINED',`${stats.retained} raster paints retained as ${stats.assets} PNG sidecars; native PDF vectors remain separate. Image color is decoded to sRGB; clips/alpha are baked at raster resolution.`,'info'));
    return out;
}
