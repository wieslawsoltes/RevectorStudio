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
        checkAbort(settings.signal);
        const validation = validateDocument(document);
        if (!validation.valid)
            throw Error('Conversion model failed validation: ' + validation.errors.join('; '));
        options.onProgress?.({ phase: 'serialize', done: 0, total: 1 });
        const dxf = exportDxf(document, { version: settings.version, precision: settings.precision, strict: settings.strict });
        checkpoint('serializeMs');
        // The preview must describe the actual file, not an optimistic pre-serialization model.
        const preview = readDxf(dxf.text);
        preview.pageBox = [...document.pageBox];
        preview.source = document.source;
        preview.name = document.name;
        for(const a of preview.assets||[]) {
            const original=(document.assets||[]).find(s=>s.id===a.id&&s.path===a.path&&s.width===a.width&&s.height===a.height);
            if(original){a.dataBase64=original.dataBase64;a.sha256=original.sha256;}
        }
        const roundtripValidation = validateDocument(preview);
        if (!roundtripValidation.valid)
            throw new Error('Serialized DXF failed round-trip validation: ' + roundtripValidation.errors.join('; '));
        checkpoint('roundtripMs');
        const report = { schema: 'revector.report/1', version: '0.4.0', color: {...auditColors(document, preview), source: scene.colorManagement || null}, ocr: scene.ocr || null, rasterImages: scene.rasterImages || null, source: document.source, target: { version: dxf.version, acadVersion: dxf.acadVersion, units: document.units }, summary: summary(document), producer: detectProducerProfile(scene.source), diagnostics: [...document.diagnostics, ...dxf.diagnostics, ...preview.diagnostics], rules: document.ruleStats || [], timings: { ...times, totalMs: performance.now() - start }, coverage: { paintItems: scene.items.length, vectorPaths: scene.items.filter(i => i.kind === 'path').length, textRuns: scene.items.filter(i => i.kind === 'text').length, forms: scene.forms.length, rasterItems: scene.items.filter(i => i.kind === 'image').length, shadings: scene.items.filter(i => i.kind === 'shading').length }, validation: { model: validation, roundtrip: roundtripValidation } };
        options.onProgress?.({ phase: 'complete', done: 1, total: 1 });
        return { document, preview, dxf, report };
    }
    async convertPdf(bytes, options = {}) {
        const source = await PdfSource.open(bytes, options);
        try {
            let scene = await source.extract(options.page || 1, options);
            if (options.rasterImages) scene = await source.preserveRasterImages(scene,{...options.rasterImages,signal:options.signal});
            if (options.ocr) scene = await recoverPdfRaster(source, scene, {...options.ocr, signal: options.signal, onProgress: options.onProgress});
            return { ...await this.convertScene(scene, options), scene };
        }
        finally {
            await source.dispose();
        }
    }
}
export const convertScene = (scene, options) => new ConversionEngine().convertScene(scene, options);
export const convertPdf = (bytes, options) => new ConversionEngine().convertPdf(bytes, options);
/** One conversion per worker. Hard termination makes cancellation independent of kernel yielding. */
export class ConversionWorker {
    constructor(url) { this.url = url; this.worker = null; this.pending = null; this.sequence = 0; }
    cancel() { this.worker?.terminate(); this.worker = null; this.pending?.(Object.assign(new Error('Conversion cancelled'), { name: 'AbortError' })); this.pending = null; }
    convert(scene, options = {}, { signal, onProgress } = {}) {
        this.cancel();
        checkAbort(signal);
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const worker = this.worker = new Worker(this.url, { type: 'module', name: 'revector-conversion' });
            const cleanup = () => {
                signal?.removeEventListener('abort', abort);
                worker.terminate();
                if (this.worker === worker)
                    this.worker = null;
                this.pending = null;
            };
            const fail = e => { cleanup(); reject(e); };
            this.pending = fail;
            const abort = () => this.cancel();
            signal?.addEventListener('abort', abort, { once: true });
            worker.onmessage = ({ data }) => {
                if (data.id !== id)
                    return;
                if (data.kind === 'progress')
                    onProgress?.(data.progress);
                else if (data.kind === 'result') {
                    cleanup();
                    resolve(data.result);
                }
                else if (data.kind === 'error')
                    fail(Object.assign(new Error(data.error.message), { name: data.error.name, stack: data.error.stack }));
            };
            worker.onerror = e => fail(Object.assign(new Error(e.message || 'Conversion worker could not start in this browser context'), { name: e.message ? 'WorkerExecutionError' : 'WorkerStartupError' }));
            const copy = { ...options };
            delete copy.signal;
            delete copy.onProgress;
            try {
                worker.postMessage({ id, scene, options: copy });
            }
            catch (error) {
                fail(error);
            }
        });
    }
    dispose() { this.cancel(); }
}
