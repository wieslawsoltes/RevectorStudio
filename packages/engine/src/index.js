import {applyAppearance} from './appearance.js';
import { documentRules } from '@revector/rules-document';
import { auditColors } from '@revector/color';
import { recoverPdfRaster } from '@revector/ocr';
import { PdfSource } from '@revector/pdf';
import { lowerScene, DEFAULT_CONVERSION_OPTIONS } from '@revector/cad';
import { RuleEngine, compileRuleSet } from '@revector/semantics';
import { cadRules, CAD_PROFILES, detectProducerProfile } from '@revector/rules-cad';
import { exportDxf, readDxf } from '@revector/dxf';
import { checkAbort, validateDocument, summary } from '@revector/model';
export { CAD_PROFILES, DEFAULT_CONVERSION_OPTIONS };
/** No browser, renderer, persistence, or framework dependency in the conversion core. */
export class ConversionEngine {
    constructor({ rules = [...cadRules, ...documentRules] } = {}) { this.rules = [...rules]; }
    register(rule) {
        if (this.rules.some(r => r.id === rule.id))
            throw Error(`Duplicate rule ${rule.id}`);
        this.rules.push(rule);
        return this;
    }
    async convertScene(scene, options = {}) {
        if (options.profile && !Object.hasOwn(CAD_PROFILES, options.profile))
            throw new RangeError('Unsupported conversion profile: ' + options.profile);
        const settings = { ...DEFAULT_CONVERSION_OPTIONS, ...CAD_PROFILES[options.profile || 'cad'], version: '2018', ...options };
        const start = performance.now(), times = {};
        let mark = start;
        const checkpoint = name => { const now = performance.now(); times[name] = now - mark; mark = now; };
        checkAbort(settings.signal);
        let document = await lowerScene(scene, settings);
        checkpoint('geometryMs');
        const rules = new RuleEngine();
        for (const r of this.rules)
            rules.register(r);
        for (const r of options.ruleSet ? compileRuleSet(options.ruleSet) : [])
            rules.register(r);
        document = await rules.run(document, settings);
        checkpoint('semanticsMs');
        document=applyAppearance(document,scene,settings);
        checkpoint('representationMs');
        checkAbort(settings.signal);
        const validation = validateDocument(document);
        if (!validation.valid)
            throw Error('Conversion model failed validation: ' + validation.errors.join('; '));
        checkpoint('validationMs');
        options.onProgress?.({ phase: 'serialize', done: 0, total: 1 });
        const dxf = exportDxf(document, { version: settings.version, precision: settings.precision, strict: settings.strict });
        checkpoint('serializeMs');
        // The preview must describe the actual file, not an optimistic pre-serialization model.
        const preview = readDxf(dxf.text);
        preview.pageBox = [...document.pageBox];
        preview.source = document.source;
        preview.name = document.name;
        const assetIndex=new Map((document.assets||[]).map(a=>[a.id,a]));
        for(const a of preview.assets||[]) {
            const candidate=assetIndex.get(a.id);
            const original=candidate&&candidate.path===a.path&&candidate.width===a.width&&candidate.height===a.height?candidate:null;
            if(original){a.dataBase64=original.dataBase64;a.sha256=original.sha256;}
        }
        const roundtripValidation = validateDocument(preview);
        if (!roundtripValidation.valid)
            throw new Error('Serialized DXF failed round-trip validation: ' + roundtripValidation.errors.join('; '));
        checkpoint('roundtripMs');
        const colorAudit = auditColors(document, preview);
        checkpoint('colorAuditMs');
        const report = { schema: 'revector.report/1', version: '0.7.0', color: {...colorAudit, source: scene.colorManagement || null}, appearance:document.source.appearance||null, ocr: scene.ocr || null, rasterImages: scene.rasterImages || null, source: document.source, target: { version: dxf.version, acadVersion: dxf.acadVersion, units: document.units }, summary: summary(document), producer: detectProducerProfile(scene.source), diagnostics: [...document.diagnostics, ...dxf.diagnostics, ...preview.diagnostics], rules: document.ruleStats || [], timings: { ...times, totalMs: performance.now() - start }, coverage: { paintItems: scene.items.length, vectorPaths: scene.items.filter(i => i.kind === 'path').length, textRuns: scene.items.filter(i => i.kind === 'text').length, forms: scene.forms.length, rasterItems: scene.items.filter(i => i.kind === 'image').length, shadings: scene.items.filter(i => i.kind === 'shading').length }, validation: { model: validation, roundtrip: roundtripValidation } };
        report.timings.totalMs = performance.now() - start;
        options.onProgress?.({ phase: 'complete', done: 1, total: 1 });
        return { document, preview, dxf, report };
    }
    async convertPdf(bytes, options = {}) {
        const pipelineStart=performance.now(),phaseTimes={};
        const source = await PdfSource.open(bytes, options);
        phaseTimes.pdfOpenMs=performance.now()-pipelineStart;
        try {
            let mark=performance.now();
            let scene = await source.extract(options.page || 1, options);
            phaseTimes.extractionMs=performance.now()-mark;mark=performance.now();
            if (options.rasterImages) scene = await source.preserveRasterImages(scene,{...options.rasterImages,signal:options.signal});
            phaseTimes.rasterImagesMs=performance.now()-mark;mark=performance.now();
            if (options.ocr) scene = await recoverPdfRaster(source, scene, {...options.ocr, signal: options.signal, onProgress: options.onProgress});
            phaseTimes.ocrMs=performance.now()-mark;mark=performance.now();
            if (options.appearance) scene = await source.captureAppearance(scene,{...options.appearance,signal:options.signal});
            phaseTimes.appearanceMs=performance.now()-mark;
            const result=await this.convertScene(scene,options);
            Object.assign(result.report.timings,phaseTimes,{totalPipelineMs:performance.now()-pipelineStart});
            return {...result,scene};
        }
        finally {
            await source.dispose();
        }
    }
}
export const convertScene = (scene, options) => new ConversionEngine().convertScene(scene, options);
export const convertPdf = (bytes, options) => new ConversionEngine().convertPdf(bytes, options);
/** One in-flight conversion per worker; successful idle workers are reused.
 * Cancellation and execution errors still hard-terminate the worker. Input scenes are
 * cloned on every postMessage: mutating a caller's scene never reuses a stale snapshot. */
