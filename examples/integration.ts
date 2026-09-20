import { PdfSource } from '@revector/pdf';
import { ConversionEngine } from '@revector/engine';
import type { Rule } from '@revector/semantics';
import type { Entity } from '@revector/model';
import { mountWorkbench } from '@revector/workbench';
/** Typed, trusted plugin: no UI dependency or source-model mutation. */
const instrumentRule: Rule = {
    id: 'plant.pressure-tags', version: '1.0.0', stage: 70, title: 'Pressure tag classification',
    run({ document, checkAbort }) {
        checkAbort();
        return document.entities.filter((e): e is Extract<Entity, {
            type: 'TEXT' | 'MTEXT';
        }> => e.type === 'TEXT' && e.text.startsWith('PT-')).map(e => ({
            title: `Classify ${e.text}`, members: [e.id], confidence: .99, exact: true,
            evidence: [{ kind: 'plant-naming-convention', prefix: 'PT-' }],
            proposal: { layers: [{ name: 'INSTRUMENT_TAGS', color: [40, 150, 190] as [
                            number,
                            number,
                            number
                        ], visible: true }], update: [{ id: e.id, patch: { layer: 'INSTRUMENT_TAGS', semantic: { ...e.semantic, class: 'pressure-instrument' } } }] }
        }));
    }
};
export async function convert(bytes: Uint8Array) {
    const source = await PdfSource.open(bytes, {
        moduleUrl: '/vendor/pdfjs/legacy/build/pdf.mjs', workerUrl: '/vendor/pdfjs/legacy/build/pdf.worker.mjs',
        pdfOptions: { cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/' }
    });
    try {
        const scene = await source.extract(1);
        const engine = new ConversionEngine().register(instrumentRule);
        const result = await engine.convertScene(scene, { version: '2018', units: 'mm', drawingScale: 100, profile: 'cad', strict: true });
        return { dxf: result.dxf.text, report: result.report, model: result.document };
    }
    finally {
        await source.dispose();
    }
}
export function mount(root: HTMLElement) { return mountWorkbench(root, { pdfjsModuleUrl: '/vendor/pdfjs/legacy/build/pdf.mjs', pdfjsWorkerUrl: '/vendor/pdfjs/legacy/build/pdf.worker.mjs', conversionWorkerUrl: '/apps/studio/conversion-worker.js', assetBase: '/vendor/pdfjs/' }); }

// Optional image recovery is separate from exact native vector transcription.
import { recoverPdfRaster, normalizeOcrOptions } from '@revector/ocr';
import { planRasterTiles, boundedRotation, estimateSkew } from '@revector/raster';
import { detectBorderlessTables, detectLists } from '@revector/rules-document';
import { auditColors } from '@revector/color';
export async function recoverScan(source: PdfSource) {
    const scene = await source.extract(1);
    const options = normalizeOcrOptions({languages:'eng+pol', deskew:true, tileSize:2048, tileOverlap:96, maxTiles:256, assetBase:'/vendor/ocr/'});
    const recovered = await recoverPdfRaster(source, scene, options);
    const result = await new ConversionEngine().convertScene(recovered, {version:'2018'});
    const color = auditColors(result.document, result.preview);
    return {result, rgbExact:color.rgbExact, opacityExact:color.opacityExact,
        tables:detectBorderlessTables(result.document), lists:detectLists(result.document)};
}
export const tilingExample = planRasterTiles(3000,2000,{tileSize:1024});
export const affineExample = boundedRotation(-4,3000,2000,8000000);
export const emptyScanSkew = estimateSkew(new Uint8Array(100),10,10);

// Raster preservation is independent of OCR: IMAGE placement remains native DXF;
// PNG bytes are returned to the embedding host as a portable file collection.
import { packageDxf } from '@revector/dxf';
import { traceRasterPaths } from '@revector/raster';
export async function preserveImages(source:PdfSource) {
    const scene = await source.preserveRasterImages(await source.extract(1),{maxPixels:16_000_000});
    const converted = await new ConversionEngine().convertScene(scene,{version:'2018'});
    return packageDxf(converted.document,{version:'2018',filename:'drawing.dxf'});
}
export async function traceBinary(binary:Uint8Array,width:number,height:number,signal?:AbortSignal) {
    const result = await traceRasterPaths(binary,width,height,{tolerance:.65,signal});
    return {paths:result.paths,graphEdges:result.stats.graphEdges,sourceIsInferred:result.inferred};
}
