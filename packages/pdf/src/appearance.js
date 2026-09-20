import {checkAbort,sha256Bytes} from '@revector/model';

export const DEFAULT_APPEARANCE_OPTIONS = Object.freeze({dpi:144,maxPixels:32_000_000,maxBytes:64*1024*1024,maxDimension:16384,background:'#ffffff'});
const createCanvas=(w,h)=>{const c=globalThis.document?.createElement('canvas')||new OffscreenCanvas(w,h);c.width=w;c.height=h;return c;};
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
/** An explicit, resolution-qualified display representation, NEVER a claim of native CAD fidelity.
 * Keep the original paint IR untouched. The engine retains editable geometry on separate layers.
 * Full-page composition is necessary for destination-dependent blends/knockout: isolated screenshots
 * of individual paint items are not equivalent. All PDF.js drawing operations run unfiltered.
 */
export async function captureAppearance(source,scene,input={}) {
    const o={...DEFAULT_APPEARANCE_OPTIONS,...input};
    for(const k of ['maxPixels','maxBytes','maxDimension'])if(!Number.isSafeInteger(o[k])||o[k]<1)throw new RangeError('Invalid appearance '+k);
    if(!Number.isFinite(o.dpi)||o.dpi<36||o.dpi>1200)throw new RangeError('Appearance DPI must be between 36 and 1200');
    if(!/^#[0-9a-f]{6}$/i.test(o.background))throw new TypeError('Appearance background must be an opaque RGB hex color');
    checkAbort(o.signal);
    if(source.pdf.isPureXfa)throw new Error('Pure XFA uses a separate DOM renderer; page Canvas is not a complete appearance');
    const page=await source.pdf.getPage(scene.pageNumber),unit=page.getViewport({scale:1}),scale=o.dpi/72;
    const width=Math.ceil(unit.width*scale),height=Math.ceil(unit.height*scale);
    if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=o.maxDimension)||width*height>o.maxPixels)throw new RangeError('Appearance pixel budget exceeded; lower DPI explicitly (no silent downsampling)');
    let canvas;
    try {
        canvas=(o.canvasFactory||createCanvas)(width,height);
        const viewport=await source.render(scene.pageNumber,canvas,{scale,background:o.background,signal:o.signal,annotationMode:scene.annotationMode});
        checkAbort(o.signal);
        if(canvas.width!==width||canvas.height!==height)throw new Error('Appearance renderer returned unexpected dimensions');
        const bytes=typeof canvas.toBuffer==='function'?new Uint8Array(canvas.toBuffer('image/png')):new Uint8Array(await (await (canvas.convertToBlob?canvas.convertToBlob({type:'image/png'}):new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed')),'image/png')))).arrayBuffer());
        checkAbort(o.signal);
        if(bytes.length>o.maxBytes)throw new RangeError('Appearance encoded-byte budget exceeded');
        const hash=sha256Bytes(bytes),out=structuredClone(scene);
        out.appearance={schema:'revector.appearance/1',mode:'page-composite',dpi:o.dpi,scale,width,height,background:o.background,
            pageNumber:scene.pageNumber,pageSize:[unit.width,unit.height],pixelToPage:[1/scale,0,0,-1/scale,0,unit.height],
            pdfToPixels:[...viewport.transform],sourceFingerprints:[...(source.pdf.fingerprints||[])],
            ocgs:structuredClone(scene.ocgs||{}),annotationMode:scene.annotationMode,
            renderer:{name:'PDF.js',version:source.lib.version,colorSpace:'sRGB'},
            exactSourceStreams:false,editable:false,originalDiagnostics:structuredClone(scene.diagnostics||[]),
            asset:{id:'APPEARANCE_'+hash,path:'images/'+hash+'.png',mimeType:'image/png',sha256:hash,width,height,dataBase64:encode(bytes),
                source:{kind:'pdf-page-appearance',dpi:o.dpi,colorSpace:'sRGB',losslessSourceEncoding:false}}};
        return out;
    }finally{if(canvas)canvas.width=canvas.height=1;}
}
