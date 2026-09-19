import { compose, inverse, transform, transformBox, I, mapPaths, rectPath, stableHash, intersects } from '@revector/geometry';
import { diagnostic, checkAbort } from '@revector/model';
import { rasterRegions, binarize, binaryRgba, detectRasterLines } from '@revector/raster';
import { SpatialIndex } from '@revector/topology';
export const OCR_VERSION = '7.0.0';
export const DEFAULT_OCR_OPTIONS = Object.freeze({scope:'raster',languages:'eng',dpi:300,minConfidence:65,preprocess:'none',rotation:0,traceLines:false,maxPixels:24_000_000,maxRegions:128,maxWords:25000,timeoutMs:120000});
export function normalizeOcrOptions(input={}) {
    const o={...DEFAULT_OCR_OPTIONS,...input};
    if(!/^[a-z][a-z0-9_]{1,23}(\+[a-z][a-z0-9_]{1,23}){0,7}$/.test(o.languages))throw new RangeError('Invalid OCR language codes');
    if(!['raster','page'].includes(o.scope)||!['none','otsu','sauvola'].includes(o.preprocess)||![0,90,180,270].includes(o.rotation))throw new RangeError('Invalid OCR mode');
    for(const [key,min,max] of [['dpi',72,600],['minConfidence',0,100],['maxPixels',1,48_000_000],['maxRegions',1,1024],['maxWords',1,100000],['timeoutMs',1000,600000]])if(!Number.isFinite(o[key])||o[key]<min||o[key]>max)throw new RangeError('Invalid OCR '+key);
    return o;
}
/** Injectable OCR provider. A session owns exactly one worker, serialized jobs and hard cancellation. */
export class TesseractOcr {
    constructor(options={}){this.options=options;this.worker=null;this.busy=false;}
    async recognize(image,options={}) {
        if(this.busy)throw new Error('OCR session is busy; await the previous recognition');
        this.busy=true;let timer,abort;const signal=options.signal;let cancelled=false;
        try{
            checkAbort(signal);
            const failure=new Promise((_,reject)=>{
                abort=()=>{cancelled=true;void this.dispose();reject(Object.assign(new Error('OCR cancelled'),{name:'AbortError'}));};
                signal?.addEventListener('abort',abort,{once:true});
                timer=setTimeout(()=>{cancelled=true;void this.dispose();reject(new Error('OCR deadline exceeded'));},options.timeoutMs||120000);
            });
            const work=(async()=>{
                if(!this.worker){
                    const moduleUrl=this.options.moduleUrl;
                    const namespace=this.options.provider||await import(/* @vite-ignore */ moduleUrl);
                    const lib=typeof namespace?.createWorker==='function'?namespace:namespace?.default;
                    if(typeof lib?.createWorker!=='function')throw new TypeError('OCR provider must export createWorker, directly or through its ES-module default export');
                    const worker=await lib.createWorker(this.options.languages||'eng',1,{...(this.options.node ? {} : {workerPath:this.options.workerPath,corePath:this.options.corePath,workerBlobURL:false}),langPath:this.options.langPath,gzip:true,logger:this.options.onProgress});
                    if(cancelled){await worker.terminate();throw Object.assign(new Error('OCR cancelled'),{name:'AbortError'});}this.worker=worker;
                }
                await this.worker.setParameters({tessedit_pageseg_mode:String(options.psm??11),preserve_interword_spaces:'1',user_defined_dpi:String(options.dpi||300)});
                return (await this.worker.recognize(image,{}, {blocks:true,text:true})).data;
            })();
            return await Promise.race([work,failure]);
        }catch(error){await this.dispose();throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.busy=false;}
    }
    async dispose(){const worker=this.worker;this.worker=null;if(worker)await worker.terminate();}
}
export function ocrWords(data) {
    const out=[];
    for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])for(const word of line.words||[]){
        const b=word.bbox;
        if(b&&[b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)&&b.x1>b.x0&&b.y1>b.y0&&String(word.text||'').trim())out.push({...word,text:String(word.text).trim(),lineBaseline:line.baseline});
    }
    return out;
}
export function rotationMatrix(rotation,width,height){
    if(rotation===0)return [...I];if(rotation===90)return [0,1,-1,0,height,0];if(rotation===180)return [-1,0,0,-1,width,height];if(rotation===270)return [0,-1,1,0,0,width];throw new RangeError('OCR rotation must be a quarter-turn');
}
function canvasPath(ctx,paths){ctx.beginPath();for(const p of paths){ctx.moveTo(...p.start);for(const s of p.segments)s.kind==='C'?ctx.bezierCurveTo(...s.c1,...s.c2,...s.to):ctx.lineTo(...s.to);if(p.closed)ctx.closePath();}}
function canvasFactory(width,height){const canvas=globalThis.document?.createElement('canvas')||new OffscreenCanvas(width,height);canvas.width=width;canvas.height=height;return canvas;}
function overlap(a,b){const w=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),h=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));return w*h/Math.max(1e-12,(a[2]-a[0])*(a[3]-a[1]));}
/** Conservative duplicate suppression: native text occupying the word region wins, regardless of OCR spelling. */
export function nativeTextBoxes(scene,pdfToPixels){return scene.items.filter(i=>i.kind==='text'&&!i.ocr&&!i.invisibleText&&i.visible!==false&&i.matrix).map(i=>{
    const first=i.matrix,last=i.glyphs?.at(-1),width=last?Math.hypot(last.matrix[4]+last.matrix[0]*last.width-first[4],last.matrix[5]+last.matrix[1]*last.width-first[5])/Math.max(1e-9,Math.hypot(first[0],first[1])):String(i.text).length*.55;
    return transformBox([0,-.2,width,i.capHeight||.8],compose(pdfToPixels,first));
});}
function inkColor(image,box){const bins=new Map();const [x0,y0,x1,y1]=box.map(Math.round);for(let y=Math.max(0,y0);y<Math.min(image.height,y1);y+=2)for(let x=Math.max(0,x0);x<Math.min(image.width,x1);x+=2){const j=4*(y*image.width+x),c=Array.from(image.data.slice(j,j+3));if(Math.min(...c)>215)continue;const k=c.map(v=>v>>4).join(','),b=bins.get(k)||[0,0,0,0];b[0]++;for(let i=0;i<3;i++)b[i+1]+=c[i];bins.set(k,b);}const best=[...bins.values()].sort((a,b)=>b[0]-a[0])[0];return best?best.slice(1).map(v=>Math.round(v/best[0])):[0,0,0];}
/** Pixel baseline -> PDF paint IR. No coordinates are guessed from a nominal DPI. */
export function wordToPaint(word,pixelToPdf,{page=1,regionId='r0',color=[0,0,0],imageIds=[]}={}){
    const b=word.bbox,h=b.y1-b.y0,w=b.x1-b.x0,baseline=word.lineBaseline;
    // The baseline is only used when it lies within this word's vertical extent.
    const by=baseline&&Number.isFinite(baseline.y0)&&baseline.y0>=b.y0&&baseline.y0<=b.y1?baseline.y0:b.y1;
    const textHeight=Math.max(1,by-b.y0),matrix=compose(pixelToPdf,[textHeight,0,0,-textHeight,b.x0,by]);
    return {id:`ocr-${page}-${stableHash([regionId,word.text,b])}`,kind:'text',operator:-1,layerId:'REVECTOR_OCR',visible:true,formPath:[],markedContent:[],clips:[],text:word.text,matrix,glyphs:[{text:word.text,matrix,width:w/textHeight}],capHeight:1,font:'ocr-substitute',fontName:'Arial',style:{fill:color,stroke:color,fillAlpha:1,strokeAlpha:1,lineWidth:0,dash:[]},ocr:{engine:'tesseract.js',version:OCR_VERSION,confidence:word.confidence/100,box:[b.x0,b.y0,b.x1,b.y1],pixelToPdf,imageIds,regionId,geometry:'estimated text metrics',font:'substituted'}};
}
/** Recognizes composited visible raster regions; vector extraction is untouched.
 * PDF.js performs image decoding, ICC transforms, soft masks and page rotation before OCR. */
