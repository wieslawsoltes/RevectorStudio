import {packageDxf} from '@revector/dxf';
import { recoverPdfRaster, DEFAULT_OCR_OPTIONS, normalizeOcrOptions } from '@revector/ocr';
import { documentRules } from '@revector/rules-document';
import { PdfSource, PDFJS_VERSION } from '@revector/pdf';
import { ConversionEngine, ConversionWorker, CAD_PROFILES } from '@revector/engine';
import { CanvasViewport, linkViewports } from '@revector/renderer';
import { cadRules } from '@revector/rules-cad';
import { compileRuleSet } from '@revector/semantics';
import { entityBox, summary } from '@revector/model';
import { union, emptyBox, validBox } from '@revector/geometry';
import { element as el, button, download, toast, dialog, askValue, zipFiles, DisposableStore } from '@revector/ui';
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const enc = x => JSON.stringify(x, null, 2);
const ruleExample = { schema: 'revector.rules/1', rules: [{ id: 'plant.instrument-tags', title: 'Instrument tag classification', confidence: .99, when: { all: [{ field: 'type', value: 'TEXT' }, { field: 'text', op: 'prefix', value: 'PT-' }] }, then: { layer: 'INSTRUMENT_TAGS', semantic: { class: 'instrument-tag', discipline: 'instrumentation' } } }] };
const field = (title, node) => el('label', { class: 'field' }, el('span', { text: title }), node);
const select = (id, values, value) => el('select', { id, value }, values.map(v => el('option', { value: Array.isArray(v) ? v[0] : v, text: Array.isArray(v) ? v[1] : v, selected: (Array.isArray(v) ? v[0] : v) === value })));
const iconButton = (label, fn, title) => button(label, fn, { className: 'icon-button', title });
/** Owns UI state only; every conversion runs through reusable packages and exported-DXF reparse. */
export class Workbench {
    constructor(root, config = {}) { this.root = root; this.config = config; this.engine = new ConversionEngine(); this.worker = config.conversionWorkerUrl ? new ConversionWorker(config.conversionWorkerUrl) : null; this.disposables = new DisposableStore(); this.abort = new AbortController(); this.source = null; this.bytes = null; this.scene = null; this.result = null; this.page = 1; this.fileName = 'Untitled.pdf'; this.decisions = {}; this.undo = []; this.redo = []; this.disabledRules = []; this.ruleSet = null; this.tab = 'recovery'; this.selected = null; this.job = 0; this.running = false; this.linked = true; this.ocrSettings = null; this.archiveSource=false; this.build(); this.bind(); this.showOverview(); }
    build() {
        const shell = el('div', { class: 'rv-shell' });
        this.root.replaceChildren(shell);
        this.shell = shell;
        this.fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf,.revector.json,.json', hidden: true });
        this.title = el('span', { class: 'document-title', text: 'No document open' });
        this.status = el('span', { text: 'Ready · vector-first · local processing' });
        this.version = select('version', ['2000', '2004', '2007', '2010', '2013', '2018'], '2018');
        this.units = select('units', ['mm', 'cm', 'm', 'in', 'pt', 'unitless'], 'mm');
        this.scale = el('input', { id: 'scale', type: 'number', min: '.000001', step: 'any', value: '1', title: 'Model units per paper unit. Set 100 for a 1:100 drawing.' });
        this.profile = select('profile', [['cad', 'CAD recovery'], ['exact', 'Geometry only'], ['inferred', 'High-confidence inference'], ['pid', 'P&ID recovery']], 'cad');
        this.pageSelect = select('page', [['1', 'Page 1']], '1');
        this.strict = el('input', { type: 'checkbox', id: 'strict' });
        this.convertButton = button('Convert', () => this.run(true), { className: 'primary', id: 'convert', title: 'Convert page · Ctrl/Cmd+Enter' });
        this.appearanceMode=select('appearance-mode',[['off','Native CAD'],['appearance','Appearance + CAD'],['semantic','CAD + reference']], 'off');
        this.appearanceMode.title='Explicit sampled PDF appearance with separate editable CAD layers';
        this.appearanceMode.addEventListener('change',()=>void this.run(true));
        this.retainImages=el('input',{id:'retain-images',type:'checkbox',checked:!!this.config.rasterImages});
        this.retainImages.addEventListener('change',()=>void this.run(true));
        this.exportButton = button('Export DXF ↗', () => this.exportDxf(), { className: 'primary', id: 'export-dxf', disabled: true });
        const top = el('header', { class: 'rv-top' }, el('div', { class: 'brand' }, el('span', { class: 'brand-mark', text: 'R' }), el('b', { text: 'revector' }), el('span', { class: 'brand-edition', text: 'STUDIO' })), el('span', { class: 'top-separator' }), this.title, el('div', { class: 'top-spacer' }), el('span', { class: 'local-badge', text: '● Local workspace' }), button('Guide', () => this.help()), button('Project', () => this.projectMenu()), this.exportButton);
        const toolbar = el('div', { class: 'rv-toolbar' }, button('＋ Open PDF', () => this.fileInput.click(), { id: 'open-pdf' }), button('Sample drawing', () => this.demo(), { id: 'demo' }), button('Raster OCR', () => this.configureOcr(), {id:'configure-ocr', title:'Opt-in local raster text recognition'}), el('label',{class:'check-label',title:'Retain decoded PDF raster images as portable DXF + PNG assets'},this.retainImages,'Keep images'), el('i', { class: 'separator' }), this.pageSelect, field('VIEW', this.appearanceMode), field('PROFILE', this.profile), field('DXF', this.version), field('UNITS', this.units), field('SCALE', this.scale), el('label', { class: 'check-label', title: 'Strict export stops when unsupported content remains' }, this.strict, 'Strict'), el('div', { class: 'top-spacer' }), button('Cancel', () => this.cancel(), { id: 'cancel' }), this.convertButton);
        this.explorer = el('aside', { class: 'rv-explorer' }, el('div', { class: 'section-label', text: 'DOCUMENT EXPLORER' }));
        const rail = el('nav', { class: 'rv-rail', 'aria-label': 'Workspace panels' }, iconButton('▤', () => this.explorer.classList.toggle('collapsed'), 'Toggle document explorer'), iconButton('⌘', () => this.setTab('recovery'), 'Semantic recovery'), iconButton('⚙', () => this.setTab('rules'), 'Rule engine'), iconButton('!', () => this.setTab('diagnostics'), 'Conversion diagnostics'), el('div', { class: 'top-spacer' }), iconButton('?', () => this.help(), 'Guide'));
        this.pdfCanvas = el('canvas', { id: 'pdf-canvas', 'aria-label': 'Source PDF drawing viewport' });
        this.cadCanvas = el('canvas', { id: 'dxf-canvas', 'aria-label': 'Exported DXF drawing viewport' });
        this.pdfInfo = el('span', { class: 'panel-meta', text: 'PDF.js · source appearance' });
        this.cadInfo = el('span', { class: 'panel-meta', text: 'Serialized DXF · round-trip preview' });
        const sourcePane = el('section', { class: 'viewport-pane' }, el('header', { class: 'pane-heading' }, el('span', { class: 'pane-indicator pdf' }), el('b', { text: 'SOURCE PDF' }), this.pdfInfo, el('div', { class: 'top-spacer' }), iconButton('⊡', () => this.pdfView.fit(), 'Fit source page')), el('div', { class: 'canvas-host' }, this.pdfCanvas, el('span', { class: 'canvas-caption', text: 'Original appearance' })));
        this.gridButton = iconButton('⌗', () => { this.cadView.grid = !this.cadView.grid; this.cadView.invalidate(); this.gridButton.classList.toggle('active', this.cadView.grid); }, 'Toggle drafting grid');
        this.colorMode = select('color-mode', [['faithful','Original colors'],['contrast','CAD contrast']], 'faithful');
        this.colorMode.addEventListener('change', () => { this.cadView.renderer.colorMode = this.colorMode.value; this.cadView.invalidate(); });
        this.themeButton = iconButton('◐', () => { this.cadView.paper = !this.cadView.paper; this.cadView.invalidate(); }, 'Switch paper / dark CAD view');
        this.linkButton = iconButton('↔', () => this.toggleLink(), 'Link viewport cameras');
        this.linkButton.classList.add('active');
        this.measureButton = iconButton('⌁', () => { this.cadView.measureMode = !this.cadView.measureMode; this.measureButton.classList.toggle('active', this.cadView.measureMode); this.setStatus(this.cadView.measureMode ? 'Measure: click two points in the DXF viewport.' : 'Selection mode'); }, 'Two-point measurement');
        this.targetCaption=el('span',{class:'canvas-caption',text:'Editable entities · select to inspect'});
        const targetPane = el('section', { class: 'viewport-pane' }, el('header', { class: 'pane-heading' }, el('span', { class: 'pane-indicator' }), el('b', { text: 'RECOVERED DXF' }), this.cadInfo, el('div', { class: 'top-spacer' }), this.linkButton, this.gridButton, this.themeButton, this.colorMode, this.measureButton, iconButton('⊡', () => this.fit(), 'Fit both pages')), el('div', { class: 'canvas-host' }, this.cadCanvas,this.targetCaption));
        this.panes = el('div', { class: 'rv-panes' }, sourcePane, targetPane);
        this.inspector = el('aside', { class: 'rv-inspector' });
        this.tabs = el('div', { class: 'bottom-tabs' });
        this.tabButtons = {};
        for (const [id, title] of [['recovery', 'Semantic recovery'], ['diagnostics', 'Diagnostics'], ['rules', 'Rule engine'], ['source', 'Source & report']]) {
            const b = button(title, () => this.setTab(id));
            b.dataset.tab = id;
            this.tabButtons[id] = b;
            this.tabs.append(b);
        }
        this.bottomContent = el('div', { class: 'bottom-content' });
        this.bottom = el('section', { class: 'rv-bottom' }, this.tabs, this.bottomContent);
        const center = el('main', { class: 'rv-center' }, this.panes, this.bottom);
        const body = el('div', { class: 'rv-body' }, rail, this.explorer, center, this.inspector);
        this.coords = el('span', { class: 'mono', text: 'X 0.00  Y 0.00' });
        this.performance = el('span', { class: 'mono', text: '—' });
        this.zoom = el('span', { class: 'mono', text: '100%' });
        shell.append(top, toolbar, body, el('footer', { class: 'rv-status' }, el('span', { class: 'status-dot' }), this.status, el('div', { class: 'top-spacer' }), this.coords, el('span', { class: 'status-divider' }), this.performance, el('span', { class: 'status-divider' }), this.zoom), this.fileInput);
        this.pdfView = new CanvasViewport(this.pdfCanvas, { kind: 'pdf' });
        this.cadView = new CanvasViewport(this.cadCanvas, { kind: 'cad' });
        this.cadView.paper = true;
        this.unlink = linkViewports(this.pdfView, this.cadView);
        this.disposables.add(this.cadView.selectionChanged.subscribe(hit => this.inspect(hit?.entity || null)));
        this.disposables.add(this.cadView.pointerMoved.subscribe(p => this.coords.textContent = `X ${fmt(p[0])}  Y ${fmt(p[1])} ${this.units.value}`));
        this.disposables.add(this.cadView.rendered.subscribe(x => this.performance.textContent = `${fmt(x.elapsedMs)} ms · ${fmt(x.drawn)} draws`));
        this.disposables.add(this.cadView.camera.changed.subscribe(c => this.zoom.textContent = `${fmt(c.scale)} px/${this.units.value}`));
        this.disposables.add(this.cadView.measureChanged.subscribe(m => {
            if (m.distance !== null) {
                this.measurement = m.distance;
                this.setStatus(`Measured ${fmt(m.distance)} ${this.units.value}. Use “Calibrate scale” in the inspector to assign a known distance.`);
                this.showMeasurement(m);
            }
        }));
        this.setTab('recovery');
    }
    bind() {
        const signal = this.abort.signal;
        this.fileInput.addEventListener('change', () => {
            const file = this.fileInput.files[0];
            if (file)
                this.openFile(file);
            this.fileInput.value = '';
        }, { signal });
        this.pageSelect.addEventListener('change', () => this.selectPage(Number(this.pageSelect.value)), { signal });
        for (const node of [this.version, this.profile, this.units, this.scale, this.strict])
            node.addEventListener('change', () => {
                if (this.scene)
                    this.run(false);
            }, { signal });
        this.root.addEventListener('dragover', e => { e.preventDefault(); this.shell.classList.add('drop-target'); }, { signal });
        this.root.addEventListener('dragleave', () => this.shell.classList.remove('drop-target'), { signal });
        this.root.addEventListener('drop', e => {
            e.preventDefault();
            this.shell.classList.remove('drop-target');
            if (e.dataTransfer.files[0])
                this.openFile(e.dataTransfer.files[0]);
        }, { signal });
        document.addEventListener('keydown', e => {
            const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
            if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'o') {
                    e.preventDefault();
                    this.fileInput.click();
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.run(true);
                }
                if (e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    this.exportDxf();
                }
                if (e.key.toLowerCase() === 'z' && !typing) {
                    e.preventDefault();
                    this.undoDecision(e.shiftKey);
                }
            }
            if (e.key === 'Escape' && this.running)
                this.cancel();
        }, { signal });
    }
    options() {
        const scale = Number(this.scale.value);
        if (!Number.isFinite(scale) || scale <= 0)
            throw Error('Drawing scale must be a positive number.');
        return { version: this.version.value, units: this.units.value, drawingScale: scale, profile: this.profile.value, strict: this.strict.checked, decisions: this.decisions[this.page] || {}, disabledRules: [...this.disabledRules], ruleSet: this.ruleSet, ocr: this.ocrSettings, archiveSource:this.archiveSource,appearance:this.appearanceMode.value==='off'?undefined:{dpi:144},appearanceView:this.appearanceMode.value==='semantic'?'semantic':'appearance',rasterImages:this.retainImages.checked?{}:undefined };
    }
    pdfOptions(name) { const base = this.config.assetBase || './vendor/pdfjs/'; return { name, moduleUrl: this.config.pdfjsModuleUrl || base + 'legacy/build/pdf.mjs', workerUrl: this.config.pdfjsWorkerUrl || base + 'legacy/build/pdf.worker.mjs', pdfOptions: { cMapUrl: base + 'cmaps/', cMapPacked: true, wasmUrl: base + 'wasm/', iccUrl: base + 'iccs/', ...this.config.pdfOptions }, onPassword: reason => askValue(reason === 2 ? 'Incorrect PDF password' : 'Encrypted PDF', 'Enter the password to open this PDF', '', { type: 'password' }) }; }
    async openFile(file) {
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (/\.json$/i.test(file.name)) {
                const p = JSON.parse(new TextDecoder().decode(bytes));
                if (p.schema !== 'revector.project/1' || !Array.isArray(p.pdf))
                    throw Error('Expected a Revector project with its original PDF.');
                if (p.pdf.length > 512 * 1024 * 1024)
                    throw Error('Project exceeds byte budget');
                await this.openBytes(new Uint8Array(p.pdf), p.name, p);
                return;
            }
            await this.openBytes(bytes, file.name);
        }
        catch (e) {
            this.error(e);
        }
    }
    async demo() {
        try {
            const bytes = this.config.demoBytes ? new Uint8Array(this.config.demoBytes) : new Uint8Array(await (await fetch(this.config.demoUrl || './assets/cooling-water.pdf')).arrayBuffer());
            await this.openBytes(bytes, 'CW-104 · Cooling water circuit.pdf');
        }
        catch (e) {
            this.error(e);
        }
    }
    async openBytes(bytes, name, project = null) {
        this.cancel();
        await this.source?.dispose();
        if(this.pdfReference){this.pdfReference.image.width=this.pdfReference.image.height=1;this.pdfReference=null;}
        this.source = null;
        this.bytes = new Uint8Array(bytes);
        this.fileName = name;
        this.result = null;
        this.scene = null;
        this.decisions = project?.decisions || {};
        this.undo = [];
        this.redo = [];
        this.disabledRules = project?.disabledRules || [];
        this.ruleSet = project?.ruleSet || null;
        this.ocrSettings = project?.settings?.ocr || null;
        this.archiveSource=!!project?.settings?.archiveSource;
        this.appearanceMode.value=project?.settings?.appearance?(project.settings.appearanceView||'appearance'):'off';
        this.retainImages.checked=project?!!project.settings?.rasterImages:this.retainImages.checked;
        this.exportButton.disabled = true;
        this.setStatus('Opening PDF locally…');
        try {
            this.source = await PdfSource.open(bytes, this.pdfOptions(name));
            this.pageSelect.replaceChildren(...Array.from({ length: this.source.numPages }, (_, i) => el('option', { value: String(i + 1), text: `Page ${i + 1} / ${this.source.numPages}` })));
            if (project?.settings) {
                for (const k of ['version', 'units', 'profile'])
                    if (project.settings[k])
                        this[k].value = project.settings[k];
                this.scale.value = String(project.settings.drawingScale || 1);
                this.strict.checked = !!project.settings.strict;
            }
            this.title.textContent = name;
            this.title.title = name;
            await this.selectPage(Math.min(this.source.numPages, project?.page || 1));
        }
        catch (e) {
            this.error(e);
        }
    }
    async selectPage(page) { this.page = page; this.pageSelect.value = String(page); this.scene = null; this.selected = null; this.result = null; this.cadView.selection.clear(); await this.run(true); }
    async run(extract = false) {
        if (!this.source)
            return;
        const id = ++this.job, pipelineStart = performance.now();
        this.jobAbort?.abort();
        this.worker?.cancel();
        const controller = this.jobAbort = new AbortController();
        this.running = true;
        this.exportReady = false;
        this.convertButton.disabled = true;
        this.exportButton.disabled = true;
        this.setStatus('Extracting PDF vector operators…');
        this.shell.classList.add('busy');
        try {
            const options = this.options(), progress = p => {
                if (id === this.job)
                    this.setStatus(`${p.phase}${p.rule ? ' · ' + p.rule : ''}${p.total ? ' · ' + Math.round(p.done / p.total * 100) + '%' : ''}`);
            };
            const extractionStart = performance.now();
            if (extract || !this.scene) {
                let next = await this.source.extract(this.page, { signal: controller.signal, onProgress: progress });
                if(this.retainImages.checked)next=await this.source.preserveRasterImages(next,{signal:controller.signal});
                if (this.ocrSettings) next = await recoverPdfRaster(this.source, next, {...this.ocrSettings, assetBase:this.config.ocrAssetBase || './vendor/ocr/', signal:controller.signal, onProgress:progress});
                if(options.appearance)next=await this.source.captureAppearance(next,{...options.appearance,signal:controller.signal});
                if (id !== this.job) return;
                this.scene = next;
            }
            if (id !== this.job)
                return;
            const scene = this.scene, extractionMs = performance.now() - extractionStart;
            let result;
            try {
                result = this.worker ? await this.worker.convert(scene, options, { signal: controller.signal, onProgress: progress }) : await this.engine.convertScene(scene, { ...options, signal: controller.signal, onProgress: progress });
            }
            catch (error) {
                if (error.name !== 'WorkerStartupError')
                    throw error;
                this.worker.dispose();
                this.worker = null;
                this.workerFallback = true;
                toast('Workers are blocked in this browser context. Using the same conversion kernel on the main thread.');
                result = await this.engine.convertScene(scene, { ...options, signal: controller.signal, onProgress: progress });
            }
            if (id !== this.job)
                return;
            this.result = result;
            this.cadView.setDocument(result.preview);
            const renderStart = performance.now();
            // This one-entry cache belongs to the workbench's extracted scene, not a
            // mutable public input cache. Extraction, document or page changes invalidate it.
            const cached = this.pdfReference;
            const reuse = cached?.scene === scene && cached.source === this.source && cached.page === this.page;
            let image = reuse ? cached.image : document.createElement('canvas'), adopted = reuse;
            try {
                if (!reuse) await this.source.render(this.page, image, { scale: Math.min(3, Math.max(1.5, 1400 / scene.pageSize[0])), signal: controller.signal });
                if (id !== this.job) return;
                this.pdfView.setImage(image, result.document.pageBox);
                this.pdfReference = {scene, source:this.source, page:this.page, image};
                adopted = true;
                if (cached && cached.image !== image) cached.image.width = cached.image.height = 1;
            } finally { if (!adopted) image.width = image.height = 1; }
            result.report.timings.pdfPreparationMs = extractionMs;
            result.report.timings.pdfReferenceMs = performance.now() - renderStart;
            result.report.timings.pdfReferenceReused = reuse ? 1 : 0;
            this.pdfView.overlays = [];
            this.cadView.selection.clear();
            this.refresh();
            this.fit();
            this.exportButton.disabled = false;
            this.exportReady = true;
            const s = summary(result.document), warnings = result.report.diagnostics.filter(d => d.severity !== 'info').length;
            result.report.timings.uiTotalMs = performance.now() - pipelineStart;
            this.setStatus(`Converted · ${fmt(s.entities)} entities · ${fmt(result.document.blocks.length)} blocks · ${fmt(result.report.timings.uiTotalMs)} ms${warnings ? ' · ' + warnings + ' review notice' + (warnings === 1 ? '' : 's') : ''}`);
            this.config.onConverted?.(result);
            return result;
        }
        catch (e) {
            if (id !== this.job)
                return;
            if (e.name !== 'AbortError' && e.name !== 'RenderingCancelledException') {
                this.cadInfo.textContent = 'Export blocked · inspect error';
                this.error(e);
            }
        }
        finally {
            if (id === this.job) {
                this.running = false;
                this.convertButton.disabled = false;
                this.shell.classList.remove('busy');
            }
        }
    }
    cancel() { this.job++; this.jobAbort?.abort(); this.worker?.cancel(); this.running = false; this.convertButton.disabled = false; this.shell?.classList.remove('busy'); this.setStatus('Ready'); }
    fit() {
        const a = this.pdfView.camera, b = this.cadView.camera, box = this.result?.document.pageBox || this.pdfView.pageBox;
        const width = Math.min(a.width, b.width), height = Math.min(a.height, b.height), s = Math.min((width - 42) / (box[2] - box[0]), (height - 42) / (box[3] - box[1]));
        a.set({ center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], scale: s });
        if (!this.linked)
            b.set({ center: a.center, scale: a.scale });
    }
    toggleLink() {
        this.linked = !this.linked;
        this.unlink?.();
        this.unlink = this.linked ? linkViewports(this.pdfView, this.cadView) : null;
        this.linkButton.classList.toggle('active', this.linked);
        if (this.linked)
            this.fit();
    }
    refresh() { const d = this.result.document, r = this.result.report; this.pdfInfo.textContent = `PDF.js ${PDFJS_VERSION} · ${fmt(this.scene.items.length)} paint items`; this.cadInfo.textContent = `${this.result.dxf.acadVersion} · ${fmt(d.entities.length)} entities`; this.refreshExplorer(); this.renderTab(); this.showOverview(); }
    refreshExplorer() {
        this.explorer.replaceChildren(el('div', { class: 'section-label', text: 'DOCUMENT EXPLORER' }), el('div', { class: 'tree-file' }, el('span', { class: 'file-badge', text: 'PDF' }), el('span', { text: this.fileName.replace(/\.pdf$/i, '') })));
        const pages = el('div', { class: 'tree-pages' });
        for (let p = 1; p <= this.source.numPages; p++)
            pages.append(button(`▧  Sheet ${String(p).padStart(2, '0')}`, () => this.selectPage(p), { className: 'tree-row' + (p === this.page ? ' selected' : '') }));
        this.explorer.append(pages);
        const d = this.result.document;
        this.explorer.append(el('div', { class: 'section-label', text: `LAYERS · ${d.layers.length}` }), el('div', { class: 'muted small tree-hint', text: 'Visibility controls the DXF preview only' }));
        const counts = new Map();
        for (const e of d.entities)
            counts.set(e.layer, (counts.get(e.layer) || 0) + 1);
        for (const layer of d.layers) {
            const checked = !this.cadView.renderer.hiddenLayers.has(layer.name), input = el('input', { type: 'checkbox', checked });
            input.addEventListener('change', () => {
                if (input.checked)
                    this.cadView.renderer.hiddenLayers.delete(layer.name);
                else
                    this.cadView.renderer.hiddenLayers.add(layer.name);
                this.cadView.invalidate();
            });
            const swatch = el('i', { class: 'layer-swatch' });
            swatch.style.background = `rgb(${(layer.color || [120, 130, 145]).join(',')})`;
            this.explorer.append(el('label', { class: 'layer-row', title: layer.name }, input, swatch, el('span', { text: layer.name }), el('small', { text: counts.get(layer.name) || '·' })));
        }
        this.explorer.append(el('div', { class: 'section-label', text: `BLOCK LIBRARY · ${d.blocks.length}` }));
        for (const b of d.blocks)
            this.explorer.append(button(`◇ ${b.name}`, () => this.inspectBlock(b), { className: 'tree-row' }));
        this.targetCaption.textContent=this.result?.report.appearance?.view==='appearance'?'Sampled appearance · editable CAD on hidden layers':'Editable entities · select to inspect';
        this.explorer.append(el('div', { class: 'explorer-foot' }, el('b', { text: this.result?.report.ocr ? 'Raster OCR recovery' : 'Vector-first recovery' }), el('span', { text: this.result?.report.ocr ? `${this.result.report.ocr.accepted} inferred words · ${this.result.report.ocr.lines} lines · ${this.result.report.ocr.paths||0} paths. Native text is preserved.` : 'Native vectors and encoded text are preserved. Raster OCR is opt-in.' })));
    }
    setTab(tab) {
        this.tab = tab;
        for (const [id, b] of Object.entries(this.tabButtons))
            b.classList.toggle('active', id === tab);
        this.renderTab();
    }
    renderTab() {
        this.bottomContent.replaceChildren();
        if (this.tab === 'rules') {
            this.renderRules();
            return;
        }
        if (!this.result) {
            this.bottomContent.append(el('div', { class: 'empty-bottom' }, el('b', { text: 'Recover the drawing. Keep the evidence.' }), el('span', { text: 'Open a vector PDF or load the sample to inspect exact geometry and review semantic proposals.' })));
            return;
        }
        if (this.tab === 'recovery')
            this.renderRecovery();
        if (this.tab === 'diagnostics')
            this.renderDiagnostics();
        if (this.tab === 'source')
            this.renderSource();
    }
    renderRecovery() {
        const all = this.result.document.candidates, counts = {};
        for (const c of all)
            counts[c.status] = (counts[c.status] || 0) + 1;
        const bar = el('div', { class: 'recovery-bar' }, el('span', { class: 'count-chip good', text: `${counts.accepted || 0} accepted` }), el('span', { class: 'count-chip', text: `${counts.pending || 0} to review` }), el('span', { class: 'muted', text: 'Confidence is a rule score, not a calibrated probability.' }), el('div', { class: 'top-spacer' }), button('Undo', () => this.undoDecision(false), { disabled: !this.undo.length }), button('Redo', () => this.undoDecision(true), { disabled: !this.redo.length }));
        this.bottomContent.append(bar);
        const table = el('table', { class: 'data-table' }), head = el('thead', {}, el('tr', {}, ['STATE', 'RECOVERED MEANING', 'RULE', 'CONFIDENCE', 'MEMBERS', 'REVIEW'].map(t => el('th', { text: t }))));
        table.append(head);
        const body = el('tbody');
        for (const c of [...all].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))) {
            const row = el('tr', { class: c.status === 'conflict' ? 'has-conflict' : '' }, el('td', {}, el('span', { class: 'state ' + c.status, text: c.status })), el('td', { class: 'candidate-name', text: c.title }), el('td', { class: 'mono muted', text: c.rule.replace(/^cad\./, '') }), el('td', {}, el('span', { class: 'score', text: `${fmt(c.confidence * 100)}%` }), el('small', { class: 'muted', text: c.exact ? ' structure' : ' inference' })), el('td', { class: 'mono', text: c.members.length }), el('td', {}, button(c.status === 'accepted' ? 'Revert' : 'Accept', e => { e.stopPropagation(); this.decide(c, c.status === 'accepted' ? 'reject' : 'accept'); }, { className: 'table-action', disabled: c.status === 'conflict' }), button(c.status === 'rejected' ? 'Reset' : 'Reject', e => { e.stopPropagation(); this.decide(c, c.status === 'rejected' ? null : 'reject'); }, { className: 'table-action muted', disabled: c.status === 'accepted' })));
            row.addEventListener('click', () => this.inspectCandidate(c));
            body.append(row);
        }
        table.append(body);
        this.bottomContent.append(table);
        if (!all.length)
            this.bottomContent.append(el('p', { class: 'muted', text: 'No semantic proposals. Source geometry remains editable.' }));
    }
    async decide(c, decision) {
        this.undo.push(structuredClone(this.decisions));
        this.redo = [];
        this.decisions[this.page] ||= {};
        if (decision)
            this.decisions[this.page][c.id] = decision;
        else
            delete this.decisions[this.page][c.id];
        await this.run(false);
    }
    async undoDecision(redo) {
        const from = redo ? this.redo : this.undo, to = redo ? this.undo : this.redo;
        if (!from.length)
            return;
        to.push(structuredClone(this.decisions));
        this.decisions = from.pop();
        await this.run(false);
    }
    renderDiagnostics() {
        const list = this.result.report.diagnostics;
        this.bottomContent.append(el('div', { class: 'recovery-bar' }, el('b', { text: `${list.length} conversion notices` }), el('span', { class: 'muted', text: 'Unmapped content is reported, not replaced with invented geometry.' })));
        if (!list.length)
            this.bottomContent.append(el('p', { class: 'good', text: 'No conversion diagnostics.' }));
        for (const d of list)
            this.bottomContent.append(el('div', { class: 'diagnostic ' + d.severity }, el('span', { class: 'state ' + d.severity, text: d.severity || 'info' }), el('code', { text: d.code }), el('span', { text: d.message })));
    }
    renderRules() {
        const bar = el('div', { class: 'recovery-bar' }, el('b', { text: 'Deterministic, replayable rule pipeline' }), el('span', { class: 'muted', text: 'Exact structures auto-apply. Inferences stay reviewable.' }), el('div', { class: 'top-spacer' }), button('Edit JSON rules', () => this.editRules()), button('Apply changes', () => this.run(false)));
        this.bottomContent.append(bar);
        const grid = el('div', { class: 'rules-grid' });
        for (const r of [...cadRules, ...documentRules]) {
            const input = el('input', { type: 'checkbox', checked: !this.disabledRules.includes(r.id) });
            input.addEventListener('change', () => {
                this.disabledRules = this.disabledRules.filter(x => x !== r.id);
                if (!input.checked)
                    this.disabledRules.push(r.id);
            });
            grid.append(el('label', { class: 'rule-card' }, input, el('div', {}, el('b', { text: r.title || r.id }), el('code', { text: r.id }), el('span', { text: r.description || 'Geometry and provenance aware CAD recovery' }))));
        }
        this.bottomContent.append(grid);
        if (this.ruleSet)
            this.bottomContent.append(el('div', { class: 'rule-custom', text: `Custom rules loaded: ${this.ruleSet.rules.length}` }));
    }
    renderSource() { const r = this.result.report; this.bottomContent.append(el('div', { class: 'recovery-bar' }, el('b', { text: 'Conversion provenance' }), el('span', { class: 'muted', text: 'Source paint IDs, rule evidence, history, and measured conversion timings' }), el('div', { class: 'top-spacer' }), button('Save report', () => download(enc(r), this.baseName() + '.report.json', 'application/json')), button('Save intermediate model', () => download(enc(this.result.document), this.baseName() + '.cad.json', 'application/json'))), el('pre', { class: 'source-report', text: enc({ source: { name: r.source.name, producer: r.source.producer, page: this.page }, target: r.target, coverage: r.coverage, color: r.color, ocr: r.ocr, rasterImages:r.rasterImages, appearance:r.appearance, timings: r.timings, validation: r.validation }) })); }
    showOverview() {
        this.inspector.replaceChildren(el('div', { class: 'section-label', text: 'CONVERSION INSPECTOR' }), el('div', { class: 'inspector-intro' }, el('span', { class: 'eyebrow', text: 'FROM PLOT TO MODEL' }), el('h2', { text: 'Structure,\nnot just strokes.' }), el('p', { class: 'muted', text: 'Review recovered entities alongside the original PDF. Every semantic proposal keeps its evidence.' })));
        if (this.result) {
            const d = this.result.document, s = summary(d);
            const stats = el('div', { class: 'stat-grid' });
            for (const [label, value] of [['ENTITIES', s.entities], ['LAYERS', d.layers.length], ['BLOCKS', d.blocks.length], ['TO REVIEW', d.candidates.filter(c => c.status === 'pending').length]])
                stats.append(el('div', {}, el('b', { text: fmt(value) }), el('span', { text: label })));
            this.inspector.append(stats, el('div', { class: 'section-label', text: 'OUTPUT CONTRACT' }));
            for (const [k, v] of [['Format', `DXF ${this.version.value}`], ['Coordinates', `${this.units.value} · Y up`], ['Drawing scale', `1 : ${this.scale.value}`], ['Curves', 'Native cubic SPLINE'], ['Text', 'Editable Unicode'], ['Raster recovery', this.result.report.ocr ? `${this.result.report.ocr.accepted} OCR words · ${this.result.report.ocr.lines} lines · ${this.result.report.ocr.paths||0} paths` : 'OCR off'], ['Appearance', this.result.report.appearance?`${this.result.report.appearance.dpi} DPI · separate CAD layers`:'Native only'], ['Raster images', this.result.report.rasterImages ? `${this.result.report.rasterImages.retained} paints · ${this.result.report.rasterImages.assets} PNG assets` : 'Not retained']])
                this.inspector.append(this.property(k, v));
        }
        this.inspector.append(el('div', { class: 'inspector-note' }, el('b', { text: 'Evidence-first recovery' }), el('p', { text: 'A PDF form is reusable structure, not proof of an original CAD block. Inferred names and meanings are identified explicitly.' })), button('Convert all pages to ZIP', () => this.exportAll(), { className: 'wide', disabled: !this.source }));
    }
    property(k, v) { return el('div', { class: 'property' }, el('span', { class: 'muted', text: k }), el('span', { text: String(v) })); }
    inspect(e) {
        this.selected = e;
        if (!e) {
            this.pdfView.overlays = [];
            this.pdfView.invalidate();
            this.showOverview();
            return;
        }
        this.inspector.replaceChildren(el('div', { class: 'section-label', text: 'ENTITY PROPERTIES' }), el('div', { class: 'entity-heading' }, el('span', { class: 'type-badge', text: e.type }), el('b', { text: e.id })));
        for (const [k, v] of [['Layer', e.layer], ['Color', (e.color || []).join(', ')], ['Lineweight', `${e.lineweight || 0} mm`], ['Text', e.text], ['Block', e.name], ['Source page', e.source?.page], ['PDF operation', e.source?.op], ['Source ID', e.source?.id], ['Semantic class', e.semantic?.class]])
            if (v !== undefined)
                this.inspector.append(this.property(k, v));
        this.inspector.append(el('pre', { class: 'entity-json', text: enc(e) }));
        const box = entityBox(e, this.result.preview);
        this.pdfView.overlays = validBox(box) ? [box] : [];
        this.pdfView.invalidate();
    }
    inspectCandidate(c) {
        this.inspector.replaceChildren(el('div', { class: 'section-label', text: 'RECOVERY EVIDENCE' }), el('div', { class: 'candidate-detail' }, el('span', { class: 'state ' + c.status, text: c.status }), el('h3', { text: c.title }), this.property('Confidence', `${fmt(c.confidence * 100)}%`), this.property('Geometry', c.exact ? 'Preserved by rule' : 'Inferred replacement'), this.property('Members', c.members.length), this.property('Rule', c.rule), el('p', { class: 'muted', text: c.conflict || 'Accepting replays conversion from the original immutable PDF scene.' }), el('pre', { class: 'evidence', text: enc(c.evidence) }), button('Accept proposal', () => this.decide(c, 'accept'), { className: 'primary wide', disabled: c.status === 'accepted' || c.status === 'conflict' }), button('Reject / revert', () => this.decide(c, 'reject'), { className: 'wide' })));
        const d = this.result.preview, ids = new Set([...c.members, ...(c.result || [])]), entities = d.entities.filter(e => ids.has(e.id));
        this.cadView.selection = new Set(entities.map(e => e.id));
        this.cadView.invalidate();
        const box = entities.reduce((b, e) => union(b, entityBox(e, d)), emptyBox());
        this.pdfView.overlays = validBox(box) ? [box] : [];
        this.pdfView.invalidate();
    }
    inspectBlock(b) { this.inspector.replaceChildren(el('div', { class: 'section-label', text: 'BLOCK DEFINITION' }), el('h3', { class: 'inspector-title', text: b.name }), this.property('Entities', b.entities.length), this.property('Instances', this.result.document.entities.filter(e => e.type === 'INSERT' && e.name === b.name).length), el('pre', { class: 'entity-json', text: enc({ origin: b.origin, source: b.source, types: b.entities.reduce((o, e) => (o[e.type] = (o[e.type] || 0) + 1, o), {}) }) })); }
    showMeasurement(m) {
        this.inspector.replaceChildren(el('div', { class: 'section-label', text: 'TWO-POINT MEASUREMENT' }), el('div', { class: 'candidate-detail' }, el('h2', { text: `${fmt(m.distance)} ${this.units.value}` }), el('p', { class: 'muted', text: 'Measured in the current exported DXF coordinate system.' }), button('Calibrate scale', async () => {
            const raw = await askValue('Calibrate drawing scale', `Known distance in ${this.units.value}`, String(m.distance));
            if (raw === null)
                return;
            const known = Number(raw);
            if (!(known > 0) || !(m.distance > 0))
                return this.error(Error('Both distances must be positive.'));
            this.scale.value = String(Number(this.scale.value) * known / m.distance);
            this.cadView.measureMode = false;
            this.measureButton.classList.remove('active');
            this.cadView.measurePoints = [];
            await this.run(false);
        }, { className: 'primary wide' }), button('Back to overview', () => this.showOverview(), { className: 'wide' })));
    }
    editRules() {
        const text = el('textarea', { class: 'rule-editor', spellcheck: false, value: enc(this.ruleSet || ruleExample) });
        dialog({ title: 'Declarative rule extension · revector.rules/1', content: el('div', {}, el('p', { class: 'muted', text: 'JSON rules may classify entities and assign layers. Advanced graph and geometry plugins use the public JavaScript Rule interface. No eval.' }), text), actions: [{ label: 'Remove custom rules', run: d => { this.ruleSet = null; d.close(); this.renderRules(); } }, { label: 'Validate & apply', primary: true, run: d => {
                        try {
                            const json = JSON.parse(text.value);
                            compileRuleSet(json);
                            this.ruleSet = json;
                            d.close();
                            this.run(false);
                        }
                        catch (e) {
                            toast(e.message, { error: true });
                        }
                    } }] });
    }
    exportDxf() {
        if (!this.result || !this.exportReady)
            return toast('Open and convert a PDF first.');
        if(this.result.document.assets?.length||this.archiveSource) {
            try {
                const pack=packageDxf(this.result.document,{version:this.version.value,strict:this.strict.checked,sourcePdf:this.archiveSource?this.bytes:undefined,filename:'drawing-'+this.baseName().replace(/[^a-zA-Z0-9_. -]/g,'_')+`.R${this.version.value}.dxf`});
                pack.files.push({name:'conversion.report.json',data:enc(this.result.report)});
                download(zipFiles(pack.files),this.baseName()+'.dxf-package.zip');
                this.setStatus(`Exported DXF + ${pack.manifest.assets.length} PNG assets`);
            }catch(error){this.error(error);}
            return;
        }
        download(this.result.dxf.text, this.baseName() + `.R${this.version.value}.dxf`, 'application/dxf');
        this.setStatus(`Exported ${this.result.dxf.acadVersion} · ${fmt(this.result.dxf.text.length)} characters`);
    }
    baseName() { return this.fileName.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + `-page-${this.page}`; }
    projectMenu() {
        const archive=el('input',{type:'checkbox',id:'archive-source',checked:this.archiveSource});
        archive.addEventListener('change',()=>{this.archiveSource=archive.checked;});
        dialog({ title: 'Project & interchange', content: el('div',{},el('p', { text: 'Save a reproducible project with the original PDF, conversion settings, rule decisions, and custom rules. Conversion is local; nothing is uploaded.' }),el('label',{class:'check-label'},archive,'Include original PDF in DXF packages'),el('p',{text:'The original PDF is byte-preserved and may include hidden content, attachments and sensitive metadata. It is not a redacted export.'})), actions: [{ label: 'Open project', run: d => { d.close(); this.fileInput.click(); } }, { label: 'Save project', primary: true, run: d => {
                        if (!this.bytes)
                            return;
                        download(enc({ schema: 'revector.project/1', name: this.fileName, pdf: Array.from(this.bytes), page: this.page, settings: this.options(), decisions: this.decisions, disabledRules: this.disabledRules, ruleSet: this.ruleSet }), this.baseName() + '.revector.json', 'application/json');
                        d.close();
                    } }] });
    }
    async exportAll() {
        if (!this.source || this.running)
            return;
        const controller = this.jobAbort = new AbortController();
        this.running = true;
        this.convertButton.disabled = true;
        try {
            const options = this.options(), files = [];
            for (let p = 1; p <= this.source.numPages; p++) {
                this.setStatus(`Batch conversion · page ${p} / ${this.source.numPages}`);
                let scene = p === this.page && this.scene ? this.scene : await this.source.extract(p, { signal: controller.signal });
                if(this.retainImages.checked&&!scene.rasterImages)scene=await this.source.preserveRasterImages(scene,{signal:controller.signal});
                if (this.ocrSettings && !scene.ocr) scene = await recoverPdfRaster(this.source, scene, {...this.ocrSettings,assetBase:this.config.ocrAssetBase || './vendor/ocr/',signal:controller.signal});
                if(options.appearance&&!scene.appearance)scene=await this.source.captureAppearance(scene,{...options.appearance,signal:controller.signal});
                const config = { ...options, decisions: this.decisions[p] || {} };
                const r = this.worker ? await this.worker.convert(scene, config, { signal: controller.signal }) : await this.engine.convertScene(scene, { ...config, signal: controller.signal });
                const pack=packageDxf(r.document,{version:options.version,strict:options.strict,filename:`page-${p}.R${options.version}.dxf`});
                files.push(...pack.files,{name:`page-${p}.report.json`,data:enc(r.report)});
            }
            if(this.archiveSource){const archive=packageDxf(this.result.document,{version:options.version,filename:'original-source.dxf',sourcePdf:this.bytes});const meta=archive.manifest.sourceArchive;files.push(archive.files.find(f=>f.name===meta.path),{name:'source-archive.json',data:enc(meta)});}
            download(zipFiles([...new Map(files.map(f=>[f.name,f])).values()]), this.fileName.replace(/\.pdf$/i, '') + '-converted.zip');
            this.setStatus(`Exported ${this.source.numPages} pages and reports`);
        }
        catch (e) {
            if (e.name !== 'AbortError')
                this.error(e);
        }
        finally {
            this.running = false;
            this.convertButton.disabled = false;
        }
    }
    configureOcr() {
        const settings={...DEFAULT_OCR_OPTIONS,...this.ocrSettings};
        const enabled=el('input',{id:'ocr-enabled',type:'checkbox',checked:!!this.ocrSettings});
        const scope=select('ocr-scope',[['raster','Raster regions only'],['page','Whole page']],settings.scope);
        const languages=select('ocr-languages',[['eng','English'],['deu','German'],['pol','Polish'],['eng+deu','English + German'],['eng+pol','English + Polish']],settings.languages);
        const dpi=el('input',{id:'ocr-dpi',type:'number',min:72,max:600,value:settings.dpi});
        const confidence=el('input',{id:'ocr-confidence',type:'number',min:0,max:100,value:settings.minConfidence});
        const preprocess=select('ocr-preprocess',['none','otsu','sauvola'],settings.preprocess);
        const rotation=select('ocr-rotation',['0','90','180','270'],String(settings.rotation));
        const tiles=select('ocr-tile-size',[...new Set(['512','1024','2048','4096',String(settings.tileSize)])].sort((a,b)=>Number(a)-Number(b)),String(settings.tileSize));
        const deskew=el('input',{id:'ocr-deskew',type:'checkbox',checked:settings.deskew});
        const invert=el('input',{id:'ocr-invert',type:'checkbox',checked:settings.invert});
        const traceMode=select('ocr-trace-mode',[['axis','Ruled horizontal / vertical lines'],['paths','Centerline graph / arbitrary paths']],settings.traceMode);
        const trace=el('input',{id:'ocr-lines',type:'checkbox',checked:settings.traceLines});
        dialog({title:'Raster OCR · local recognition',content:el('div',{class:'guide'},
            el('p',{text:'Tesseract.js 7 · Apache-2.0 · WASM. PDF data stays in this browser. Native text takes precedence. OCR text metrics and colors are estimated; review the report.'}),
            field('Enable OCR',enabled),field('Scope',scope),field('Languages',languages),field('Resolution (DPI)',dpi),
            field('Minimum confidence (%)',confidence),field('Preprocessing',preprocess),field('Recognition rotation',rotation),
            field('Correct small scan skew',deskew),field('Invert light text on dark paper',invert),field('Maximum tile side (pixels)',tiles),
            field('Infer raster linework',trace),field('Linework algorithm',traceMode),
            el('p',{text:'Tiles overlap to protect words at boundaries. Deskew estimates small angles, not arbitrary page orientation. Both preserve the inverse coordinate transform in OCR provenance.'})),
            actions:[{label:'Cancel',run:d=>d.close()},{label:'Apply and convert',primary:true,run:d=>{
                try {
                    this.ocrSettings=enabled.checked?normalizeOcrOptions({...settings,scope:scope.value,languages:languages.value,dpi:Number(dpi.value),minConfidence:Number(confidence.value),
                        preprocess:preprocess.value,rotation:Number(rotation.value),deskew:deskew.checked,invert:invert.checked,tileSize:Number(tiles.value),traceLines:trace.checked,traceMode:traceMode.value}):null;
                    d.close();void this.run(true);
                }catch(error){this.error(error);}
            }}]});
    }
    help() { dialog({ title: 'Revector Studio · vector-first CAD recovery', content: el('div', { class: 'guide' }, el('h3', { text: 'A local, inspectable conversion workflow' }), el('p', { text: 'Open a vector PDF, select a page, choose units and the drawing scale, then Convert. PDF points are converted to the selected unit; a 1:100 printed drawing needs drawing scale 100 to recover model distances.' }), el('p', { text: 'The left panel shows PDF.js rendering. The right panel reads the actual serialized DXF. Drag to pan, use the wheel to zoom, double-click or press F to fit, and click entities or proposals to inspect source evidence. The ↔ control synchronizes views.' }), el('h3', { text: 'Meaning is recovered, not assumed' }), el('p', { text: 'Exact form reuse and conservative structural rules can apply automatically. Review inferred circles, dimensions, tags, hatching, and centerlines. Accept/reject decisions replay from the source scene; Undo and Redo never accumulate geometry damage.' }), el('h3', { text: 'Explicit format boundaries' }), el('p', { text: 'Keep images exports native DXF IMAGE references together with PNG sidecars in a ZIP. Clips and constant alpha are baked into native-resolution raster pixels. Raster OCR is opt-in and local. Confidence filtering, native-text suppression and optional ruled-line estimation do not guarantee exact recognition. Original-color mode preserves RGB; CAD contrast is display-only. Appearance + CAD retains PDF.js-rendered shading, masks, blends and clipped text in a sampled IMAGE layer with separate hidden editable geometry. It is resolution-qualified, not native reconstruction of those effects. CAD + reference hides that appearance layer instead. Native-only unsupported cases still require review. Embedded font programs are not exported. Substituted CAD fonts can change text appearance. Strict mode blocks exports with unresolved error diagnostics.' }), el('p', { text: 'DXF 2000 uses indexed colors; newer versions retain true color. Printed dimensions are inferred non-associative DIMENSION entities with retained display geometry, not recovered original CAD constraints.' }), el('p', { class: 'mono', text: 'Ctrl/Cmd+O Open  ·  Ctrl/Cmd+Enter Convert  ·  Ctrl/Cmd+S Export  ·  F Fit  ·  Escape Cancel' })), actions: [{ label: 'Close', primary: true, run: d => d.close() }] }); }
    setStatus(text) {
        if (this.status)
            this.status.textContent = text;
    }
    error(e) { console.error(e); this.setStatus(`Error: ${e.message}`); toast(e.message, { error: true, timeout: 10000 }); this.config.onError?.(e); }
    async dispose() { this.cancel(); this.abort.abort(); this.unlink?.(); this.disposables.dispose(); this.worker?.dispose(); this.pdfView.dispose(); if(this.pdfReference){this.pdfReference.image.width=this.pdfReference.image.height=1;this.pdfReference=null;} this.cadView.dispose(); await this.source?.dispose(); this.root.replaceChildren(); }
}
export function mountWorkbench(root, config = {}) {
    const workbench = new Workbench(root, config);
    if (config.autoDemo)
        void workbench.demo();
    return workbench;
}
