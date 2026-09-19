import { I, compose, transform, vector, inverse, mapPaths, pathBox, pathEdges, pathPolygons, rectPath, containsBox, intersects, near, stableHash, decomposeInsert, booleanPaths, clipCurveToPaths, insidePaths, emptyBox, extend, validBox } from '@revector/geometry';
import { createDocument, ensureLayer, diagnostic, entityBox, checkAbort, yieldTask } from '@revector/model';
const unitFactor = { mm: 25.4 / 72, cm: 2.54 / 72, m: .0254 / 72, in: 1 / 72, pt: 1, unitless: 1 };
const cleanName = s => String(s || '0').replace(/[<>\/\\":;?*|=,\x00-\x1f]/g, '_').slice(0, 240) || '0';
function transformEntity(e, m) {
    const out = structuredClone(e);
    delete out.bounds;
    switch (e.type) {
        case 'LINE':
            out.start = transform(m, e.start);
            out.end = transform(m, e.end);
            break;
        case 'LWPOLYLINE':
        case 'SOLID':
            out.points = e.points.map(p => transform(m, p));
            break;
        case 'SPLINE':
            out.controlPoints = e.controlPoints.map(p => transform(m, p));
            break;
        case 'HATCH':
            out.paths = mapPaths(e.paths, m);
            break;
        case 'TEXT':
        case 'MTEXT':
        case 'ATTRIB': {
            const a = (e.rotation || 0) * Math.PI / 180, tm = compose(m, [Math.cos(a) * e.height, Math.sin(a) * e.height, -Math.sin(a) * e.height, Math.cos(a) * e.height, ...e.position]);
            out.position = [tm[4], tm[5]];
            out.height = Math.hypot(tm[2], tm[3]);
            out.width = e.width * Math.hypot(m[0], m[1]);
            out.rotation = Math.atan2(tm[1], tm[0]) * 180 / Math.PI;
            break;
        }
        default: throw Error(`Cannot localize ${e.type}`);
    }
    return out;
}
export { transformEntity };
export const DEFAULT_CONVERSION_OPTIONS = Object.freeze({ units: 'mm', drawingScale: 1, includeHidden: false, clip: true, preserveForms: true, textMode: 'adaptive', styleLayers: true, strict: false, precision: 10, patternLimit: 2500, booleanTolerance: 1e-8 });
/** Lowers PDF paint geometry independently of the semantic inference engine. */
export async function lowerScene(scene, userOptions = {}) {
    const options = { ...DEFAULT_CONVERSION_OPTIONS, ...userOptions };
    if (!Number.isFinite(options.drawingScale) || options.drawingScale <= 0)
        throw new RangeError('Drawing scale must be positive');
    const factor = unitFactor[options.units];
    if (!factor)
        throw new RangeError('Unsupported output units');
    const scale = factor * options.drawingScale, M = compose([scale, 0, 0, scale, 0, 0], scene.pageTransform || I);
    const doc = createDocument({ name: scene.source?.name || `Page ${scene.pageNumber}`, units: options.units, source: { ...scene.source, page: scene.pageNumber, coordinateTransform: M, options: Object.fromEntries(Object.entries(options).filter(([k, v]) => !['signal', 'onProgress'].includes(k) && typeof v !== 'function')), irSchema: scene.schema }, pageBox: [0, 0, (scene.pageSize?.[0] ?? (scene.box[2] - scene.box[0])) * scale, (scene.pageSize?.[1] ?? (scene.box[3] - scene.box[1])) * scale], diagnostics: structuredClone(scene.diagnostics || []) });
    const records = new Map(), styleNames = new Map(), sourceEntities = new Map();
    let counter = 0;
    const addReport = (code, msg, severity = 'warning', id) => doc.diagnostics.push(diagnostic(code, msg, severity, { sourceId: id, page: scene.pageNumber }));
    const makeId = () => `e${++counter}`;
    function layerFor(item, color) {
        if (item.layerId) {
            const g = scene.ocgs?.[item.layerId];
            const name = cleanName(g?.name || item.layerId);
            ensureLayer(doc, name, color, g?.visible !== false);
            return name;
        }
        if (!options.styleLayers)
            return '0';
        const weight = (item.style?.lineWidth || 0) * factor, key = color.join('-') + ':' + weight.toFixed(2) + ':' + (item.style?.dash || []).join(',');
        let name = styleNames.get(key);
        if (!name) {
            name = `PDF_${color.map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()}_${Math.round(weight * 100)}`;
            if (item.style?.dash?.length)
                name += '_DASH';
            styleNames.set(key, name);
            ensureLayer(doc, name, color);
        }
        return name;
    }
    function common(item, paint = 'stroke') { const style = item.style || {}, color = style[paint] || [0, 0, 0], opacity = style[paint + 'Alpha'] ?? 1; return { id: makeId(), layer: layerFor(item, color), color: [...color], lineweight: (style.lineWidth || 0) * 25.4 / 72 * (scene.userUnit || 1), opacity, dash: (style.dash || []).map(v => v * scale), dashPhase: (style.dashPhase || 0) * scale, source: { ids: [item.id], page: scene.pageNumber, operator: item.operator, formPath: item.formPath || [], markedContent: item.markedContent || [], kind: item.kind }, semantic: { class: item.annotation ? 'annotation' : null, confidence: 1, method: 'source' } }; }
    function append(e, item) {
        doc.entities.push(e);
        if (!sourceEntities.has(item.id))
            sourceEntities.set(item.id, []);
        sourceEntities.get(item.id).push(e);
    }
    function edgeEntity(edge, item) { const base = common(item); return edge.kind === 'L' ? { ...base, type: 'LINE', start: edge.points[0], end: edge.points[1] } : { ...base, type: 'SPLINE', degree: 3, controlPoints: edge.points, knots: [0, 0, 0, 0, 1, 1, 1, 1], weights: [], closed: false }; }
    function effectiveClips(item) {
        const clips = (item.clips || []).map(c => ({ ...c, paths: mapPaths(c.paths || [], M) }));
        if (options.clip)
            clips.unshift({ id: 'page-crop', paths: [rectPath(doc.pageBox)], rule: 'nonzero' });
        return options.clip ? clips : [];
    }
    function clippedStroke(edge, clips, item) {
        let parts = [edge];
        for (const c of clips) {
            if (c.text) {
                addReport('UNRESOLVED_TEXT_CLIP', 'Geometry affected by a text clipping mask requires font-outline recovery.', 'error', item.id);
                continue;
            }
            if (!c.paths.length) {
                parts = [];
                break;
            }
            const cb = pathBox(c.paths);
            parts = parts.flatMap(e => {
                const eb = pathBox([{ start: e.points[0], segments: [e.kind === 'L' ? { kind: 'L', to: e.points[1] } : { kind: 'C', c1: e.points[1], c2: e.points[2], to: e.points[3] }], closed: false }]);
                if (!intersects(eb, cb))
                    return [];
                // Rectangular enclosing clips can be skipped without changing the geometry.
                if (c.paths.length === 1 && c.paths[0].segments.every(s => s.kind === 'L') && isAxisRect(c.paths[0]) && containsBox(cb, eb, 1e-9))
                    return [e];
                return clipCurveToPaths(e, c.paths, c.rule, { tolerance: options.booleanTolerance });
            });
        }
        return parts;
    }
    function isAxisRect(p) {
        if (!p.segments.every(s => s.kind === 'L'))
            return false;
        const vertices = [p.start, ...p.segments.map(s => s.to)];
        if (vertices.length === 5 && near(vertices[0], vertices.at(-1)))
            vertices.pop();
        return vertices.length === 4 && vertices.every((v, i) => { const w = vertices[(i + 1) % 4]; return Math.abs(v[0] - w[0]) < 1e-9 || Math.abs(v[1] - w[1]) < 1e-9; });
    }
    function fillPaths(paths, clips, item) {
        let result = paths.map(p => ({ ...p, closed: true }));
        let rule = item.fillRule || 'nonzero';
        // Normalizing removes redundant same-winding islands and resolves overlap.
        try {
            result = booleanPaths(result, [], { operation: 'normalize', subjectRule: rule, tolerance: options.booleanTolerance });
            rule = 'nonzero';
            for (const c of clips) {
                if (c.text) {
                    addReport('UNRESOLVED_TEXT_CLIP', 'Filled geometry has an unresolved font-outline clip.', 'error', item.id);
                    continue;
                }
                if (!c.paths.length)
                    return [];
                const a = pathBox(result), b = pathBox(c.paths);
                if (!intersects(a, b))
                    return [];
                if (c.paths.length === 1 && isAxisRect(c.paths[0]) && containsBox(b, a, 1e-9))
                    continue;
                result = booleanPaths(result, c.paths, { operation: 'intersection', subjectRule: rule, clipRule: c.rule, tolerance: options.booleanTolerance });
                if (!result.length)
                    break;
            }
        }
        catch (error) {
            addReport('BOOLEAN_REVIEW', `Exact-primitive fill/clip arrangement could not be resolved safely: ${error.message}. Original fill retained for review.`, 'error', item.id);
            return paths.map(p => ({ ...p, closed: true }));
        }
        return result;
    }
    async function paintPath(item) {
        const paths = mapPaths(item.paths, M), clips = effectiveClips(item);
        if (item.fill && item.style?.fillPattern !== undefined) {
            await expandPattern(item, paths, clips);
        }
        else if (item.fill && (item.style?.fillAlpha ?? 1) > 0) {
            const result = fillPaths(paths, clips, item);
            if (result.length)
                append({ ...common(item, 'fill'), type: 'HATCH', paths: result, solid: true, fillRule: 'evenodd' }, item);
        }
        if (item.stroke && (item.style?.strokeAlpha ?? 1) > 0) {
            if (item.style?.strokePattern !== undefined)
                addReport('PATTERN_STROKE', 'Pattern-painted stroke is preserved as a centreline; patterned stroke coverage requires review.', 'error', item.id);
            for (const p of paths) {
                const original = pathEdges(p);
                let parts = [];
                try {
                    parts = original.flatMap(e => clippedStroke(e, clips, item));
                }
                catch (error) {
                    addReport('CURVE_CLIP_REVIEW', error.message, 'error', item.id);
                    parts = original;
                }
                const allLines = parts.every(e => e.kind === 'L'), connected = parts.every((e, i) => !i || near(parts[i - 1].points.at(-1), e.points[0], 1e-8));
                if (parts.length > 1 && allLines && connected) {
                    let points = [parts[0].points[0], ...parts.map(e => e.points[1])];
                    const closed = near(points[0], points.at(-1), 1e-8);
                    if (closed)
                        points.pop();
                    append({ ...common(item), type: 'LWPOLYLINE', points, closed }, item);
                }
                else
                    for (const e of parts)
                        if (e.kind === 'C' || !near(e.points[0], e.points[1]))
                            append(edgeEntity(e, item), item);
            }
        }
    }
    async function expandPattern(item, fill, clips) {
        const index = item.style.fillPattern;
        if (typeof index !== 'number') {
            addReport('SHADING_FILL_OMITTED', 'Shading is retained in the PDF/source manifest, not replaced by fabricated vector fills.', 'error', item.id);
            return;
        }
        const pattern = scene.patterns?.[index];
        if (!pattern?.scene || !pattern.xStep || !pattern.yStep) {
            addReport('INVALID_TILING_PATTERN', 'Tiling pattern has no usable vector cell.', 'error', item.id);
            return;
        }
        const rawMatrix = compose(item.style.fillPatternTransform || I, pattern.matrix || I), pm = compose(M, rawMatrix);
        let inv;
        try {
            inv = inverse(pm);
        }
        catch {
            addReport('SINGULAR_PATTERN', 'Pattern transform is singular.', 'error', item.id);
            return;
        }
        const local = pathBox(mapPaths(fill, inv)), xstep = Math.abs(pattern.xStep), ystep = Math.abs(pattern.yStep), x0 = Math.floor((local[0] - pattern.box[2]) / xstep), x1 = Math.ceil((local[2] - pattern.box[0]) / xstep), y0 = Math.floor((local[1] - pattern.box[3]) / ystep), y1 = Math.ceil((local[3] - pattern.box[1]) / ystep);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > options.patternLimit) {
            addReport('PATTERN_BUDGET', 'Vector tiling pattern exceeds the configured cell budget. Raise patternLimit explicitly.', 'error', item.id);
            return;
        }
        // Cell primitives remain splines/lines. The parent fill is an exact clipping path.
        const invM = inverse(M);
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const cell = compose(rawMatrix, [1, 0, 0, 1, x * xstep, y * ystep]);
                for (const child of pattern.scene.items) {
                    if (child.kind !== 'path') {
                        addReport('PATTERN_NON_PATH', 'Text/image content inside a tiling cell is not expanded by this vector-cell converter.', 'error', item.id);
                        continue;
                    }
                    const style = { ...child.style };
                    if (pattern.paintType === 2) {
                        style.stroke = pattern.baseColor || item.style.fill;
                        style.fill = pattern.baseColor || item.style.fill;
                    }
                    const expanded = { ...child, id: `${item.id}-cell-${x}-${y}-${child.id}`, paths: mapPaths(child.paths, cell), style, layerId: item.layerId, formPath: item.formPath, clips: [...(item.clips || []), { paths: mapPaths(fill, invM), rule: item.fillRule }, ...child.clips.map(c => ({ ...c, paths: mapPaths(c.paths, cell) }))] };
                    await paintPath(expanded);
                }
            }
    }
    function addText(item) {
        if (!item.text)
            return;
        const mode = options.textMode === 'glyphs' || item.vertical || (options.textMode === 'adaptive' && item.requiresGlyphPositioning) ? 'glyphs' : 'runs';
        const glyphs = mode === 'glyphs' ? item.glyphs : [{ text: item.text, matrix: item.matrix, width: null }];
        for (const g of glyphs) {
            if (!g.text.trim())
                continue;
            const tm = compose(M, g.matrix), ux = [tm[0], tm[1]], vx = [tm[2], tm[3]], xLen = Math.hypot(...ux);
            if (xLen < 1e-12)
                continue;
            const det = tm[0] * tm[3] - tm[1] * tm[2], height = Math.abs(det) / xLen;
            if (height < 1e-12)
                continue;
            const rotation = Math.atan2(tm[1], tm[0]) * 180 / Math.PI, oblique = Math.atan2(tm[0] * tm[2] + tm[1] * tm[3], Math.abs(det)) * 180 / Math.PI;
            let width = g.width !== null ? g.width * xLen : 0;
            if (!width) {
                const last = item.glyphs?.at(-1);
                if (last) {
                    const end = transform(M, [last.matrix[4] + last.matrix[0] * last.width, last.matrix[5] + last.matrix[1] * last.width]);
                    width = Math.hypot(end[0] - tm[4], end[1] - tm[5]);
                }
                else
                    width = g.text.length * height * .55;
            }
            const e = { ...common(item, 'fill'), type: 'TEXT', text: g.text, position: [tm[4], tm[5]], height: height * (item.capHeight || .7), width, rotation, oblique, mirror: det < 0 ? 4 : 0, font: item.fontName || 'sans-serif', widthFactor: 1, source: { ...commonSource(item), font: item.font, textMatrix: tm, originalText: item.text } };
            let visible = true;
            for (const c of effectiveClips(item)) {
                if (c.text)
                    continue;
                const box = entityBox(e, doc);
                if (!intersects(box, pathBox(c.paths))) {
                    visible = false;
                    break;
                }
                if (!containsBox(pathBox(c.paths), box))
                    addReport('PARTIAL_TEXT_CLIP', 'A partially clipped editable text run is preserved whole. Switch to glyph positioning for finer granularity; font-outline clipping is not inferred.', 'error', item.id);
            }
            if (visible)
                append(e, item);
        }
    }
    function commonSource(item) { return { ids: [item.id], page: scene.pageNumber, operator: item.operator, formPath: item.formPath || [], kind: item.kind }; }
    for (let i = 0; i < scene.items.length; i++) {
        if ((i & 127) === 0) {
            checkAbort(options.signal);
            options.onProgress?.({ phase: 'lower', done: i, total: scene.items.length });
            if (i)
                await yieldTask();
        }
        const item = scene.items[i];
        if (item.invisibleText || (!options.includeHidden && item.visible === false))
            continue;
        if (item.kind === 'path')
            await paintPath(item);
        else if (item.kind === 'text')
            addText(item);
    }
    if (scene.items.some(i => i.kind === 'text'))
        addReport('FONT_SUBSTITUTION', 'DXF stores editable Unicode and positioned metrics, not embedded PDF font programs. Target CAD fonts and shaping may differ.', 'warning');
    if (options.preserveForms) {
        // Leaf forms are converted first. Only exact INSERT-representable transforms
        // are folded; shears or unresolved clipped forms remain exploded.
        const consumed = new Set(), definitions = new Map();
        for (const form of [...(scene.forms || [])].reverse()) {
            const members = doc.entities.filter(e => !consumed.has(e.id) && e.source?.formPath?.includes(form.id));
            if (members.length < 2 || members.some(e => e.type === 'INSERT' || e.type === 'DIMENSION'))
                continue;
            const fm = compose(M, form.transform), decomp = decomposeInsert(fm);
            if (!decomp) {
                addReport('SHEARED_FORM', 'Form has shear; exact vector geometry remains exploded because a single DXF INSERT cannot represent the transform.', 'info', form.id);
                continue;
            }
            if (members.some(e => ['TEXT', 'MTEXT', 'ATTRIB'].includes(e.type)) && Math.abs(Math.abs(decomp.scale[0]) - Math.abs(decomp.scale[1])) > 1e-9)
                continue;
            let local;
            try {
                const inv = inverse(fm);
                local = members.map(e => transformEntity(e, inv));
            }
            catch {
                continue;
            }
            const signature = JSON.stringify(local.map(e => { const { id, source, semantic, ...geometry } = e; return geometry; }), (k, v) => typeof v === 'number' ? Number(v.toFixed(9)) : v);
            const hash = stableHash(signature);
            let block = definitions.get(hash);
            // Hash collisions are never treated as geometry equality.
            if (block && block.signature !== signature)
                block = null;
            if (!block) {
                const name = `PDF_FORM_${hash.toUpperCase()}_${definitions.size}`;
                block = { name, entities: local.map((e, i) => ({ ...e, id: `b${definitions.size}_${i}` })), origin: [0, 0], source: { form: form.id }, signature };
                definitions.set(hash, block);
                doc.blocks.push(block);
            }
            const first = members[0], insert = { id: makeId(), type: 'INSERT', name: block.name, ...decomp, layer: first.layer, color: first.color, lineweight: first.lineweight, opacity: first.opacity, source: { ids: [...new Set(members.flatMap(e => e.source?.ids || []))], page: scene.pageNumber, form: form.id, formPath: (first.source?.formPath || []).filter(x => x !== form.id) }, semantic: { class: 'form-xobject', confidence: 1, method: 'source' }, attributes: [] };
            const index = doc.entities.indexOf(first);
            for (const e of members)
                consumed.add(e.id);
            doc.entities.splice(index, 0, insert);
            doc.candidates.push({ id: `source-${form.id}`, rule: 'pdf.forms', title: `Preserve Form XObject as ${block.name}`, confidence: 1, exact: true, status: 'accepted', members: members.map(e => e.id), evidence: [{ kind: 'pdf-form-scope', form: form.id, operatorCount: form.end - form.start }], result: [insert.id] });
        }
        doc.entities = doc.entities.filter(e => !consumed.has(e.id));
        for (const b of doc.blocks)
            delete b.signature;
    }
    if (!options.clip && scene.items.some(i => i.clips?.length))
        addReport('CLIPPING_DISABLED', 'Clip processing is disabled. Geometry outside PDF clipping boundaries remains in the drawing.', 'warning');
    doc.source.operatorCount = scene.operatorCount;
    doc.source.paintItems = scene.items.length;
    doc.source.rasterItems = scene.items.filter(i => i.kind === 'image').length;
    options.onProgress?.({ phase: 'lower', done: scene.items.length, total: scene.items.length });
    return doc;
}
