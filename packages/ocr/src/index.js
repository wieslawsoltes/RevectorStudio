import { compose, inverse, transform, transformBox, I, mapPaths, rectPath, stableHash, intersects } from '@revector/geometry';
import { diagnostic, checkAbort } from '@revector/model';
import { rasterRegions, binarize, binaryRgba, detectRasterLines, planRasterTiles, estimateSkew, boundedRotation } from '@revector/raster';
import { SpatialIndex } from '@revector/topology';
export const OCR_VERSION = '7.0.0';
export const DEFAULT_OCR_OPTIONS = Object.freeze({scope:'raster',languages:'eng',dpi:300,minConfidence:65,preprocess:'none',rotation:0,traceLines:false,maxPixels:24_000_000,maxRegions:128,maxWords:25000,timeoutMs:120000,tileSize:2048,tileOverlap:96,maxTiles:256,deskew:false});
export function normalizeOcrOptions(input={}) {
    const o={...DEFAULT_OCR_OPTIONS,...input};
    if(!/^[a-z][a-z0-9_]{1,23}(\+[a-z][a-z0-9_]{1,23}){0,7}$/.test(o.languages))throw new RangeError('Invalid OCR language codes');
    if(!['raster','page'].includes(o.scope)||!['none','otsu','sauvola'].includes(o.preprocess)||![0,90,180,270].includes(o.rotation))throw new RangeError('Invalid OCR mode');
    for(const [key,min,max] of [['dpi',72,600],['minConfidence',0,100],['maxPixels',1,48_000_000],['maxRegions',1,1024],['maxWords',1,100000],['timeoutMs',1000,600000],['tileSize',256,8192],['tileOverlap',0,2048],['maxTiles',1,4096]])if(!Number.isFinite(o[key])||o[key]<min||o[key]>max)throw new RangeError('Invalid OCR '+key);
    for(const key of ['maxRegions','maxWords','tileSize','tileOverlap','maxTiles'])if(!Number.isInteger(o[key]))throw new RangeError('OCR '+key+' must be an integer');
    if(o.tileOverlap*2>=o.tileSize)throw new RangeError('OCR overlap must be smaller than half a tile');
    if(o.tileSize*o.tileSize>o.maxPixels) o.tileSize=Math.max(256,Math.floor(Math.sqrt(o.maxPixels)));
    if(o.tileSize*o.tileSize>o.maxPixels||o.tileOverlap*2>=o.tileSize)throw new RangeError('OCR pixel budget cannot accommodate the tile settings');
    return o;
}
/** Injectable OCR provider. A session owns exactly one worker, serialized jobs and hard cancellation. */
export class TesseractOcr {
    constructor(options={}){this.options=options;this.worker=null;this.busy=false;this.active=null;this.terminated=new WeakMap();}
    stop(worker){
        if(!worker||typeof worker!=='object')return Promise.resolve();
        if(!this.terminated.has(worker))this.terminated.set(worker,Promise.resolve().then(()=>worker.terminate?.()).catch(()=>{}));
        return this.terminated.get(worker);
    }
    async recognize(image,options={}) {
        if(this.busy)throw new Error('OCR session is busy; await the previous recognition');
        const timeout=options.timeoutMs??120000;
        if(!Number.isFinite(timeout)||timeout<=0)throw new RangeError('Invalid OCR deadline');
        checkAbort(options.signal);this.busy=true;
        const token={cancelled:false,cancel:null};this.active=token;
        let timer,localWorker=this.worker;
        const ensureActive=()=>{if(token.cancelled||this.active!==token)throw Object.assign(new Error('OCR cancelled'),{name:'AbortError'});};
        const failure=new Promise((_,reject)=>{
            token.cancel=(error)=>{if(token.cancelled)return;token.cancelled=true;
                if(this.worker===localWorker)this.worker=null;void this.stop(localWorker);reject(error);
            };
        });
        const abort=()=>token.cancel(Object.assign(new Error('OCR cancelled'),{name:'AbortError'}));
        options.signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>token.cancel(new Error('OCR deadline exceeded')),timeout);
        const work=(async()=>{
            if(!localWorker){
                const moduleUrl=this.options.moduleUrl;
                const namespace=this.options.provider||await import(/* @vite-ignore */ moduleUrl);
                ensureActive();const lib=typeof namespace?.createWorker==='function'?namespace:namespace?.default;
                if(typeof lib?.createWorker!=='function')throw new TypeError('OCR provider must export createWorker, directly or through its ES-module default export');
                const created=await lib.createWorker(this.options.languages||'eng',1,{...(this.options.node?{}:{workerPath:this.options.workerPath,corePath:this.options.corePath,workerBlobURL:false}),
                    langPath:this.options.langPath,gzip:true,logger:typeof this.options.onProgress==='function'?this.options.onProgress:()=>{}});
                // A cancelled initialization may finish after a NEW call has started.
                // Release only its own worker, never a newer session's worker.
                if(token.cancelled||this.active!==token){void this.stop(created);ensureActive();}
                localWorker=created;
                if(!created||typeof created.setParameters!=='function'||typeof created.recognize!=='function'||typeof created.terminate!=='function')throw new TypeError('OCR provider returned an invalid worker');
                this.worker=created;
            }
            ensureActive();await localWorker.setParameters({tessedit_pageseg_mode:String(options.psm??11),preserve_interword_spaces:'1',user_defined_dpi:String(options.dpi||300)});
            ensureActive();const response=await localWorker.recognize(image,{}, {blocks:true,text:true});ensureActive();return response.data;
        })();
        try{return await Promise.race([work,failure]);}
        catch(error){token.cancelled=true;if(this.worker===localWorker)this.worker=null;void this.stop(localWorker);throw error;}
        finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(this.active===token){this.active=null;this.busy=false;}}
    }
    async dispose(){this.active?.cancel(Object.assign(new Error('OCR disposed'),{name:'AbortError'}));const worker=this.worker;this.worker=null;await this.stop(worker);}
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
/** Confidence-ordered spatial NMS for overlapping tiles. Text disagreement is
 * retained unless boxes almost coincide. Equal labels at distinct positions remain. */
