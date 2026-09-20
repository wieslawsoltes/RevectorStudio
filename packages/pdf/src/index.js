import {preserveRasterImages} from './images.js';
export {preserveRasterImages,DEFAULT_IMAGE_OPTIONS} from './images.js';
import { interpretOperators } from './interpreter.js';
import { diagnostic, checkAbort } from '@revector/model';
export { interpretOperators } from './interpreter.js';
export { OPS, DRAW_OPS } from './ops.js';
export const PDFJS_VERSION = '6.4.172';
export const SUPPORTED_PDFJS_VERSIONS = Object.freeze(['6.3.289', '6.4.172']);
/** Dependency injection keeps this package usable in browser, Node and native hosts. */
export async function loadPdfJs({ moduleUrl, workerUrl } = {}) {
    const lib = moduleUrl ? await import(/* @vite-ignore */ moduleUrl) : await import('pdfjs-dist/build/pdf.mjs');
    if (!SUPPORTED_PDFJS_VERSIONS.includes(lib.version))
        throw new Error(`Expected PDF.js ${PDFJS_VERSION}; received ${lib.version}. Adapter upgrades require contract tests.`);
    if (workerUrl)
        lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
}
function getObject(store, id, timeout = 15000) {
    return new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error(`PDF resource ${id} did not resolve`)), timeout);
        try {
            store.get(id, value => { clearTimeout(timer); resolve(value); });
        }
        catch (e) {
            clearTimeout(timer);
            reject(e);
        }
    });
}
function snapshotFont(f) {
    const keys = ['name', 'loadedName', 'fallbackName', 'ascent', 'capHeight', 'descent', 'vertical', 'isType3Font', 'fontMatrix', 'missingFile', 'type', 'isSerifFont', 'isSymbolicFont'];
    const out = {};
    for (const k of keys)
        if (f[k] !== undefined)
            out[k] = f[k];
    return out;
}
export class PdfSource {
    #cache = new Map();
    constructor(lib, task, pdf, options) { this.lib = lib; this.task = task; this.pdf = pdf; this.options = options; this.numPages = pdf.numPages; this.metadata = null; }
    static async open(data, options = {}) {
        const lib = options.pdfjs || await loadPdfJs(options);
        const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
        if (bytes.byteLength > (options.maxBytes ?? 512 * 1024 * 1024))
            throw new RangeError('PDF exceeds the configured byte budget.');
        const task = lib.getDocument({ data: bytes, isEvalSupported: false, fontExtraProperties: true, useSystemFonts: true, stopAtErrors: false, enableXfa: true, ...options.pdfOptions });
        task.onPassword = (update, reason) => {
            if (!options.onPassword) {
                void task.destroy();
                return;
            }
            Promise.resolve(options.onPassword(reason)).then(value => {
                if (value === null || value === undefined)
                    void task.destroy();
                else
                    update(String(value));
            }).catch(() => task.destroy());
        };
        task.onProgress = p => options.onProgress?.({ phase: 'load', done: p.loaded, total: p.total });
        const pdf = await task.promise;
        const source = new PdfSource(lib, task, pdf, options);
        source.metadata = await pdf.getMetadata().catch(() => ({ info: {} }));
        source.optionalContent = await pdf.getOptionalContentConfig({ intent: 'display' }).catch(() => null);
        source.ocgs = source.optionalContent?.[Symbol.iterator] ? Object.fromEntries(source.optionalContent) : source.optionalContent?.getGroups?.() || {};
        return source;
    }
    async extract(pageNumber, options = {}) {
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.numPages)
            throw new RangeError('Invalid page number');
        checkAbort(options.signal);
        const page = await this.pdf.getPage(pageNumber);
        const annotationMode = options.includeAnnotations === false ? this.lib.AnnotationMode.DISABLE : this.lib.AnnotationMode.ENABLE;
        const key = `${pageNumber}:${annotationMode}`;
        let cached = this.#cache.get(key);
        if (!cached) {
            // `any` and the immutable snapshot are essential: PDF.js display rendering
            // replaces packed path buffers with Path2D instances in its cached list.
            const raw = await page.getOperatorList({ intent: 'any', annotationMode });
            const list = structuredClone(raw);
            const fontIds = new Set();
            for (let i = 0; i < list.fnArray.length; i++) {
                if (list.fnArray[i] === this.lib.OPS.setFont)
                    fontIds.add(list.argsArray[i][0]);
                if (list.fnArray[i] === this.lib.OPS.setGState)
                    for (const [k, v] of list.argsArray[i][0] || [])
                        if (k === 'Font')
                            fontIds.add(v[0]);
            }
            const fonts = {};
            for (const id of fontIds) {
                try {
                    fonts[id] = snapshotFont(await getObject(page.commonObjs, id));
                }
                catch {
                    fonts[id] = { name: id, missingFile: true };
                }
            }
            const structure = await page.getStructTree().catch(() => null);
            const annotations = await page.getAnnotations({ intent: 'any' }).catch(() => []);
            cached = { list, fonts, structure, annotations: annotations.map(a => ({ id: a.id, subtype: a.subtype, rect: a.rect, contents: a.contentsObj?.str || '', fieldName: a.fieldName, fieldValue: a.fieldValue, url: a.url })) };
            this.#cache.set(key, cached);
            while (this.#cache.size > (this.options.maxCachedPages ?? 3))
                this.#cache.delete(this.#cache.keys().next().value);
        }
        // Flip the destination canvas Y axis, not the PDF's local Y axis.
        // dontFlip:true flips before page rotation and reverses 90/270-degree sheets.
        const vp = page.getViewport({ scale: 1 });
        const [a,b,c,d,e,f] = vp.transform;
        const pageTransform = [a,-b,c,-d,e,vp.height-f];
        const groups = {};
        for (const [id, g] of Object.entries(this.ocgs))
            groups[id] = { name: g.name, visible: g.visible, locked: g.locked };
        const scene = await interpretOperators(cached.list, { ...options, OPS: this.lib.OPS, pageNumber, box: page.view, pageTransform, userUnit: page.userUnit, rotation: page.rotate, fonts: cached.fonts, ocgs: groups, structure: cached.structure, annotations: cached.annotations, source: { name: this.options.name || this.metadata?.info?.Title || 'PDF document', fingerprints: this.pdf.fingerprints, producer: this.metadata?.info?.Producer || '', creator: this.metadata?.info?.Creator || '', pdfVersion: this.metadata?.info?.PDFFormatVersion || '', ...this.metadata?.info } });
        scene.pageSize = [vp.width, vp.height];
        scene.annotationMode = annotationMode;
        scene.colorManagement = {engine: 'PDF.js', version: this.lib.version, output: 'sRGB', useWasm: this.options.pdfOptions?.useWasm !== false, iccResourcesConfigured: !!this.options.pdfOptions?.iccUrl, policy: 'Supported ICCBased/CalRGB/CalGray/Lab/Separation/DeviceN colors are resolved by PDF.js; no second profile conversion is applied.'};
        if (!scene.colorManagement.iccResourcesConfigured) scene.diagnostics.push(diagnostic('ICC_RESOURCES_NOT_CONFIGURED', 'No ICC resource URL was configured; PDF.js may use its fallback CMYK conversion.', 'warning'));

        if (this.pdf.isPureXfa)
            scene.diagnostics.push(diagnostic('XFA_DOCUMENT', 'Dynamic XFA content is previewed by PDF.js but has no complete DXF conversion mapping.', 'error'));
        return scene;
    }
    async render(pageNumber, canvas, { scale = 1, background = '#ffffff', signal } = {}) {
        checkAbort(signal);
        const page = await this.pdf.getPage(pageNumber), viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
        const task = page.render({ canvasContext: ctx, viewport, background, optionalContentConfigPromise: Promise.resolve(this.optionalContent), annotationMode: this.lib.AnnotationMode.ENABLE });
        const abort = () => task.cancel();
        signal?.addEventListener('abort', abort, { once: true });
        try {
            await task.promise;
            return viewport;
        }
        finally {
            signal?.removeEventListener('abort', abort);
        }
    }
    async rasterResource(scene,item) {
        const page=await this.pdf.getPage(scene.pageNumber);
        if(item.reference)return getObject(item.reference.startsWith('g_')?page.commonObjs:page.objs,item.reference);
        const key=`${scene.pageNumber}:${scene.annotationMode??this.lib.AnnotationMode.ENABLE}`;
        if(!this.#cache.has(key))await this.extract(scene.pageNumber,{includeAnnotations:scene.annotationMode!==this.lib.AnnotationMode.DISABLE});
        const list=this.#cache.get(key)?.list;
        const args=list?.argsArray[item.operator];
        if(item.imageType==='paintInlineImageXObject'&&args?.[0])return args[0];
        throw new Error('Unsupported inline/packed raster resource');
    }
    preserveRasterImages(scene,options={}) { return preserveRasterImages(this,scene,options); }
    setLayerVisible(id, visible) { this.optionalContent?.setVisibility(id, visible); }
    async outline() { return this.pdf.getOutline(); }
    async attachmentInventory() { const a = await this.pdf.getAttachments(); return Object.entries(a || {}).map(([id, x]) => ({ id, name: x.filename, size: x.content.length })); }
    async dispose() { this.#cache.clear(); await this.task.destroy(); }
}
