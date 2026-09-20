import { normalizeRgb } from '@revector/color';
import { I, compose, transform, vector, mapPaths, rectPath, pathBox, emptyBox, extend, near, stableHash, similarity } from '@revector/geometry';
import { SCENE_SCHEMA, diagnostic, checkAbort, yieldTask } from '@revector/model';
import { OPS as DEFAULT_OPS } from './ops.js';
const clone = x => structuredClone(x);
function rgb(args) { return normalizeRgb(args.length === 1 ? args[0] : args); }
const gray = g => [g, g, g].map(x => Math.round(Math.max(0, Math.min(1, x)) * 255));
const cmyk = ([c, m, y, k]) => [c, m, y].map(v => Math.round(255 * (1 - Math.min(1, v + k))));
function visibleOC(props, groups) {
    if (!props)
        return true;
    if (typeof props === 'string')
        return groups[props]?.visible !== false;
    if (props.type === 'OCG')
        return groups[props.id]?.visible !== false;
    if (props.type === 'OCMD') {
        if (props.expression) {
            const ev = e => typeof e === 'string' ? groups[e]?.visible !== false : e[0] === 'And' ? e.slice(1).every(ev) : e[0] === 'Or' ? e.slice(1).some(ev) : !ev(e[1]);
            return ev(props.expression);
        }
        const vals = (props.ids || []).map(id => groups[id]?.visible !== false);
        switch (props.policy) {
            case 'AllOn': return vals.every(Boolean);
            case 'AnyOff': return vals.some(v => !v);
            case 'AllOff': return vals.every(v => !v);
            default: return vals.some(Boolean);
        }
    }
    return true;
}
function initialState(options) { return { ctm: [...(options.initialTransform || I)], style: { stroke: [0, 0, 0], fill: [0, 0, 0], lineWidth: 1, lineCap: 0, lineJoin: 0, miterLimit: 10, dash: [], dashPhase: 0, strokeAlpha: 1, fillAlpha: 1, blend: 'Normal' }, clips: [], tm: [...I], tlm: [...I], font: '', fontSize: 12, hscale: 1, charSpacing: 0, wordSpacing: 0, leading: 0, rise: 0, textMode: 0, textX: 0, textY: 0, softMask: false, visibility: true }; }
/** Converts an immutable operator-list snapshot to a CAD-neutral paint IR.
 * No CanvasGraphics monkey-patching; no raster reads, OCR, eval, or font export.
 */