export function deduplicateOcrWords(words,{maxComparisons=1000000}={}) {
    const box=w=>[w.bbox.x0,w.bbox.y0,w.bbox.x1,w.bbox.y1],records=words.map((word,index)=>({word,index,box:box(word)}));
    const index=new SpatialIndex(records,r=>r.box),suppressed=new Set(),keptIds=new Set(),kept=[];let work=0;
    const normalize=s=>String(s).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
    // A complete observation wins over a crop-edge fragment even when the OCR
    // engine assigns the fragment higher confidence. Tile-edge contact alone is
    // not a reason to discard text: unmatched observations are retained/flagged.
    records.sort((a,b)=>Number(!!a.word.clippedEdges?.length)-Number(!!b.word.clippedEdges?.length)||(Number.isFinite(b.word.confidence)?b.word.confidence:-1)-(Number.isFinite(a.word.confidence)?a.word.confidence:-1)||a.index-b.index);
    for(const record of records){if(suppressed.has(record.index))continue;kept.push(record);keptIds.add(record.index);
        for(const other of index.search(record.box)){
            if(++work>maxComparisons)throw new RangeError('OCR duplicate comparison budget exceeded');
            if(other===record||suppressed.has(other.index)||keptIds.has(other.index))continue;
            const common=overlap(record.box,other.box),reverse=overlap(other.box,record.box),same=normalize(record.word.text)===normalize(other.word.text);
            const fragment=other.word.clippedEdges?.length&&!record.word.clippedEdges?.length&&Number.isInteger(record.word.tile)&&Number.isInteger(other.word.tile)&&record.word.tile!==other.word.tile&&reverse>.9;
            if(fragment||Math.min(common,reverse)>(same?.55:.92))suppressed.add(other.index);
        }
    }
    return kept.sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]||a.index-b.index).map(r=>r.word);
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
    const canvases=new Set(),factory=input.canvasFactory||canvasFactory;
    const make=(width,height)=>{const canvas=factory(width,height);canvases.add(canvas);return canvas;};
    try { return await recoverRasterCore(source,scene,{...input,canvasFactory:make}); }
    finally { for(const canvas of canvases){canvas.width=1;canvas.height=1;} }
}
async function recoverRasterCore(source,scene,input={}) {
    const o=normalizeOcrOptions(input),signal=o.signal,make=o.canvasFactory||canvasFactory,regions=rasterRegions(scene,o);
    const out=structuredClone(scene);out.items=out.items.filter(i=>!i.ocr&&!i.rasterInference);out.ocr={engine:'tesseract.js',version:OCR_VERSION,options:Object.fromEntries(Object.entries(o).filter(([k,v])=>!['signal','provider','canvasFactory','session','onProgress'].includes(k)&&typeof v!=='function')),accepted:0,rejected:0,duplicates:0,regions:regions.length,lines:0,rejectedWords:[],tiles:0,tileDuplicates:0,deskew:[]};
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
            const R=rotationMatrix(o.rotation,w,h),oriented=make(o.rotation%180?h:w,o.rotation%180?w:h),oc=oriented.getContext('2d',{willReadFrequently:true});
            oc.setTransform(...R);oc.drawImage(crop,0,0);oc.resetTransform();
            let rotated=oriented,applied=R;
            try{
                if(o.deskew){
                    // Analyze a small thumbnail so the angular sweep has bounded cost.
                    const ds=Math.min(1,1400/Math.max(oriented.width,oriented.height)),small=make(Math.max(1,Math.round(oriented.width*ds)),Math.max(1,Math.round(oriented.height*ds)));
                    const sc=small.getContext('2d',{willReadFrequently:true});sc.drawImage(oriented,0,0,small.width,small.height);
                    const binary=binarize(sc.getImageData(0,0,small.width,small.height),{signal,invert:!!o.invert});
                    const skew=estimateSkew(binary,small.width,small.height,{signal});small.width=small.height=1;
                    const skewRecord={region:ri,...skew,scale:1};out.ocr.deskew.push(skewRecord);
                    if(skew.angle){const correction=boundedRotation(-skew.angle,oriented.width,oriented.height,o.maxPixels);
                        skewRecord.scale=correction.scale;rotated=make(correction.width,correction.height);const dc=rotated.getContext('2d');dc.fillStyle='#fff';dc.fillRect(0,0,rotated.width,rotated.height);
                        dc.setTransform(...correction.matrix);dc.drawImage(oriented,0,0);dc.resetTransform();applied=compose(correction.matrix,R);
                    }
                }
                const rc=rotated.getContext('2d',{willReadFrequently:true}),localToGlobal=compose([1,0,0,1,x,y],inverse(applied)),localToPdf=compose(pixelToPdf,localToGlobal);
                if(out.ocr.tiles>=o.maxTiles)throw new RangeError('OCR tile budget exceeded');
                const tiles=planRasterTiles(rotated.width,rotated.height,{tileSize:o.tileSize,overlap:o.tileOverlap,maxTiles:o.maxTiles-out.ocr.tiles});
                const candidates=[],lineCandidates=[];
                for(let ti=0;ti<tiles.length;ti++){
                    checkAbort(signal);out.ocr.tiles++;const tile=tiles[ti],canvas=make(tile.width,tile.height),tc=canvas.getContext('2d',{willReadFrequently:true});
                    try{
                        tc.drawImage(rotated,-tile.x,-tile.y);const original=tc.getImageData(0,0,tile.width,tile.height);
                        let binary;
                        if(o.preprocess!=='none'){binary=binarize(original,{method:o.preprocess,invert:!!o.invert,signal,maxPixels:o.maxPixels});const clean=binaryRgba(binary,tile.width,tile.height),image=tc.createImageData(tile.width,tile.height);image.data.set(clean.data);tc.putImageData(image,0,0);}
                        else if(o.invert){const image=tc.createImageData(tile.width,tile.height);image.data.set(original.data);for(let j=0;j<image.data.length;j+=4)for(let k=0;k<3;k++)image.data[j+k]=255-image.data[j+k];tc.putImageData(image,0,0);}
                        o.onProgress?.({phase:'ocr-tile',done:ti,total:tiles.length});
                        const data=await session.recognize(typeof canvas.toBuffer==='function'?canvas.toBuffer('image/png'):canvas,{...o,signal}),words=ocrWords(data);
                        if(out.ocr.accepted+out.ocr.rejected+out.ocr.duplicates+out.ocr.tileDuplicates+candidates.length+words.length>o.maxWords)throw new RangeError('OCR word budget exceeded');
                        for(const word of words){const b=word.bbox,box=[b.x0,b.y0,b.x1,b.y1];
                            if(b.x0<0||b.y0<0||b.x1>tile.width||b.y1>tile.height)continue;
                            const baseline=word.lineBaseline,clippedEdges=[];
                            if(tile.x>0&&b.x0<=2)clippedEdges.push('left');
                            if(tile.y>0&&b.y0<=2)clippedEdges.push('top');
                            if(tile.x+tile.width<rotated.width&&b.x1>=tile.width-2)clippedEdges.push('right');
                            if(tile.y+tile.height<rotated.height&&b.y1>=tile.height-2)clippedEdges.push('bottom');
                            candidates.push({...word,bbox:{x0:b.x0+tile.x,y0:b.y0+tile.y,x1:b.x1+tile.x,y1:b.y1+tile.y},
                                lineBaseline:baseline?{x0:baseline.x0+tile.x,y0:baseline.y0+tile.y,x1:baseline.x1+tile.x,y1:baseline.y1+tile.y}:undefined,
                                sampledColor:inkColor(original,box),tile:ti,clippedEdges});
                        }
                        if(o.traceLines){binary ||= binarize(original,{signal,invert:!!o.invert});for(const word of words){const b=word.bbox;
                            for(let py=Math.max(0,Math.floor(b.y0)-2);py<Math.min(tile.height,Math.ceil(b.y1)+2);py++)for(let px=Math.max(0,Math.floor(b.x0)-2);px<Math.min(tile.width,Math.ceil(b.x1)+2);px++)binary[py*tile.width+px]=0;
                        }
                            for(const line of detectRasterLines(binary,tile.width,tile.height,{minLength:Math.max(24,scale*15),maxThickness:Math.max(3,Math.round(scale*3)),signal})){
                                // Clip inferred lines to disjoint ownership cells; halo duplicates
                                // must not introduce double strokes in the exported drawing.
                                let start=[line.start[0]+tile.x,line.start[1]+tile.y],end=[line.end[0]+tile.x,line.end[1]+tile.y];const vertical=start[0]===end[0],axis=vertical?1:0,other=1-axis;
                                if(start[other]<tile.core[other]||start[other]>=tile.core[other+2])continue;
                                start[axis]=Math.max(start[axis],tile.core[axis]);end[axis]=Math.min(end[axis],tile.core[axis+2]);if(end[axis]-start[axis]<1)continue;
                                lineCandidates.push({...line,start,end});if(lineCandidates.length>100000)throw new RangeError('OCR line budget exceeded');
                            }
                        }
                    }finally{canvas.width=canvas.height=1;}
                }
                const recovered=deduplicateOcrWords(candidates);out.ocr.tileDuplicates+=candidates.length-recovered.length;
                for(const word of recovered){const b=word.bbox,box=[b.x0,b.y0,b.x1,b.y1],global=transformBox(box,localToGlobal);
                    if(native.search(global).some(b=>intersects(global,b)&&overlap(global,b)>.6)){out.ocr.duplicates++;continue;}
                    if(!Number.isFinite(word.confidence)||word.confidence<o.minConfidence){out.ocr.rejected++;if(out.ocr.rejectedWords.length<200)out.ocr.rejectedWords.push({text:word.text,confidence:word.confidence??0,box,region:ri});continue;}
                    const item=wordToPaint(word,localToPdf,{page:scene.pageNumber,regionId:String(ri),imageIds:(region.wholePage?out.items.filter(i=>i.kind==='image'&&i.visible!==false):region.items).map(i=>i.id),color:word.sampledColor});
                    item.ocr.tile=word.tile;item.ocr.clippedEdges=word.clippedEdges||[];item.ocr.deskew=out.ocr.deskew.find(d=>d.region===ri)||null;out.items.push(item);out.ocr.accepted++;
                }
                for(const line of lineCandidates){const start=transform(localToPdf,line.start),end=transform(localToPdf,line.end);
                    out.items.push({id:`raster-line-${ri}-${out.ocr.lines++}`,kind:'path',operator:-1,visible:true,layerId:'REVECTOR_RASTER_LINES',paths:[{start,segments:[{kind:'L',to:end}],closed:false}],stroke:true,fill:false,clips:[],formPath:[],style:{stroke:[0,0,0],lineWidth:line.thickness*Math.hypot(localToPdf[0],localToPdf[1]),strokeAlpha:1,dash:[]},rasterInference:{method:'axis-runs',confidence:line.confidence}});
                }
            }finally{crop.width=crop.height=1;oriented.width=oriented.height=1;rotated.width=rotated.height=1;}

        }
    }finally{if(own)await session.dispose();full.width=full.height=1;}
    if(out.ocr.accepted)out.ocgs.REVECTOR_OCR={name:'OCR_TEXT',visible:true};if(out.ocr.lines)out.ocgs.REVECTOR_RASTER_LINES={name:'RASTER_LINE_HYPOTHESES',visible:true};
    out.diagnostics=out.diagnostics.filter(d=>!d.code.startsWith('OCR_'));
    out.diagnostics.push(diagnostic('OCR_RECOVERY',`${out.ocr.accepted} OCR words added; ${out.ocr.rejected} below confidence threshold; ${out.ocr.duplicates} native-text overlaps suppressed. OCR is inferred, not lossless.`, 'warning',{ocr:out.ocr}));
    if(o.traceLines)out.diagnostics.push(diagnostic('RASTER_LINE_INFERENCE','Axis-aligned raster lines are estimated, not exact recovered CAD primitives; text boxes are excluded.','warning'));
    out.source={...out.source,ocr:{engine:out.ocr.engine,accepted:out.ocr.accepted,effectiveDpi:out.ocr.effectiveDpi}};return out;
}