export class ConversionWorker {
    constructor(url) { this.url = url; this.worker = null; this.pending = null; this.sequence = 0; }
    cancel() { this.pending?.(Object.assign(new Error('Conversion cancelled'), { name: 'AbortError' })); }
    convert(scene, options = {}, { signal, onProgress } = {}) {
        this.cancel();
        checkAbort(signal);
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            let worker;
            try { worker = this.worker ||= new Worker(this.url, { type: 'module', name: 'revector-conversion' }); }
            catch (error) { reject(error); return; }
            let settled = false;
            const cleanup = terminate => {
                if (settled) return false;
                settled = true;
                signal?.removeEventListener('abort', abort);
                worker.onmessage = worker.onerror = worker.onmessageerror = null;
                if (this.pending === fail) this.pending = null;
                if (terminate) { worker.terminate(); if (this.worker === worker) this.worker = null; }
                else worker.onerror = () => {
                    if (this.worker === worker && !this.pending) { worker.terminate(); this.worker = null; }
                };
                return true;
            };
            const fail = error => { if (cleanup(true)) reject(error); };
            const abort = () => fail(Object.assign(new Error('Conversion cancelled'), { name: 'AbortError' }));
            this.pending = fail;
            signal?.addEventListener('abort', abort, { once: true });
            worker.onmessage = ({ data }) => {
                if (settled || data.id !== id) return;
                if (data.kind === 'progress') {
                    try { onProgress?.(data.progress); } catch (error) { fail(error); }
                } else if (data.kind === 'result') {
                    if (cleanup(false)) resolve(data.result);
                } else if (data.kind === 'error') {
                    fail(Object.assign(new Error(data.error.message), { name: data.error.name, stack: data.error.stack }));
                }
            };
            worker.onerror = e => fail(Object.assign(new Error(e.message || 'Conversion worker could not start in this browser context'), { name: e.message ? 'WorkerExecutionError' : 'WorkerStartupError' }));
            worker.onmessageerror = () => fail(new Error('Conversion worker returned an unreadable result'));
            const copy = { ...options };
            delete copy.signal; delete copy.onProgress;
            try { checkAbort(signal); worker.postMessage({ id, scene, options: copy }); }
            catch (error) { fail(error); }
        });
    }
    dispose() { this.cancel(); this.worker?.terminate(); this.worker = null; }
}