export async function recoverPdfRaster(source,scene,input={}) {
    const o=normalizeOcrOptions(input),signal=o.signal,make=o.canvasFactory||canvasFactory,regions=rasterRegions(scene,o);
    const out=structuredClone(scene);out.items=out.items.filter(i=>!i.ocr&&!i.rasterInference);out.ocr={engine:'tesseract.js',version:OCR_VERSION,options:Object.fromEntries(Object.entries(o).filter(([k,v])=>!['signal','provider','canvasFactory','session','onProgress'].includes(k)&&typeof v!=='function')),accepted:0,rejected:0,duplicates:0,regions:regions.length,lines:0,rejectedWords:[]};
    if(!regions.length){out.diagnostics.push(diagnostic('OCR_NO_RASTER','No visible raster content was found. Native PDF text was not OCR processed.','info'));return out;}
    const page=await source.pdf.getPage(scene.pageNumber),vp=page.getViewport({scale:1}),scale=Math.min(o.dpi/72,Math.sqrt(o.maxPixels/(vp.width*vp.height))*.999);
    const full=make(1,1),render=await source.render(scene.pageNumber,full,{scale,signal,background:'#ffffff'}),pdfToPixels=render.transform,pixelToPdf=inverse(pdfToPixels),pageToPixels=compose(pdfToPixels,inverse(scene.pageTransform||I)),native=new SpatialIndex(nativeTextBoxes(out,pdfToPixels), b=>b);
    out.ocr.effectiveDpi=72*scale;
    const base=new URL(o.assetBase||'./vendor/ocr/',globalThis.document?.baseURI||'file:///').href;
    const own=!o.session,session=o.session||new TesseractOcr({languages:o.languages,moduleUrl:base+'tesseract.esm.min.js',workerPath:base+'worker.min.js',corePath:base+'core/',langPath:base+'lang',provider:o.provider,onProgress:p=>o.onProgress?.({phase:'ocr',status:p.status,done:p.progress,total:1})});
    try{
        for(let ri=0;ri<regions.length;ri++){
            checkAbort(signal);o.onProgress?.({phase:'ocr-region',done:ri,total:regions.length});
            const region=regions[ri],b=transformBox(region.box,pageToPixels),x=Math.max(0,Math.floor(b[0])),y=Math.max(0,Math.floor(b[1])),w=Math.min(full.width,Math.ceil(b[2]))-x,h=Math.min(full.height,Math.ceil(b[3]))-y;if(w<2||h<2)continue;
            const crop=make(w,h),ctx=crop.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
            if(region.wholePage)ctx.drawImage(full,-x,-y);
            else for(const item of region.items){ctx.save();const m=compose([1,0,0,1,-x,-y],pdfToPixels);canvasPath(ctx,mapPaths([rectPath([0,0,1,1])],compose(m,item.transform)));ctx.clip();for(const clip of item.clips||[])if(!clip.text){canvasPath(ctx,mapPaths(clip.paths||[],m));ctx.clip(clip.rule==='evenodd'?'evenodd':'nonzero');}ctx.drawImage(full,-x,-y);ctx.restore();}
            const R=rotationMatrix(o.rotation,w,h),rotated=make(o.rotation%180?h:w,o.rotation%180?w:h),rc=rotated.getContext('2d',{willReadFrequently:true});rc.setTransform(...R);rc.drawImage(crop,0,0);rc.resetTransform();
            const original=rc.getImageData(0,0,rotated.width,rotated.height),localToGlobal=compose([1,0,0,1,x,y],inverse(R)),localToPdf=compose(pixelToPdf,localToGlobal);
            let binary;
            if(o.preprocess!=='none'){binary=binarize(original,{method:o.preprocess,invert:!!o.invert,signal,maxPixels:o.maxPixels});const clean=binaryRgba(binary,original.width,original.height),image=rc.createImageData(clean.width,clean.height);image.data.set(clean.data);rc.putImageData(image,0,0);}
            const data=await session.recognize(typeof rotated.toBuffer === 'function' ? rotated.toBuffer('image/png') : rotated,{...o,signal}),words=ocrWords(data);
            if(out.ocr.accepted+out.ocr.rejected+out.ocr.duplicates+words.length>o.maxWords)throw new RangeError('OCR word budget exceeded');
            const wordBoxes=[];
            for(const word of words){const box=[word.bbox.x0,word.bbox.y0,word.bbox.x1,word.bbox.y1];wordBoxes.push(box);const global=transformBox(box,localToGlobal);if(native.search(global).some(b=>intersects(global,b)&&overlap(global,b)>.6)){out.ocr.duplicates++;continue;}
                if(!Number.isFinite(word.confidence)||word.confidence<o.minConfidence){out.ocr.rejected++;if(out.ocr.rejectedWords.length<200)out.ocr.rejectedWords.push({text:word.text,confidence:word.confidence??0,box,region:ri});continue;}
                out.items.push(wordToPaint(word,localToPdf,{page:scene.pageNumber,regionId:String(ri),imageIds:region.items.map(i=>i.id),color:inkColor(original,box)}));out.ocr.accepted++;
            }
            if(o.traceLines){binary ||= binarize(original,{signal});for(const b of wordBoxes){for(let py=Math.max(0,Math.floor(b[1])-2);py<Math.min(original.height,Math.ceil(b[3])+2);py++)for(let px=Math.max(0,Math.floor(b[0])-2);px<Math.min(original.width,Math.ceil(b[2])+2);px++)binary[py*original.width+px]=0;}
                for(const line of detectRasterLines(binary,original.width,original.height,{minLength:Math.max(24,scale*15),maxThickness:Math.max(3,Math.round(scale*3)),signal})){const start=transform(localToPdf,line.start),end=transform(localToPdf,line.end);out.items.push({id:`raster-line-${ri}-${out.ocr.lines++}`,kind:'path',operator:-1,visible:true,layerId:'REVECTOR_RASTER_LINES',paths:[{start,segments:[{kind:'L',to:end}],closed:false}],stroke:true,fill:false,clips:[],formPath:[],style:{stroke:[0,0,0],lineWidth:line.thickness/scale,strokeAlpha:1,dash:[]},rasterInference:{method:'axis-runs',confidence:line.confidence}});}
            }
            crop.width=crop.height=1;rotated.width=rotated.height=1;
        }
    }finally{if(own)await session.dispose();full.width=full.height=1;}
    if(out.ocr.accepted)out.ocgs.REVECTOR_OCR={name:'OCR_TEXT',visible:true};if(out.ocr.lines)out.ocgs.REVECTOR_RASTER_LINES={name:'RASTER_LINE_HYPOTHESES',visible:true};
    out.diagnostics=out.diagnostics.filter(d=>!d.code.startsWith('OCR_'));
    out.diagnostics.push(diagnostic('OCR_RECOVERY',`${out.ocr.accepted} OCR words added; ${out.ocr.rejected} below confidence threshold; ${out.ocr.duplicates} native-text overlaps suppressed. OCR is inferred, not lossless.`, 'warning',{ocr:out.ocr}));
    if(o.traceLines)out.diagnostics.push(diagnostic('RASTER_LINE_INFERENCE','Axis-aligned raster lines are estimated, not exact recovered CAD primitives; text boxes are excluded.','warning'));
    out.source={...out.source,ocr:{engine:out.ocr.engine,accepted:out.ocr.accepted,effectiveDpi:out.ocr.effectiveDpi}};return out;
}