export async function interpretOperators(operatorList, options = {}) {
    const ops = options.OPS || DEFAULT_OPS, names = new Map(Object.entries(ops).map(([k, v]) => [v, k]));
    const count = operatorList.fnArray.length, maxOps = options.maxOperators ?? 2000000;
    if (count > maxOps)
        throw new RangeError(`Operator budget exceeded: ${count} > ${maxOps}`);
    const scene = { schema: SCENE_SCHEMA, pageNumber: options.pageNumber || 1, box: options.box || [0, 0, 612, 792], pageTransform: options.pageTransform || [...I], rotation: options.rotation || 0, userUnit: options.userUnit || 1, items: [], forms: [], ocgs: options.ocgs || {}, fonts: options.fonts || {}, patterns: [], diagnostics: [], operatorCount: count, source: options.source || {}, structure: options.structure || null, annotations: options.annotations || [] };
    let state = initialState(options), path = [], at = null, pendingClip = null, opIndex = 0, nextId = 0;
    const stack = [], marked = [], forms = [], groups = [], patternKeys = new Map(), featureKeys = new Set();
    const id = () => `p${scene.pageNumber}-${++nextId}`;
    const report = (code, message, severity = 'warning', detail = {}) => {
        const key = code + ':' + (detail.sourceId || '');
        if (!featureKeys.has(key)) {
            featureKeys.add(key);
            scene.diagnostics.push(diagnostic(code, message, severity, { page: scene.pageNumber, operator: opIndex, ...detail }));
        }
    };
    const metadata = () => { const oc = [...marked].reverse().find(m => m.tag === 'OC'); const p = oc?.properties; const layerId = typeof p === 'string' ? p : p?.type === 'OCG' ? p.id : p?.ids?.[0] || null; return { operator: opIndex, layerId, visible: state.visibility && marked.every(m => m.visible !== false), formPath: forms.map(f => f.id), markedContent: marked.map(m => ({ tag: m.tag, properties: m.properties })), clips: state.clips.slice(), annotation: state.annotation || null }; };
    const move = p => { at = { start: transform(state.ctm, p), segments: [], closed: false }; path.push(at); };
    const line = p => {
        if (!at)
            move(p);
        else
            at.segments.push({ kind: 'L', to: transform(state.ctm, p) });
    };
    const curve = (c1, c2, p) => {
        if (!at)
            move(p);
        else
            at.segments.push({ kind: 'C', c1: transform(state.ctm, c1), c2: transform(state.ctm, c2), to: transform(state.ctm, p) });
    };
    const close = () => {
        if (at)
            at.closed = true;
    };
    const applyClip = () => {
        if (pendingClip) {
            state.clips = [...state.clips, { id: `clip-${scene.pageNumber}-${opIndex}`, paths: clone(path), rule: pendingClip }];
            pendingClip = null;
        }
    };
    function emitPaint(name) {
        const isClose = ['closeStroke', 'closeFillStroke', 'closeEOFillStroke'].includes(name);
        if (isClose)
            close();
        const stroke = ['stroke', 'closeStroke', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke'].includes(name);
        const fill = ['fill', 'eoFill', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke'].includes(name);
        if ((stroke || fill) && path.some(p => p.segments.length)) {
            const sx = Math.hypot(state.ctm[0], state.ctm[1]), sy = Math.hypot(state.ctm[2], state.ctm[3]);
            const item = { id: id(), kind: 'path', paths: clone(path), stroke, fill, fillRule: name.toLowerCase().includes('eo') ? 'evenodd' : 'nonzero', style: { ...clone(state.style), lineWidth: state.style.lineWidth * Math.sqrt(Math.abs(state.ctm[0] * state.ctm[3] - state.ctm[1] * state.ctm[2])), dash: state.style.dash.map(n => n * sx), dashPhase: state.style.dashPhase * sx }, ...metadata() };
            if (stroke && !similarity(state.ctm) && state.style.lineWidth > 0)
                report('NONUNIFORM_STROKE', 'An anisotropically transformed stroke has no exact DXF lineweight equivalent. Centreline is preserved.', 'warning', { sourceId: item.id });
            if (state.softMask) {
                item.softMask = true;
                report('SOFT_MASK', 'Soft-mask compositing is retained in provenance, not flattened into CAD geometry.', 'error', { sourceId: item.id });
            }
            if (state.style.blend !== 'Normal' && state.style.blend !== 'source-over')
                report('BLEND_MODE', `PDF blend mode ${state.style.blend} is not a DXF compositing operation.`, 'error', { sourceId: item.id });
            scene.items.push(item);
        }
        applyClip();
        path = [];
        at = null;
    }
    function packed(data) {
        if (!data)
            return;
        if (typeof data === 'object' && !ArrayBuffer.isView(data) && !Array.isArray(data))
            throw new TypeError('Path was already mutated by the PDF renderer. Extract/snapshot operators before rendering.');
        let j = 0;
        while (j < data.length) {
            const op = data[j++];
            switch (op) {
                case 0:
                    move([data[j++], data[j++]]);
                    break;
                case 1:
                    line([data[j++], data[j++]]);
                    break;
                case 2:
                    curve([data[j++], data[j++]], [data[j++], data[j++]], [data[j++], data[j++]]);
                    break;
                case 3: {
                    const q = transform(state.ctm, [data[j++], data[j++]]), end = transform(state.ctm, [data[j++], data[j++]]), start = at?.segments.at(-1)?.to || at?.start;
                    if (start)
                        at.segments.push({ kind: 'C', c1: [start[0] + 2 / 3 * (q[0] - start[0]), start[1] + 2 / 3 * (q[1] - start[1])], c2: [end[0] + 2 / 3 * (q[0] - end[0]), end[1] + 2 / 3 * (q[1] - end[1])], to: end });
                    break;
                }
                case 4:
                    close();
                    break;
                default: throw new RangeError(`Unknown packed DrawOPS ${op}`);
            }
        }
    }
    function legacyPath(pathOps, coords) {
        let i = 0;
        for (const op of pathOps) {
            const name = names.get(op);
            if (name === 'moveTo')
                move([coords[i++], coords[i++]]);
            else if (name === 'lineTo')
                line([coords[i++], coords[i++]]);
            else if (name === 'curveTo')
                curve([coords[i++], coords[i++]], [coords[i++], coords[i++]], [coords[i++], coords[i++]]);
            else if (name === 'curveTo2') {
                const c = transform(state.ctm, [coords[i++], coords[i++]]), p = transform(state.ctm, [coords[i++], coords[i++]]);
                if (at)
                    at.segments.push({ kind: 'C', c1: at.segments.at(-1)?.to || at.start, c2: c, to: p });
            }
            else if (name === 'curveTo3') {
                const c = transform(state.ctm, [coords[i++], coords[i++]]), p = transform(state.ctm, [coords[i++], coords[i++]]);
                if (at)
                    at.segments.push({ kind: 'C', c1: c, c2: p, to: p });
            }
            else if (name === 'closePath')
                close();
            else if (name === 'rectangle') {
                const x = coords[i++], y = coords[i++], w = coords[i++], h = coords[i++];
                move([x, y]);
                line([x + w, y]);
                line([x + w, y + h]);
                line([x, y + h]);
                close();
            }
            else
                report('UNKNOWN_PATH_OPERATOR', `Unhandled legacy path operator ${name || op}`, 'error');
        }
    }
    function moveText(x, y) { state.tlm = compose(state.tlm, [1, 0, 0, 1, x, y]); state.tm = [...state.tlm]; state.textX = 0; state.textY = 0; }
    function showText(glyphArray) {
        const glyphs = Array.isArray(glyphArray) ? glyphArray : [];
        const font = scene.fonts[state.font] || {}, fs = state.fontSize, vertical = !!font.vertical;
        let x = state.textX, y = state.textY;
        const startX = x;
        const output = [], text = [];
        let adjusted = state.charSpacing !== 0 || state.wordSpacing !== 0;
        for (const g of glyphs) {
            if (typeof g === 'number') {
                if (g !== 0)
                    adjusted = true;
                const advance = -g / 1000 * fs;
                if (vertical)
                    y += advance;
                else
                    x += advance * state.hscale;
                continue;
            }
            if (!g)
                continue;
            const unicode = g.unicode || g.fontChar || '\ufffd';
            const width = Number(g.width) || 0;
            let gx = x, gy = y + state.rise;
            if (vertical && g.vmetric) {
                gx -= g.vmetric[1] * fs / 1000;
                gy += g.vmetric[2] * fs / 1000;
            }
            const matrix = compose(state.ctm, compose(state.tm, [fs * state.hscale, 0, 0, fs, gx, gy]));
            output.push({ text: unicode, matrix, width: width / 1000, fontChar: g.fontChar || null, isSpace: !!g.isSpace });
            text.push(unicode);
            const spacing = state.charSpacing + (g.isSpace ? state.wordSpacing : 0);
            if (vertical)
                y -= (g.vmetric?.[0] ?? width) * fs / 1000 + spacing;
            else
                x += (width * fs / 1000 + spacing) * state.hscale;
        }
        state.textX = x;
        state.textY = y;
        if (!output.length)
            return;
        const item = { id: id(), kind: 'text', text: text.join(''), glyphs: output, matrix: output[0].matrix, advance: x - startX, font: state.font, fontName: font.name || font.fallbackName || 'sans-serif', capHeight: font.capHeight || font.ascent || .7, requiresGlyphPositioning: adjusted, vertical, renderingMode: state.textMode, style: clone(state.style), ...metadata() };
        if ((state.textMode & 3) === 3) {
            item.visible = false;
            item.invisibleText = true;
        }
        if (state.textMode >= 4) {
            state.hasTextClip = true;
            report('TEXT_CLIP', 'Text used as a clipping path requires font-outline clipping. Subsequent affected geometry is flagged.', 'error', { sourceId: item.id });
        }
        if ((state.textMode & 3) === 1 || (state.textMode & 3) === 2)
            report('STROKED_TEXT', 'Editable DXF text cannot encode the PDF glyph stroke/fill painting model.', 'warning', { sourceId: item.id });
        if (font.isType3Font)
            report('TYPE3_FONT', 'Type 3 glyph programs are not flattened to CAD text outlines in this build. Editable Unicode is retained when available.', 'error', { sourceId: item.id });
        if (vertical)
            report('VERTICAL_TEXT', 'Vertical text uses individual positioned glyphs in DXF. Target-font metrics may differ.', 'warning', { sourceId: item.id });
        if (item.text.includes('\ufffd'))
            report('UNMAPPED_GLYPH', 'At least one glyph has no usable Unicode mapping. Original glyph identifiers are retained.', 'warning', { sourceId: item.id });
        if (state.softMask || !['Normal', 'source-over'].includes(state.style.blend))
            report('TEXT_COMPOSITING', 'Text is affected by a PDF mask or non-normal blend mode. Native CAD text does not reproduce that composition.', 'error', { sourceId: item.id });
        scene.items.push(item);
    }
    function setPattern(which, args) {
        const ir = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        if (ir[0] === 'TilingPattern') {
            const key = stableHash([ir[3], ir[4], ir[5], ir[6], ir[2]?.fnArray]);
            let index = patternKeys.get(key);
            if (index == null) {
                index = scene.patterns.length;
                patternKeys.set(key, index);
                scene.patterns.push({ id: `pattern-${index}`, raw: ir, baseColor: ir[1], matrix: ir[3] || I, box: ir[4], xStep: ir[5], yStep: ir[6], paintType: ir[7] });
            }
            state.style[which + 'Pattern'] = index;
            state.style[which + 'PatternTransform'] = [...state.ctm];
        }
        else {
            state.style[which + 'Pattern'] = { kind: 'shading', raw: ir };
            report('SHADING_PATTERN', 'Shading-pattern color has no exact native vector DXF equivalent.', 'error');
        }
    }
    for (opIndex = 0; opIndex < count; opIndex++) {
        if ((opIndex & 2047) === 0) {
            checkAbort(options.signal);
            options.onProgress?.({ phase: 'extract', done: opIndex, total: count });
            if (opIndex)
                await yieldTask();
        }
        const fn = operatorList.fnArray[opIndex], name = names.get(fn), a = operatorList.argsArray[opIndex] || [];
        switch (name) {
            case 'dependency':
            case 'beginCompat':
            case 'endCompat':
            case 'setRenderingIntent':
            case 'setFlatness':
            case 'setCharWidth':
            case 'setCharWidthAndBounds':
            case 'markPoint':
            case 'markPointProps': break;
            case 'save':
                stack.push(clone(state));
                break;
            case 'restore':
                if (stack.length)
                    state = stack.pop();
                else
                    report('GRAPHICS_STACK_UNDERFLOW', 'Unbalanced PDF restore operator.', 'error');
                pendingClip = null;
                break;
            case 'transform':
                state.ctm = compose(state.ctm, a);
                break;
            case 'setLineWidth':
                state.style.lineWidth = a[0];
                break;
            case 'setLineCap':
                state.style.lineCap = a[0];
                break;
            case 'setLineJoin':
                state.style.lineJoin = a[0];
                break;
            case 'setMiterLimit':
                state.style.miterLimit = a[0];
                break;
            case 'setDash':
                state.style.dash = Array.from(a[0]);
                state.style.dashPhase = a[1] || 0;
                break;
            case 'setStrokeRGBColor':
                state.style.stroke = rgb(a);
                delete state.style.strokePattern;
                break;
            case 'setFillRGBColor':
                state.style.fill = rgb(a);
                delete state.style.fillPattern;
                break;
            case 'setStrokeGray':
                state.style.stroke = gray(a[0]);
                delete state.style.strokePattern;
                break;
            case 'setFillGray':
                state.style.fill = gray(a[0]);
                delete state.style.fillPattern;
                break;
            case 'setStrokeCMYKColor':
                state.style.stroke = cmyk(a);
                report('CMYK_FALLBACK', 'Raw CMYK operator converted using a device approximation. PDF.js normally normalizes colors.');
                break;
            case 'setFillCMYKColor':
                state.style.fill = cmyk(a);
                report('CMYK_FALLBACK', 'Raw CMYK operator converted using a device approximation. PDF.js normally normalizes colors.');
                break;
            case 'setStrokeColorSpace':
            case 'setFillColorSpace': break;
            case 'setStrokeColor':
            case 'setFillColor':
                report('UNNORMALIZED_COLOR', 'Unexpected non-normalized PDF color operator.', 'error');
                break;
            case 'setStrokeTransparent':
                state.style.strokeAlpha = 0;
                break;
            case 'setFillTransparent':
                state.style.fillAlpha = 0;
                break;
            case 'setStrokeColorN':
                setPattern('stroke', a);
                break;
            case 'setFillColorN':
                setPattern('fill', a);
                break;
            case 'setGState':
                for (const [k, v] of a[0] || []) {
                    if (k === 'LW')
                        state.style.lineWidth = v;
                    else if (k === 'LC')
                        state.style.lineCap = v;
                    else if (k === 'LJ')
                        state.style.lineJoin = v;
                    else if (k === 'ML')
                        state.style.miterLimit = v;
                    else if (k === 'D') {
                        state.style.dash = Array.from(v[0]);
                        state.style.dashPhase = v[1];
                    }
                    else if (k === 'CA')
                        state.style.strokeAlpha = v;
                    else if (k === 'ca')
                        state.style.fillAlpha = v;
                    else if (k === 'BM')
                        state.style.blend = v;
                    else if (k === 'SMask')
                        state.softMask = !!v;
                    else if (k === 'Font') {
                        state.font = v[0];
                        state.fontSize = v[1];
                    }
                    else if (k === 'TR' || k === 'TR2') {
                        state.transferFunction=!!v;
                        report('TRANSFER_FUNCTION', 'PDF transfer function retained only in the source representation.');
                    }
                    else if (k === 'OP' || k === 'op' || k === 'OPM')
                        report('OVERPRINT', 'Overprint is a print-compositing property without a DXF equivalent.');
                }
                break;
            case 'moveTo':
                move(a);
                break;
            case 'lineTo':
                line(a);
                break;
            case 'curveTo':
                curve(a.slice(0, 2), a.slice(2, 4), a.slice(4, 6));
                break;
            case 'curveTo2':
                if (at)
                    at.segments.push({ kind: 'C', c1: at.segments.at(-1)?.to || at.start, c2: transform(state.ctm, a.slice(0, 2)), to: transform(state.ctm, a.slice(2, 4)) });
                break;
            case 'curveTo3':
                if (at) {
                    const p = transform(state.ctm, a.slice(2, 4));
                    at.segments.push({ kind: 'C', c1: transform(state.ctm, a.slice(0, 2)), c2: p, to: p });
                }
                break;
            case 'rectangle': {
                const [x, y, w, h] = a;
                move([x, y]);
                line([x + w, y]);
                line([x + w, y + h]);
                line([x, y + h]);
                close();
                break;
            }
            case 'closePath':
                close();
                break;
            case 'clip':
                pendingClip = 'nonzero';
                break;
            case 'eoClip':
                pendingClip = 'evenodd';
                break;
            case 'constructPath':
                if (typeof a[0] === 'number') {
                    packed(a[1]?.[0]);
                    const action = names.get(a[0]);
                    if (!action)
                        report('UNKNOWN_PAINT_OPERATOR', `Unknown path paint operator ${a[0]}`, 'error');
                    else
                        emitPaint(action);
                }
                else
                    legacyPath(a[0], a[1]);
                break;
            case 'stroke':
            case 'closeStroke':
            case 'fill':
            case 'eoFill':
            case 'fillStroke':
            case 'eoFillStroke':
            case 'closeFillStroke':
            case 'closeEOFillStroke':
            case 'endPath':
                emitPaint(name);
                break;
            case 'rawFillPath':
                packed(a[0]?.path || a[0]);
                emitPaint('fill');
                break;
            case 'beginText':
                state.tm = [...I];
                state.tlm = [...I];
                state.textX = state.textY = 0;
                break;
            case 'endText':
                if (state.hasTextClip) {
                    state.clips = [...state.clips, { id: `textclip-${opIndex}`, text: true, paths: [], rule: 'nonzero' }];
                    state.hasTextClip = false;
                }
                break;
            case 'setCharSpacing':
                state.charSpacing = a[0];
                break;
            case 'setWordSpacing':
                state.wordSpacing = a[0];
                break;
            case 'setHScale':
                state.hscale = a[0] / 100;
                break;
            case 'setLeading':
                state.leading = a[0];
                break;
            case 'setFont':
                state.font = a[0];
                state.fontSize = a[1];
                break;
            case 'setTextRenderingMode':
                state.textMode = a[0];
                break;
            case 'setTextRise':
                state.rise = a[0];
                break;
            case 'moveText':
                moveText(a[0], a[1]);
                break;
            case 'setLeadingMoveText':
                state.leading = -a[1];
                moveText(a[0], a[1]);
                break;
            case 'setTextMatrix': {
                const m = a.length === 1 ? a[0] : a;
                if (m?.length !== 6 || !Array.from(m).every(Number.isFinite))
                    throw new Error('Invalid PDF text matrix');
                state.tm = Array.from(m);
                state.tlm = Array.from(m);
                state.textX = state.textY = 0;
                break;
            }
            case 'nextLine':
                moveText(0, -state.leading);
                break;
            case 'showText':
            case 'showSpacedText':
                showText(a[0]);
                break;
            case 'nextLineShowText':
                moveText(0, -state.leading);
                showText(a[0]);
                break;
            case 'nextLineSetSpacingShowText':
                state.wordSpacing = a[0];
                state.charSpacing = a[1];
                moveText(0, -state.leading);
                showText(a[2]);
                break;
            case 'beginMarkedContent':
                marked.push({ tag: a[0], properties: null, visible: true });
                break;
            case 'beginMarkedContentProps':
                marked.push({ tag: a[0], properties: a[1], visible: a[0] === 'OC' ? visibleOC(a[1], scene.ocgs) : true });
                break;
            case 'endMarkedContent':
                marked.pop();
                break;
            case 'paintFormXObjectBegin': {
                stack.push(clone(state));
                if (a[0])
                    state.ctm = compose(state.ctm, a[0]);
                const form = { id: `form-${scene.pageNumber}-${scene.forms.length}`, transform: [...state.ctm], box: a[1], start: scene.items.length, parent: forms.at(-1)?.id || null };
                scene.forms.push(form);
                forms.push(form);
                if (a[1])
                    state.clips = [...state.clips, { id: `bbox-${form.id}`, paths: mapPaths([rectPath(a[1])], state.ctm), rule: 'nonzero', formBox: true }];
                break;
            }
            case 'paintFormXObjectEnd': {
                const f = forms.pop();
                if (f)
                    f.end = scene.items.length;
                if (stack.length)
                    state = stack.pop();
                break;
            }
            case 'beginGroup': {
                groups.push(clone(state));
                const g = a[0] || {};
                if (g.bbox)
                    state.clips = [...state.clips, { id: `group-bbox-${opIndex}`, paths: mapPaths([rectPath(g.bbox)], compose(state.ctm, g.matrix || I)), rule: 'nonzero' }];
                if(g.knockout||g.isolated)state.nonNormalGroup=true;
                if (g.smask)
                    state.softMask = true;
                if (g.knockout || g.isolated)
                    report('TRANSPARENCY_GROUP', 'Transparency group isolation/knockout is not a native DXF operation. The group clip is retained; composition requires review.', 'error');
                break;
            }
            case 'endGroup':
                if (groups.length)
                    state = groups.pop();
                break;
            case 'beginAnnotation':
                stack.push(clone(state));
                state = initialState(options);
                state.annotation = a[0];
                if (a[1])
                    state.clips = [{ id: `annotation-${a[0]}`, paths: [rectPath(a[1])], rule: 'nonzero' }];
                if (a[2])
                    state.ctm = compose(state.ctm, a[2]);
                if (a[3])
                    state.ctm = compose(state.ctm, a[3]);
                report('ANNOTATION_APPEARANCE', 'Annotation appearance geometry is included; interactive behavior remains source metadata.', 'info');
                break;
            case 'endAnnotation':
                if (stack.length)
                    state = stack.pop();
                break;
            case 'shadingFill':
                scene.items.push({ id: id(), kind: 'shading', raw: a, transform: [...state.ctm], ...metadata() });
                report('SHADING', 'PDF axial/radial/mesh shading is not silently rasterized or converted to a flat fill.', 'error');
                break;
            case 'paintImageXObject':
            case 'paintImageMaskXObject':
            case 'paintInlineImageXObject':
            case 'paintInlineImageXObjectGroup':
            case 'paintImageXObjectRepeat':
            case 'paintImageMaskXObjectRepeat':
            case 'paintImageMaskXObjectGroup':
            case 'paintSolidColorImageMask': {
                const emit = (matrix = I, image = a[0]) => scene.items.push({ id: id(), kind: 'image', imageType: name, reference: typeof image === 'string' ? image : null, transform: compose(state.ctm, matrix), style:clone(state.style),softMask:state.softMask,transferFunction:!!state.transferFunction,nonNormalGroup:!!state.nonNormalGroup, width: image?.width, height: image?.height, ...metadata() });
                if (name === 'paintImageXObjectRepeat') {
                    for (let i=0;i<a[3].length;i+=2) emit([a[1],0,0,a[2],a[3][i],a[3][i+1]]);
                } else if (name === 'paintImageMaskXObjectRepeat') {
                    for (let i=0;i<a[5].length;i+=2) emit([a[1],a[2],a[3],a[4],a[5][i],a[5][i+1]]);
                } else if (name === 'paintImageMaskXObjectGroup') {
                    for (const image of a[0]) emit(image.transform, image);
                } else if (name === 'paintInlineImageXObjectGroup') {
                    for (const image of a[1]) emit(image.transform);
                } else emit();
                report('RASTER_CONTENT', 'Raster content has no automatic vector mapping. Enable Raster OCR for local text recovery; remaining image graphics stay in the PDF.', 'warning');
                break;
            }
            default:
                report('UNHANDLED_OPERATOR', `Unhandled PDF.js operator ${name || fn}; no silent success.`, 'error');
                break;
        }
    }
    if (stack.length || forms.length)
        report('UNBALANCED_SCOPE', 'Unbalanced PDF graphics/form scope at the end of the page.', 'error');
    for (const p of scene.patterns) {
        const ir = p.raw;
        if ((options.patternDepth || 0) >= 3) {
            report('PATTERN_DEPTH', 'Nested pattern budget reached.', 'error');
            continue;
        }
        try {
            p.scene = await interpretOperators(ir[2], { ...options, pageTransform: I, initialTransform: I, patternDepth: (options.patternDepth || 0) + 1, box: p.box, source: { kind: 'tiling-pattern' } });
        }
        catch (error) {
            report('PATTERN_EXTRACTION', error.message, 'error');
        }
        delete p.raw;
    }
    options.onProgress?.({ phase: 'extract', done: count, total: count });
    return scene;
}
