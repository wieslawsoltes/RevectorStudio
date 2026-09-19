/* Revector Studio MIT — generated static worker bundle. */
globalThis.__revectorImport=url=>import(url);
const factories={"@revector/cad":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONVERSION_OPTIONS = void 0;
exports.transformEntity = transformEntity;
exports.lowerScene = lowerScene;
const geometry_1 = require("@revector/geometry");
const model_1 = require("@revector/model");
const unitFactor = { mm: 25.4 / 72, cm: 2.54 / 72, m: .0254 / 72, in: 1 / 72, pt: 1, unitless: 1 };
const cleanName = s => String(s || '0').replace(/[<>\/\\":;?*|=,\x00-\x1f]/g, '_').slice(0, 240) || '0';
function transformEntity(e, m) {
    const out = structuredClone(e);
    delete out.bounds;
    switch (e.type) {
        case 'LINE':
            out.start = (0, geometry_1.transform)(m, e.start);
            out.end = (0, geometry_1.transform)(m, e.end);
            break;
        case 'LWPOLYLINE':
        case 'SOLID':
            out.points = e.points.map(p => (0, geometry_1.transform)(m, p));
            break;
        case 'SPLINE':
            out.controlPoints = e.controlPoints.map(p => (0, geometry_1.transform)(m, p));
            break;
        case 'HATCH':
            out.paths = (0, geometry_1.mapPaths)(e.paths, m);
            break;
        case 'TEXT':
        case 'MTEXT':
        case 'ATTRIB': {
            const a = (e.rotation || 0) * Math.PI / 180, tm = (0, geometry_1.compose)(m, [Math.cos(a) * e.height, Math.sin(a) * e.height, -Math.sin(a) * e.height, Math.cos(a) * e.height, ...e.position]);
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
exports.DEFAULT_CONVERSION_OPTIONS = Object.freeze({ units: 'mm', drawingScale: 1, includeHidden: false, clip: true, preserveForms: true, textMode: 'adaptive', styleLayers: true, strict: false, precision: 10, patternLimit: 2500, booleanTolerance: 1e-8 });
/** Lowers PDF paint geometry independently of the semantic inference engine. */
async function lowerScene(scene, userOptions = {}) {
    const options = { ...exports.DEFAULT_CONVERSION_OPTIONS, ...userOptions };
    if (!Number.isFinite(options.drawingScale) || options.drawingScale <= 0)
        throw new RangeError('Drawing scale must be positive');
    const factor = unitFactor[options.units];
    if (!factor)
        throw new RangeError('Unsupported output units');
    const scale = factor * options.drawingScale, M = (0, geometry_1.compose)([scale, 0, 0, scale, 0, 0], scene.pageTransform || geometry_1.I);
    const doc = (0, model_1.createDocument)({ name: scene.source?.name || `Page ${scene.pageNumber}`, units: options.units, source: { ...scene.source, page: scene.pageNumber, coordinateTransform: M, options: Object.fromEntries(Object.entries(options).filter(([k, v]) => !['signal', 'onProgress'].includes(k) && typeof v !== 'function')), irSchema: scene.schema }, pageBox: [0, 0, (scene.pageSize?.[0] ?? (scene.box[2] - scene.box[0])) * scale, (scene.pageSize?.[1] ?? (scene.box[3] - scene.box[1])) * scale], diagnostics: structuredClone(scene.diagnostics || []) });
    const records = new Map(), styleNames = new Map(), sourceEntities = new Map();
    let counter = 0;
    const addReport = (code, msg, severity = 'warning', id) => doc.diagnostics.push((0, model_1.diagnostic)(code, msg, severity, { sourceId: id, page: scene.pageNumber }));
    const makeId = () => `e${++counter}`;
    function layerFor(item, color) {
        if (item.layerId) {
            const g = scene.ocgs?.[item.layerId];
            const name = cleanName(g?.name || item.layerId);
            (0, model_1.ensureLayer)(doc, name, color, g?.visible !== false);
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
            (0, model_1.ensureLayer)(doc, name, color);
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
        const clips = (item.clips || []).map(c => ({ ...c, paths: (0, geometry_1.mapPaths)(c.paths || [], M) }));
        if (options.clip)
            clips.unshift({ id: 'page-crop', paths: [(0, geometry_1.rectPath)(doc.pageBox)], rule: 'nonzero' });
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
            const cb = (0, geometry_1.pathBox)(c.paths);
            parts = parts.flatMap(e => {
                const eb = (0, geometry_1.pathBox)([{ start: e.points[0], segments: [e.kind === 'L' ? { kind: 'L', to: e.points[1] } : { kind: 'C', c1: e.points[1], c2: e.points[2], to: e.points[3] }], closed: false }]);
                if (!(0, geometry_1.intersects)(eb, cb))
                    return [];
                // Rectangular enclosing clips can be skipped without changing the geometry.
                if (c.paths.length === 1 && c.paths[0].segments.every(s => s.kind === 'L') && isAxisRect(c.paths[0]) && (0, geometry_1.containsBox)(cb, eb, 1e-9))
                    return [e];
                return (0, geometry_1.clipCurveToPaths)(e, c.paths, c.rule, { tolerance: options.booleanTolerance });
            });
        }
        return parts;
    }
    function isAxisRect(p) {
        if (!p.segments.every(s => s.kind === 'L'))
            return false;
        const vertices = [p.start, ...p.segments.map(s => s.to)];
        if (vertices.length === 5 && (0, geometry_1.near)(vertices[0], vertices.at(-1)))
            vertices.pop();
        return vertices.length === 4 && vertices.every((v, i) => { const w = vertices[(i + 1) % 4]; return Math.abs(v[0] - w[0]) < 1e-9 || Math.abs(v[1] - w[1]) < 1e-9; });
    }
    function fillPaths(paths, clips, item) {
        let result = paths.map(p => ({ ...p, closed: true }));
        let rule = item.fillRule || 'nonzero';
        // Normalizing removes redundant same-winding islands and resolves overlap.
        try {
            result = (0, geometry_1.booleanPaths)(result, [], { operation: 'normalize', subjectRule: rule, tolerance: options.booleanTolerance });
            rule = 'nonzero';
            for (const c of clips) {
                if (c.text) {
                    addReport('UNRESOLVED_TEXT_CLIP', 'Filled geometry has an unresolved font-outline clip.', 'error', item.id);
                    continue;
                }
                if (!c.paths.length)
                    return [];
                const a = (0, geometry_1.pathBox)(result), b = (0, geometry_1.pathBox)(c.paths);
                if (!(0, geometry_1.intersects)(a, b))
                    return [];
                if (c.paths.length === 1 && isAxisRect(c.paths[0]) && (0, geometry_1.containsBox)(b, a, 1e-9))
                    continue;
                result = (0, geometry_1.booleanPaths)(result, c.paths, { operation: 'intersection', subjectRule: rule, clipRule: c.rule, tolerance: options.booleanTolerance });
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
        const paths = (0, geometry_1.mapPaths)(item.paths, M), clips = effectiveClips(item);
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
                const original = (0, geometry_1.pathEdges)(p);
                let parts = [];
                try {
                    parts = original.flatMap(e => clippedStroke(e, clips, item));
                }
                catch (error) {
                    addReport('CURVE_CLIP_REVIEW', error.message, 'error', item.id);
                    parts = original;
                }
                const allLines = parts.every(e => e.kind === 'L'), connected = parts.every((e, i) => !i || (0, geometry_1.near)(parts[i - 1].points.at(-1), e.points[0], 1e-8));
                if (parts.length > 1 && allLines && connected) {
                    let points = [parts[0].points[0], ...parts.map(e => e.points[1])];
                    const closed = (0, geometry_1.near)(points[0], points.at(-1), 1e-8);
                    if (closed)
                        points.pop();
                    append({ ...common(item), type: 'LWPOLYLINE', points, closed }, item);
                }
                else
                    for (const e of parts)
                        if (e.kind === 'C' || !(0, geometry_1.near)(e.points[0], e.points[1]))
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
        const rawMatrix = (0, geometry_1.compose)(item.style.fillPatternTransform || geometry_1.I, pattern.matrix || geometry_1.I), pm = (0, geometry_1.compose)(M, rawMatrix);
        let inv;
        try {
            inv = (0, geometry_1.inverse)(pm);
        }
        catch {
            addReport('SINGULAR_PATTERN', 'Pattern transform is singular.', 'error', item.id);
            return;
        }
        const local = (0, geometry_1.pathBox)((0, geometry_1.mapPaths)(fill, inv)), xstep = Math.abs(pattern.xStep), ystep = Math.abs(pattern.yStep), x0 = Math.floor((local[0] - pattern.box[2]) / xstep), x1 = Math.ceil((local[2] - pattern.box[0]) / xstep), y0 = Math.floor((local[1] - pattern.box[3]) / ystep), y1 = Math.ceil((local[3] - pattern.box[1]) / ystep);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > options.patternLimit) {
            addReport('PATTERN_BUDGET', 'Vector tiling pattern exceeds the configured cell budget. Raise patternLimit explicitly.', 'error', item.id);
            return;
        }
        // Cell primitives remain splines/lines. The parent fill is an exact clipping path.
        const invM = (0, geometry_1.inverse)(M);
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const cell = (0, geometry_1.compose)(rawMatrix, [1, 0, 0, 1, x * xstep, y * ystep]);
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
                    const expanded = { ...child, id: `${item.id}-cell-${x}-${y}-${child.id}`, paths: (0, geometry_1.mapPaths)(child.paths, cell), style, layerId: item.layerId, formPath: item.formPath, clips: [...(item.clips || []), { paths: (0, geometry_1.mapPaths)(fill, invM), rule: item.fillRule }, ...child.clips.map(c => ({ ...c, paths: (0, geometry_1.mapPaths)(c.paths, cell) }))] };
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
            const tm = (0, geometry_1.compose)(M, g.matrix), ux = [tm[0], tm[1]], vx = [tm[2], tm[3]], xLen = Math.hypot(...ux);
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
                    const end = (0, geometry_1.transform)(M, [last.matrix[4] + last.matrix[0] * last.width, last.matrix[5] + last.matrix[1] * last.width]);
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
                const box = (0, model_1.entityBox)(e, doc);
                if (!(0, geometry_1.intersects)(box, (0, geometry_1.pathBox)(c.paths))) {
                    visible = false;
                    break;
                }
                if (!(0, geometry_1.containsBox)((0, geometry_1.pathBox)(c.paths), box))
                    addReport('PARTIAL_TEXT_CLIP', 'A partially clipped editable text run is preserved whole. Switch to glyph positioning for finer granularity; font-outline clipping is not inferred.', 'error', item.id);
            }
            if (visible)
                append(e, item);
        }
    }
    function commonSource(item) { return { ids: [item.id], page: scene.pageNumber, operator: item.operator, formPath: item.formPath || [], kind: item.kind }; }
    for (let i = 0; i < scene.items.length; i++) {
        if ((i & 127) === 0) {
            (0, model_1.checkAbort)(options.signal);
            options.onProgress?.({ phase: 'lower', done: i, total: scene.items.length });
            if (i)
                await (0, model_1.yieldTask)();
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
            const fm = (0, geometry_1.compose)(M, form.transform), decomp = (0, geometry_1.decomposeInsert)(fm);
            if (!decomp) {
                addReport('SHEARED_FORM', 'Form has shear; exact vector geometry remains exploded because a single DXF INSERT cannot represent the transform.', 'info', form.id);
                continue;
            }
            if (members.some(e => ['TEXT', 'MTEXT', 'ATTRIB'].includes(e.type)) && Math.abs(Math.abs(decomp.scale[0]) - Math.abs(decomp.scale[1])) > 1e-9)
                continue;
            let local;
            try {
                const inv = (0, geometry_1.inverse)(fm);
                local = members.map(e => transformEntity(e, inv));
            }
            catch {
                continue;
            }
            const signature = JSON.stringify(local.map(e => { const { id, source, semantic, ...geometry } = e; return geometry; }), (k, v) => typeof v === 'number' ? Number(v.toFixed(9)) : v);
            const hash = (0, geometry_1.stableHash)(signature);
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

},
"@revector/dxf/aci.js":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACI = void 0;
// AutoCAD Color Index palette. Numeric color data from ezdxf (MIT).
exports.ACI = [0, 16711680, 16776960, 65280, 65535, 255, 16711935, 16777215, 8421504, 12632256, 16711680, 16744319, 10813440, 10834514, 8323072, 8339263, 4980736, 4990502, 2490368, 2495251, 16727808, 16752511, 10823936, 10839890, 8331008, 8343359, 4985600, 4992806, 2492672, 2496275, 16744192, 16760703, 10834432, 10845266, 8339200, 8347455, 4990464, 4995366, 2495232, 2497555, 16760576, 16768895, 10845184, 10850642, 8347392, 8351551, 4995328, 4997670, 2497536, 2498835, 16776960, 16777087, 10855680, 10855762, 8355584, 8355647, 5000192, 5000230, 2500096, 2500115, 12582656, 14679935, 8168704, 9545042, 6258432, 7307071, 3755008, 4344870, 1844736, 2172435, 8388352, 12582783, 5416192, 8168786, 4161280, 6258495, 2509824, 3755046, 1254912, 1844755, 4194048, 10485631, 2729216, 6792530, 2064128, 5209919, 1264640, 3099686, 599552, 1517075, 65280, 8388479, 42240, 5416274, 32512, 4161343, 19456, 2509862, 9728, 1254931, 65343, 8388511, 42281, 5416295, 32543, 4161359, 19475, 2509871, 9737, 1267735, 65407, 8388543, 42322, 5416316, 32575, 4161375, 19494, 2509881, 9747, 1267740, 65471, 8388575, 42364, 5416337, 32607, 4161391, 19513, 2509890, 9756, 1267800, 65535, 8388607, 42405, 5416357, 32639, 4161407, 19532, 2509900, 9766, 1267800, 49151, 8380415, 31909, 5411237, 24447, 4157311, 14668, 2507390, 7206, 1267800, 32767, 8372223, 21157, 5405861, 16255, 4153215, 9804, 2505086, 4902, 1252440, 16383, 8364031, 10661, 5400485, 8063, 4149119, 4940, 2502526, 2342, 1251160, 255, 8355839, 165, 5395109, 127, 4145023, 76, 2500222, 38, 1250136, 4129023, 10452991, 2687141, 6771365, 2031743, 5193599, 1245260, 3090046, 589862, 1512280, 8323327, 12550143, 5374117, 8147621, 4128895, 6242175, 2490444, 3745406, 1245222, 1839960, 12517631, 14647295, 8126629, 9523877, 6226047, 7290751, 3735628, 4335180, 1835046, 5772120, 16711935, 16744447, 10813605, 10834597, 8323199, 8339327, 4980812, 4990540, 2490406, 5772120, 16711871, 16744415, 10813564, 10834577, 8323167, 8339311, 4980793, 4990530, 2490396, 5772120, 16711807, 16744383, 10813522, 10834556, 8323135, 8339295, 4980774, 4990521, 2490387, 5772060, 16711743, 16744351, 10813481, 10834535, 8323103, 8339279, 4980755, 4990511, 2490377, 5772055, 0, 6645093, 6710886, 10066329, 13421772, 16777215];

},
"@revector/dxf":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeDxfString = exports.readDxf = exports.nearestACI = exports.dxfString = exports.exportDxf = exports.writeDxf = void 0;
var writer_js_1 = require("@revector/dxf/writer.js");
Object.defineProperty(exports, "writeDxf", { enumerable: true, get: function () { return writer_js_1.writeDxf; } });
Object.defineProperty(exports, "exportDxf", { enumerable: true, get: function () { return writer_js_1.exportDxf; } });
Object.defineProperty(exports, "dxfString", { enumerable: true, get: function () { return writer_js_1.dxfString; } });
Object.defineProperty(exports, "nearestACI", { enumerable: true, get: function () { return writer_js_1.nearestACI; } });
var reader_js_1 = require("@revector/dxf/reader.js");
Object.defineProperty(exports, "readDxf", { enumerable: true, get: function () { return reader_js_1.readDxf; } });
Object.defineProperty(exports, "decodeDxfString", { enumerable: true, get: function () { return reader_js_1.decodeDxfString; } });

},
"@revector/dxf/reader.js":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeDxfString = void 0;
exports.readDxf = readDxf;
const model_1 = require("@revector/model");
const geometry_1 = require("@revector/geometry");
const aci_js_1 = require("@revector/dxf/aci.js");
const decodeDxfString = s => String(s).replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, v) => String.fromCharCode(parseInt(v, 16)));
exports.decodeDxfString = decodeDxfString;
function pairs(text, maxPairs) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/), out = [];
    if (lines.at(-1) === '')
        lines.pop();
    if (lines.length % 2)
        throw new Error('DXF group/value line count is odd');
    if (lines.length / 2 > maxPairs)
        throw new RangeError('DXF pair budget exceeded');
    for (let i = 0; i < lines.length; i += 2) {
        const code = Number(lines[i].trim());
        if (!Number.isInteger(code) || code < 0 || code > 1071)
            throw new Error(`Invalid DXF group code on line ${i + 1}`);
        out.push([code, lines[i + 1]]);
    }
    return out;
}
function records(data) {
    const out = [];
    for (const p of data) {
        if (p[0] === 0)
            out.push({ type: p[1].trim(), tags: [] });
        else if (out.length)
            out.at(-1).tags.push(p);
    }
    return out;
}
const get = (r, code, def) => r.tags.find(t => t[0] === code)?.[1] ?? def;
const n = (r, c, d = 0) => Number(get(r, c, d));
const p = (r, c, d = [0, 0]) => [n(r, c, d[0]), n(r, c + 10, d[1])];
function readColor(r, layer) {
    const color = n(r, 420, -1);
    if (color >= 0)
        return [color >>> 16 & 255, color >>> 8 & 255, color & 255];
    const index = Math.abs(n(r, 62, 256));
    if (index === 256 || index === 0)
        return layer?.color || [0, 0, 0];
    const c = aci_js_1.ACI[index] ?? 0;
    return [c >>> 16 & 255, c >>> 8 & 255, c & 255];
}
function parseXdata(r) {
    const index = r.tags.findIndex(t => t[0] === 1001 && t[1] === 'REVECTOR');
    if (index < 0)
        return null;
    let json = '';
    for (let i = index + 1; i < r.tags.length && r.tags[i][0] !== 1001; i++)
        if (r.tags[i][0] === 1000)
            json += (0, exports.decodeDxfString)(r.tags[i][1]);
    try {
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
function points(r, code) {
    const out = [];
    for (let i = 0; i < r.tags.length; i++)
        if (r.tags[i][0] === code) {
            const q = [Number(r.tags[i][1]), 0];
            for (let j = i + 1; j < r.tags.length && r.tags[j][0] !== code; j++)
                if (r.tags[j][0] === code + 10) {
                    q[1] = Number(r.tags[j][1]);
                    break;
                }
            out.push(q);
        }
    return out;
}
function readHatch(r) {
    const tags = r.tags;
    let i = tags.findIndex(t => t[0] === 91), count = Number(tags[i++][1]);
    const paths = [];
    function take(c) {
        if (tags[i]?.[0] !== c)
            throw new Error(`HATCH expected code ${c}, got ${tags[i]?.[0]}`);
        return Number(tags[i++][1]);
    }
    function point(c) { return [take(c), take(c + 10)]; }
    for (let k = 0; k < count; k++) {
        const flags = take(92);
        if (flags & 2) {
            const bulge = take(72), closed = take(73), num = take(93), ps = [];
            for (let j = 0; j < num; j++) {
                ps.push(point(10));
                if (bulge && tags[i]?.[0] === 42)
                    take(42);
            }
            const refs = take(97);
            i += refs;
            paths.push({ start: ps[0], segments: ps.slice(1).map(to => ({ kind: 'L', to })), closed: !!closed });
        }
        else {
            const edgeCount = take(93);
            let start = null, segments = [];
            for (let j = 0; j < edgeCount; j++) {
                const type = take(72);
                if (type === 1) {
                    const a = point(10), b = point(11);
                    if (!start)
                        start = a;
                    segments.push({ kind: 'L', to: b });
                }
                else if (type === 4) {
                    const degree = take(94), rational = take(73);
                    take(74);
                    const nk = take(95), np = take(96), knots = [], ps = [];
                    for (let z = 0; z < nk; z++)
                        knots.push(take(40));
                    for (let z = 0; z < np; z++) {
                        ps.push(point(10));
                        if (rational && tags[i]?.[0] === 42)
                            take(42);
                    }
                    const fit = take(97);
                    for (let z = 0; z < fit; z++)
                        point(11);
                    if (fit) {
                        if (tags[i]?.[0] === 12)
                            point(12);
                        if (tags[i]?.[0] === 13)
                            point(13);
                    }
                    if (degree !== 3 || ps.length !== 4)
                        throw Error('DXF preview only accepts cubic HATCH spline edges emitted by this writer');
                    if (!start)
                        start = ps[0];
                    segments.push({ kind: 'C', c1: ps[1], c2: ps[2], to: ps[3] });
                }
                else
                    throw Error(`Unsupported HATCH edge type ${type}`);
            }
            const refs = take(97);
            i += refs;
            paths.push({ start, segments, closed: true });
        }
    }
    return paths;
}
/** Reads the writer's complete entity subset. It is not advertised as a universal DXF importer. */
function readDxf(text, { maxPairs = 10000000 } = {}) {
    const data = pairs(text, maxPairs), sections = new Map();
    let name = null;
    for (let i = 0; i < data.length; i++) {
        const [c, v] = data[i];
        if (c === 0 && v === 'SECTION') {
            if (data[i + 1]?.[0] !== 2)
                throw Error('DXF SECTION has no name');
            name = data[++i][1];
            sections.set(name, []);
        }
        else if (c === 0 && v === 'ENDSEC')
            name = null;
        else if (name)
            sections.get(name).push(data[i]);
    }
    if (data.at(-1)?.[1] !== 'EOF')
        throw Error('DXF has no EOF marker');
    const doc = (0, model_1.createDocument)({ name: 'DXF round trip', layers: [] });
    const header = sections.get('HEADER') || [];
    for (let i = 0; i < header.length; i++)
        if (header[i][0] === 9) {
            const key = header[i][1], value = header[i + 1]?.[1];
            if (key === '$ACADVER')
                doc.acadVersion = value;
            if (key === '$INSUNITS')
                doc.units = ({ 0: 'unitless', 1: 'in', 4: 'mm', 5: 'cm', 6: 'm' })[Number(value)] || 'unitless';
            if (key === '$LIMMAX')
                doc.pageBox = [0, 0, Number(header[i + 1][1]), Number(header[i + 2][1])];
        }
    const tables = records(sections.get('TABLES') || []), styles = new Map(), linetypes = new Map();
    for (const r of tables) {
        if (r.type === 'LAYER')
            doc.layers.push({ name: (0, exports.decodeDxfString)(get(r, 2, '0')), color: readColor(r), visible: n(r, 62, 7) >= 0 });
        else if (r.type === 'STYLE')
            styles.set(get(r, 2, ''), get(r, 3, 'Arial'));
        else if (r.type === 'LTYPE')
            linetypes.set(get(r, 2, ''), r.tags.filter(t => t[0] === 49).map(t => Math.abs(Number(t[1]))));
    }
    if (!doc.layers.some(l => l.name === '0'))
        doc.layers.push({ name: '0', color: [0, 0, 0], visible: true });
    let next = 0;
    function entity(r) {
        const layer = (0, exports.decodeDxfString)(get(r, 8, '0')), l = doc.layers.find(l => l.name === layer), meta = parseXdata(r);
        const e = { id: meta?.id || `dxf-${++next}`, handle: get(r, 5, ''), type: r.type, layer, color: readColor(r, l), lineweight: Math.max(0, n(r, 370, 0)) / 100, opacity: get(r, 440, null) !== null ? (n(r, 440) & 255) / 255 : 1, dash: linetypes.get(get(r, 6, 'CONTINUOUS')) || [], source: meta?.source || {}, semantic: meta?.semantic || {} };
        switch (r.type) {
            case 'LINE':
                e.start = p(r, 10);
                e.end = p(r, 11);
                break;
            case 'LWPOLYLINE':
                e.points = points(r, 10);
                e.bulges = Array(e.points.length).fill(0);
                {
                    let i = -1;
                    for (const [c, v] of r.tags) {
                        if (c === 10)
                            i++;
                        if (c === 42 && i >= 0)
                            e.bulges[i] = Number(v);
                    }
                }
                e.closed = !!(n(r, 70) & 1);
                e.constantWidth = n(r, 43);
                break;
            case 'CIRCLE':
            case 'ARC':
                e.center = p(r, 10);
                e.radius = n(r, 40);
                if (r.type === 'ARC') {
                    e.startAngle = n(r, 50);
                    e.endAngle = n(r, 51);
                }
                break;
            case 'ELLIPSE':
                e.center = p(r, 10);
                e.major = p(r, 11);
                e.ratio = n(r, 40);
                e.startParam = n(r, 41);
                e.endParam = n(r, 42, Math.PI * 2);
                break;
            case 'SPLINE':
                e.degree = n(r, 71);
                e.knots = r.tags.filter(t => t[0] === 40).map(t => Number(t[1]));
                e.weights = r.tags.filter(t => t[0] === 41).map(t => Number(t[1]));
                e.controlPoints = points(r, 10);
                e.closed = !!(n(r, 70) & 1);
                break;
            case 'HATCH':
                e.paths = readHatch(r);
                e.solid = n(r, 70) === 1;
                e.fillRule = 'evenodd';
                if (!e.solid)
                    e.pattern = { angle: n(r, 53), origin: [n(r, 43), n(r, 44)], offset: [n(r, 45), n(r, 46)] };
                break;
            case 'SOLID': {
                const a = p(r, 10), b = p(r, 11), c = p(r, 13), d = p(r, 12);
                e.points = (0, geometry_1.near)(c, d) ? [a, b, c] : [a, b, c, d];
                break;
            }
            case 'TEXT':
            case 'ATTRIB':
                e.text = (0, exports.decodeDxfString)(get(r, 1, ''));
                e.position = p(r, 10);
                e.height = n(r, 40, 1);
                e.rotation = n(r, 50);
                e.width = n(r, 72) === 5 ? (0, geometry_1.distance)(e.position, p(r, 11)) : e.height * .55 * e.text.length * n(r, 41, 1);
                e.widthFactor = n(r, 41, 1);
                e.oblique = n(r, 51);
                e.mirror = n(r, 71);
                e.font = (0, exports.decodeDxfString)(styles.get(get(r, 7, 'STANDARD')) || 'Arial');
                if (r.type === 'ATTRIB') {
                    e.tag = (0, exports.decodeDxfString)(get(r, 2, 'VALUE'));
                    e.value = e.text;
                }
                break;
            case 'MTEXT':
                e.text = (0, exports.decodeDxfString)(r.tags.filter(t => t[0] === 3 || t[0] === 1).map(t => t[1]).join('')).replace(/\\P/g, '\n');
                e.position = p(r, 10);
                e.height = n(r, 40, 1);
                e.width = n(r, 41);
                e.rotation = n(r, 50) * 180 / Math.PI;
                e.font = styles.get(get(r, 7, 'STANDARD')) || 'Arial';
                break;
            case 'INSERT':
                e.name = (0, exports.decodeDxfString)(get(r, 2, ''));
                e.position = p(r, 10);
                e.scale = [n(r, 41, 1), n(r, 42, 1)];
                e.rotation = n(r, 50);
                e.attributes = [];
                break;
            case 'DIMENSION':
                e.block = (0, exports.decodeDxfString)(get(r, 2, ''));
                e.dimensionType = n(r, 70) & 7;
                e.definition = p(r, 10);
                e.extension1 = p(r, 13);
                e.extension2 = p(r, 14);
                e.textPosition = p(r, 11);
                e.text = (0, exports.decodeDxfString)(get(r, 1, ''));
                e.measurement = n(r, 42);
                break;
            default:
                if (!['SEQEND', 'BLOCK', 'ENDBLK'].includes(r.type))
                    doc.diagnostics.push((0, model_1.diagnostic)('DXF_ENTITY_UNSUPPORTED', `DXF preview does not implement ${r.type}.`, 'error'));
                return null;
        }
        if (meta?.font)
            e.sourceFont = meta.font;
        return e;
    }
    function readEntities(rs, out) {
        let lastInsert = null;
        for (const r of rs) {
            const e = entity(r);
            if (!e) {
                if (r.type === 'SEQEND')
                    lastInsert = null;
                continue;
            }
            if (e.type === 'ATTRIB' && lastInsert)
                lastInsert.attributes.push(e);
            else {
                out.push(e);
                lastInsert = e.type === 'INSERT' ? e : null;
            }
        }
    }
    const blockRecords = records(sections.get('BLOCKS') || []);
    let active = null, rs = [];
    for (const r of blockRecords) {
        if (r.type === 'BLOCK') {
            active = { name: (0, exports.decodeDxfString)(get(r, 2, '')), origin: p(r, 10), entities: [] };
            rs = [];
        }
        else if (r.type === 'ENDBLK') {
            if (active && !active.name.startsWith('*Model_Space') && !active.name.startsWith('*Paper_Space')) {
                readEntities(rs, active.entities);
                doc.blocks.push(active);
            }
            active = null;
        }
        else if (active)
            rs.push(r);
    }
    readEntities(records(sections.get('ENTITIES') || []), doc.entities);
    const handles = new Map([...doc.entities, ...doc.blocks.flatMap(b => b.entities)].map(e => [e.handle, e.id]));
    for (const r of records(sections.get('OBJECTS') || []))
        if (r.type === 'GROUP')
            doc.groups.push({ name: get(r, 5, ''), description: (0, exports.decodeDxfString)(get(r, 300, '')), members: r.tags.filter(t => t[0] === 340).map(t => handles.get(t[1])).filter(Boolean) });
    return doc;
}

},
"@revector/dxf/writer.js":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dxfString = dxfString;
exports.nearestACI = nearestACI;
exports.exportDxf = exportDxf;
exports.writeDxf = writeDxf;
const geometry_1 = require("@revector/geometry");
const model_1 = require("@revector/model");
const aci_js_1 = require("@revector/dxf/aci.js");
const UNIT_CODES = { unitless: 0, in: 1, mm: 4, cm: 5, m: 6, pt: 0 };
const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
function dxfString(value) {
    let out = '';
    for (let i = 0; i < String(value ?? '').length; i++) {
        const c = String(value ?? '').charCodeAt(i);
        if (c === 10 || c === 13 || c < 32)
            out += ' ';
        else if (c > 126)
            out += '\\U+' + c.toString(16).toUpperCase().padStart(4, '0');
        else
            out += String.fromCharCode(c);
    }
    return out;
}
function name(value) { const n = String(value).replace(/[<>\/\\":;?*|=,\x00-\x1f]/g, '_'); return n.slice(0, 240) || '0'; }
function blockName(value) { return value.startsWith('*') ? '*' + name(value.slice(1)) : name(value); }
function nearestACI(rgb) {
    let best = 7, error = Infinity;
    for (let i = 1; i < 256; i++) {
        const v = aci_js_1.ACI[i], c = [v >>> 16 & 255, v >>> 8 & 255, v & 255], d = c.reduce((s, x, j) => s + (x - rgb[j]) ** 2, 0);
        if (d < error) {
            error = d;
            best = i;
        }
    }
    return best;
}
const rgbInt = rgb => (Math.round(rgb[0]) << 16) | (Math.round(rgb[1]) << 8) | Math.round(rgb[2]);
function nearestWeight(mm) { const w = mm * 100; return LINEWEIGHTS.reduce((a, b) => Math.abs(a - w) <= Math.abs(b - w) ? a : b); }
const safeFont = s => {
    const v = String(s || 'Arial').replace(/^[A-Z]{6}\+/, '');
    const bold = /bold|semibold|demi/i.test(v), italic = /italic|oblique/i.test(v);
    if (/mono|courier/i.test(v))
        return 'cour' + (bold ? (italic ? 'bi' : 'bd') : (italic ? 'i' : '')) + '.ttf';
    if (/serif|times/i.test(v) && !/sans/i.test(v))
        return 'times' + (bold ? (italic ? 'bi' : 'bd') : (italic ? 'i' : '')) + '.ttf';
    if (/arial|helvetica|sans/i.test(v))
        return 'arial' + (bold ? (italic ? 'bi' : 'bd') : (italic ? 'i' : '')) + '.ttf';
    return name(v) + '.ttf';
};
/** Six real DXF generations, with explicit capability diagnostics (not a header-only switch). */
function exportDxf(doc, { version = '2018', precision = 10, strict = false, xdata = true } = {}) {
    version = String(version);
    if (!model_1.DXF_VERSIONS[version])
        throw new RangeError('DXF version must be 2000, 2004, 2007, 2010, 2013 or 2018');
    for (const [label, values, normalize] of [['layer', doc.layers.map(x => x.name), name], ['block', doc.blocks.map(x => x.name), blockName], ['group', doc.groups.map(x => x.name), name]]) {
        const keys = values.map(x => normalize(x).toUpperCase());
        if (new Set(keys).size !== keys.length)
            throw Error(`DXF ${label} names collide after normalization`);
    }
    const check = (0, model_1.validateDocument)(doc);
    if (!check.valid)
        throw new Error('Invalid CAD model: ' + check.errors.join('; '));
    if (!Number.isInteger(precision) || precision < 3 || precision > 15)
        throw new RangeError('DXF precision must be 3–15 decimal places');
    const diagnostics = [], modern = Number(version) >= 2004, handles = new Map(), blockHandles = new Map(), blockBegin = new Map(), blockEnd = new Map(), attrHandles = new Map(), seqHandles = new Map();
    let next = 0x100;
    const h = () => (next++).toString(16).toUpperCase();
    const tableNames = ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD'];
    const tables = Object.fromEntries(tableNames.map(k => [k, h()]));
    const root = h(), groupDict = h(), layoutDict = h(), modelLayout = h(), paperLayout = h(), modelRecord = h(), paperRecord = h();
    blockHandles.set('*Model_Space', modelRecord);
    blockHandles.set('*Paper_Space', paperRecord);
    for (const b of doc.blocks)
        blockHandles.set(b.name, h());
    for (const k of blockHandles.keys()) {
        blockBegin.set(k, h());
        blockEnd.set(k, h());
    }
    const fonts = new Map([['STANDARD', { name: 'STANDARD', font: 'txt', handle: h() }]]);
    for (const e of (0, model_1.allEntities)(doc).flatMap(e => [e, ...e.attributes || []]))
        if (['TEXT', 'MTEXT', 'ATTRIB'].includes(e.type)) {
            const font = e.font || 'Arial';
            if (!fonts.has(font))
                fonts.set(font, { name: 'RV_' + (0, geometry_1.stableHash)(font).toUpperCase(), font: safeFont(font), handle: h() });
        }
    const linetypes = new Map([['BYBLOCK', { name: 'BYBLOCK', dash: [], handle: h() }], ['BYLAYER', { name: 'BYLAYER', dash: [], handle: h() }], ['CONTINUOUS', { name: 'CONTINUOUS', dash: [], handle: h() }]]);
    for (const e of (0, model_1.allEntities)(doc))
        if (e.dash?.length) {
            const k = (0, geometry_1.stableHash)(e.dash);
            if (!linetypes.has(k))
                linetypes.set(k, { name: 'RV_DASH_' + k.toUpperCase(), dash: e.dash, handle: h() });
        }
    const layerHandles = new Map(doc.layers.map(l => [l.name, h()]));
    const appids = [{ name: 'ACAD', handle: h() }, { name: 'REVECTOR', handle: h() }];
    const dimStyle = h(), vport = h();
    const groupHandles = new Map(doc.groups.map(g => [g.name, h()]));
    for (const e of (0, model_1.allEntities)(doc)) {
        handles.set(e.id, h());
        if (e.type === 'INSERT' && e.attributes?.length) {
            for (const a of e.attributes)
                attrHandles.set(a.id, h());
            seqHandles.set(e.id, h());
        }
    }
    let current = [];
    const num = n => {
        if (!Number.isFinite(n))
            throw Error(`Non-finite DXF numeric value ${n}`);
        const v = Math.abs(n) < 10 ** (-precision) / 2 ? 0 : n;
        return Number(v.toFixed(precision)).toString();
    };
    const tag = (code, value) => { current.push(String(code), typeof value === 'number' ? num(value) : dxfString(value)); };
    const pt = (code, p, z = true) => {
        tag(code, p[0]);
        tag(code + 10, p[1]);
        if (z)
            tag(code + 20, p[2] || 0);
    };
    const record = (type, handle, owner, subclasses = []) => {
        tag(0, type);
        tag(type === 'DIMSTYLE' ? 105 : 5, handle);
        if (owner)
            tag(330, owner);
        for (const s of subclasses)
            tag(100, s);
    };
    const table = (type, count, fn) => { record('TABLE', tables[type], null); tag(2, type); tag(100, 'AcDbSymbolTable'); tag(70, count); fn(); tag(0, 'ENDTAB'); };
    function color(rgb, hidden = false) {
        const aci = nearestACI(rgb);
        tag(62, hidden ? -aci : aci);
        if (modern)
            tag(420, rgbInt(rgb));
    }
    function common(e, owner, handle = handles.get(e.id)) {
        record(e.type, handle, null);
        const reactors = doc.groups.filter(g => g.members.includes(e.id));
        if (reactors.length) {
            tag(102, '{ACAD_REACTORS');
            for (const g of reactors)
                tag(330, groupHandles.get(g.name));
            tag(102, '}');
        }
        tag(330, owner);
        tag(100, 'AcDbEntity');
        tag(8, name(e.layer || '0'));
        if (e.color)
            color(e.color);
        if (e.dash?.length)
            tag(6, linetypes.get((0, geometry_1.stableHash)(e.dash)).name);
        if (e.lineweight != null)
            tag(370, nearestWeight(e.lineweight));
        if (modern && e.opacity != null && e.opacity < 1)
            tag(440, 0x02000000 | Math.round(Math.max(0, e.opacity) * 255));
    }
    function provenance(e) {
        if (!xdata)
            return;
        const value = JSON.stringify({ id: e.id, source: { ids: (e.source?.ids || []).slice(0, 64), page: e.source?.page, operator: e.source?.operator, form: e.source?.form, ref: (0, geometry_1.stableHash)(e.source || {}) }, semantic: e.semantic || {}, font: e.font });
        tag(1001, 'REVECTOR');
        let chunk = '';
        for (const c of value) {
            const text = dxfString(c);
            if (chunk.length + text.length > 240) {
                tag(1000, chunk);
                chunk = '';
            }
            chunk += text;
        }
        if (chunk)
            tag(1000, chunk);
    }
    function textFields(e, attribute = false) {
        tag(100, 'AcDbText');
        pt(10, e.position);
        tag(40, e.height);
        tag(1, e.text || e.value || '');
        tag(50, e.rotation || 0);
        tag(41, e.widthFactor || 1);
        if (e.oblique)
            tag(51, e.oblique);
        tag(7, (fonts.get(e.font || 'Arial') || fonts.get('STANDARD')).name);
        tag(71, e.mirror || 0);
        const fit = e.width > 0;
        tag(72, fit ? 5 : 0);
        const angle = (e.rotation || 0) * Math.PI / 180;
        pt(11, fit ? [e.position[0] + e.width * Math.cos(angle), e.position[1] + e.width * Math.sin(angle)] : e.position);
        if (attribute) {
            tag(100, 'AcDbAttribute');
            tag(2, name(e.tag || 'VALUE'));
            tag(70, 0);
            tag(73, 0);
            tag(74, 0);
        }
        else {
            tag(100, 'AcDbText');
            tag(73, 0);
        }
    }
    function hatch(e) {
        tag(100, 'AcDbHatch');
        pt(10, [0, 0]);
        pt(210, [0, 0, 1]);
        tag(2, e.solid === false ? 'RV_PATTERN' : 'SOLID');
        tag(70, e.solid === false ? 0 : 1);
        tag(71, 0);
        tag(91, e.paths.length);
        for (const p of e.paths) {
            const edges = (0, geometry_1.pathEdges)({ ...p, closed: true });
            if (edges.every(s => s.kind === 'L')) {
                let points = [p.start, ...p.segments.map(s => s.to)];
                if (points.length > 1 && (0, geometry_1.near)(points[0], points.at(-1)))
                    points.pop();
                tag(92, 2);
                tag(72, 0);
                tag(73, 1);
                tag(93, points.length);
                for (const p of points)
                    pt(10, p, false);
                tag(97, 0);
            }
            else {
                tag(92, 0);
                tag(93, edges.length);
                for (const edge of edges) {
                    if (edge.kind === 'L') {
                        tag(72, 1);
                        pt(10, edge.points[0], false);
                        pt(11, edge.points[1], false);
                    }
                    else {
                        tag(72, 4);
                        tag(94, 3);
                        tag(73, 0);
                        tag(74, 0);
                        tag(95, 8);
                        tag(96, 4);
                        for (const knot of [0, 0, 0, 0, 1, 1, 1, 1])
                            tag(40, knot);
                        for (const p of edge.points)
                            pt(10, p, false);
                        tag(97, 0);
                    }
                }
                tag(97, 0);
            }
        }
        tag(75, 0);
        tag(76, 1);
        if (e.solid === false) {
            tag(52, 0);
            tag(41, 1);
            tag(77, 0);
            tag(78, 1);
            tag(53, e.pattern?.angle || 0);
            tag(43, e.pattern?.origin?.[0] || 0);
            tag(44, e.pattern?.origin?.[1] || 0);
            tag(45, e.pattern?.offset?.[0] || 0);
            tag(46, e.pattern?.offset?.[1] ?? 1);
            tag(79, 0);
        }
        tag(98, 0);
    }
    function emitEntity(e, owner) {
        common(e, owner);
        switch (e.type) {
            case 'LINE':
                tag(100, 'AcDbLine');
                pt(10, e.start);
                pt(11, e.end);
                break;
            case 'LWPOLYLINE':
                tag(100, 'AcDbPolyline');
                tag(90, e.points.length);
                tag(70, e.closed ? 1 : 0);
                if (e.constantWidth)
                    tag(43, e.constantWidth);
                for (let i = 0; i < e.points.length; i++) {
                    pt(10, e.points[i], false);
                    if (e.bulges?.[i])
                        tag(42, e.bulges[i]);
                }
                break;
            case 'CIRCLE':
                tag(100, 'AcDbCircle');
                pt(10, e.center);
                tag(40, e.radius);
                break;
            case 'ARC':
                tag(100, 'AcDbCircle');
                pt(10, e.center);
                tag(40, e.radius);
                tag(100, 'AcDbArc');
                tag(50, e.startAngle);
                tag(51, e.endAngle);
                break;
            case 'ELLIPSE':
                tag(100, 'AcDbEllipse');
                pt(10, e.center);
                pt(11, e.major);
                pt(210, [0, 0, 1]);
                tag(40, e.ratio);
                tag(41, e.startParam ?? 0);
                tag(42, e.endParam ?? Math.PI * 2);
                break;
            case 'SPLINE':
                tag(100, 'AcDbSpline');
                pt(210, [0, 0, 1]);
                tag(70, 8 | (e.closed ? 1 : 0) | (e.weights?.length ? 4 : 0));
                tag(71, e.degree);
                tag(72, e.knots.length);
                tag(73, e.controlPoints.length);
                tag(74, 0);
                tag(42, 1e-7);
                tag(43, 1e-7);
                tag(44, 1e-10);
                for (const k of e.knots)
                    tag(40, k);
                for (const w of e.weights || [])
                    tag(41, w);
                for (const p of e.controlPoints)
                    pt(10, p);
                break;
            case 'HATCH':
                hatch(e);
                break;
            case 'SOLID':
                tag(100, 'AcDbTrace');
                pt(10, e.points[0]);
                pt(11, e.points[1]);
                pt(12, e.points[3] || e.points[2]);
                pt(13, e.points[2]);
                break;
            case 'TEXT':
                textFields(e);
                break;
            case 'MTEXT':
                tag(100, 'AcDbMText');
                pt(10, e.position);
                tag(40, e.height);
                tag(41, e.width || 0);
                tag(71, 1);
                tag(72, 1);
                tag(1, (e.text || '').replace(/\n/g, '\\P'));
                tag(7, (fonts.get(e.font || 'Arial') || fonts.get('STANDARD')).name);
                tag(50, (e.rotation || 0) * Math.PI / 180);
                break;
            case 'INSERT':
                tag(100, 'AcDbBlockReference');
                if (e.attributes?.length)
                    tag(66, 1);
                tag(2, blockName(e.name));
                pt(10, e.position);
                tag(41, e.scale?.[0] ?? 1);
                tag(42, e.scale?.[1] ?? 1);
                tag(43, 1);
                tag(50, e.rotation || 0);
                break;
            case 'DIMENSION':
                tag(100, 'AcDbDimension');
                tag(2, blockName(e.block));
                pt(10, e.definition);
                pt(11, e.textPosition);
                tag(70, (e.dimensionType ?? 1) | 32);
                tag(1, e.text || '<>');
                tag(3, 'STANDARD');
                tag(42, e.measurement || 0);
                tag(100, 'AcDbAlignedDimension');
                pt(13, e.extension1);
                pt(14, e.extension2);
                break;
            default: throw new Error(`Unsupported DXF output entity ${e.type}`);
        }
        provenance(e);
        if (e.type === 'INSERT' && e.attributes?.length) {
            for (const a of e.attributes) {
                common({ ...a, type: 'ATTRIB', layer: a.layer || e.layer }, handles.get(e.id), attrHandles.get(a.id));
                textFields(a, true);
                provenance(a);
            }
            record('SEQEND', seqHandles.get(e.id), handles.get(e.id), ['AcDbEntity']);
            tag(8, e.layer || '0');
        }
    }
    const entities = (0, model_1.allEntities)(doc);
    if (!modern && entities.some(e => e.opacity != null && e.opacity < 1))
        diagnostics.push((0, model_1.diagnostic)('DXF2000_TRANSPARENCY', 'DXF 2000 cannot retain the requested entity transparency.', 'error'));
    if (!modern && entities.some(e => e.color && aci_js_1.ACI[nearestACI(e.color)] !== rgbInt(e.color)))
        diagnostics.push((0, model_1.diagnostic)('DXF2000_TRUECOLOR', 'DXF 2000 uses nearest indexed colors; true-color entity tags are omitted.', 'warning'));
    if (entities.some(e => e.dashPhase))
        diagnostics.push((0, model_1.diagnostic)('DASH_PHASE', 'DXF linetypes do not preserve arbitrary PDF per-path dash phase.', 'warning'));
    if (strict && [...doc.diagnostics, ...diagnostics].some(d => d.severity === 'error'))
        throw new Error('Strict export blocked by unresolved conversion diagnostics. Export the audit report or resolve the listed features.');
    // TABLES
    tag(0, 'SECTION');
    tag(2, 'TABLES');
    table('VPORT', 1, () => { record('VPORT', vport, tables.VPORT, ['AcDbSymbolTableRecord', 'AcDbViewportTableRecord']); tag(2, '*Active'); tag(70, 0); pt(10, [0, 0], false); pt(11, [1, 1], false); pt(12, [doc.pageBox[2] / 2, doc.pageBox[3] / 2], false); pt(13, [0, 0], false); pt(14, [10, 10], false); pt(15, [10, 10], false); pt(16, [0, 0, 1]); pt(17, [0, 0, 0]); tag(40, doc.pageBox[3] || 210); tag(41, (doc.pageBox[2] || 297) / (doc.pageBox[3] || 210)); tag(42, 50); tag(43, 0); tag(44, 0); tag(50, 0); tag(51, 0); tag(71, 0); tag(72, 100); tag(73, 1); tag(74, 3); tag(75, 0); tag(76, 0); tag(77, 0); tag(78, 0); });
    table('LTYPE', linetypes.size, () => {
        for (const l of linetypes.values()) {
            record('LTYPE', l.handle, tables.LTYPE, ['AcDbSymbolTableRecord', 'AcDbLinetypeTableRecord']);
            tag(2, l.name);
            tag(70, 0);
            tag(3, l.dash.length ? 'Recovered PDF stroke pattern' : '');
            tag(72, 65);
            tag(73, l.dash.length);
            tag(40, l.dash.reduce((a, b) => a + Math.abs(b), 0));
            l.dash.forEach((n, i) => { tag(49, (i % 2 ? -1 : 1) * Math.abs(n)); tag(74, 0); });
        }
    });
    table('LAYER', doc.layers.length, () => {
        for (const l of doc.layers) {
            record('LAYER', layerHandles.get(l.name), tables.LAYER, ['AcDbSymbolTableRecord', 'AcDbLayerTableRecord']);
            tag(2, name(l.name));
            tag(70, 0);
            color(l.color || [0, 0, 0], l.visible === false);
            tag(6, 'CONTINUOUS');
            tag(290, 1);
            tag(370, -3);
        }
    });
    table('STYLE', fonts.size, () => {
        for (const f of fonts.values()) {
            record('STYLE', f.handle, tables.STYLE, ['AcDbSymbolTableRecord', 'AcDbTextStyleTableRecord']);
            tag(2, f.name);
            tag(70, 0);
            tag(40, 0);
            tag(41, 1);
            tag(50, 0);
            tag(71, 0);
            tag(42, 2.5);
            tag(3, f.font);
            tag(4, '');
        }
    });
    table('VIEW', 0, () => { });
    table('UCS', 0, () => { });
    table('APPID', appids.length, () => {
        for (const a of appids) {
            record('APPID', a.handle, tables.APPID, ['AcDbSymbolTableRecord', 'AcDbRegAppTableRecord']);
            tag(2, a.name);
            tag(70, 0);
        }
    });
    table('DIMSTYLE', 1, () => { record('DIMSTYLE', dimStyle, tables.DIMSTYLE, ['AcDbSymbolTableRecord', 'AcDbDimStyleTableRecord']); tag(2, 'STANDARD'); tag(70, 0); tag(40, 1); tag(41, 2.5); tag(42, .625); tag(43, 3.75); tag(44, 1.25); tag(140, 2.5); tag(147, .625); tag(340, fonts.get('STANDARD').handle); });
    table('BLOCK_RECORD', blockHandles.size, () => {
        for (const [k, handle] of blockHandles) {
            record('BLOCK_RECORD', handle, tables.BLOCK_RECORD, ['AcDbSymbolTableRecord', 'AcDbBlockTableRecord']);
            tag(2, blockName(k));
            if (k === '*Model_Space')
                tag(340, modelLayout);
            else if (k === '*Paper_Space')
                tag(340, paperLayout);
            tag(70, UNIT_CODES[doc.units] ?? 0);
            tag(280, 1);
            tag(281, 0);
        }
    });
    tag(0, 'ENDSEC');
    // BLOCK definitions and ownership.
    tag(0, 'SECTION');
    tag(2, 'BLOCKS');
    for (const [k, owner] of blockHandles) {
        const b = doc.blocks.find(b => b.name === k);
        record('BLOCK', blockBegin.get(k), owner, ['AcDbEntity']);
        tag(8, '0');
        tag(100, 'AcDbBlockBegin');
        tag(2, blockName(k));
        tag(70, k.startsWith('*D') ? 1 : 0);
        pt(10, b?.origin || [0, 0]);
        tag(3, blockName(k));
        tag(1, '');
        if (b)
            for (const e of b.entities)
                emitEntity(e, owner);
        record('ENDBLK', blockEnd.get(k), owner, ['AcDbEntity']);
        tag(8, '0');
        tag(100, 'AcDbBlockEnd');
    }
    tag(0, 'ENDSEC');
    tag(0, 'SECTION');
    tag(2, 'ENTITIES');
    for (const e of doc.entities)
        emitEntity(e, modelRecord);
    tag(0, 'ENDSEC');
    // Root dictionaries, selectable semantic GROUPs, and real layout records.
    tag(0, 'SECTION');
    tag(2, 'OBJECTS');
    record('DICTIONARY', root, '0', ['AcDbDictionary']);
    tag(281, 1);
    tag(3, 'ACAD_GROUP');
    tag(350, groupDict);
    tag(3, 'ACAD_LAYOUT');
    tag(350, layoutDict);
    record('DICTIONARY', groupDict, root, ['AcDbDictionary']);
    tag(281, 1);
    for (const g of doc.groups) {
        tag(3, name(g.name));
        tag(350, groupHandles.get(g.name));
    }
    record('DICTIONARY', layoutDict, root, ['AcDbDictionary']);
    tag(281, 1);
    tag(3, 'Model');
    tag(350, modelLayout);
    tag(3, 'Layout1');
    tag(350, paperLayout);
    const ext = (0, model_1.documentBox)(doc);
    function layout(handle, label, order, block) {
        record('LAYOUT', handle, layoutDict, ['AcDbPlotSettings']);
        tag(1, '');
        tag(2, '');
        tag(4, '');
        tag(6, '');
        for (const c of [40, 41, 42, 43, 46, 47, 48, 49])
            tag(c, 0);
        tag(44, doc.pageBox[2]);
        tag(45, doc.pageBox[3]);
        tag(140, doc.pageBox[2]);
        tag(141, doc.pageBox[3]);
        tag(142, 1);
        tag(143, 1);
        tag(70, order ? 0 : 1024);
        tag(72, 1);
        tag(73, 0);
        tag(74, 5);
        tag(7, '');
        tag(75, 16);
        tag(76, 0);
        tag(77, 2);
        tag(78, 300);
        tag(147, 1);
        tag(148, 0);
        tag(149, 0);
        tag(100, 'AcDbLayout');
        tag(1, label);
        tag(70, 1);
        tag(71, order);
        pt(10, [0, 0], false);
        pt(11, [doc.pageBox[2], doc.pageBox[3]], false);
        pt(12, [0, 0]);
        pt(14, [ext[0], ext[1]]);
        pt(15, [ext[2], ext[3]]);
        tag(146, 0);
        pt(13, [0, 0]);
        pt(16, [1, 0]);
        pt(17, [0, 1]);
        tag(76, 0);
        tag(330, block);
    }
    layout(modelLayout, 'Model', 0, modelRecord);
    layout(paperLayout, 'Layout1', 1, paperRecord);
    for (const g of doc.groups) {
        record('GROUP', groupHandles.get(g.name), groupDict, ['AcDbGroup']);
        tag(300, g.description || 'Recovered semantic group');
        tag(70, 0);
        tag(71, 1);
        for (const id of g.members)
            if (handles.has(id))
                tag(340, handles.get(id));
    }
    tag(0, 'ENDSEC');
    tag(0, 'EOF');
    const body = current;
    current = [];
    tag(0, 'SECTION');
    tag(2, 'HEADER');
    tag(9, '$ACADVER');
    tag(1, model_1.DXF_VERSIONS[version]);
    tag(9, '$ACADMAINTVER');
    tag(70, 0);
    tag(9, '$DWGCODEPAGE');
    tag(3, 'ANSI_1252');
    tag(9, '$HANDSEED');
    tag(5, next.toString(16).toUpperCase());
    tag(9, '$INSBASE');
    pt(10, [0, 0]);
    tag(9, '$EXTMIN');
    pt(10, [ext[0], ext[1]]);
    tag(9, '$EXTMAX');
    pt(10, [ext[2], ext[3]]);
    tag(9, '$LIMMIN');
    pt(10, [0, 0], false);
    tag(9, '$LIMMAX');
    pt(10, [doc.pageBox[2], doc.pageBox[3]], false);
    tag(9, '$INSUNITS');
    tag(70, UNIT_CODES[doc.units] ?? 0);
    tag(9, '$MEASUREMENT');
    tag(70, doc.units === 'in' ? 0 : 1);
    tag(9, '$LUNITS');
    tag(70, 2);
    tag(9, '$LUPREC');
    tag(70, 4);
    tag(9, '$AUNITS');
    tag(70, 0);
    tag(9, '$AUPREC');
    tag(70, 4);
    tag(9, '$TILEMODE');
    tag(70, 1);
    tag(9, '$LTSCALE');
    tag(40, 1);
    tag(9, '$PSLTSCALE');
    tag(70, 0);
    tag(9, '$FILLMODE');
    tag(70, 1);
    tag(9, '$CLAYER');
    tag(8, '0');
    tag(0, 'ENDSEC');
    const text = current.concat(body).join('\r\n') + '\r\n';
    return { text, version, acadVersion: model_1.DXF_VERSIONS[version], diagnostics, entityCount: doc.entities.length, handleCount: next - 0x100 };
}
function writeDxf(doc, options) { return exportDxf(doc, options).text; }

},
"@revector/engine":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversionWorker = exports.convertPdf = exports.convertScene = exports.ConversionEngine = exports.DEFAULT_CONVERSION_OPTIONS = exports.CAD_PROFILES = void 0;
const pdf_1 = require("@revector/pdf");
const cad_1 = require("@revector/cad");
Object.defineProperty(exports, "DEFAULT_CONVERSION_OPTIONS", { enumerable: true, get: function () { return cad_1.DEFAULT_CONVERSION_OPTIONS; } });
const semantics_1 = require("@revector/semantics");
const rules_cad_1 = require("@revector/rules-cad");
Object.defineProperty(exports, "CAD_PROFILES", { enumerable: true, get: function () { return rules_cad_1.CAD_PROFILES; } });
const dxf_1 = require("@revector/dxf");
const model_1 = require("@revector/model");
/** No browser, renderer, persistence, or framework dependency in the conversion core. */
class ConversionEngine {
    constructor({ rules = rules_cad_1.cadRules } = {}) { this.rules = [...rules]; }
    register(rule) {
        if (this.rules.some(r => r.id === rule.id))
            throw Error(`Duplicate rule ${rule.id}`);
        this.rules.push(rule);
        return this;
    }
    async convertScene(scene, options = {}) {
        if (options.profile && !Object.hasOwn(rules_cad_1.CAD_PROFILES, options.profile))
            throw new RangeError('Unsupported conversion profile: ' + options.profile);
        const settings = { ...cad_1.DEFAULT_CONVERSION_OPTIONS, ...rules_cad_1.CAD_PROFILES[options.profile || 'cad'], version: '2018', ...options };
        const start = performance.now(), times = {};
        let mark = start;
        const checkpoint = name => { const now = performance.now(); times[name] = now - mark; mark = now; };
        (0, model_1.checkAbort)(settings.signal);
        let document = await (0, cad_1.lowerScene)(scene, settings);
        checkpoint('geometryMs');
        const rules = new semantics_1.RuleEngine();
        for (const r of this.rules)
            rules.register(r);
        for (const r of options.ruleSet ? (0, semantics_1.compileRuleSet)(options.ruleSet) : [])
            rules.register(r);
        document = await rules.run(document, settings);
        checkpoint('semanticsMs');
        (0, model_1.checkAbort)(settings.signal);
        const validation = (0, model_1.validateDocument)(document);
        if (!validation.valid)
            throw Error('Conversion model failed validation: ' + validation.errors.join('; '));
        options.onProgress?.({ phase: 'serialize', done: 0, total: 1 });
        const dxf = (0, dxf_1.exportDxf)(document, { version: settings.version, precision: settings.precision, strict: settings.strict });
        checkpoint('serializeMs');
        // The preview must describe the actual file, not an optimistic pre-serialization model.
        const preview = (0, dxf_1.readDxf)(dxf.text);
        preview.pageBox = [...document.pageBox];
        preview.source = document.source;
        preview.name = document.name;
        const roundtripValidation = (0, model_1.validateDocument)(preview);
        if (!roundtripValidation.valid)
            throw new Error('Serialized DXF failed round-trip validation: ' + roundtripValidation.errors.join('; '));
        checkpoint('roundtripMs');
        const report = { schema: 'revector.report/1', version: '0.1.0', source: document.source, target: { version: dxf.version, acadVersion: dxf.acadVersion, units: document.units }, summary: (0, model_1.summary)(document), producer: (0, rules_cad_1.detectProducerProfile)(scene.source), diagnostics: [...document.diagnostics, ...dxf.diagnostics, ...preview.diagnostics], rules: document.ruleStats || [], timings: { ...times, totalMs: performance.now() - start }, coverage: { paintItems: scene.items.length, vectorPaths: scene.items.filter(i => i.kind === 'path').length, textRuns: scene.items.filter(i => i.kind === 'text').length, forms: scene.forms.length, rasterItems: scene.items.filter(i => i.kind === 'image').length, shadings: scene.items.filter(i => i.kind === 'shading').length }, validation: { model: validation, roundtrip: roundtripValidation } };
        options.onProgress?.({ phase: 'complete', done: 1, total: 1 });
        return { document, preview, dxf, report };
    }
    async convertPdf(bytes, options = {}) {
        const source = await pdf_1.PdfSource.open(bytes, options);
        try {
            const scene = await source.extract(options.page || 1, options);
            return { ...await this.convertScene(scene, options), scene };
        }
        finally {
            await source.dispose();
        }
    }
}
exports.ConversionEngine = ConversionEngine;
const convertScene = (scene, options) => new ConversionEngine().convertScene(scene, options);
exports.convertScene = convertScene;
const convertPdf = (bytes, options) => new ConversionEngine().convertPdf(bytes, options);
exports.convertPdf = convertPdf;
/** One conversion per worker. Hard termination makes cancellation independent of kernel yielding. */
class ConversionWorker {
    constructor(url) { this.url = url; this.worker = null; this.pending = null; this.sequence = 0; }
    cancel() { this.worker?.terminate(); this.worker = null; this.pending?.(Object.assign(new Error('Conversion cancelled'), { name: 'AbortError' })); this.pending = null; }
    convert(scene, options = {}, { signal, onProgress } = {}) {
        this.cancel();
        (0, model_1.checkAbort)(signal);
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
exports.ConversionWorker = ConversionWorker;

},
"@revector/engine/worker.js":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = require("@revector/engine");
self.onmessage = async ({ data: { id, scene, options } }) => {
    try {
        const result = await (0, engine_1.convertScene)(scene, { ...options, onProgress: progress => self.postMessage({ id, kind: 'progress', progress }) });
        self.postMessage({ id, kind: 'result', result });
    }
    catch (error) {
        self.postMessage({ id, kind: 'error', error: { name: error.name, message: error.message, stack: error.stack } });
    }
};

},
"@revector/geometry/boolean.js":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intersectEdges = intersectEdges;
exports.pathWinding = pathWinding;
exports.insidePaths = insidePaths;
exports.clipCurveToPaths = clipCurveToPaths;
exports.booleanPaths = booleanPaths;
const geometry_1 = require("@revector/geometry");
const point = (e, t) => e.kind === 'L' ? (0, geometry_1.lerp)(...e.points, t) : (0, geometry_1.cubicPoint)(e.points, t);
function derivative(e, t) {
    if (e.kind === 'L')
        return (0, geometry_1.sub)(e.points[1], e.points[0]);
    const p = e.points, u = 1 - t;
    return [3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]), 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1])];
}
const bounds = e => {
    if (e.kind === 'C')
        return (0, geometry_1.cubicBox)(e.points);
    const b = (0, geometry_1.emptyBox)();
    e.points.forEach(p => (0, geometry_1.extend)(b, p));
    return b;
};
const power = v => [-v[0] + 3 * v[1] - 3 * v[2] + v[3], 3 * v[0] - 6 * v[1] + 3 * v[2], -3 * v[0] + 3 * v[1], v[0]];
function uniqueRoots(roots, tol = 1e-8) { return roots.sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((v, i, a) => !i || Math.abs(v[0] - a[i - 1][0]) > tol || Math.abs(v[1] - a[i - 1][1]) > tol); }
/** Returns parameter pairs, not a polygonal approximation of the source curves. */
function intersectEdges(a, b, { tolerance = 1e-8, maxSubdivisions = 20000 } = {}) {
    const tol = tolerance;
    if (!(0, geometry_1.intersects)(bounds(a), bounds(b)))
        return [];
    if (a.kind === 'L' && b.kind === 'L') {
        const p = a.points[0], q = b.points[0], r = (0, geometry_1.sub)(a.points[1], p), s = (0, geometry_1.sub)(b.points[1], q), den = (0, geometry_1.cross)(r, s), qp = (0, geometry_1.sub)(q, p), rr = (0, geometry_1.dot)(r, r), ss = (0, geometry_1.dot)(s, s);
        if (rr < tol * tol || ss < tol * tol)
            return [];
        if (Math.abs(den) > tol * Math.max((0, geometry_1.length)(r), (0, geometry_1.length)(s))) {
            const t = (0, geometry_1.cross)(qp, s) / den, u = (0, geometry_1.cross)(qp, r) / den;
            return t >= -tol && t <= 1 + tol && u >= -tol && u <= 1 + tol ? [[Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))]] : [];
        }
        if (Math.abs((0, geometry_1.cross)(qp, r)) > tol * (0, geometry_1.length)(r))
            return [];
        const roots = [];
        for (const t of [0, 1]) {
            const u = (0, geometry_1.dot)((0, geometry_1.sub)(point(a, t), q), s) / ss;
            if (u >= -tol && u <= 1 + tol)
                roots.push([t, Math.max(0, Math.min(1, u))]);
        }
        for (const u of [0, 1]) {
            const t = (0, geometry_1.dot)((0, geometry_1.sub)(point(b, u), p), r) / rr;
            if (t >= -tol && t <= 1 + tol)
                roots.push([Math.max(0, Math.min(1, t)), u]);
        }
        return uniqueRoots(roots);
    }
    if (a.kind === 'L')
        return intersectEdges(b, a, { tolerance, maxSubdivisions }).map(([t, u]) => [u, t]);
    if (b.kind === 'L') {
        const q = b.points[0], d = (0, geometry_1.sub)(b.points[1], q), dd = (0, geometry_1.dot)(d, d);
        if (dd < tol * tol)
            return [];
        const values = a.points.map(p => (0, geometry_1.cross)(d, (0, geometry_1.sub)(p, q))), scale = Math.max(...values.map(Math.abs), 1), coeff = power(values).map(x => x / scale), roots = [];
        for (const t of (0, geometry_1.polynomialRoots01)(coeff, Math.min(1e-11, tol * .01))) {
            const u = (0, geometry_1.dot)((0, geometry_1.sub)(point(a, t), q), d) / dd;
            if (u >= -tol && u <= 1 + tol)
                roots.push([t, Math.max(0, Math.min(1, u))]);
        }
        return uniqueRoots(roots);
    }
    if (a.points.every((p, i) => (0, geometry_1.near)(p, b.points[i], tol)))
        return [[0, 0], [1, 1]];
    if (a.points.every((p, i) => (0, geometry_1.near)(p, b.points[3 - i], tol)))
        return [[0, 1], [1, 0]];
    const stack = [{ a: a.points, b: b.points, ta: 0, tb: 1, ua: 0, ub: 1, depth: 0 }], roots = [];
    let iterations = 0;
    while (stack.length) {
        if (++iterations > maxSubdivisions)
            throw new RangeError('Bezier intersection subdivision budget exceeded; coincident curves require review.');
        const n = stack.pop(), ba = (0, geometry_1.cubicBox)(n.a), bb = (0, geometry_1.cubicBox)(n.b);
        if (!(0, geometry_1.intersects)([ba[0] - tol, ba[1] - tol, ba[2] + tol, ba[3] + tol], bb))
            continue;
        const sizeA = Math.max(ba[2] - ba[0], ba[3] - ba[1]), sizeB = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
        if (n.depth > 44 || (Math.max(sizeA, sizeB) < tol * 4) || ((n.tb - n.ta) < 1e-9 && (n.ub - n.ua) < 1e-9)) {
            let t = (n.ta + n.tb) / 2, u = (n.ua + n.ub) / 2;
            for (let i = 0; i < 12; i++) {
                const f = (0, geometry_1.sub)(point(a, t), point(b, u)), da = derivative(a, t), db = derivative(b, u), det = (0, geometry_1.cross)(da, db);
                if (Math.abs(det) < 1e-20)
                    break;
                const dt = -(0, geometry_1.cross)(f, db) / det, du = -(0, geometry_1.cross)(f, da) / det;
                const nt = t + dt, nu = u + du;
                if (nt < -.001 || nt > 1.001 || nu < -.001 || nu > 1.001)
                    break;
                t = Math.max(0, Math.min(1, nt));
                u = Math.max(0, Math.min(1, nu));
                if (Math.abs(dt) + Math.abs(du) < 1e-13)
                    break;
            }
            if ((0, geometry_1.distance)(point(a, t), point(b, u)) <= tol * 8)
                roots.push([t, u]);
            continue;
        }
        if (sizeA * (n.tb - n.ta) >= sizeB * (n.ub - n.ua)) {
            const [l, r] = (0, geometry_1.splitCubic)(n.a, .5), m = (n.ta + n.tb) / 2;
            stack.push({ ...n, a: l, tb: m, depth: n.depth + 1 }, { ...n, a: r, ta: m, depth: n.depth + 1 });
        }
        else {
            const [l, r] = (0, geometry_1.splitCubic)(n.b, .5), m = (n.ua + n.ub) / 2;
            stack.push({ ...n, b: l, ub: m, depth: n.depth + 1 }, { ...n, b: r, ua: m, depth: n.depth + 1 });
        }
    }
    return uniqueRoots(roots, 1e-6);
}
/** Exact polynomial ray tests, using half-open crossings to avoid vertex double counts. */
function pathWinding(p, paths) {
    let winding = 0;
    for (const path of paths)
        for (const e of (0, geometry_1.pathEdges)({ ...path, closed: true })) {
            if (e.kind === 'L') {
                const [a, b] = e.points;
                if (a[1] <= p[1] && b[1] > p[1] && (0, geometry_1.cross)((0, geometry_1.sub)(b, a), (0, geometry_1.sub)(p, a)) > 0)
                    winding++;
                else if (a[1] > p[1] && b[1] <= p[1] && (0, geometry_1.cross)((0, geometry_1.sub)(b, a), (0, geometry_1.sub)(p, a)) < 0)
                    winding--;
            }
            else {
                const v = e.points.map(q => q[1] - p[1]);
                const scale = Math.max(1, ...v.map(Math.abs));
                for (const t of (0, geometry_1.polynomialRoots01)(power(v).map(x => x / scale))) {
                    if (t >= 1 - 1e-9)
                        continue;
                    const q = point(e, t);
                    if (q[0] <= p[0])
                        continue;
                    const dy = derivative(e, t)[1];
                    if (Math.abs(dy) > 1e-9)
                        winding += Math.sign(dy);
                    else {
                        const eps = 1e-5, y0 = point(e, Math.max(0, t - eps))[1] - p[1], y1 = point(e, Math.min(1, t + eps))[1] - p[1];
                        if (y0 * y1 < 0)
                            winding += Math.sign(y1 - y0);
                    }
                }
            }
        }
    return winding;
}
function insidePaths(p, paths, rule = 'nonzero') { const w = pathWinding(p, paths); return rule === 'evenodd' ? Math.abs(w) % 2 === 1 : w !== 0; }
function edgePart(e, a, b) { return { kind: e.kind, points: e.kind === 'L' ? [point(e, a), point(e, b)] : (0, geometry_1.subCubic)(e.points, a, b) }; }
function reverseEdge(e) { return { kind: e.kind, points: [...e.points].reverse() }; }
function clipCurveToPaths(edge, paths, rule = 'nonzero', options = {}) {
    const ts = [0, 1];
    for (const p of paths)
        for (const other of (0, geometry_1.pathEdges)({ ...p, closed: true }))
            for (const [t] of intersectEdges(edge, other, options))
                ts.push(t);
    ts.sort((a, b) => a - b);
    const cuts = ts.filter((t, i) => !i || t - ts[i - 1] > 1e-9), out = [];
    for (let i = 1; i < cuts.length; i++)
        if (insidePaths(point(edge, (cuts[i] + cuts[i - 1]) / 2), paths, rule))
            out.push(edgePart(edge, cuts[i - 1], cuts[i]));
    return out;
}
function edgeToSegment(e) { return e.kind === 'L' ? { kind: 'L', to: e.points[1] } : { kind: 'C', c1: e.points[1], c2: e.points[2], to: e.points[3] }; }
/**
 * Arrangement-based boolean over lines and polynomial cubic curves.
 * Intersection locations use double precision + subdivision/Newton refinement;
 * output curves remain analytic cubics (de Casteljau), never tessellated polylines.
 * Ambiguous/degenerate arrangements throw rather than fabricate geometry.
 */
function booleanPaths(subject, clip = [], { operation = 'intersection', subjectRule = 'nonzero', clipRule = 'nonzero', tolerance = 1e-8, maxPairs = 250000 } = {}) {
    const edges = [...subject.flatMap(p => (0, geometry_1.pathEdges)({ ...p, closed: true })), ...clip.flatMap(p => (0, geometry_1.pathEdges)({ ...p, closed: true }))].filter(e => e.kind === 'C' || (0, geometry_1.distance)(...e.points) > tolerance);
    if (!edges.length)
        return [];
    const boxes = edges.map(bounds), cuts = edges.map(() => [0, 1]);
    let pairs = 0;
    // Sweep on min-X; avoids the quadratic empty-pair scan of naive booleans.
    const order = edges.map((_, i) => i).sort((a, b) => boxes[a][0] - boxes[b][0]);
    const active = [];
    for (const i of order) {
        for (let k = active.length - 1; k >= 0; k--)
            if (boxes[active[k]][2] < boxes[i][0] - tolerance)
                active.splice(k, 1);
        for (const j of active) {
            if (!(0, geometry_1.intersects)(boxes[i], boxes[j]))
                continue;
            if (++pairs > maxPairs)
                throw new RangeError('Vector boolean intersection budget exceeded');
            for (const [t, u] of intersectEdges(edges[i], edges[j], { tolerance })) {
                cuts[i].push(t);
                cuts[j].push(u);
            }
        }
        active.push(i);
    }
    const predicate = p => { const a = insidePaths(p, subject, subjectRule), b = insidePaths(p, clip, clipRule); return operation === 'normalize' ? a : operation === 'union' ? a || b : operation === 'difference' ? a && !b : operation === 'xor' ? a !== b : a && b; };
    const kept = [], seen = new Set();
    for (let i = 0; i < edges.length; i++) {
        const ts = cuts[i].sort((a, b) => a - b).filter((t, j, a) => !j || t - a[j - 1] > 1e-9);
        for (let k = 1; k < ts.length; k++) {
            const e = edgePart(edges[i], ts[k - 1], ts[k]), mid = point(e, .5), d = derivative(e, .5), len = (0, geometry_1.length)(d);
            if (len < tolerance)
                continue;
            const scale = Math.max((0, geometry_1.distance)(e.points[0], e.points.at(-1)), 1), offset = Math.max(tolerance * 16, scale * 1e-8), n = [-d[1] / len * offset, d[0] / len * offset];
            let left = predicate((0, geometry_1.add)(mid, n)), right = predicate((0, geometry_1.sub)(mid, n));
            if (left === right)
                continue;
            const oriented = left ? e : reverseEdge(e);
            const key = oriented.kind + oriented.points.map(p => p.map(x => Math.round(x / (tolerance * 8))).join(',')).join(';');
            if (seen.has(key))
                continue;
            seen.add(key);
            kept.push(oriented);
        }
    }
    const result = [], used = new Set(), matchTolerance = tolerance * 64;
    const bucketKey = p => p.map(x => Math.round(x / matchTolerance)).join(',');
    const starts = new Map();
    kept.forEach((e, i) => {
        const key = bucketKey(e.points[0]);
        if (!starts.has(key))
            starts.set(key, []);
        starts.get(key).push(i);
    });
    const neighbors = p => {
        const [x, y] = p.map(x => Math.round(x / matchTolerance)), out = [];
        for (let i = -1; i <= 1; i++)
            for (let j = -1; j <= 1; j++)
                for (const n of starts.get(`${x + i},${y + j}`) || [])
                    if (!used.has(n) && (0, geometry_1.distance)(p, kept[n].points[0]) <= matchTolerance)
                        out.push(n);
        return out;
    };
    for (let first = 0; first < kept.length; first++) {
        if (used.has(first))
            continue;
        const loop = [], start = kept[first].points[0];
        let index = first;
        for (let guard = 0; guard <= kept.length; guard++) {
            if (used.has(index))
                throw new Error('Ambiguous vector-boolean boundary');
            const e = kept[index];
            used.add(index);
            loop.push(e);
            const end = e.points.at(-1);
            if ((0, geometry_1.distance)(end, start) <= matchTolerance)
                break;
            const next = neighbors(end);
            if (!next.length)
                throw new Error('Open vector-boolean boundary; export requires review');
            const tangent = derivative(e, 1);
            next.sort((a, b) => { const da = derivative(kept[a], 0), db = derivative(kept[b], 0); return Math.atan2((0, geometry_1.cross)(tangent, da), (0, geometry_1.dot)(tangent, da)) - Math.atan2((0, geometry_1.cross)(tangent, db), (0, geometry_1.dot)(tangent, db)); });
            index = next[0];
        }
        if ((0, geometry_1.distance)(loop.at(-1).points.at(-1), start) > matchTolerance)
            throw new Error('Vector-boolean boundary did not close');
        result.push({ start: [...start], segments: loop.map(edgeToSegment), closed: true });
    }
    return result;
}

},
"@revector/geometry":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.booleanPaths = exports.clipCurveToPaths = exports.insidePaths = exports.pathWinding = exports.intersectEdges = exports.containsBox = exports.contains = exports.intersects = exports.validBox = exports.near = exports.lerp = exports.distance = exports.length = exports.cross = exports.dot = exports.mul = exports.sub = exports.add = exports.I = exports.EPS = void 0;
exports.finitePoint = finitePoint;
exports.transform = transform;
exports.vector = vector;
exports.compose = compose;
exports.inverse = inverse;
exports.similarity = similarity;
exports.decomposeInsert = decomposeInsert;
exports.insertMatrix = insertMatrix;
exports.emptyBox = emptyBox;
exports.extend = extend;
exports.union = union;
exports.transformBox = transformBox;
exports.cubicPoint = cubicPoint;
exports.splitCubic = splitCubic;
exports.subCubic = subCubic;
exports.polynomialRoots01 = polynomialRoots01;
exports.cubicBox = cubicBox;
exports.pathBox = pathBox;
exports.mapPaths = mapPaths;
exports.rectPath = rectPath;
exports.pathEdges = pathEdges;
exports.pointSegmentDistance = pointSegmentDistance;
exports.flattenCubic = flattenCubic;
exports.flattenPath = flattenPath;
exports.polygonArea = polygonArea;
exports.windingNumber = windingNumber;
exports.insidePolygons = insidePolygons;
exports.clipEdge = clipEdge;
exports.convexPolygon = convexPolygon;
exports.clipPolygon = clipPolygon;
exports.pathPolygons = pathPolygons;
exports.circleThrough = circleThrough;
exports.inferCircle = inferCircle;
exports.stableHash = stableHash;
/** Exact-primitive geometry. Display tessellation is deliberately separate from export. */
exports.EPS = 1e-10;
exports.I = Object.freeze([1, 0, 0, 1, 0, 0]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
exports.add = add;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
exports.sub = sub;
const mul = (a, s) => [a[0] * s, a[1] * s];
exports.mul = mul;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
exports.dot = dot;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
exports.cross = cross;
const length = a => Math.hypot(...a);
exports.length = length;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
exports.distance = distance;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
exports.lerp = lerp;
const near = (a, b, t = exports.EPS) => (0, exports.distance)(a, b) <= t;
exports.near = near;
function finitePoint(p) { return p?.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]); }
function transform(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
function vector(m, p) { return [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]]; }
/** Column vectors: compose(a,b) applies b first, then a. */
function compose(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
function inverse(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(d) < 1e-18)
        throw new RangeError('Singular affine matrix');
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}
function similarity(m, tol = 1e-9) { const x = [m[0], m[1]], y = [m[2], m[3]], sx = (0, exports.length)(x), sy = (0, exports.length)(y); return sx > exports.EPS && Math.abs((0, exports.dot)(x, y)) <= tol * sx * sy && Math.abs(sx - sy) <= tol * Math.max(sx, sy); }
function decomposeInsert(m, tol = 1e-9) {
    const sx = Math.hypot(m[0], m[1]);
    if (sx < exports.EPS)
        return null;
    const sy = (m[0] * m[3] - m[1] * m[2]) / sx;
    if (Math.abs(m[0] * m[2] + m[1] * m[3]) > tol * sx * Math.hypot(m[2], m[3]))
        return null;
    return { position: [m[4], m[5]], scale: [sx, sy], rotation: Math.atan2(m[1], m[0]) * 180 / Math.PI };
}
function insertMatrix(e) { const a = (e.rotation || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), [x, y] = e.scale || [1, 1]; return [c * x, s * x, -s * y, c * y, ...e.position]; }
function emptyBox() { return [Infinity, Infinity, -Infinity, -Infinity]; }
function extend(b, p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); return b; }
function union(a, b) {
    if (!(0, exports.validBox)(b))
        return a;
    extend(a, [b[0], b[1]]);
    extend(a, [b[2], b[3]]);
    return a;
}
const validBox = b => b?.length === 4 && b.every(Number.isFinite) && b[2] >= b[0] && b[3] >= b[1];
exports.validBox = validBox;
const intersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
exports.intersects = intersects;
const contains = (b, p, t = 0) => p[0] >= b[0] - t && p[0] <= b[2] + t && p[1] >= b[1] - t && p[1] <= b[3] + t;
exports.contains = contains;
const containsBox = (a, b, t = 0) => (0, exports.contains)(a, [b[0], b[1]], t) && (0, exports.contains)(a, [b[2], b[3]], t);
exports.containsBox = containsBox;
function transformBox(b, m) {
    const out = emptyBox();
    for (const p of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]])
        extend(out, transform(m, p));
    return out;
}
function cubicPoint(p, t) { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; }
function splitCubic(p, t) { const a = (0, exports.lerp)(p[0], p[1], t), b = (0, exports.lerp)(p[1], p[2], t), c = (0, exports.lerp)(p[2], p[3], t), d = (0, exports.lerp)(a, b, t), e = (0, exports.lerp)(b, c, t), f = (0, exports.lerp)(d, e, t); return [[p[0], a, d, f], [f, e, c, p[3]]]; }
function subCubic(p, t0, t1) {
    if (t0 <= exports.EPS && t1 >= 1 - exports.EPS)
        return p.map(p => [...p]);
    const left = splitCubic(p, t1)[0];
    return t0 <= exports.EPS ? left : splitCubic(left, t0 / t1)[1];
}
/** Real roots in [0,1], isolated by derivative extrema; tangencies are retained. */
function polynomialRoots01(coeff, tol = 1e-11) {
    let c = [...coeff];
    while (c.length > 1 && Math.abs(c[0]) < tol)
        c.shift();
    const n = c.length - 1;
    if (n <= 0)
        return [];
    if (n === 1) {
        const x = -c[1] / c[0];
        return x >= -tol && x <= 1 + tol ? [Math.min(1, Math.max(0, x))] : [];
    }
    const evalAt = t => c.reduce((v, x) => v * t + x, 0), d = c.slice(0, -1).map((x, i) => x * (n - i));
    const points = [0, ...polynomialRoots01(d, tol), 1].sort((a, b) => a - b), out = [];
    for (const t of points)
        if (Math.abs(evalAt(t)) <= tol)
            out.push(t);
    for (let i = 1; i < points.length; i++) {
        let a = points[i - 1], b = points[i], fa = evalAt(a), fb = evalAt(b);
        if (fa * fb >= 0)
            continue;
        for (let j = 0; j < 60 && b - a > tol; j++) {
            const m = (a + b) / 2, f = evalAt(m);
            if (fa * f <= 0) {
                b = m;
                fb = f;
            }
            else {
                a = m;
                fa = f;
            }
        }
        out.push((a + b) / 2);
    }
    return [...new Set(out.map(x => Math.round(x / tol) * tol))].sort((a, b) => a - b).filter(x => x >= -tol && x <= 1 + tol).map(x => Math.max(0, Math.min(1, x)));
}
function cubicBox(p) {
    const b = emptyBox();
    extend(b, p[0]);
    extend(b, p[3]);
    for (let ax = 0; ax < 2; ax++) {
        const [a, z, c, d] = p.map(v => v[ax]);
        const roots = polynomialRoots01([3 * (-a + 3 * z - 3 * c + d), 6 * (a - 2 * z + c), 3 * (z - a)]);
        for (const t of roots)
            extend(b, cubicPoint(p, t));
    }
    return b;
}
function pathBox(paths) {
    const b = emptyBox();
    for (const p of paths) {
        extend(b, p.start);
        let at = p.start;
        for (const s of p.segments) {
            if (s.kind === 'C')
                union(b, cubicBox([at, s.c1, s.c2, s.to]));
            else
                extend(b, s.to);
            at = s.to;
        }
    }
    return b;
}
function mapPaths(paths, m) { return paths.map(p => ({ ...p, start: transform(m, p.start), segments: p.segments.map(s => s.kind === 'C' ? { ...s, c1: transform(m, s.c1), c2: transform(m, s.c2), to: transform(m, s.to) } : { ...s, to: transform(m, s.to) }) })); }
function rectPath(b) { return { start: [b[0], b[1]], segments: [{ kind: 'L', to: [b[2], b[1]] }, { kind: 'L', to: [b[2], b[3]] }, { kind: 'L', to: [b[0], b[3]] }], closed: true }; }
function pathEdges(path) {
    let p = path.start;
    const edges = [];
    for (const s of path.segments) {
        edges.push(s.kind === 'C' ? { kind: 'C', points: [p, s.c1, s.c2, s.to] } : { kind: 'L', points: [p, s.to] });
        p = s.to;
    }
    if (path.closed && !(0, exports.near)(p, path.start))
        edges.push({ kind: 'L', points: [p, path.start] });
    return edges;
}
function pointSegmentDistance(p, a, b) { const v = (0, exports.sub)(b, a), d = (0, exports.dot)(v, v), t = d > exports.EPS ? Math.max(0, Math.min(1, (0, exports.dot)((0, exports.sub)(p, a), v) / d)) : 0; return (0, exports.distance)(p, (0, exports.lerp)(a, b, t)); }
/** Display only; never used by the exact spline exporter. */
function flattenCubic(p, tolerance = 0.1, out = [p[0]], depth = 0) {
    if (depth >= 18 || Math.max(pointSegmentDistance(p[1], p[0], p[3]), pointSegmentDistance(p[2], p[0], p[3])) <= tolerance) {
        out.push(p[3]);
        return out;
    }
    const [a, b] = splitCubic(p, .5);
    flattenCubic(a, tolerance, out, depth + 1);
    flattenCubic(b, tolerance, out, depth + 1);
    return out;
}
function flattenPath(p, tol = .1) {
    const out = [p.start];
    for (const e of pathEdges(p)) {
        if (e.kind === 'C')
            flattenCubic(e.points, tol, out);
        else
            out.push(e.points[1]);
    }
    return out;
}
function polygonArea(p) {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
        a += (0, exports.cross)(p[j], p[i]);
    return a / 2;
}
function windingNumber(p, poly) {
    let w = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i];
        if (pointSegmentDistance(p, a, b) < exports.EPS)
            return Infinity;
        if (a[1] <= p[1]) {
            if (b[1] > p[1] && (0, exports.cross)((0, exports.sub)(b, a), (0, exports.sub)(p, a)) > 0)
                w++;
        }
        else if (b[1] <= p[1] && (0, exports.cross)((0, exports.sub)(b, a), (0, exports.sub)(p, a)) < 0)
            w--;
    }
    return w;
}
function insidePolygons(p, polys, rule = 'nonzero') {
    let w = 0;
    for (const q of polys) {
        const v = windingNumber(p, q);
        if (v === Infinity)
            return true;
        w += v;
    }
    return rule === 'evenodd' ? Math.abs(w) % 2 === 1 : w !== 0;
}
/** Exact line or Bézier clipping against polygon boundaries; retains cubic controls. */
function clipEdge(edge, polys, rule = 'nonzero') {
    const cuts = [0, 1];
    const ps = edge.points;
    for (const poly of polys)
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[j], d = (0, exports.sub)(poly[i], a);
            const v = ps.map(p => (0, exports.cross)(d, (0, exports.sub)(p, a)));
            let roots;
            if (edge.kind === 'L') {
                const div = v[0] - v[1];
                roots = Math.abs(div) > exports.EPS ? [v[0] / div] : [];
            }
            else
                roots = polynomialRoots01([-v[0] + 3 * v[1] - 3 * v[2] + v[3], 3 * v[0] - 6 * v[1] + 3 * v[2], -3 * v[0] + 3 * v[1], v[0]]);
            const len = (0, exports.dot)(d, d);
            for (const t of roots)
                if (t > exports.EPS && t < 1 - exports.EPS) {
                    const p = edge.kind === 'L' ? (0, exports.lerp)(ps[0], ps[1], t) : cubicPoint(ps, t);
                    const u = len > exports.EPS ? (0, exports.dot)((0, exports.sub)(p, a), d) / len : 0;
                    if (u >= -exports.EPS && u <= 1 + exports.EPS)
                        cuts.push(t);
                }
        }
    cuts.sort((a, b) => a - b);
    const unique = cuts.filter((x, i) => i === 0 || x - cuts[i - 1] > 1e-9), out = [];
    for (let i = 1; i < unique.length; i++) {
        const a = unique[i - 1], b = unique[i], m = (a + b) / 2, p = edge.kind === 'L' ? (0, exports.lerp)(ps[0], ps[1], m) : cubicPoint(ps, m);
        if (insidePolygons(p, polys, rule))
            out.push({ kind: edge.kind, points: edge.kind === 'L' ? [(0, exports.lerp)(ps[0], ps[1], a), (0, exports.lerp)(ps[0], ps[1], b)] : subCubic(ps, a, b) });
    }
    return out;
}
function convexPolygon(poly) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length], v = (0, exports.cross)((0, exports.sub)(b, a), (0, exports.sub)(c, b));
        if (Math.abs(v) < exports.EPS)
            continue;
        const s = Math.sign(v);
        if (sign && sign !== s)
            return false;
        sign = s;
    }
    return sign !== 0;
}
/** Sutherland-Hodgman: exact intersections for linear closed paths, convex clip. */
function clipPolygon(subject, clip) {
    let out = subject.map(p => [...p]);
    const sign = Math.sign(polygonArea(clip));
    for (let i = 0, j = clip.length - 1; i < clip.length; j = i++) {
        const a = clip[j], d = (0, exports.sub)(clip[i], a), inside = p => sign * (0, exports.cross)(d, (0, exports.sub)(p, a)) >= -exports.EPS;
        const input = out;
        out = [];
        if (!input.length)
            break;
        for (let k = 0, h = input.length - 1; k < input.length; h = k++) {
            const s = input[h], e = input[k], si = inside(s), ei = inside(e);
            if (si !== ei) {
                const v = (0, exports.sub)(e, s), den = (0, exports.cross)(d, v);
                if (Math.abs(den) > exports.EPS)
                    out.push((0, exports.lerp)(s, e, -(0, exports.cross)(d, (0, exports.sub)(s, a)) / den));
            }
            if (ei)
                out.push(e);
        }
    }
    return out;
}
function pathPolygons(paths) {
    if (paths.some(p => p.segments.some(s => s.kind !== 'L')))
        return null;
    return paths.map(p => [p.start, ...p.segments.map(s => s.to)]);
}
function circleThrough(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < exports.EPS)
        return null;
    const aa = (0, exports.dot)(a, a), bb = (0, exports.dot)(b, b), cc = (0, exports.dot)(c, c), center = [(aa * (b[1] - c[1]) + bb * (c[1] - a[1]) + cc * (a[1] - b[1])) / d, (aa * (c[0] - b[0]) + bb * (a[0] - c[0]) + cc * (b[0] - a[0])) / d];
    return { center, radius: (0, exports.distance)(center, a) };
}
/** A conic hypothesis, NOT an exact identity between a polynomial cubic and circle. */
function inferCircle(paths, tol = 0.00035) {
    if (paths.length !== 1)
        return null;
    const p = paths[0], edges = pathEdges(p);
    if (edges.length !== 4 || edges.some(e => e.kind !== 'C'))
        return null;
    const c = circleThrough(edges[0].points[0], edges[1].points[0], edges[2].points[0]);
    if (!c || c.radius < exports.EPS)
        return null;
    let error = 0;
    for (const e of edges)
        for (let i = 0; i <= 32; i++)
            error = Math.max(error, Math.abs((0, exports.distance)(cubicPoint(e.points, i / 32), c.center) - c.radius));
    if (error > c.radius * tol)
        return null;
    return { ...c, maxError: error, relativeError: error / c.radius };
}
function stableHash(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
var boolean_js_1 = require("@revector/geometry/boolean.js");
Object.defineProperty(exports, "intersectEdges", { enumerable: true, get: function () { return boolean_js_1.intersectEdges; } });
Object.defineProperty(exports, "pathWinding", { enumerable: true, get: function () { return boolean_js_1.pathWinding; } });
Object.defineProperty(exports, "insidePaths", { enumerable: true, get: function () { return boolean_js_1.insidePaths; } });
Object.defineProperty(exports, "clipCurveToPaths", { enumerable: true, get: function () { return boolean_js_1.clipCurveToPaths; } });
Object.defineProperty(exports, "booleanPaths", { enumerable: true, get: function () { return boolean_js_1.booleanPaths; } });

},
"@revector/model":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yieldTask = exports.AbortConversionError = exports.Signal = exports.DXF_VERSIONS = exports.SCENE_SCHEMA = exports.MODEL_SCHEMA = void 0;
exports.createDocument = createDocument;
exports.diagnostic = diagnostic;
exports.ensureLayer = ensureLayer;
exports.allEntities = allEntities;
exports.entityBox = entityBox;
exports.documentBox = documentBox;
exports.entityPaths = entityPaths;
exports.validateDocument = validateDocument;
exports.countTypes = countTypes;
exports.summary = summary;
exports.checkAbort = checkAbort;
const geometry_1 = require("@revector/geometry");
exports.MODEL_SCHEMA = 'revector.cad/1';
exports.SCENE_SCHEMA = 'revector.pdf/1';
exports.DXF_VERSIONS = Object.freeze({ '2000': 'AC1015', '2004': 'AC1018', '2007': 'AC1021', '2010': 'AC1024', '2013': 'AC1027', '2018': 'AC1032' });
function createDocument(options = {}) { return { schema: exports.MODEL_SCHEMA, revision: 0, name: options.name || 'Untitled', units: options.units || 'mm', entities: [], blocks: [], layers: [{ name: '0', color: [210, 220, 230], visible: true }], groups: [], diagnostics: [], candidates: [], history: [], source: {}, pageBox: [0, 0, 297, 210], ...options }; }
function diagnostic(code, message, severity = 'warning', detail = {}) { return { code, message, severity, ...detail }; }
function ensureLayer(doc, name, color = [0, 0, 0], visible = true) {
    let l = doc.layers.find(l => l.name === name);
    if (!l) {
        l = { name, color, visible };
        doc.layers.push(l);
    }
    return l;
}
function allEntities(doc) { return [...doc.entities, ...doc.blocks.flatMap(b => b.entities)]; }
function entityBox(e, doc, seen = new Set()) {
    if (e.bounds && (0, geometry_1.validBox)(e.bounds))
        return [...e.bounds];
    const b = (0, geometry_1.emptyBox)();
    switch (e.type) {
        case 'LINE':
            (0, geometry_1.extend)(b, e.start);
            (0, geometry_1.extend)(b, e.end);
            break;
        case 'LWPOLYLINE':
            for (const p of e.points)
                (0, geometry_1.extend)(b, p);
            break;
        case 'SPLINE':
            if (e.degree === 3 && e.controlPoints.length === 4)
                return (0, geometry_1.cubicBox)(e.controlPoints);
            for (const p of e.controlPoints)
                (0, geometry_1.extend)(b, p);
            break;
        case 'CIRCLE':
        case 'ARC': return [e.center[0] - e.radius, e.center[1] - e.radius, e.center[0] + e.radius, e.center[1] + e.radius];
        case 'ELLIPSE': {
            const r = Math.hypot(...e.major), s = r * e.ratio, ux = e.major[0] / r, uy = e.major[1] / r;
            const x = Math.hypot(r * ux, s * uy), y = Math.hypot(r * uy, s * ux);
            return [e.center[0] - x, e.center[1] - y, e.center[0] + x, e.center[1] + y];
        }
        case 'HATCH': return (0, geometry_1.pathBox)(e.paths);
        case 'SOLID':
            for (const p of e.points)
                (0, geometry_1.extend)(b, p);
            break;
        case 'TEXT':
        case 'MTEXT':
        case 'ATTRIB': {
            const h = e.height || 1, w = e.width || h * .55 * (e.text || '').length, angle = (e.rotation || 0) * Math.PI / 180;
            const m = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), ...e.position];
            return (0, geometry_1.transformBox)([0, -h * .22, w, h], m);
        }
        case 'INSERT': {
            if (seen.has(e.name))
                break;
            const block = doc?.blocks.find(b => b.name === e.name);
            if (block) {
                const next = new Set([...seen, e.name]);
                for (const child of block.entities)
                    (0, geometry_1.union)(b, entityBox(child, doc, next));
                if ((0, geometry_1.validBox)(b)) {
                    const box = (0, geometry_1.transformBox)(b, (0, geometry_1.compose)((0, geometry_1.insertMatrix)(e), [1, 0, 0, 1, -(block.origin?.[0] || 0), -(block.origin?.[1] || 0)]));
                    for (const a of e.attributes || [])
                        (0, geometry_1.union)(box, entityBox({ ...a, type: 'ATTRIB' }, doc));
                    return box;
                }
            }
            break;
        }
        case 'DIMENSION': {
            const block = doc?.blocks.find(b => b.name === e.block);
            if (block)
                for (const c of block.entities)
                    (0, geometry_1.union)(b, entityBox(c, doc, seen));
            break;
        }
    }
    return (0, geometry_1.validBox)(b) ? b : [0, 0, 0, 0];
}
function documentBox(doc) {
    const b = (0, geometry_1.emptyBox)();
    for (const e of doc.entities)
        (0, geometry_1.union)(b, entityBox(e, doc));
    return (0, geometry_1.validBox)(b) ? b : [...doc.pageBox];
}
function entityPaths(e) {
    switch (e.type) {
        case 'LINE': return [{ start: e.start, segments: [{ kind: 'L', to: e.end }], closed: false }];
        case 'LWPOLYLINE': return [{ start: e.points[0], segments: e.points.slice(1).map(to => ({ kind: 'L', to })), closed: !!e.closed }];
        case 'SPLINE':
            if (e.degree === 3 && e.controlPoints.length === 4)
                return [{ start: e.controlPoints[0], segments: [{ kind: 'C', c1: e.controlPoints[1], c2: e.controlPoints[2], to: e.controlPoints[3] }], closed: false }];
            return [];
        case 'HATCH': return e.paths;
        case 'SOLID': return [{ start: e.points[0], segments: e.points.slice(1).map(to => ({ kind: 'L', to })), closed: true }];
        default: return [];
    }
}
function validateDocument(doc) {
    const errors = [];
    const ids = new Set(), blocks = new Map(doc.blocks.map(b => [b.name, b]));
    const layers = new Set(doc.layers.map(l => l.name));
    const check = (v, path) => {
        if (typeof v === 'number' && !Number.isFinite(v))
            errors.push(`${path}: non-finite number`);
        else if (v && typeof v === 'object')
            for (const [k, x] of Object.entries(v))
                check(x, `${path}.${k}`);
    };
    if (blocks.size !== doc.blocks.length)
        errors.push('Duplicate block names');
    if (layers.size !== doc.layers.length)
        errors.push('Duplicate layer names');
    for (const e of allEntities(doc).flatMap(e => [e, ...(e.attributes || [])])) {
        if (!e.id)
            errors.push('Entity has no id');
        else if (ids.has(e.id))
            errors.push(`Duplicate id ${e.id}`);
        ids.add(e.id);
        if (!layers.has(e.layer || '0'))
            errors.push(`Missing layer ${e.layer}`);
        if (e.type === 'INSERT' && !blocks.has(e.name))
            errors.push(`Missing block ${e.name}`);
        if (e.type === 'DIMENSION' && !blocks.has(e.block))
            errors.push(`Missing dimension block ${e.block}`);
        if (e.type === 'SPLINE' && e.knots.length !== e.controlPoints.length + e.degree + 1)
            errors.push(`Invalid spline knot count ${e.id}`);
        check(e, e.id);
    }
    for (const g of doc.groups) {
        for (const id of g.members)
            if (!ids.has(id))
                errors.push(`Group ${g.name} references missing entity ${id}`);
    }
    const visit = (name, stack = new Set()) => {
        if (stack.has(name)) {
            errors.push(`Cyclic block reference ${name}`);
            return;
        }
        const next = new Set([...stack, name]);
        for (const e of blocks.get(name)?.entities || [])
            if (e.type === 'INSERT')
                visit(e.name, next);
    };
    for (const name of blocks.keys())
        visit(name);
    return { valid: !errors.length, errors };
}
function countTypes(doc) {
    const out = {};
    for (const e of doc.entities)
        out[e.type] = (out[e.type] || 0) + 1;
    return out;
}
function summary(doc) { return { entities: doc.entities.length, blockDefinitions: doc.blocks.length, layers: doc.layers.length, types: countTypes(doc), diagnostics: doc.diagnostics.length, accepted: doc.candidates.filter(c => c.status === 'accepted').length, pending: doc.candidates.filter(c => c.status === 'pending').length }; }
class Signal {
    #subscribers = new Set();
    subscribe(fn) { this.#subscribers.add(fn); return () => this.#subscribers.delete(fn); }
    emit(value) {
        for (const fn of this.#subscribers)
            fn(value);
    }
    clear() { this.#subscribers.clear(); }
}
exports.Signal = Signal;
class AbortConversionError extends Error {
    constructor() { super('Conversion cancelled'); this.name = 'AbortError'; }
}
exports.AbortConversionError = AbortConversionError;
function checkAbort(signal) {
    if (signal?.aborted)
        throw new AbortConversionError();
}
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
exports.yieldTask = yieldTask;

},
"@revector/pdf":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfSource = exports.SUPPORTED_PDFJS_VERSIONS = exports.PDFJS_VERSION = exports.DRAW_OPS = exports.OPS = exports.interpretOperators = void 0;
exports.loadPdfJs = loadPdfJs;
const interpreter_js_1 = require("@revector/pdf/interpreter.js");
const model_1 = require("@revector/model");
var interpreter_js_2 = require("@revector/pdf/interpreter.js");
Object.defineProperty(exports, "interpretOperators", { enumerable: true, get: function () { return interpreter_js_2.interpretOperators; } });
var ops_js_1 = require("@revector/pdf/ops.js");
Object.defineProperty(exports, "OPS", { enumerable: true, get: function () { return ops_js_1.OPS; } });
Object.defineProperty(exports, "DRAW_OPS", { enumerable: true, get: function () { return ops_js_1.DRAW_OPS; } });
exports.PDFJS_VERSION = '6.4.172';
exports.SUPPORTED_PDFJS_VERSIONS = Object.freeze(['6.3.289', '6.4.172']);
/** Dependency injection keeps this package usable in browser, Node and native hosts. */
async function loadPdfJs({ moduleUrl, workerUrl } = {}) {
    const lib = moduleUrl ? await globalThis.__revectorImport(moduleUrl) : await globalThis.__revectorImport('pdfjs-dist/build/pdf.mjs');
    if (!exports.SUPPORTED_PDFJS_VERSIONS.includes(lib.version))
        throw new Error(`Expected PDF.js ${exports.PDFJS_VERSION}; received ${lib.version}. Adapter upgrades require contract tests.`);
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
class PdfSource {
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
        (0, model_1.checkAbort)(options.signal);
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
        const vp = page.getViewport({ scale: 1, dontFlip: true });
        const groups = {};
        for (const [id, g] of Object.entries(this.ocgs))
            groups[id] = { name: g.name, visible: g.visible, locked: g.locked };
        const scene = await (0, interpreter_js_1.interpretOperators)(cached.list, { ...options, OPS: this.lib.OPS, pageNumber, box: page.view, pageTransform: vp.transform, userUnit: page.userUnit, rotation: page.rotate, fonts: cached.fonts, ocgs: groups, structure: cached.structure, annotations: cached.annotations, source: { name: this.options.name || this.metadata?.info?.Title || 'PDF document', fingerprints: this.pdf.fingerprints, producer: this.metadata?.info?.Producer || '', creator: this.metadata?.info?.Creator || '', pdfVersion: this.metadata?.info?.PDFFormatVersion || '', ...this.metadata?.info } });
        scene.pageSize = [vp.width, vp.height];
        if (this.pdf.isPureXfa)
            scene.diagnostics.push((0, model_1.diagnostic)('XFA_DOCUMENT', 'Dynamic XFA content is previewed by PDF.js but has no complete DXF conversion mapping.', 'error'));
        return scene;
    }
    async render(pageNumber, canvas, { scale = 1, background = '#ffffff', signal } = {}) {
        (0, model_1.checkAbort)(signal);
        const page = await this.pdf.getPage(pageNumber), viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });
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
    setLayerVisible(id, visible) { this.optionalContent?.setVisibility(id, visible); }
    async outline() { return this.pdf.getOutline(); }
    async attachmentInventory() { const a = await this.pdf.getAttachments(); return Object.entries(a || {}).map(([id, x]) => ({ id, name: x.filename, size: x.content.length })); }
    async dispose() { this.#cache.clear(); await this.task.destroy(); }
}
exports.PdfSource = PdfSource;

},
"@revector/pdf/interpreter.js":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpretOperators = interpretOperators;
const geometry_1 = require("@revector/geometry");
const model_1 = require("@revector/model");
const ops_js_1 = require("@revector/pdf/ops.js");
const clone = x => structuredClone(x);
function rgb(args) {
    const a = args.length === 1 ? args[0] : args;
    if (typeof a === 'string') {
        const v = a.startsWith('#') ? a.slice(1) : '';
        if (v.length === 6)
            return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
        const m = a.match(/[\d.]+/g);
        return m?.length >= 3 ? m.slice(0, 3).map(Number) : [0, 0, 0];
    }
    if (ArrayBuffer.isView(a) || Array.isArray(a)) {
        const v = Array.from(a).slice(0, 3);
        return v.map(x => Math.max(0, Math.min(255, Number(x))));
    }
    return [0, 0, 0];
}
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
function initialState(options) { return { ctm: [...(options.initialTransform || geometry_1.I)], style: { stroke: [0, 0, 0], fill: [0, 0, 0], lineWidth: 1, lineCap: 0, lineJoin: 0, miterLimit: 10, dash: [], dashPhase: 0, strokeAlpha: 1, fillAlpha: 1, blend: 'Normal' }, clips: [], tm: [...geometry_1.I], tlm: [...geometry_1.I], font: '', fontSize: 12, hscale: 1, charSpacing: 0, wordSpacing: 0, leading: 0, rise: 0, textMode: 0, textX: 0, textY: 0, softMask: false, visibility: true }; }
/** Converts an immutable operator-list snapshot to a CAD-neutral paint IR.
 * No CanvasGraphics monkey-patching; no raster reads, OCR, eval, or font export.
 */
async function interpretOperators(operatorList, options = {}) {
    const ops = options.OPS || ops_js_1.OPS, names = new Map(Object.entries(ops).map(([k, v]) => [v, k]));
    const count = operatorList.fnArray.length, maxOps = options.maxOperators ?? 2000000;
    if (count > maxOps)
        throw new RangeError(`Operator budget exceeded: ${count} > ${maxOps}`);
    const scene = { schema: model_1.SCENE_SCHEMA, pageNumber: options.pageNumber || 1, box: options.box || [0, 0, 612, 792], pageTransform: options.pageTransform || [...geometry_1.I], rotation: options.rotation || 0, userUnit: options.userUnit || 1, items: [], forms: [], ocgs: options.ocgs || {}, fonts: options.fonts || {}, patterns: [], diagnostics: [], operatorCount: count, source: options.source || {}, structure: options.structure || null, annotations: options.annotations || [] };
    let state = initialState(options), path = [], at = null, pendingClip = null, opIndex = 0, nextId = 0;
    const stack = [], marked = [], forms = [], groups = [], patternKeys = new Map(), featureKeys = new Set();
    const id = () => `p${scene.pageNumber}-${++nextId}`;
    const report = (code, message, severity = 'warning', detail = {}) => {
        const key = code + ':' + (detail.sourceId || '');
        if (!featureKeys.has(key)) {
            featureKeys.add(key);
            scene.diagnostics.push((0, model_1.diagnostic)(code, message, severity, { page: scene.pageNumber, operator: opIndex, ...detail }));
        }
    };
    const metadata = () => { const oc = [...marked].reverse().find(m => m.tag === 'OC'); const p = oc?.properties; const layerId = typeof p === 'string' ? p : p?.type === 'OCG' ? p.id : p?.ids?.[0] || null; return { operator: opIndex, layerId, visible: state.visibility && marked.every(m => m.visible !== false), formPath: forms.map(f => f.id), markedContent: marked.map(m => ({ tag: m.tag, properties: m.properties })), clips: state.clips.slice(), annotation: state.annotation || null }; };
    const move = p => { at = { start: (0, geometry_1.transform)(state.ctm, p), segments: [], closed: false }; path.push(at); };
    const line = p => {
        if (!at)
            move(p);
        else
            at.segments.push({ kind: 'L', to: (0, geometry_1.transform)(state.ctm, p) });
    };
    const curve = (c1, c2, p) => {
        if (!at)
            move(p);
        else
            at.segments.push({ kind: 'C', c1: (0, geometry_1.transform)(state.ctm, c1), c2: (0, geometry_1.transform)(state.ctm, c2), to: (0, geometry_1.transform)(state.ctm, p) });
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
            if (stroke && !(0, geometry_1.similarity)(state.ctm) && state.style.lineWidth > 0)
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
                    const q = (0, geometry_1.transform)(state.ctm, [data[j++], data[j++]]), end = (0, geometry_1.transform)(state.ctm, [data[j++], data[j++]]), start = at?.segments.at(-1)?.to || at?.start;
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
                const c = (0, geometry_1.transform)(state.ctm, [coords[i++], coords[i++]]), p = (0, geometry_1.transform)(state.ctm, [coords[i++], coords[i++]]);
                if (at)
                    at.segments.push({ kind: 'C', c1: at.segments.at(-1)?.to || at.start, c2: c, to: p });
            }
            else if (name === 'curveTo3') {
                const c = (0, geometry_1.transform)(state.ctm, [coords[i++], coords[i++]]), p = (0, geometry_1.transform)(state.ctm, [coords[i++], coords[i++]]);
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
    function moveText(x, y) { state.tlm = (0, geometry_1.compose)(state.tlm, [1, 0, 0, 1, x, y]); state.tm = [...state.tlm]; state.textX = 0; state.textY = 0; }
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
            const matrix = (0, geometry_1.compose)(state.ctm, (0, geometry_1.compose)(state.tm, [fs * state.hscale, 0, 0, fs, gx, gy]));
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
            const key = (0, geometry_1.stableHash)([ir[3], ir[4], ir[5], ir[6], ir[2]?.fnArray]);
            let index = patternKeys.get(key);
            if (index == null) {
                index = scene.patterns.length;
                patternKeys.set(key, index);
                scene.patterns.push({ id: `pattern-${index}`, raw: ir, baseColor: ir[1], matrix: ir[3] || geometry_1.I, box: ir[4], xStep: ir[5], yStep: ir[6], paintType: ir[7] });
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
            (0, model_1.checkAbort)(options.signal);
            options.onProgress?.({ phase: 'extract', done: opIndex, total: count });
            if (opIndex)
                await (0, model_1.yieldTask)();
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
                state.ctm = (0, geometry_1.compose)(state.ctm, a);
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
                    else if (k === 'TR' || k === 'TR2')
                        report('TRANSFER_FUNCTION', 'PDF transfer function retained only in the source representation.');
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
                    at.segments.push({ kind: 'C', c1: at.segments.at(-1)?.to || at.start, c2: (0, geometry_1.transform)(state.ctm, a.slice(0, 2)), to: (0, geometry_1.transform)(state.ctm, a.slice(2, 4)) });
                break;
            case 'curveTo3':
                if (at) {
                    const p = (0, geometry_1.transform)(state.ctm, a.slice(2, 4));
                    at.segments.push({ kind: 'C', c1: (0, geometry_1.transform)(state.ctm, a.slice(0, 2)), c2: p, to: p });
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
                state.tm = [...geometry_1.I];
                state.tlm = [...geometry_1.I];
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
                    state.ctm = (0, geometry_1.compose)(state.ctm, a[0]);
                const form = { id: `form-${scene.pageNumber}-${scene.forms.length}`, transform: [...state.ctm], box: a[1], start: scene.items.length, parent: forms.at(-1)?.id || null };
                scene.forms.push(form);
                forms.push(form);
                if (a[1])
                    state.clips = [...state.clips, { id: `bbox-${form.id}`, paths: (0, geometry_1.mapPaths)([(0, geometry_1.rectPath)(a[1])], state.ctm), rule: 'nonzero', formBox: true }];
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
                    state.clips = [...state.clips, { id: `group-bbox-${opIndex}`, paths: (0, geometry_1.mapPaths)([(0, geometry_1.rectPath)(g.bbox)], (0, geometry_1.compose)(state.ctm, g.matrix || geometry_1.I)), rule: 'nonzero' }];
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
                    state.clips = [{ id: `annotation-${a[0]}`, paths: [(0, geometry_1.rectPath)(a[1])], rule: 'nonzero' }];
                if (a[2])
                    state.ctm = (0, geometry_1.compose)(state.ctm, a[2]);
                if (a[3])
                    state.ctm = (0, geometry_1.compose)(state.ctm, a[3]);
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
                scene.items.push({ id: id(), kind: 'image', imageType: name, reference: typeof a[0] === 'string' ? a[0] : null, transform: [...state.ctm], width: a[1] || a[0]?.width, height: a[2] || a[0]?.height, ...metadata() });
                report('RASTER_CONTENT', 'Raster/image-mask content is detected but never OCR-processed or vector-traced.', 'warning');
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
            p.scene = await interpretOperators(ir[2], { ...options, pageTransform: geometry_1.I, initialTransform: geometry_1.I, patternDepth: (options.patternDepth || 0) + 1, box: p.box, source: { kind: 'tiling-pattern' } });
        }
        catch (error) {
            report('PATTERN_EXTRACTION', error.message, 'error');
        }
        delete p.raw;
    }
    options.onProgress?.({ phase: 'extract', done: count, total: count });
    return scene;
}

},
"@revector/pdf/ops.js":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRAW_OPS = exports.OPS = void 0;
// PDF.js public OPS values are intentionally stable. The injected engine's OPS
// map is preferred. DrawOPS is the packed path encoding used by PDF.js 5/6.
exports.OPS = Object.freeze({ dependency: 1, setLineWidth: 2, setLineCap: 3, setLineJoin: 4, setMiterLimit: 5, setDash: 6, setRenderingIntent: 7, setFlatness: 8, setGState: 9, save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, clip: 29, eoClip: 30, beginText: 31, endText: 32, setCharSpacing: 33, setWordSpacing: 34, setHScale: 35, setLeading: 36, setFont: 37, setTextRenderingMode: 38, setTextRise: 39, moveText: 40, setLeadingMoveText: 41, setTextMatrix: 42, nextLine: 43, showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47, setCharWidth: 48, setCharWidthAndBounds: 49, setStrokeColorSpace: 50, setFillColorSpace: 51, setStrokeColor: 52, setStrokeColorN: 53, setFillColor: 54, setFillColorN: 55, setStrokeGray: 56, setFillGray: 57, setStrokeRGBColor: 58, setFillRGBColor: 59, setStrokeCMYKColor: 60, setFillCMYKColor: 61, shadingFill: 62, beginInlineImage: 63, beginImageData: 64, endInlineImage: 65, paintXObject: 66, markPoint: 67, markPointProps: 68, beginMarkedContent: 69, beginMarkedContentProps: 70, endMarkedContent: 71, beginCompat: 72, endCompat: 73, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, beginGroup: 76, endGroup: 77, beginAnnotation: 80, endAnnotation: 81, paintImageMaskXObject: 83, paintImageMaskXObjectGroup: 84, paintImageXObject: 85, paintInlineImageXObject: 86, paintInlineImageXObjectGroup: 87, paintImageXObjectRepeat: 88, paintImageMaskXObjectRepeat: 89, paintSolidColorImageMask: 90, constructPath: 91, setStrokeTransparent: 92, setFillTransparent: 93, rawFillPath: 94 });
exports.DRAW_OPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

},
"@revector/renderer":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasViewport = exports.CadRenderer = exports.Camera = void 0;
exports.splinePoint = splinePoint;
exports.linkViewports = linkViewports;
const geometry_1 = require("@revector/geometry");
const model_1 = require("@revector/model");
const topology_1 = require("@revector/topology");
const TAU = Math.PI * 2;
class Camera {
    constructor() { this.center = [0, 0]; this.scale = 1; this.width = 1; this.height = 1; this.changed = new model_1.Signal(); }
    resize(w, h) { this.width = Math.max(1, w); this.height = Math.max(1, h); this.changed.emit(this); }
    set({ center = this.center, scale = this.scale }, notify = true) {
        if (!center.every(Number.isFinite) || !Number.isFinite(scale) || scale <= 0)
            return;
        this.center = [...center];
        this.scale = Math.max(1e-6, Math.min(1e6, scale));
        if (notify)
            this.changed.emit(this);
    }
    get matrix() { return [this.scale, 0, 0, -this.scale, this.width / 2 - this.center[0] * this.scale, this.height / 2 + this.center[1] * this.scale]; }
    screen(p) { return (0, geometry_1.transform)(this.matrix, p); }
    world(p) { return [(p[0] - this.width / 2) / this.scale + this.center[0], (this.height / 2 - p[1]) / this.scale + this.center[1]]; }
    zoomAt(p, factor) { const anchor = this.world(p), s = Math.max(1e-6, Math.min(1e6, this.scale * factor)); this.set({ scale: s, center: [anchor[0] - (p[0] - this.width / 2) / s, anchor[1] + (p[1] - this.height / 2) / s] }); }
    pan(dx, dy) { this.set({ center: [this.center[0] - dx / this.scale, this.center[1] + dy / this.scale] }); }
    fit(box, padding = 30) {
        if (!(0, geometry_1.validBox)(box))
            return;
        this.set({ center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], scale: Math.min(Math.max(20, this.width - padding * 2) / Math.max(1e-9, box[2] - box[0]), Math.max(20, this.height - padding * 2) / Math.max(1e-9, box[3] - box[1])) });
    }
    get viewBox() { const a = this.world([0, this.height]), b = this.world([this.width, 0]); return [...a, ...b]; }
}
exports.Camera = Camera;
function path2d(paths) {
    const path = new Path2D();
    for (const p of paths) {
        path.moveTo(...p.start);
        for (const s of p.segments) {
            if (s.kind === 'C')
                path.bezierCurveTo(...s.c1, ...s.c2, ...s.to);
            else
                path.lineTo(...s.to);
        }
        if (p.closed)
            path.closePath();
    }
    return path;
}
function arcBulge(p, q, bulge, path) {
    if (!bulge) {
        path.lineTo(...q);
        return;
    }
    const dx = q[0] - p[0], dy = q[1] - p[1], chord = Math.hypot(dx, dy);
    if (chord < 1e-12)
        return;
    const cx = (p[0] + q[0]) / 2 - dy * (1 - bulge * bulge) / (4 * bulge), cy = (p[1] + q[1]) / 2 + dx * (1 - bulge * bulge) / (4 * bulge), r = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge)), a = Math.atan2(p[1] - cy, p[0] - cx);
    path.arc(cx, cy, r, a, a + 4 * Math.atan(bulge), bulge < 0);
}
/** Display-only evaluation of a general B-spline. Export always retains original knots/controls. */
function splinePoint(e, t) {
    const p = e.degree, U = e.knots, n = e.controlPoints.length - 1;
    let k = p;
    while (k < n && t >= U[k + 1])
        k++;
    const d = [];
    for (let j = 0; j <= p; j++) {
        const i = k - p + j, w = e.weights?.[i] ?? 1;
        d.push([e.controlPoints[i][0] * w, e.controlPoints[i][1] * w, w]);
    }
    for (let r = 1; r <= p; r++)
        for (let j = p; j >= r; j--) {
            const i = k - p + j, den = U[i + p - r + 1] - U[i], a = den ? (t - U[i]) / den : 0;
            d[j] = d[j].map((v, c) => (1 - a) * d[j - 1][c] + a * v);
        }
    return [d[p][0] / d[p][2], d[p][1] / d[p][2]];
}
function makePath(e) {
    if (e.type === 'CIRCLE' || e.type === 'ARC') {
        const p = new Path2D();
        p.arc(...e.center, e.radius, e.type === 'ARC' ? e.startAngle * Math.PI / 180 : 0, e.type === 'ARC' ? e.endAngle * Math.PI / 180 : TAU);
        return p;
    }
    if (e.type === 'ELLIPSE') {
        const p = new Path2D(), r = Math.hypot(...e.major);
        p.ellipse(...e.center, r, r * e.ratio, Math.atan2(e.major[1], e.major[0]), e.startParam ?? 0, e.endParam ?? TAU);
        return p;
    }
    if (e.type === 'LWPOLYLINE' && e.bulges?.some(Boolean)) {
        const p = new Path2D();
        p.moveTo(...e.points[0]);
        for (let i = 0; i < e.points.length - 1; i++)
            arcBulge(e.points[i], e.points[i + 1], e.bulges[i], p);
        if (e.closed) {
            arcBulge(e.points.at(-1), e.points[0], e.bulges.at(-1), p);
            p.closePath();
        }
        return p;
    }
    if (e.type === 'SPLINE' && !(e.degree === 3 && e.controlPoints.length === 4 && !(e.weights || []).some(w => w !== e.weights[0]))) {
        const p = new Path2D(), a = e.knots[e.degree], b = e.knots[e.controlPoints.length];
        p.moveTo(...splinePoint(e, a));
        for (let i = 1; i <= 256; i++)
            p.lineTo(...splinePoint(e, a + (b - a) * i / 256));
        return p;
    }
    return path2d((0, model_1.entityPaths)(e));
}
function cssColor(rgb, dark) {
    const c = rgb || [0, 0, 0];
    if (dark && c.reduce((s, v) => s + v, 0) < 420)
        return `rgb(${c.map(v => Math.round(135 + v * .65)).join(' ')})`;
    return `rgb(${c.join(' ')})`;
}
function fontFamily(name) {
    if (/cour|mono/i.test(name))
        return '"Courier New", monospace';
    if (/times|serif/i.test(name) && !/sans/i.test(name))
        return '"Times New Roman", serif';
    return 'Arial, Helvetica, sans-serif';
}
/** Retained command renderer; BVH culls offscreen roots, draw order is never sorted by style. */
class CadRenderer {
    constructor() { this.doc = null; this.roots = []; this.commands = new Map(); this.paths = new WeakMap(); this.fontMetrics = new Map(); this.index = new topology_1.SpatialIndex([]); this.hiddenLayers = new Set(); this.dark = true; this.weights = true; this.drawn = 0; }
    setDocument(doc) {
        this.doc = doc;
        this.paths = new WeakMap();
        this.commands.clear();
        this.roots = doc.entities.map((e, index) => ({ e, index, box: (0, model_1.entityBox)(e, doc) }));
        this.index = new topology_1.SpatialIndex(this.roots, r => r.box);
        const blocks = new Map(doc.blocks.map(b => [b.name, b]));
        const expand = (e, m, root, out, depth = 0, inherited = '0') => {
            if (depth > 64)
                return;
            const layer = (e.layer || '0') === '0' ? inherited : e.layer;
            if (e.type === 'INSERT') {
                const b = blocks.get(e.name);
                if (b) {
                    const origin = b.origin || [0, 0];
                    const next = (0, geometry_1.compose)(m, (0, geometry_1.compose)((0, geometry_1.insertMatrix)(e), [1, 0, 0, 1, -origin[0], -origin[1]]));
                    for (const child of b.entities)
                        expand(child, next, root, out, depth + 1, layer);
                }
                for (const a of e.attributes || [])
                    expand({ ...a, type: 'ATTRIB' }, m, root, out, depth + 1, layer);
            }
            else if (e.type === 'DIMENSION') {
                for (const child of blocks.get(e.block)?.entities || [])
                    expand(child, m, root, out, depth + 1, layer);
            }
            else
                out.push({ e, m, root, layer, box: (0, geometry_1.transformBox)((0, model_1.entityBox)(e, doc), m) });
        };
        for (const r of this.roots) {
            const commands = [];
            expand(r.e, geometry_1.I, r.e, commands);
            this.commands.set(r.e.id, commands);
        }
        this.hiddenLayers = new Set(doc.layers.filter(l => l.visible === false).map(l => l.name));
    }
    draw(ctx, camera, { selected = new Set(), ghost = false } = {}) {
        if (!this.doc)
            return;
        const roots = this.index.search(camera.viewBox).sort((a, b) => a.index - b.index);
        this.drawn = 0;
        for (const r of roots) {
            if (this.hiddenLayers.has(r.e.layer))
                continue;
            const selectedRoot = selected.has(r.e.id);
            for (const cmd of this.commands.get(r.e.id) || []) {
                if (this.hiddenLayers.has(cmd.layer))
                    continue;
                this.drawCommand(ctx, cmd, camera, selectedRoot, ghost);
                this.drawn++;
            }
        }
    }
    drawCommand(ctx, cmd, camera, selected, ghost) {
        const { e, m } = cmd, scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
        ctx.save();
        ctx.transform(...m);
        const color = selected ? '#58d9ec' : cssColor(e.color, this.dark);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = ghost ? .2 : (e.opacity ?? 1);
        const units = { mm: 1, cm: .1, m: .001, in: 1 / 25.4, pt: 72 / 25.4, unitless: 1 }[this.doc.units] || 1;
        const weight = this.weights ? (e.lineweight ?? .2) * units * (this.doc.source?.options?.drawingScale || 1) : 0;
        ctx.lineWidth = Math.max(selected ? 1.8 / camera.scale : .65 / camera.scale, weight) / scale;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.setLineDash((e.dash || []).map(v => Math.abs(v)));
        ctx.lineDashOffset = -(e.dashPhase || 0);
        if (['TEXT', 'MTEXT', 'ATTRIB'].includes(e.type)) {
            this.drawText(ctx, e);
        }
        else {
            let path = this.paths.get(e);
            if (!path) {
                path = makePath(e);
                this.paths.set(e, path);
            }
            if (e.type === 'HATCH' && e.solid === false) {
                const b = (0, model_1.entityBox)(e, this.doc), a = (e.pattern?.angle || 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], origin = e.pattern?.origin || [0, 0], offset = e.pattern?.offset || [0, 1], spacing = Math.abs(offset[0] * v[0] + offset[1] * v[1]);
                if (spacing > 1e-9) {
                    ctx.clip(path, 'evenodd');
                    const corners = [[b[0], b[1]], [b[0], b[3]], [b[2], b[1]], [b[2], b[3]]], ds = corners.map(p => (p[0] - origin[0]) * v[0] + (p[1] - origin[1]) * v[1]), ts = corners.map(p => (p[0] - origin[0]) * u[0] + (p[1] - origin[1]) * u[1]), lo = Math.floor(Math.min(...ds) / spacing), hi = Math.ceil(Math.max(...ds) / spacing);
                    ctx.beginPath();
                    for (let k = lo; k <= hi && k - lo < 20000; k++) {
                        const d = k * spacing;
                        ctx.moveTo(origin[0] + d * v[0] + Math.min(...ts) * u[0], origin[1] + d * v[1] + Math.min(...ts) * u[1]);
                        ctx.lineTo(origin[0] + d * v[0] + Math.max(...ts) * u[0], origin[1] + d * v[1] + Math.max(...ts) * u[1]);
                    }
                    ctx.stroke();
                }
            }
            else if (e.type === 'HATCH' || e.type === 'SOLID')
                ctx.fill(path, 'evenodd');
            else
                ctx.stroke(path);
        }
        ctx.restore();
    }
    drawText(ctx, e) {
        const text = e.text || e.value || '', angle = (e.rotation || 0) * Math.PI / 180, family = fontFamily(e.font || ''), bold = /bold|demi|arialb|courbd|timesbd/i.test(e.font || ''), italic = /italic|oblique|ariali|arialbi/i.test(e.font || ''), font = `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}100px ${family}`;
        ctx.translate(...e.position);
        ctx.rotate(angle);
        ctx.transform(1, 0, Math.tan((e.oblique || 0) * Math.PI / 180), 1, 0, 0);
        if (e.mirror & 2)
            ctx.scale(-1, 1);
        if (e.mirror & 4)
            ctx.scale(1, -1);
        ctx.scale(1, -1);
        ctx.font = font;
        ctx.textBaseline = 'alphabetic';
        ctx.fontKerning = 'none';
        let cap = this.fontMetrics.get(font);
        if (!cap) {
            cap = ctx.measureText('H').actualBoundingBoxAscent || 70;
            this.fontMetrics.set(font, cap);
        }
        const sy = e.height / cap;
        const lines = text.replace(/\\P/g, '\n').split('\n');
        for (let i = 0; i < lines.length; i++) {
            const w = ctx.measureText(lines[i]).width, sx = e.type === 'MTEXT' ? sy : (e.width > 0 && w > 0 ? e.width / w : sy * (e.widthFactor || 1));
            ctx.save();
            ctx.translate(0, i * e.height * 1.6);
            ctx.scale(sx, sy);
            ctx.fillText(lines[i], 0, 0);
            ctx.restore();
        }
    }
    pick(point, camera) {
        if (!this.doc)
            return null;
        const r = 6 / camera.scale, roots = this.index.search([point[0] - r, point[1] - r, point[0] + r, point[1] + r]).sort((a, b) => b.index - a.index);
        let best = null, bestDistance = Infinity;
        for (const root of roots) {
            if (this.hiddenLayers.has(root.e.layer))
                continue;
            for (const cmd of this.commands.get(root.e.id) || []) {
                if (this.hiddenLayers.has(cmd.layer) || !(0, geometry_1.contains)(cmd.box, point, r))
                    continue;
                const e = cmd.e, p = (0, geometry_1.transform)((0, geometry_1.inverse)(cmd.m), point), factor = Math.sqrt(Math.abs(cmd.m[0] * cmd.m[3] - cmd.m[1] * cmd.m[2])) || 1;
                let d = Infinity;
                if (['TEXT', 'MTEXT', 'ATTRIB', 'HATCH', 'SOLID'].includes(e.type))
                    d = 0;
                else if (e.type === 'CIRCLE' || e.type === 'ARC')
                    d = Math.abs((0, geometry_1.distance)(p, e.center) - e.radius) * factor;
                else {
                    for (const path of (0, model_1.entityPaths)(e)) {
                        const pts = (0, geometry_1.flattenPath)(path, .5 / (camera.scale * factor));
                        for (let i = 1; i < pts.length; i++)
                            d = Math.min(d, (0, geometry_1.pointSegmentDistance)(p, pts[i - 1], pts[i]) * factor);
                    }
                    if (e.type === 'ELLIPSE')
                        d = 0;
                }
                if (d < r && d < bestDistance) {
                    best = { entity: root.e, child: e, distance: d };
                    bestDistance = d;
                }
            }
        }
        return best;
    }
}
exports.CadRenderer = CadRenderer;
/** Framework-neutral interactive viewport, also usable for PDF raster previews. */
class CanvasViewport {
    constructor(canvas, { kind = 'cad', camera = new Camera() } = {}) {
        this.canvas = canvas;
        this.kind = kind;
        this.camera = camera;
        this.renderer = kind === 'cad' ? new CadRenderer() : null;
        this.selection = new Set();
        this.selectionChanged = new model_1.Signal();
        this.pointerMoved = new model_1.Signal();
        this.measureChanged = new model_1.Signal();
        this.rendered = new model_1.Signal();
        this.image = null;
        this.pageBox = [0, 0, 297, 210];
        this.grid = kind === 'cad';
        this.paper = kind === 'pdf';
        this.measureMode = false;
        this.measurePoints = [];
        this.overlays = [];
        this.frame = 0;
        this.abort = new AbortController();
        this.sub = camera.changed.subscribe(() => this.invalidate());
        this.bindInput();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(canvas);
        this.resize();
    }
    resize() { const r = this.canvas.getBoundingClientRect(), dpr = Math.min(3, globalThis.devicePixelRatio || 1); this.dpr = dpr; this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr)); this.camera.resize(r.width, r.height); }
    setDocument(doc) { this.renderer?.setDocument(doc); this.pageBox = [...doc.pageBox]; this.invalidate(); }
    setImage(image, box) { this.image = image; this.pageBox = [...box]; this.invalidate(); }
    fit(content = false) { this.camera.fit(content && this.renderer?.doc ? (0, model_1.documentBox)(this.renderer.doc) : this.pageBox); }
    invalidate() {
        if (!this.frame)
            this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
    }
    render() {
        const start = performance.now(), ctx = this.canvas.getContext('2d', { alpha: false }), cam = this.camera, w = cam.width, h = cam.height, dpr = this.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = this.kind === 'pdf' ? '#202731' : this.paper ? '#e9edf0' : '#101720';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.transform(...cam.matrix);
        const b = this.pageBox;
        if (this.paper) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        }
        if (this.grid && !this.paper)
            this.drawGrid(ctx);
        if (this.image) {
            ctx.save();
            ctx.translate(b[0], b[3]);
            ctx.scale(1, -1);
            ctx.drawImage(this.image, 0, 0, b[2] - b[0], b[3] - b[1]);
            ctx.restore();
        }
        if (this.renderer) {
            this.renderer.dark = !this.paper;
            this.renderer.draw(ctx, cam, { selected: this.selection });
        }
        ctx.lineWidth = 1 / cam.scale;
        ctx.strokeStyle = this.kind === 'pdf' ? '#a4acb7' : '#334052';
        ctx.setLineDash([]);
        ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        ctx.strokeStyle = '#24b7d1';
        ctx.fillStyle = '#24b7d12b';
        ctx.lineWidth = 1.5 / cam.scale;
        for (const b of this.overlays) {
            ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
            ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        }
        if (this.measurePoints.length) {
            ctx.beginPath();
            ctx.moveTo(...this.measurePoints[0]);
            for (const p of this.measurePoints.slice(1))
                ctx.lineTo(...p);
            ctx.strokeStyle = '#f8c768';
            ctx.stroke();
            for (const p of this.measurePoints) {
                ctx.beginPath();
                ctx.arc(...p, 3 / cam.scale, 0, TAU);
                ctx.fillStyle = '#f8c768';
                ctx.fill();
            }
        }
        ctx.restore();
        this.rendered.emit({ elapsedMs: performance.now() - start, drawn: this.renderer?.drawn || 0 });
    }
    drawGrid(ctx) {
        const cam = this.camera, step = 10 ** Math.floor(Math.log10(75 / cam.scale)), b = cam.viewBox;
        ctx.lineWidth = .6 / cam.scale;
        ctx.strokeStyle = '#1c2734';
        ctx.beginPath();
        for (let x = Math.floor(b[0] / step) * step; x <= b[2]; x += step) {
            ctx.moveTo(x, b[1]);
            ctx.lineTo(x, b[3]);
        }
        for (let y = Math.floor(b[1] / step) * step; y <= b[3]; y += step) {
            ctx.moveTo(b[0], y);
            ctx.lineTo(b[2], y);
        }
        ctx.stroke();
    }
    bindInput() {
        const canvas = this.canvas, signal = this.abort.signal;
        canvas.tabIndex = 0;
        canvas.style.touchAction = 'none';
        let drag = null;
        canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); this.camera.zoomAt([e.clientX - r.left, e.clientY - r.top], Math.exp(-e.deltaY * .0015)); }, { passive: false, signal });
        canvas.addEventListener('pointerdown', e => {
            if (e.button > 1)
                return;
            canvas.focus();
            canvas.setPointerCapture(e.pointerId);
            drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, id: e.pointerId, moved: false };
        }, { signal });
        canvas.addEventListener('pointermove', e => {
            const r = canvas.getBoundingClientRect(), p = this.camera.world([e.clientX - r.left, e.clientY - r.top]);
            this.pointerMoved.emit(p);
            if (drag && drag.id === e.pointerId) {
                const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                drag.moved ||= Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3;
                if (drag.moved)
                    this.camera.pan(dx, dy);
                drag.x = e.clientX;
                drag.y = e.clientY;
            }
        }, { signal });
        canvas.addEventListener('pointerup', e => {
            if (!drag || drag.id !== e.pointerId)
                return;
            const moved = drag.moved;
            drag = null;
            if (canvas.hasPointerCapture(e.pointerId))
                canvas.releasePointerCapture(e.pointerId);
            if (moved)
                return;
            const r = canvas.getBoundingClientRect(), point = this.camera.world([e.clientX - r.left, e.clientY - r.top]);
            if (this.measureMode) {
                if (this.measurePoints.length >= 2)
                    this.measurePoints = [];
                this.measurePoints.push(point);
                this.measureChanged.emit({ points: [...this.measurePoints], distance: this.measurePoints.length === 2 ? (0, geometry_1.distance)(...this.measurePoints) : null });
                this.invalidate();
                return;
            }
            const hit = this.renderer?.pick(point, this.camera);
            if (!e.shiftKey)
                this.selection.clear();
            if (hit)
                this.selection.add(hit.entity.id);
            this.selectionChanged.emit(hit);
            this.invalidate();
        }, { signal });
        canvas.addEventListener('pointercancel', () => drag = null, { signal });
        canvas.addEventListener('dblclick', () => this.fit(), { signal });
        canvas.addEventListener('keydown', e => {
            if (e.key === 'f' || e.key === 'F') {
                this.fit();
                e.preventDefault();
            }
            if (e.key === 'Escape') {
                this.measurePoints = [];
                this.selection.clear();
                this.selectionChanged.emit(null);
                this.invalidate();
            }
        }, { signal });
    }
    dispose() {
        this.abort.abort();
        this.observer.disconnect();
        this.sub();
        if (this.frame)
            cancelAnimationFrame(this.frame);
    }
}
exports.CanvasViewport = CanvasViewport;
function linkViewports(a, b) {
    let applying = false;
    const sync = (from, to) => {
        if (applying)
            return;
        applying = true;
        to.camera.set({ center: from.camera.center, scale: from.camera.scale });
        applying = false;
    };
    const u = a.camera.changed.subscribe(() => sync(a, b)), v = b.camera.changed.subscribe(() => sync(b, a));
    return () => { u(); v(); };
}

},
"@revector/rules-cad":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorTemplateLibrary = exports.CAD_PROFILES = exports.cadRules = void 0;
exports.detectProducerProfile = detectProducerProfile;
const geometry_1 = require("@revector/geometry");
const model_1 = require("@revector/model");
const topology_1 = require("@revector/topology");
const clone = x => structuredClone(x);
const colorKey = e => [e.layer, e.color, e.lineweight, e.opacity, e.dash].join('|');
function offsetEntity(e, origin, id) {
    const v = p => (0, geometry_1.sub)(p, origin), o = { ...clone(e), id };
    delete o.bounds;
    switch (e.type) {
        case 'LINE':
            o.start = v(e.start);
            o.end = v(e.end);
            break;
        case 'LWPOLYLINE':
        case 'SOLID':
            o.points = e.points.map(v);
            break;
        case 'SPLINE':
            o.controlPoints = e.controlPoints.map(v);
            break;
        case 'HATCH':
            o.paths = e.paths.map(p => ({ ...p, start: v(p.start), segments: p.segments.map(s => ({ ...s, to: v(s.to), ...(s.c1 ? { c1: v(s.c1), c2: v(s.c2) } : {}) })) }));
            break;
    }
    return o;
}
exports.cadRules = [
    { id: 'geometry.join-chains', title: 'Connected line chains', version: '1.0.0', stage: 10, description: 'Join degree-2, identical-style line chains without snapping or tessellation.', run: ({ document }) => {
            const groups = new Map();
            for (const e of document.entities)
                if (e.type === 'LINE' && !e.dash?.length) {
                    const k = colorKey(e);
                    if (!groups.has(k))
                        groups.set(k, []);
                    groups.get(k).push(e);
                }
            const out = [];
            for (const lines of groups.values())
                for (const c of (0, topology_1.joinLineChains)(lines))
                    if (c.members.length >= 2 && c.members.length <= 512) {
                        const id = 'join-' + (0, geometry_1.stableHash)(c.members.map(e => e.id)), points = c.closed ? c.points.slice(0, -1) : c.points;
                        out.push({ title: `Join ${c.members.length} connected segments`, members: c.members.map(e => e.id), confidence: 1, exact: true, evidence: [{ kind: 'degree-two-connectivity', tolerance: 1e-9 }, { kind: 'identical-stroke-style' }], proposal: { remove: c.members.map(e => e.id), add: [{ ...clone(c.members[0]), id, type: 'LWPOLYLINE', points, closed: c.closed, source: { ids: [...new Set(c.members.flatMap(e => e.source?.ids || []))] }, semantic: { class: 'connected-polyline', method: 'topology' } }] } });
                    }
            return out;
        } },
    { id: 'cad.conic-recovery', title: 'Printed cubic circles', version: '1.0.0', stage: 20, description: 'Recognize four-cubic printed circles. Replacement is explicitly non-exact and opt-in in exact mode.', run: ({ document }) => {
            const groups = new Map();
            for (const e of document.entities)
                if (e.type === 'SPLINE' && e.degree === 3 && e.controlPoints.length === 4) {
                    const key = (e.source?.ids || [e.id]).join('|');
                    if (!groups.has(key))
                        groups.set(key, []);
                    groups.get(key).push(e);
                }
            const out = [];
            for (const es of groups.values()) {
                if (es.length !== 4 || !es.every(e => colorKey(e) === colorKey(es[0])))
                    continue;
                const edges = [es[0]], remaining = es.slice(1);
                while (remaining.length) {
                    const i = remaining.findIndex(e => (0, geometry_1.near)(edges.at(-1).controlPoints[3], e.controlPoints[0], 1e-7));
                    if (i < 0)
                        break;
                    edges.push(remaining.splice(i, 1)[0]);
                }
                if (edges.length !== 4 || !(0, geometry_1.near)(edges[3].controlPoints[3], edges[0].controlPoints[0], 1e-7))
                    continue;
                const paths = [{ start: edges[0].controlPoints[0], segments: edges.map(e => ({ kind: 'C', c1: e.controlPoints[1], c2: e.controlPoints[2], to: e.controlPoints[3] })), closed: true }];
                const c = (0, geometry_1.inferCircle)(paths);
                if (!c)
                    continue;
                const id = 'circle-' + (0, geometry_1.stableHash)(es.map(e => e.id));
                out.push({ title: 'Recover a native CIRCLE from a printed cubic circle', members: es.map(e => e.id), confidence: .97, exact: false, errorBound: c.maxError, evidence: [{ kind: 'four-cubic-closed-contour' }, { kind: 'radial-fit', maxDeviation: c.maxError, relativeDeviation: c.relativeError, samplesPerCubic: 33 }], proposal: { remove: es.map(e => e.id), add: [{ ...clone(es[0]), id, type: 'CIRCLE', center: c.center, radius: c.radius, source: { ids: [...new Set(es.flatMap(e => e.source?.ids || []))] }, semantic: { class: 'circle', method: 'bounded-conic-inference' } }] } });
            }
            return out;
        } },
    { id: 'cad.repeated-symbols', title: 'Repeated vector symbols', version: '1.0.0', stage: 30, description: 'Create shared BLOCKs for translation-equivalent connected components; no invented original block names.', run: ({ document, checkAbort }) => {
            const eligible = document.entities.filter(e => ['LINE', 'LWPOLYLINE', 'SPLINE'].includes(e.type) && !e.dash?.length), components = (0, topology_1.connectedComponents)(eligible, topology_1.endpoints, 1e-8), groups = new Map();
            for (const component of components) {
                checkAbort();
                if (component.length > 64 || component.length < 1)
                    continue;
                if (component.length === 1 && !(component[0].type === 'LWPOLYLINE' && component[0].closed && component[0].points.length >= 3))
                    continue;
                const box = (0, geometry_1.emptyBox)();
                component.forEach(e => (0, geometry_1.union)(box, (0, model_1.entityBox)(e, document)));
                const origin = [box[0], box[1]], local = component.map((e, i) => offsetEntity(e, origin, `local-${i}`));
                const geometry = local.map(e => ({ type: e.type, layer: e.layer, color: e.color, lineweight: e.lineweight, opacity: e.opacity, start: e.start, end: e.end, points: e.points, controlPoints: e.controlPoints, knots: e.knots, closed: e.closed }));
                const canonical = JSON.stringify(geometry, (_, v) => typeof v === 'number' ? Math.round(v * 1e8) / 1e8 : v), key = (0, geometry_1.stableHash)(canonical);
                if (!groups.has(key))
                    groups.set(key, []);
                groups.get(key).push({ component, origin, local, canonical });
            }
            const out = [];
            for (const [key, occurrences] of groups) {
                if (occurrences.length < 3)
                    continue;
                const matching = occurrences.filter(o => o.canonical === occurrences[0].canonical);
                if (matching.length < 3)
                    continue;
                const name = `RV_SYMBOL_${key.toUpperCase()}`, members = matching.flatMap(o => o.component.map(e => e.id)), block = { name, origin: [0, 0], entities: matching[0].local.map((e, i) => ({ ...e, id: `${name}-${i}` })), source: { inference: 'translation-equivalent-connected-components' } };
                out.push({ title: `Recover ${matching.length} instances of a repeated symbol`, members, confidence: .995, exact: true, evidence: [{ kind: 'repeated-component', instances: matching.length, coordinateTolerance: 1e-8 }, { kind: 'style-and-geometry-equality' }], proposal: { remove: members, blocks: [block], placements: Object.fromEntries(matching.map((o, i) => [`${name}-ref-${i}`, o.component.reduce((a, e) => document.entities.indexOf(a) < document.entities.indexOf(e) ? a : e).id])), add: matching.map((o, i) => ({ id: `${name}-ref-${i}`, type: 'INSERT', name, position: o.origin, rotation: 0, scale: [1, 1], layer: o.component[0].layer, color: o.component[0].color, lineweight: o.component[0].lineweight, opacity: o.component[0].opacity, attributes: [], source: { ids: [...new Set(o.component.flatMap(e => e.source?.ids || []))] }, semantic: { class: 'repeated-symbol', method: 'geometric-repetition' } })) } });
            }
            return out;
        } },
    { id: 'cad.tag-attributes', title: 'Tag-to-block attributes', version: '1.0.0', stage: 40, description: 'Associate a CAD-like tag with an isolated nearby INSERT; proposals retain evidence and remain reviewable.', run: ({ document }) => {
            const blocks = document.entities.filter(e => e.type === 'INSERT');
            if (!blocks.length)
                return [];
            const index = new topology_1.SpatialIndex(blocks, e => (0, model_1.entityBox)(e, document)), out = [];
            for (const t of document.entities) {
                if (t.type !== 'TEXT' || !/^\s*[A-Z]{1,5}[- ]?\d{2,6}[A-Z]?\s*$/.test(t.text))
                    continue;
                const r = t.height * 8, b = (0, model_1.entityBox)(t, document), nearby = index.search([b[0] - r, b[1] - r, b[2] + r, b[3] + r]).map(e => { const eb = (0, model_1.entityBox)(e, document); return { e, d: (0, geometry_1.distance)(t.position, [(eb[0] + eb[2]) / 2, (eb[1] + eb[3]) / 2]) }; }).sort((a, b) => a.d - b.d);
                if (!nearby.length || (nearby[1] && nearby[1].d < nearby[0].d * 1.6))
                    continue;
                const e = nearby[0].e;
                const attr = { ...clone(t), id: `${e.id}-tag-${t.id}`, type: 'ATTRIB', tag: 'TAG', value: t.text };
                out.push({ title: `Attach ${t.text} to ${e.name}`, members: [e.id, t.id], confidence: .94, exact: true, evidence: [{ kind: 'cad-tag-syntax', text: t.text }, { kind: 'unique-nearest-block', distance: nearby[0].d }], proposal: { remove: [t.id], update: [{ id: e.id, appendAttributes: [attr], patch: { semantic: { ...e.semantic, tag: t.text } } }] } });
            }
            return out;
        } },
    { id: 'cad.dimensions', title: 'Dimension reconstruction', version: '1.0.0', stage: 45, description: 'Detect numeric label + baseline + two triangular arrowheads; emit a native DIMENSION with the original anonymous display block.', run: ({ document }) => {
            const lines = document.entities.filter(e => e.type === 'LINE'), arrows = document.entities.filter(e => (e.type === 'SOLID' && e.points.length === 3) || (e.type === 'HATCH' && e.paths.length === 1 && e.paths[0].segments.every(s => s.kind === 'L') && [2, 3].includes(e.paths[0].segments.length))), index = new topology_1.SpatialIndex(arrows, e => (0, model_1.entityBox)(e, document)), out = [];
            for (const text of document.entities) {
                if (text.type !== 'TEXT' || !/^\s*(?:[ØøR])?\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|m|in|"|°))?\s*$/.test(text.text))
                    continue;
                const h = text.height, best = [];
                for (const l of lines) {
                    const d = (0, geometry_1.sub)(l.end, l.start), len = (0, geometry_1.length)(d);
                    if (len < h * 4)
                        continue;
                    const u = (0, geometry_1.dot)((0, geometry_1.sub)(text.position, l.start), d) / (len * len), perp = Math.abs((0, geometry_1.cross)(d, (0, geometry_1.sub)(text.position, l.start))) / len;
                    if (u < -.1 || u > 1.1 || perp > h * 2.5)
                        continue;
                    const tip = p => index.search([p[0] - h, p[1] - h, p[0] + h, p[1] + h]).filter(e => { const paths = (0, model_1.entityPaths)(e); return paths.some(path => [path.start, ...path.segments.map(s => s.to)].some(q => (0, geometry_1.distance)(p, q) < h * .25)); });
                    const a = tip(l.start), b = tip(l.end);
                    if (!a.length || !b.length || a[0].id === b[0].id)
                        continue;
                    best.push({ l, a: a[0], b: b[0], distance: perp, len });
                }
                best.sort((a, b) => a.distance - b.distance);
                if (!best.length)
                    continue;
                const hit = best[0], members = [text, hit.l, hit.a, hit.b], key = (0, geometry_1.stableHash)(members.map(e => e.id)), name = `*D${key}`, block = { name, origin: [0, 0], entities: [...members].sort((a, b) => document.entities.indexOf(a) - document.entities.indexOf(b)).map((e, i) => ({ ...clone(e), id: `${name}-${i}` })) };
                out.push({ title: `Recover aligned dimension “${text.text}”`, members: members.map(e => e.id), confidence: .93, exact: true, evidence: [{ kind: 'numeric-label', text: text.text }, { kind: 'paired-arrowheads', ids: [hit.a.id, hit.b.id] }, { kind: 'baseline-distance', distance: hit.distance }, { kind: 'visual-geometry-preserved', anonymousBlock: name }], proposal: { remove: members.map(e => e.id), blocks: [block], add: [{ id: 'dim-' + key, type: 'DIMENSION', block: name, dimensionType: 1, definition: hit.l.end, extension1: hit.l.start, extension2: hit.l.end, textPosition: text.position, text: text.text, measurement: hit.len, layer: hit.l.layer, color: hit.l.color, lineweight: hit.l.lineweight, source: { ids: members.flatMap(e => e.source?.ids || []) }, semantic: { class: 'dimension', method: 'baseline-arrowheads-label', associative: false } }] } });
            }
            return out;
        } },
    { id: 'cad.centerlines', title: 'Centerline classification', version: '1.0.0', stage: 50, description: 'Classify dash-dot geometry without changing its coordinates.', run: ({ document }) => document.entities.filter(e => e.dash?.length >= 4).map(e => ({ title: 'Classify dash-dot stroke as a centerline candidate', members: [e.id], confidence: .88, exact: true, evidence: [{ kind: 'dash-pattern', pattern: e.dash }], proposal: { update: [{ id: e.id, patch: { semantic: { ...e.semantic, class: 'centerline', method: 'dash-heuristic' } } }] } })) },
    { id: 'cad.hatch-families', title: 'Hatch line families', version: '1.0.0', stage: 55, description: 'Identify repeated parallel strokes as a semantic GROUP; original geometry is not replaced by a guessed boundary.', run: ({ document }) => {
            const bins = new Map();
            for (const e of document.entities) {
                if (e.type !== 'LINE')
                    continue;
                const d = (0, geometry_1.sub)(e.end, e.start), len = (0, geometry_1.length)(d);
                if (len < 1e-8)
                    continue;
                let a = Math.atan2(d[1], d[0]);
                if (a < 0)
                    a += Math.PI;
                const key = colorKey(e) + ':' + Math.round(a * 1e6);
                if (!bins.has(key))
                    bins.set(key, []);
                bins.get(key).push(e);
            }
            const out = [];
            for (const es of bins.values()) {
                if (es.length < 8)
                    continue;
                const d = (0, geometry_1.sub)(es[0].end, es[0].start), len = (0, geometry_1.length)(d), n = [-d[1] / len, d[0] / len], offsets = es.map(e => (0, geometry_1.dot)(e.start, n)).sort((a, b) => a - b), spacings = offsets.slice(1).map((v, i) => v - offsets[i]).filter(x => x > 1e-8);
                if (spacings.length < 7)
                    continue;
                const mean = spacings.reduce((a, b) => a + b) / spacings.length, variance = spacings.reduce((a, b) => a + (b - mean) ** 2, 0) / spacings.length;
                if (Math.sqrt(variance) > mean * .015)
                    continue;
                const id = 'hatch-family-' + (0, geometry_1.stableHash)(es.map(e => e.id));
                out.push({ title: `Identify ${es.length} regularly spaced hatch strokes`, members: es.map(e => e.id), confidence: .9, exact: true, evidence: [{ kind: 'parallel-line-family', spacing: mean, relativeStdDev: Math.sqrt(variance) / mean }], proposal: { groups: [{ name: id, members: es.map(e => e.id), description: 'Recovered parallel hatch family', semantic: { class: 'hatch-family', spacing: mean } }], update: es.map(e => ({ id: e.id, patch: { semantic: { ...e.semantic, class: 'hatch-stroke', family: id } } })) } });
            }
            return out;
        } },
    { id: 'cad.title-block', title: 'Title block fields', version: '1.0.0', stage: 60, description: 'Group recognizable sheet/revision/scale fields without fabricating discarded model metadata.', run: ({ document }) => {
            const labels = document.entities.filter(e => e.type === 'TEXT' && /\b(?:DRAWING|DRAWN|REV(?:ISION)?|SCALE|SHEET|PROJECT|APPROVED|DATE)\b/i.test(e.text));
            if (labels.length < 3)
                return [];
            const key = (0, geometry_1.stableHash)(labels.map(e => e.id));
            return [{ title: 'Identify a drawing title-block field group', members: labels.map(e => e.id), confidence: .91, exact: true, evidence: [{ kind: 'title-block-vocabulary', labels: labels.map(e => e.text) }], proposal: { groups: [{ name: 'TITLE_BLOCK_' + key, members: labels.map(e => e.id), description: 'Inferred title-block fields', semantic: { class: 'title-block' } }] } }];
        } }
];
exports.CAD_PROFILES = Object.freeze({
    exact: { name: 'Exact geometry', description: 'Only coordinate-preserving transformations are accepted automatically.', fidelity: 'exact', minConfidence: .98 },
    cad: { name: 'CAD print recovery', description: 'Conservative source recovery; review conics, dimensions and attributes.', fidelity: 'exact', minConfidence: .98 },
    inferred: { name: 'Reviewed CAD inference', description: 'Accept high-confidence conic hypotheses; errors and original controls remain recorded.', fidelity: 'inferred', minConfidence: .96 },
    pid: { name: 'P&ID / schematic', description: 'Source geometry plus symbol repetition and tag association. Associations remain proposals.', fidelity: 'exact', minConfidence: .98 }
});
function detectProducerProfile(source) { const text = [source?.producer, source?.creator, source?.Producer, source?.Creator].filter(Boolean).join(' '); return /AutoCAD|DWG To PDF|Autodesk/i.test(text) ? { family: 'Autodesk CAD print', confidence: .99 } : /MicroStation|Bentley/i.test(text) ? { family: 'Bentley CAD print', confidence: .99 } : /Bluebeam/i.test(text) ? { family: 'Bluebeam PDF', confidence: .99 } : /SolidWorks|Dassault/i.test(text) ? { family: 'Dassault CAD print', confidence: .99 } : { family: 'Generic vector PDF', confidence: 1 }; }
/** Explicit vector-glyph templates; never operates on pixels or OCR data. */
class VectorTemplateLibrary {
    #templates = [];
    register({ name, paths, semantic, tolerance = 1e-7 }) {
        if (!name || !paths?.length)
            throw Error('A vector template requires a name and nonempty paths');
        const box = (0, geometry_1.pathBox)(paths), origin = [box[0], box[1]];
        const signature = JSON.stringify(paths.map(p => ({ start: (0, geometry_1.sub)(p.start, origin), closed: p.closed, segments: p.segments.map(s => ({ ...s, to: (0, geometry_1.sub)(s.to, origin), ...(s.c1 ? { c1: (0, geometry_1.sub)(s.c1, origin), c2: (0, geometry_1.sub)(s.c2, origin) } : {}) })) })), (_, v) => typeof v === 'number' ? Math.round(v / tolerance) * tolerance : v);
        this.#templates.push({ name, signature, semantic, tolerance });
        return this;
    }
    match(paths) {
        const matches = [];
        for (const t of this.#templates) {
            const temp = new VectorTemplateLibrary().register({ name: t.name, paths, semantic: {}, tolerance: t.tolerance });
            if (temp.#templates[0].signature === t.signature)
                matches.push({ name: t.name, semantic: clone(t.semantic), confidence: 1 });
        }
        return matches;
    }
}
exports.VectorTemplateLibrary = VectorTemplateLibrary;

},
"@revector/semantics":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleEngine = void 0;
exports.commitCandidate = commitCandidate;
exports.safeRegex = safeRegex;
exports.compileRuleSet = compileRuleSet;
const geometry_1 = require("@revector/geometry");
const model_1 = require("@revector/model");
const clone = x => structuredClone(x);
function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const x of Object.values(value))
            deepFreeze(x);
    }
    return value;
}
function orderRules(rules) {
    const result = [], visiting = new Set(), done = new Set(), map = new Map(rules.map(r => [r.id, r]));
    function visit(r) {
        if (done.has(r.id))
            return;
        if (visiting.has(r.id))
            throw Error(`Semantic rule dependency cycle at ${r.id}`);
        visiting.add(r.id);
        for (const dep of r.after || [])
            if (map.has(dep))
                visit(map.get(dep));
        visiting.delete(r.id);
        done.add(r.id);
        result.push(r);
    }
    for (const r of [...rules].sort((a, b) => (a.stage || 0) - (b.stage || 0) || (b.priority || 0) - (a.priority || 0) || a.id.localeCompare(b.id)))
        visit(r);
    return result;
}
function sanitizeCandidate(c, rule) {
    if (!c || !Array.isArray(c.members) || !c.proposal)
        throw Error(`Rule ${rule.id} returned an invalid proposal`);
    if (!Number.isFinite(c.confidence) || c.confidence < 0 || c.confidence > 1)
        throw Error(`Invalid confidence from ${rule.id}`);
    const members = [...new Set(c.members)];
    return { ...clone(c), id: c.id || `${rule.id}:${(0, geometry_1.stableHash)([members, c.title])}`, rule: rule.id, ruleVersion: rule.version || '1.0.0', members, exact: c.exact === true, status: 'pending', evidence: c.evidence || [] };
}
/** Apply a proposal to a clone, validate, and atomically return the new document. */
function commitCandidate(document, candidate) {
    const next = clone(document), existing = new Map(next.entities.map(e => [e.id, e])), p = candidate.proposal;
    for (const id of candidate.members)
        if (!existing.has(id))
            throw new Error(`Stale candidate ${candidate.id}: entity ${id} no longer exists`);
    const remove = new Set(p.remove || []);
    for (const id of remove)
        if (!existing.has(id))
            throw new Error(`Cannot remove missing entity ${id}`);
    const removed = next.entities.filter(e => remove.has(e.id)), updated = [];
    for (const u of p.update || []) {
        const e = existing.get(u.id);
        if (!e)
            throw new Error(`Cannot update missing entity ${u.id}`);
        if (u.patch?.id && u.patch.id !== u.id)
            throw Error('Rule patches may not change identity');
        updated.push({ id: u.id, before: clone(e) });
        Object.assign(e, clone(u.patch));
        if (u.appendAttributes)
            e.attributes = [...(e.attributes || []), ...clone(u.appendAttributes)];
    }
    const original = next.entities;
    const firstIndex = original.findIndex(e => remove.has(e.id));
    const additions = clone(p.add || []);
    for (const e of additions) {
        e.semantic = { ...e.semantic, rule: candidate.rule, confidence: candidate.confidence, exact: candidate.exact };
    }
    if (p.placements) {
        const placed = new Set(), out = [];
        for (const e of original) {
            for (const a of additions)
                if (p.placements[a.id] === e.id) {
                    out.push(a);
                    placed.add(a.id);
                }
            if (!remove.has(e.id))
                out.push(e);
        }
        for (const a of additions)
            if (!placed.has(a.id))
                throw Error(`Missing placement anchor for ${a.id}`);
        next.entities = out;
    }
    else {
        next.entities = original.filter(e => !remove.has(e.id));
        next.entities.splice(firstIndex < 0 ? next.entities.length : firstIndex, 0, ...additions);
    }
    // Keep semantic GROUP references valid when later extensions replace members.
    for (const g of next.groups) {
        if (g.members.some(id => remove.has(id)))
            g.members = [...new Set(g.members.flatMap(id => remove.has(id) ? additions.map(e => e.id) : [id]))];
    }
    next.groups = next.groups.filter(g => g.members.length > 0);
    for (const b of p.blocks || []) {
        if (next.blocks.some(x => x.name === b.name))
            throw new Error(`Duplicate block ${b.name}`);
        next.blocks.push(clone(b));
    }
    for (const l of p.layers || [])
        (0, model_1.ensureLayer)(next, l.name, l.color, l.visible);
    for (const g of p.groups || [])
        next.groups.push(clone(g));
    const check = (0, model_1.validateDocument)(next);
    if (!check.valid)
        throw Error(`Rule transaction failed validation: ${check.errors.slice(0, 4).join('; ')}`);
    next.revision++;
    next.history.push({ candidate: candidate.id, rule: candidate.rule, revision: next.revision, removed, updated, added: additions.map(e => e.id), blocks: (p.blocks || []).map(b => b.name) });
    if (!candidate.exact)
        next.diagnostics.push((0, model_1.diagnostic)('SEMANTIC_GEOMETRY_CHANGE', `Accepted inference: ${candidate.title}. Original primitives are retained in the conversion history.`, 'warning', { rule: candidate.rule, candidate: candidate.id, errorBound: candidate.errorBound }));
    return next;
}
class RuleEngine {
    #rules = new Map();
    register(rule) {
        if (!rule?.id || typeof rule.run !== 'function')
            throw new TypeError('A semantic rule requires id and run(context)');
        if (this.#rules.has(rule.id))
            throw new Error(`Duplicate rule ${rule.id}`);
        this.#rules.set(rule.id, rule);
        return this;
    }
    unregister(id) { return this.#rules.delete(id); }
    list() { return [...this.#rules.values()].map(({ run, ...metadata }) => metadata); }
    async run(document, options = {}) {
        let doc = clone(document);
        const minConfidence = options.minConfidence ?? .98, maxCandidates = options.maxCandidates ?? 20000, decisions = options.decisions || {}, disabled = new Set(options.disabledRules || []), stats = [];
        const rules = orderRules([...this.#rules.values()].filter(r => !disabled.has(r.id)));
        for (let index = 0; index < rules.length; index++) {
            (0, model_1.checkAbort)(options.signal);
            const rule = rules[index], start = performance.now();
            options.onProgress?.({ phase: 'semantics', rule: rule.id, done: index, total: rules.length });
            const snapshot = deepFreeze(clone({ entities: doc.entities, blocks: doc.blocks, layers: doc.layers, groups: doc.groups, source: doc.source, pageBox: doc.pageBox, units: doc.units, revision: doc.revision }));
            const context = Object.freeze({ document: snapshot, options, signal: options.signal, checkAbort: () => (0, model_1.checkAbort)(options.signal) });
            let proposed = 0, accepted = 0;
            try {
                const output = await rule.run(context);
                for await (const raw of output || []) {
                    (0, model_1.checkAbort)(options.signal);
                    if (doc.candidates.length >= maxCandidates)
                        throw new RangeError('Semantic candidate budget exceeded');
                    const c = sanitizeCandidate(raw, rule);
                    if (doc.candidates.some(x => x.id === c.id))
                        continue;
                    proposed++;
                    const decision = decisions[c.id];
                    if (decision === 'reject')
                        c.status = 'rejected';
                    const auto = c.confidence >= minConfidence && (c.exact || options.fidelity === 'inferred');
                    if (decision === 'accept' || (decision !== 'reject' && auto)) {
                        try {
                            doc = commitCandidate(doc, c);
                            c.status = 'accepted';
                            c.result = (c.proposal.add || []).map(e => e.id);
                            accepted++;
                        }
                        catch (error) {
                            c.status = 'conflict';
                            c.conflict = error.message;
                        }
                    }
                    doc.candidates.push(c);
                }
            }
            catch (error) {
                if (error.name === 'AbortError')
                    throw error;
                doc.diagnostics.push((0, model_1.diagnostic)('RULE_FAILURE', `Rule ${rule.id}: ${error.message}`, 'error', { rule: rule.id }));
            }
            stats.push({ rule: rule.id, proposed, accepted, elapsedMs: performance.now() - start });
            await (0, model_1.yieldTask)();
        }
        doc.ruleStats = stats;
        options.onProgress?.({ phase: 'semantics', done: rules.length, total: rules.length });
        return doc;
    }
    accept(document, id) {
        const c = document.candidates.find(c => c.id === id);
        if (!c)
            throw Error('Unknown candidate');
        if (c.status === 'accepted')
            return document;
        const doc = commitCandidate(document, c);
        doc.candidates.find(c => c.id === id).status = 'accepted';
        return doc;
    }
    reject(document, id) {
        const doc = clone(document), c = doc.candidates.find(c => c.id === id);
        if (!c)
            throw Error('Unknown candidate');
        if (c.status === 'accepted')
            throw Error('Re-run from the original scene with an explicit reject decision to undo accepted transformations safely.');
        c.status = 'rejected';
        return doc;
    }
}
exports.RuleEngine = RuleEngine;
const ALLOWED_FIELDS = new Set(['type', 'layer', 'text', 'font', 'semantic.class', 'source.kind']);
function valueAt(e, path) { return path.split('.').reduce((o, k) => o?.[k], e); }
/** Deliberately restricted regex grammar to avoid untrusted catastrophic backtracking. */
function safeRegex(pattern) {
    if (typeof pattern !== 'string' || pattern.length > 160)
        throw Error('Rule regex must be at most 160 characters');
    if (/[()|{}]|\\[1-9]|\\k[<']/.test(pattern))
        throw Error('Regex groups, alternatives, counted repetition, and backreferences are not permitted in declarative rules');
    const unbounded = (pattern.match(/(?<!\\)[*+]/g) || []).length;
    if (unbounded > 1)
        throw Error('At most one unbounded quantifier is permitted in a declarative rule');
    return new RegExp(pattern, 'u');
}
function compilePredicate(p, depth = 0) {
    if (depth > 8)
        throw Error('Rule predicate nesting limit');
    if (p.all) {
        const f = p.all.map(x => compilePredicate(x, depth + 1));
        return e => f.every(f => f(e));
    }
    if (p.any) {
        const f = p.any.map(x => compilePredicate(x, depth + 1));
        return e => f.some(f => f(e));
    }
    if (p.not) {
        const f = compilePredicate(p.not, depth + 1);
        return e => !f(e);
    }
    if (!ALLOWED_FIELDS.has(p.field))
        throw Error(`Unsupported predicate field ${p.field}`);
    const get = e => valueAt(e, p.field);
    switch (p.op || 'eq') {
        case 'eq': return e => get(e) === p.value;
        case 'in':
            if (!Array.isArray(p.value) || p.value.length > 100)
                throw Error('Invalid in predicate');
            return e => p.value.includes(get(e));
        case 'contains': return e => String(get(e) || '').includes(String(p.value));
        case 'prefix': return e => String(get(e) || '').startsWith(String(p.value));
        case 'regex': {
            const r = safeRegex(p.value);
            return e => r.test(String(get(e) || '').slice(0, 512));
        }
        default: throw Error(`Unsupported predicate operation ${p.op}`);
    }
}
function compileRuleSet(json) {
    if (json.schema !== 'revector.rules/1' || !Array.isArray(json.rules) || json.rules.length > 128)
        throw Error('Invalid rule set; expected revector.rules/1 and at most 128 rules');
    return json.rules.map(r => {
        const test = compilePredicate(r.when), action = r.then || {};
        if (!action.layer && !action.semantic)
            throw Error(`Rule ${r.id} needs a layer or semantic action`);
        return { id: r.id, version: r.version || '1.0.0', title: r.title || r.id, stage: r.stage ?? 50, priority: r.priority ?? 0, description: 'User-supplied declarative classification rule', run: ({ document }) => document.entities.filter(test).map(e => ({ title: r.title || `Classify ${e.id}`, members: [e.id], confidence: r.confidence ?? .99, exact: true, evidence: [{ kind: 'declarative-match', predicate: r.when }], proposal: { update: [{ id: e.id, patch: { ...(action.layer ? { layer: action.layer } : {}), semantic: { ...e.semantic, ...action.semantic, method: 'user-rule' } } }], layers: action.layer ? [{ name: action.layer, color: e.color || [0, 0, 0], visible: true }] : [] } })) };
    });
}

},
"@revector/topology":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisjointSet = exports.SpatialIndex = void 0;
exports.connectedComponents = connectedComponents;
exports.endpoints = endpoints;
exports.joinLineChains = joinLineChains;
const geometry_1 = require("@revector/geometry");
/** Immutable median-split BVH, used for queries and picking. No giant-grid pathology. */
class SpatialIndex {
    constructor(items = [], getBox = x => x.bounds) { this.items = items; this.getBox = getBox; this.root = this.#build(items.map((item, index) => ({ item, index, box: getBox(item) }))); }
    #build(items) {
        if (!items.length)
            return null;
        const box = (0, geometry_1.emptyBox)();
        for (const i of items)
            (0, geometry_1.union)(box, i.box);
        if (items.length <= 12)
            return { box, items };
        const axis = box[2] - box[0] >= box[3] - box[1] ? 0 : 1;
        items.sort((a, b) => (a.box[axis] + a.box[axis + 2]) - (b.box[axis] + b.box[axis + 2]) || a.index - b.index);
        const mid = items.length >> 1;
        return { box, left: this.#build(items.slice(0, mid)), right: this.#build(items.slice(mid)) };
    }
    search(box) {
        const out = [], stack = [this.root];
        while (stack.length) {
            const n = stack.pop();
            if (!n || !(0, geometry_1.intersects)(n.box, box))
                continue;
            if (n.items) {
                for (const i of n.items)
                    if ((0, geometry_1.intersects)(i.box, box))
                        out.push(i.item);
            }
            else
                stack.push(n.left, n.right);
        }
        return out;
    }
}
exports.SpatialIndex = SpatialIndex;
class DisjointSet {
    constructor(n) { this.parents = Int32Array.from({ length: n }, (_, i) => i); this.rank = new Uint8Array(n); }
    find(x) {
        let y = x;
        while (y !== this.parents[y])
            y = this.parents[y];
        while (x !== y) {
            const n = this.parents[x];
            this.parents[x] = y;
            x = n;
        }
        return y;
    }
    union(a, b) {
        a = this.find(a);
        b = this.find(b);
        if (a === b)
            return;
        if (this.rank[a] < this.rank[b])
            [a, b] = [b, a];
        this.parents[b] = a;
        if (this.rank[a] === this.rank[b])
            this.rank[a]++;
    }
}
exports.DisjointSet = DisjointSet;
function connectedComponents(entities, getEndpoints, tolerance = 1e-7) {
    const ds = new DisjointSet(entities.length), grid = new Map(), step = Math.max(tolerance, 1e-9);
    for (let i = 0; i < entities.length; i++)
        for (const p of getEndpoints(entities[i])) {
            const x = Math.floor(p[0] / step), y = Math.floor(p[1] / step);
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++)
                    for (const q of grid.get(`${x + dx},${y + dy}`) || [])
                        if ((0, geometry_1.distance)(p, q.p) <= tolerance)
                            ds.union(i, q.i);
            const key = `${x},${y}`;
            if (!grid.has(key))
                grid.set(key, []);
            grid.get(key).push({ i, p });
        }
    const out = new Map();
    for (let i = 0; i < entities.length; i++) {
        const k = ds.find(i);
        if (!out.has(k))
            out.set(k, []);
        out.get(k).push(entities[i]);
    }
    return [...out.values()];
}
function endpoints(e) {
    if (e.type === 'LINE')
        return [e.start, e.end];
    if (e.type === 'LWPOLYLINE')
        return e.closed ? e.points : [e.points[0], e.points.at(-1)];
    if (e.type === 'SPLINE')
        return [e.controlPoints[0], e.controlPoints.at(-1)];
    return [];
}
/** Only joins unambiguous degree-2 chains. Junctions remain junctions. No snapping. */
function joinLineChains(lines, tolerance = 1e-9) {
    const graph = new Map(), key = p => p.map(x => Math.round(x / tolerance)).join(',');
    for (const l of lines)
        for (const p of [l.start, l.end]) {
            const k = key(p);
            if (!graph.has(k))
                graph.set(k, []);
            graph.get(k).push(l);
        }
    const used = new Set(), chains = [];
    const walk = (line, from) => {
        const points = [from], members = [];
        let l = line, p = from;
        while (l && !used.has(l.id)) {
            used.add(l.id);
            members.push(l);
            const q = (0, geometry_1.near)(l.start, p, tolerance) ? l.end : l.start;
            points.push(q);
            const links = graph.get(key(q)) || [];
            if (links.length !== 2)
                break;
            const n = links.find(v => !used.has(v.id));
            if (!n)
                break;
            p = q;
            l = n;
        }
        return { points, members, closed: points.length > 2 && (0, geometry_1.near)(points[0], points.at(-1), tolerance) };
    };
    for (const l of lines) {
        if (used.has(l.id))
            continue;
        const a = graph.get(key(l.start)), b = graph.get(key(l.end));
        if (a.length !== 2 || b.length !== 2)
            chains.push(walk(l, a.length !== 2 ? l.start : l.end));
    }
    for (const l of lines)
        if (!used.has(l.id))
            chains.push(walk(l, l.start));
    return chains;
}

},
"@revector/ui":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisposableStore = void 0;
exports.element = element;
exports.button = button;
exports.download = download;
exports.toast = toast;
exports.dialog = dialog;
exports.askValue = askValue;
exports.crc32 = crc32;
exports.zipFiles = zipFiles;
/** Small framework-neutral UI primitives. All document-derived strings are text, never HTML. */
function element(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class')
            el.className = v;
        else if (k === 'text')
            el.textContent = v;
        else if (k === 'dataset')
            Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function')
            el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in el && k !== 'style')
            el[k] = v;
        else if (v !== false && v != null)
            el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity))
        if (c != null)
            el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
}
function button(text, onClick, { title = text, className = '', ...attrs } = {}) { return element('button', { type: 'button', text, title, class: className, onClick, ...attrs }); }
function download(data, name, type = 'application/octet-stream') { const blob = data instanceof Blob ? data : new Blob([data], { type }), url = URL.createObjectURL(blob), a = element('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); return blob; }
function toast(message, { error = false, timeout = 5000 } = {}) { const box = element('div', { class: 'rv-toast' + (error ? ' error' : ''), role: 'status', text: message }); document.body.append(box); setTimeout(() => box.remove(), timeout); return box; }
function dialog({ title, content, actions = [] }) { const d = element('dialog', { class: 'rv-dialog' }, element('header', {}, element('strong', { text: title }), button('×', () => d.close(), { title: 'Close dialog' })), element('section', {}, content), element('footer', {}, actions.map(a => button(a.label, () => a.run(d), { className: a.primary ? 'primary' : '' })))); document.body.append(d); d.addEventListener('close', () => d.remove(), { once: true }); d.showModal(); return d; }
function askValue(title, label, value = '', { type = 'text' } = {}) {
    return new Promise(resolve => {
        const input = element('input', { type, value, autocomplete: 'off' });
        const d = dialog({ title, content: element('label', {}, label, input), actions: [{ label: 'Cancel', run: d => d.close() }, { label: 'Continue', primary: true, run: d => { resolve(input.value); d.close(); } }] });
        d.addEventListener('close', () => resolve(null), { once: true });
        input.focus();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                resolve(input.value);
                d.close();
            }
        });
    });
}
class DisposableStore {
    constructor() { this.items = []; }
    add(fn) { this.items.push(fn); return fn; }
    dispose() {
        for (const f of this.items.splice(0).reverse())
            f();
    }
}
exports.DisposableStore = DisposableStore;
const crcTable = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes)
        c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
/** Standards-conforming ZIP32 stored entries. No compression dependency, no executable content. */
function zipFiles(files) {
    const chunks = [], central = [], encoder = new TextEncoder();
    let offset = 0;
    const header = n => new DataView(new ArrayBuffer(n));
    for (const file of files) {
        if (/(^|\/)\.\.(\/|$)|^[\\/]/.test(file.name))
            throw Error('Unsafe archive path');
        const name = encoder.encode(file.name), data = typeof file.data === 'string' ? encoder.encode(file.data) : new Uint8Array(file.data), crc = crc32(data);
        if (data.length > 0xffffffff || offset > 0xffffffff || files.length > 65535)
            throw Error('ZIP32 size limit');
        const h = header(30);
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x800, true);
        h.setUint16(12, 0x21, true);
        h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true);
        h.setUint32(22, data.length, true);
        h.setUint16(26, name.length, true);
        chunks.push(h.buffer, name, data);
        const c = header(46);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x800, true);
        c.setUint16(14, 0x21, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, data.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        central.push(c.buffer, name);
        offset += 30 + name.length + data.length;
    }
    const centralSize = central.reduce((s, c) => s + c.byteLength, 0), end = header(22);
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' });
}

},
"@revector/workbench":(require,module,exports)=>{
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Workbench = void 0;
exports.mountWorkbench = mountWorkbench;
const pdf_1 = require("@revector/pdf");
const engine_1 = require("@revector/engine");
const renderer_1 = require("@revector/renderer");
const rules_cad_1 = require("@revector/rules-cad");
const semantics_1 = require("@revector/semantics");
const model_1 = require("@revector/model");
const geometry_1 = require("@revector/geometry");
const ui_1 = require("@revector/ui");
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const enc = x => JSON.stringify(x, null, 2);
const ruleExample = { schema: 'revector.rules/1', rules: [{ id: 'plant.instrument-tags', title: 'Instrument tag classification', confidence: .99, when: { all: [{ field: 'type', value: 'TEXT' }, { field: 'text', op: 'prefix', value: 'PT-' }] }, then: { layer: 'INSTRUMENT_TAGS', semantic: { class: 'instrument-tag', discipline: 'instrumentation' } } }] };
const field = (title, node) => (0, ui_1.element)('label', { class: 'field' }, (0, ui_1.element)('span', { text: title }), node);
const select = (id, values, value) => (0, ui_1.element)('select', { id, value }, values.map(v => (0, ui_1.element)('option', { value: Array.isArray(v) ? v[0] : v, text: Array.isArray(v) ? v[1] : v, selected: (Array.isArray(v) ? v[0] : v) === value })));
const iconButton = (label, fn, title) => (0, ui_1.button)(label, fn, { className: 'icon-button', title });
/** Owns UI state only; every conversion runs through reusable packages and exported-DXF reparse. */
class Workbench {
    constructor(root, config = {}) { this.root = root; this.config = config; this.engine = new engine_1.ConversionEngine(); this.worker = config.conversionWorkerUrl ? new engine_1.ConversionWorker(config.conversionWorkerUrl) : null; this.disposables = new ui_1.DisposableStore(); this.abort = new AbortController(); this.source = null; this.bytes = null; this.scene = null; this.result = null; this.page = 1; this.fileName = 'Untitled.pdf'; this.decisions = {}; this.undo = []; this.redo = []; this.disabledRules = []; this.ruleSet = null; this.tab = 'recovery'; this.selected = null; this.job = 0; this.running = false; this.linked = true; this.build(); this.bind(); this.showOverview(); }
    build() {
        const shell = (0, ui_1.element)('div', { class: 'rv-shell' });
        this.root.replaceChildren(shell);
        this.shell = shell;
        this.fileInput = (0, ui_1.element)('input', { type: 'file', accept: '.pdf,application/pdf,.revector.json,.json', hidden: true });
        this.title = (0, ui_1.element)('span', { class: 'document-title', text: 'No document open' });
        this.status = (0, ui_1.element)('span', { text: 'Ready · vector-first · local processing' });
        this.version = select('version', ['2000', '2004', '2007', '2010', '2013', '2018'], '2018');
        this.units = select('units', ['mm', 'cm', 'm', 'in', 'pt', 'unitless'], 'mm');
        this.scale = (0, ui_1.element)('input', { id: 'scale', type: 'number', min: '.000001', step: 'any', value: '1', title: 'Model units per paper unit. Set 100 for a 1:100 drawing.' });
        this.profile = select('profile', [['cad', 'CAD recovery'], ['exact', 'Geometry only'], ['inferred', 'High-confidence inference'], ['pid', 'P&ID recovery']], 'cad');
        this.pageSelect = select('page', [['1', 'Page 1']], '1');
        this.strict = (0, ui_1.element)('input', { type: 'checkbox', id: 'strict' });
        this.convertButton = (0, ui_1.button)('Convert', () => this.run(true), { className: 'primary', id: 'convert', title: 'Convert page · Ctrl/Cmd+Enter' });
        this.exportButton = (0, ui_1.button)('Export DXF ↗', () => this.exportDxf(), { className: 'primary', id: 'export-dxf', disabled: true });
        const top = (0, ui_1.element)('header', { class: 'rv-top' }, (0, ui_1.element)('div', { class: 'brand' }, (0, ui_1.element)('span', { class: 'brand-mark', text: 'R' }), (0, ui_1.element)('b', { text: 'revector' }), (0, ui_1.element)('span', { class: 'brand-edition', text: 'STUDIO' })), (0, ui_1.element)('span', { class: 'top-separator' }), this.title, (0, ui_1.element)('div', { class: 'top-spacer' }), (0, ui_1.element)('span', { class: 'local-badge', text: '● Local workspace' }), (0, ui_1.button)('Guide', () => this.help()), (0, ui_1.button)('Project', () => this.projectMenu()), this.exportButton);
        const toolbar = (0, ui_1.element)('div', { class: 'rv-toolbar' }, (0, ui_1.button)('＋ Open PDF', () => this.fileInput.click(), { id: 'open-pdf' }), (0, ui_1.button)('Sample drawing', () => this.demo(), { id: 'demo' }), (0, ui_1.element)('i', { class: 'separator' }), this.pageSelect, field('PROFILE', this.profile), field('DXF', this.version), field('UNITS', this.units), field('SCALE', this.scale), (0, ui_1.element)('label', { class: 'check-label', title: 'Strict export stops when unsupported content remains' }, this.strict, 'Strict'), (0, ui_1.element)('div', { class: 'top-spacer' }), (0, ui_1.button)('Cancel', () => this.cancel(), { id: 'cancel' }), this.convertButton);
        this.explorer = (0, ui_1.element)('aside', { class: 'rv-explorer' }, (0, ui_1.element)('div', { class: 'section-label', text: 'DOCUMENT EXPLORER' }));
        const rail = (0, ui_1.element)('nav', { class: 'rv-rail', 'aria-label': 'Workspace panels' }, iconButton('▤', () => this.explorer.classList.toggle('collapsed'), 'Toggle document explorer'), iconButton('⌘', () => this.setTab('recovery'), 'Semantic recovery'), iconButton('⚙', () => this.setTab('rules'), 'Rule engine'), iconButton('!', () => this.setTab('diagnostics'), 'Conversion diagnostics'), (0, ui_1.element)('div', { class: 'top-spacer' }), iconButton('?', () => this.help(), 'Guide'));
        this.pdfCanvas = (0, ui_1.element)('canvas', { id: 'pdf-canvas', 'aria-label': 'Source PDF drawing viewport' });
        this.cadCanvas = (0, ui_1.element)('canvas', { id: 'dxf-canvas', 'aria-label': 'Exported DXF drawing viewport' });
        this.pdfInfo = (0, ui_1.element)('span', { class: 'panel-meta', text: 'PDF.js · source appearance' });
        this.cadInfo = (0, ui_1.element)('span', { class: 'panel-meta', text: 'Serialized DXF · round-trip preview' });
        const sourcePane = (0, ui_1.element)('section', { class: 'viewport-pane' }, (0, ui_1.element)('header', { class: 'pane-heading' }, (0, ui_1.element)('span', { class: 'pane-indicator pdf' }), (0, ui_1.element)('b', { text: 'SOURCE PDF' }), this.pdfInfo, (0, ui_1.element)('div', { class: 'top-spacer' }), iconButton('⊡', () => this.pdfView.fit(), 'Fit source page')), (0, ui_1.element)('div', { class: 'canvas-host' }, this.pdfCanvas, (0, ui_1.element)('span', { class: 'canvas-caption', text: 'Original appearance' })));
        this.gridButton = iconButton('⌗', () => { this.cadView.grid = !this.cadView.grid; this.cadView.invalidate(); this.gridButton.classList.toggle('active', this.cadView.grid); }, 'Toggle drafting grid');
        this.themeButton = iconButton('◐', () => { this.cadView.paper = !this.cadView.paper; this.cadView.invalidate(); }, 'Switch paper / dark CAD view');
        this.linkButton = iconButton('↔', () => this.toggleLink(), 'Link viewport cameras');
        this.linkButton.classList.add('active');
        this.measureButton = iconButton('⌁', () => { this.cadView.measureMode = !this.cadView.measureMode; this.measureButton.classList.toggle('active', this.cadView.measureMode); this.setStatus(this.cadView.measureMode ? 'Measure: click two points in the DXF viewport.' : 'Selection mode'); }, 'Two-point measurement');
        const targetPane = (0, ui_1.element)('section', { class: 'viewport-pane' }, (0, ui_1.element)('header', { class: 'pane-heading' }, (0, ui_1.element)('span', { class: 'pane-indicator' }), (0, ui_1.element)('b', { text: 'RECOVERED DXF' }), this.cadInfo, (0, ui_1.element)('div', { class: 'top-spacer' }), this.linkButton, this.gridButton, this.themeButton, this.measureButton, iconButton('⊡', () => this.fit(), 'Fit both pages')), (0, ui_1.element)('div', { class: 'canvas-host' }, this.cadCanvas, (0, ui_1.element)('span', { class: 'canvas-caption', text: 'Editable entities · select to inspect' })));
        this.panes = (0, ui_1.element)('div', { class: 'rv-panes' }, sourcePane, targetPane);
        this.inspector = (0, ui_1.element)('aside', { class: 'rv-inspector' });
        this.tabs = (0, ui_1.element)('div', { class: 'bottom-tabs' });
        this.tabButtons = {};
        for (const [id, title] of [['recovery', 'Semantic recovery'], ['diagnostics', 'Diagnostics'], ['rules', 'Rule engine'], ['source', 'Source & report']]) {
            const b = (0, ui_1.button)(title, () => this.setTab(id));
            b.dataset.tab = id;
            this.tabButtons[id] = b;
            this.tabs.append(b);
        }
        this.bottomContent = (0, ui_1.element)('div', { class: 'bottom-content' });
        this.bottom = (0, ui_1.element)('section', { class: 'rv-bottom' }, this.tabs, this.bottomContent);
        const center = (0, ui_1.element)('main', { class: 'rv-center' }, this.panes, this.bottom);
        const body = (0, ui_1.element)('div', { class: 'rv-body' }, rail, this.explorer, center, this.inspector);
        this.coords = (0, ui_1.element)('span', { class: 'mono', text: 'X 0.00  Y 0.00' });
        this.performance = (0, ui_1.element)('span', { class: 'mono', text: '—' });
        this.zoom = (0, ui_1.element)('span', { class: 'mono', text: '100%' });
        shell.append(top, toolbar, body, (0, ui_1.element)('footer', { class: 'rv-status' }, (0, ui_1.element)('span', { class: 'status-dot' }), this.status, (0, ui_1.element)('div', { class: 'top-spacer' }), this.coords, (0, ui_1.element)('span', { class: 'status-divider' }), this.performance, (0, ui_1.element)('span', { class: 'status-divider' }), this.zoom), this.fileInput);
        this.pdfView = new renderer_1.CanvasViewport(this.pdfCanvas, { kind: 'pdf' });
        this.cadView = new renderer_1.CanvasViewport(this.cadCanvas, { kind: 'cad' });
        this.unlink = (0, renderer_1.linkViewports)(this.pdfView, this.cadView);
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
        return { version: this.version.value, units: this.units.value, drawingScale: scale, profile: this.profile.value, strict: this.strict.checked, decisions: this.decisions[this.page] || {}, disabledRules: [...this.disabledRules], ruleSet: this.ruleSet };
    }
    pdfOptions(name) { const base = this.config.assetBase || './vendor/pdfjs/'; return { name, moduleUrl: this.config.pdfjsModuleUrl || base + 'legacy/build/pdf.mjs', workerUrl: this.config.pdfjsWorkerUrl || base + 'legacy/build/pdf.worker.mjs', pdfOptions: { cMapUrl: base + 'cmaps/', cMapPacked: true, wasmUrl: base + 'wasm/', iccUrl: base + 'iccs/', ...this.config.pdfOptions }, onPassword: reason => (0, ui_1.askValue)(reason === 2 ? 'Incorrect PDF password' : 'Encrypted PDF', 'Enter the password to open this PDF', '', { type: 'password' }) }; }
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
        this.exportButton.disabled = true;
        this.setStatus('Opening PDF locally…');
        try {
            this.source = await pdf_1.PdfSource.open(bytes, this.pdfOptions(name));
            this.pageSelect.replaceChildren(...Array.from({ length: this.source.numPages }, (_, i) => (0, ui_1.element)('option', { value: String(i + 1), text: `Page ${i + 1} / ${this.source.numPages}` })));
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
        const id = ++this.job;
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
            if (extract || !this.scene)
                this.scene = await this.source.extract(this.page, { signal: controller.signal, onProgress: progress });
            if (id !== this.job)
                return;
            const scene = this.scene;
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
                (0, ui_1.toast)('Workers are blocked in this browser context. Using the same conversion kernel on the main thread.');
                result = await this.engine.convertScene(scene, { ...options, signal: controller.signal, onProgress: progress });
            }
            if (id !== this.job)
                return;
            this.result = result;
            this.cadView.setDocument(result.preview);
            const image = document.createElement('canvas');
            await this.source.render(this.page, image, { scale: Math.min(3, Math.max(1.5, 1400 / scene.pageSize[0])), signal: controller.signal });
            if (id !== this.job)
                return;
            this.pdfView.setImage(image, result.document.pageBox);
            this.pdfView.overlays = [];
            this.cadView.selection.clear();
            this.refresh();
            this.fit();
            this.exportButton.disabled = false;
            this.exportReady = true;
            const s = (0, model_1.summary)(result.document), warnings = result.report.diagnostics.filter(d => d.severity !== 'info').length;
            this.setStatus(`Converted · ${fmt(s.entities)} entities · ${fmt(result.document.blocks.length)} blocks · ${fmt(result.report.timings.totalMs)} ms${warnings ? ' · ' + warnings + ' review notice' + (warnings === 1 ? '' : 's') : ''}`);
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
        this.unlink = this.linked ? (0, renderer_1.linkViewports)(this.pdfView, this.cadView) : null;
        this.linkButton.classList.toggle('active', this.linked);
        if (this.linked)
            this.fit();
    }
    refresh() { const d = this.result.document, r = this.result.report; this.pdfInfo.textContent = `PDF.js ${pdf_1.PDFJS_VERSION} · ${fmt(this.scene.items.length)} paint items`; this.cadInfo.textContent = `${this.result.dxf.acadVersion} · ${fmt(d.entities.length)} entities`; this.refreshExplorer(); this.renderTab(); this.showOverview(); }
    refreshExplorer() {
        this.explorer.replaceChildren((0, ui_1.element)('div', { class: 'section-label', text: 'DOCUMENT EXPLORER' }), (0, ui_1.element)('div', { class: 'tree-file' }, (0, ui_1.element)('span', { class: 'file-badge', text: 'PDF' }), (0, ui_1.element)('span', { text: this.fileName.replace(/\.pdf$/i, '') })));
        const pages = (0, ui_1.element)('div', { class: 'tree-pages' });
        for (let p = 1; p <= this.source.numPages; p++)
            pages.append((0, ui_1.button)(`▧  Sheet ${String(p).padStart(2, '0')}`, () => this.selectPage(p), { className: 'tree-row' + (p === this.page ? ' selected' : '') }));
        this.explorer.append(pages);
        const d = this.result.document;
        this.explorer.append((0, ui_1.element)('div', { class: 'section-label', text: `LAYERS · ${d.layers.length}` }), (0, ui_1.element)('div', { class: 'muted small tree-hint', text: 'Visibility controls the DXF preview only' }));
        const counts = new Map();
        for (const e of d.entities)
            counts.set(e.layer, (counts.get(e.layer) || 0) + 1);
        for (const layer of d.layers) {
            const checked = !this.cadView.renderer.hiddenLayers.has(layer.name), input = (0, ui_1.element)('input', { type: 'checkbox', checked });
            input.addEventListener('change', () => {
                if (input.checked)
                    this.cadView.renderer.hiddenLayers.delete(layer.name);
                else
                    this.cadView.renderer.hiddenLayers.add(layer.name);
                this.cadView.invalidate();
            });
            const swatch = (0, ui_1.element)('i', { class: 'layer-swatch' });
            swatch.style.background = `rgb(${(layer.color || [120, 130, 145]).join(',')})`;
            this.explorer.append((0, ui_1.element)('label', { class: 'layer-row', title: layer.name }, input, swatch, (0, ui_1.element)('span', { text: layer.name }), (0, ui_1.element)('small', { text: counts.get(layer.name) || '·' })));
        }
        this.explorer.append((0, ui_1.element)('div', { class: 'section-label', text: `BLOCK LIBRARY · ${d.blocks.length}` }));
        for (const b of d.blocks)
            this.explorer.append((0, ui_1.button)(`◇ ${b.name}`, () => this.inspectBlock(b), { className: 'tree-row' }));
        this.explorer.append((0, ui_1.element)('div', { class: 'explorer-foot' }, (0, ui_1.element)('b', { text: 'No raster tracing' }), (0, ui_1.element)('span', { text: 'Only PDF vectors and encoded text enter the CAD model.' })));
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
            this.bottomContent.append((0, ui_1.element)('div', { class: 'empty-bottom' }, (0, ui_1.element)('b', { text: 'Recover the drawing. Keep the evidence.' }), (0, ui_1.element)('span', { text: 'Open a vector PDF or load the sample to inspect exact geometry and review semantic proposals.' })));
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
        const bar = (0, ui_1.element)('div', { class: 'recovery-bar' }, (0, ui_1.element)('span', { class: 'count-chip good', text: `${counts.accepted || 0} accepted` }), (0, ui_1.element)('span', { class: 'count-chip', text: `${counts.pending || 0} to review` }), (0, ui_1.element)('span', { class: 'muted', text: 'Confidence is a rule score, not a calibrated probability.' }), (0, ui_1.element)('div', { class: 'top-spacer' }), (0, ui_1.button)('Undo', () => this.undoDecision(false), { disabled: !this.undo.length }), (0, ui_1.button)('Redo', () => this.undoDecision(true), { disabled: !this.redo.length }));
        this.bottomContent.append(bar);
        const table = (0, ui_1.element)('table', { class: 'data-table' }), head = (0, ui_1.element)('thead', {}, (0, ui_1.element)('tr', {}, ['STATE', 'RECOVERED MEANING', 'RULE', 'CONFIDENCE', 'MEMBERS', 'REVIEW'].map(t => (0, ui_1.element)('th', { text: t }))));
        table.append(head);
        const body = (0, ui_1.element)('tbody');
        for (const c of [...all].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))) {
            const row = (0, ui_1.element)('tr', { class: c.status === 'conflict' ? 'has-conflict' : '' }, (0, ui_1.element)('td', {}, (0, ui_1.element)('span', { class: 'state ' + c.status, text: c.status })), (0, ui_1.element)('td', { class: 'candidate-name', text: c.title }), (0, ui_1.element)('td', { class: 'mono muted', text: c.rule.replace(/^cad\./, '') }), (0, ui_1.element)('td', {}, (0, ui_1.element)('span', { class: 'score', text: `${fmt(c.confidence * 100)}%` }), (0, ui_1.element)('small', { class: 'muted', text: c.exact ? ' structure' : ' inference' })), (0, ui_1.element)('td', { class: 'mono', text: c.members.length }), (0, ui_1.element)('td', {}, (0, ui_1.button)(c.status === 'accepted' ? 'Revert' : 'Accept', e => { e.stopPropagation(); this.decide(c, c.status === 'accepted' ? 'reject' : 'accept'); }, { className: 'table-action', disabled: c.status === 'conflict' }), (0, ui_1.button)(c.status === 'rejected' ? 'Reset' : 'Reject', e => { e.stopPropagation(); this.decide(c, c.status === 'rejected' ? null : 'reject'); }, { className: 'table-action muted', disabled: c.status === 'accepted' })));
            row.addEventListener('click', () => this.inspectCandidate(c));
            body.append(row);
        }
        table.append(body);
        this.bottomContent.append(table);
        if (!all.length)
            this.bottomContent.append((0, ui_1.element)('p', { class: 'muted', text: 'No semantic proposals. Source geometry remains editable.' }));
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
        this.bottomContent.append((0, ui_1.element)('div', { class: 'recovery-bar' }, (0, ui_1.element)('b', { text: `${list.length} conversion notices` }), (0, ui_1.element)('span', { class: 'muted', text: 'Unmapped content is reported, not replaced with invented geometry.' })));
        if (!list.length)
            this.bottomContent.append((0, ui_1.element)('p', { class: 'good', text: 'No conversion diagnostics.' }));
        for (const d of list)
            this.bottomContent.append((0, ui_1.element)('div', { class: 'diagnostic ' + d.severity }, (0, ui_1.element)('span', { class: 'state ' + d.severity, text: d.severity || 'info' }), (0, ui_1.element)('code', { text: d.code }), (0, ui_1.element)('span', { text: d.message })));
    }
    renderRules() {
        const bar = (0, ui_1.element)('div', { class: 'recovery-bar' }, (0, ui_1.element)('b', { text: 'Deterministic, replayable rule pipeline' }), (0, ui_1.element)('span', { class: 'muted', text: 'Exact structures auto-apply. Inferences stay reviewable.' }), (0, ui_1.element)('div', { class: 'top-spacer' }), (0, ui_1.button)('Edit JSON rules', () => this.editRules()), (0, ui_1.button)('Apply changes', () => this.run(false)));
        this.bottomContent.append(bar);
        const grid = (0, ui_1.element)('div', { class: 'rules-grid' });
        for (const r of rules_cad_1.cadRules) {
            const input = (0, ui_1.element)('input', { type: 'checkbox', checked: !this.disabledRules.includes(r.id) });
            input.addEventListener('change', () => {
                this.disabledRules = this.disabledRules.filter(x => x !== r.id);
                if (!input.checked)
                    this.disabledRules.push(r.id);
            });
            grid.append((0, ui_1.element)('label', { class: 'rule-card' }, input, (0, ui_1.element)('div', {}, (0, ui_1.element)('b', { text: r.title || r.id }), (0, ui_1.element)('code', { text: r.id }), (0, ui_1.element)('span', { text: r.description || 'Geometry and provenance aware CAD recovery' }))));
        }
        this.bottomContent.append(grid);
        if (this.ruleSet)
            this.bottomContent.append((0, ui_1.element)('div', { class: 'rule-custom', text: `Custom rules loaded: ${this.ruleSet.rules.length}` }));
    }
    renderSource() { const r = this.result.report; this.bottomContent.append((0, ui_1.element)('div', { class: 'recovery-bar' }, (0, ui_1.element)('b', { text: 'Conversion provenance' }), (0, ui_1.element)('span', { class: 'muted', text: 'Source paint IDs, rule evidence, history, and measured conversion timings' }), (0, ui_1.element)('div', { class: 'top-spacer' }), (0, ui_1.button)('Save report', () => (0, ui_1.download)(enc(r), this.baseName() + '.report.json', 'application/json')), (0, ui_1.button)('Save intermediate model', () => (0, ui_1.download)(enc(this.result.document), this.baseName() + '.cad.json', 'application/json'))), (0, ui_1.element)('pre', { class: 'source-report', text: enc({ source: { name: r.source.name, producer: r.source.producer, page: this.page }, target: r.target, coverage: r.coverage, timings: r.timings, validation: r.validation }) })); }
    showOverview() {
        this.inspector.replaceChildren((0, ui_1.element)('div', { class: 'section-label', text: 'CONVERSION INSPECTOR' }), (0, ui_1.element)('div', { class: 'inspector-intro' }, (0, ui_1.element)('span', { class: 'eyebrow', text: 'FROM PLOT TO MODEL' }), (0, ui_1.element)('h2', { text: 'Structure,\nnot just strokes.' }), (0, ui_1.element)('p', { class: 'muted', text: 'Review recovered entities alongside the original PDF. Every semantic proposal keeps its evidence.' })));
        if (this.result) {
            const d = this.result.document, s = (0, model_1.summary)(d);
            const stats = (0, ui_1.element)('div', { class: 'stat-grid' });
            for (const [label, value] of [['ENTITIES', s.entities], ['LAYERS', d.layers.length], ['BLOCKS', d.blocks.length], ['TO REVIEW', d.candidates.filter(c => c.status === 'pending').length]])
                stats.append((0, ui_1.element)('div', {}, (0, ui_1.element)('b', { text: fmt(value) }), (0, ui_1.element)('span', { text: label })));
            this.inspector.append(stats, (0, ui_1.element)('div', { class: 'section-label', text: 'OUTPUT CONTRACT' }));
            for (const [k, v] of [['Format', `DXF ${this.version.value}`], ['Coordinates', `${this.units.value} · Y up`], ['Drawing scale', `1 : ${this.scale.value}`], ['Curves', 'Native cubic SPLINE'], ['Text', 'Editable Unicode'], ['Raster images', 'Not traced / not exported']])
                this.inspector.append(this.property(k, v));
        }
        this.inspector.append((0, ui_1.element)('div', { class: 'inspector-note' }, (0, ui_1.element)('b', { text: 'Evidence-first recovery' }), (0, ui_1.element)('p', { text: 'A PDF form is reusable structure, not proof of an original CAD block. Inferred names and meanings are identified explicitly.' })), (0, ui_1.button)('Convert all pages to ZIP', () => this.exportAll(), { className: 'wide', disabled: !this.source }));
    }
    property(k, v) { return (0, ui_1.element)('div', { class: 'property' }, (0, ui_1.element)('span', { class: 'muted', text: k }), (0, ui_1.element)('span', { text: String(v) })); }
    inspect(e) {
        this.selected = e;
        if (!e) {
            this.pdfView.overlays = [];
            this.pdfView.invalidate();
            this.showOverview();
            return;
        }
        this.inspector.replaceChildren((0, ui_1.element)('div', { class: 'section-label', text: 'ENTITY PROPERTIES' }), (0, ui_1.element)('div', { class: 'entity-heading' }, (0, ui_1.element)('span', { class: 'type-badge', text: e.type }), (0, ui_1.element)('b', { text: e.id })));
        for (const [k, v] of [['Layer', e.layer], ['Color', (e.color || []).join(', ')], ['Lineweight', `${e.lineweight || 0} mm`], ['Text', e.text], ['Block', e.name], ['Source page', e.source?.page], ['PDF operation', e.source?.op], ['Source ID', e.source?.id], ['Semantic class', e.semantic?.class]])
            if (v !== undefined)
                this.inspector.append(this.property(k, v));
        this.inspector.append((0, ui_1.element)('pre', { class: 'entity-json', text: enc(e) }));
        const box = (0, model_1.entityBox)(e, this.result.preview);
        this.pdfView.overlays = (0, geometry_1.validBox)(box) ? [box] : [];
        this.pdfView.invalidate();
    }
    inspectCandidate(c) {
        this.inspector.replaceChildren((0, ui_1.element)('div', { class: 'section-label', text: 'RECOVERY EVIDENCE' }), (0, ui_1.element)('div', { class: 'candidate-detail' }, (0, ui_1.element)('span', { class: 'state ' + c.status, text: c.status }), (0, ui_1.element)('h3', { text: c.title }), this.property('Confidence', `${fmt(c.confidence * 100)}%`), this.property('Geometry', c.exact ? 'Preserved by rule' : 'Inferred replacement'), this.property('Members', c.members.length), this.property('Rule', c.rule), (0, ui_1.element)('p', { class: 'muted', text: c.conflict || 'Accepting replays conversion from the original immutable PDF scene.' }), (0, ui_1.element)('pre', { class: 'evidence', text: enc(c.evidence) }), (0, ui_1.button)('Accept proposal', () => this.decide(c, 'accept'), { className: 'primary wide', disabled: c.status === 'accepted' || c.status === 'conflict' }), (0, ui_1.button)('Reject / revert', () => this.decide(c, 'reject'), { className: 'wide' })));
        const d = this.result.preview, ids = new Set([...c.members, ...(c.result || [])]), entities = d.entities.filter(e => ids.has(e.id));
        this.cadView.selection = new Set(entities.map(e => e.id));
        this.cadView.invalidate();
        const box = entities.reduce((b, e) => (0, geometry_1.union)(b, (0, model_1.entityBox)(e, d)), (0, geometry_1.emptyBox)());
        this.pdfView.overlays = (0, geometry_1.validBox)(box) ? [box] : [];
        this.pdfView.invalidate();
    }
    inspectBlock(b) { this.inspector.replaceChildren((0, ui_1.element)('div', { class: 'section-label', text: 'BLOCK DEFINITION' }), (0, ui_1.element)('h3', { class: 'inspector-title', text: b.name }), this.property('Entities', b.entities.length), this.property('Instances', this.result.document.entities.filter(e => e.type === 'INSERT' && e.name === b.name).length), (0, ui_1.element)('pre', { class: 'entity-json', text: enc({ origin: b.origin, source: b.source, types: b.entities.reduce((o, e) => (o[e.type] = (o[e.type] || 0) + 1, o), {}) }) })); }
    showMeasurement(m) {
        this.inspector.replaceChildren((0, ui_1.element)('div', { class: 'section-label', text: 'TWO-POINT MEASUREMENT' }), (0, ui_1.element)('div', { class: 'candidate-detail' }, (0, ui_1.element)('h2', { text: `${fmt(m.distance)} ${this.units.value}` }), (0, ui_1.element)('p', { class: 'muted', text: 'Measured in the current exported DXF coordinate system.' }), (0, ui_1.button)('Calibrate scale', async () => {
            const raw = await (0, ui_1.askValue)('Calibrate drawing scale', `Known distance in ${this.units.value}`, String(m.distance));
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
        }, { className: 'primary wide' }), (0, ui_1.button)('Back to overview', () => this.showOverview(), { className: 'wide' })));
    }
    editRules() {
        const text = (0, ui_1.element)('textarea', { class: 'rule-editor', spellcheck: false, value: enc(this.ruleSet || ruleExample) });
        (0, ui_1.dialog)({ title: 'Declarative rule extension · revector.rules/1', content: (0, ui_1.element)('div', {}, (0, ui_1.element)('p', { class: 'muted', text: 'JSON rules may classify entities and assign layers. Advanced graph and geometry plugins use the public JavaScript Rule interface. No eval.' }), text), actions: [{ label: 'Remove custom rules', run: d => { this.ruleSet = null; d.close(); this.renderRules(); } }, { label: 'Validate & apply', primary: true, run: d => {
                        try {
                            const json = JSON.parse(text.value);
                            (0, semantics_1.compileRuleSet)(json);
                            this.ruleSet = json;
                            d.close();
                            this.run(false);
                        }
                        catch (e) {
                            (0, ui_1.toast)(e.message, { error: true });
                        }
                    } }] });
    }
    exportDxf() {
        if (!this.result || !this.exportReady)
            return (0, ui_1.toast)('Open and convert a PDF first.');
        (0, ui_1.download)(this.result.dxf.text, this.baseName() + `.R${this.version.value}.dxf`, 'application/dxf');
        this.setStatus(`Exported ${this.result.dxf.acadVersion} · ${fmt(this.result.dxf.text.length)} characters`);
    }
    baseName() { return this.fileName.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + `-page-${this.page}`; }
    projectMenu() {
        (0, ui_1.dialog)({ title: 'Project & interchange', content: (0, ui_1.element)('p', { text: 'Save a reproducible project with the original PDF, conversion settings, rule decisions, and custom rules. Conversion is local; nothing is uploaded.' }), actions: [{ label: 'Open project', run: d => { d.close(); this.fileInput.click(); } }, { label: 'Save project', primary: true, run: d => {
                        if (!this.bytes)
                            return;
                        (0, ui_1.download)(enc({ schema: 'revector.project/1', name: this.fileName, pdf: Array.from(this.bytes), page: this.page, settings: this.options(), decisions: this.decisions, disabledRules: this.disabledRules, ruleSet: this.ruleSet }), this.baseName() + '.revector.json', 'application/json');
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
                const scene = p === this.page && this.scene ? this.scene : await this.source.extract(p, { signal: controller.signal });
                const config = { ...options, decisions: this.decisions[p] || {} };
                const r = this.worker ? await this.worker.convert(scene, config, { signal: controller.signal }) : await this.engine.convertScene(scene, { ...config, signal: controller.signal });
                files.push({ name: `page-${p}.R${options.version}.dxf`, data: r.dxf.text }, { name: `page-${p}.report.json`, data: enc(r.report) });
            }
            (0, ui_1.download)((0, ui_1.zipFiles)(files), this.fileName.replace(/\.pdf$/i, '') + '-converted.zip');
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
    help() { (0, ui_1.dialog)({ title: 'Revector Studio · vector-first CAD recovery', content: (0, ui_1.element)('div', { class: 'guide' }, (0, ui_1.element)('h3', { text: 'A local, inspectable conversion workflow' }), (0, ui_1.element)('p', { text: 'Open a vector PDF, select a page, choose units and the drawing scale, then Convert. PDF points are converted to the selected unit; a 1:100 printed drawing needs drawing scale 100 to recover model distances.' }), (0, ui_1.element)('p', { text: 'The left panel shows PDF.js rendering. The right panel reads the actual serialized DXF. Drag to pan, use the wheel to zoom, double-click or press F to fit, and click entities or proposals to inspect source evidence. The ↔ control synchronizes views.' }), (0, ui_1.element)('h3', { text: 'Meaning is recovered, not assumed' }), (0, ui_1.element)('p', { text: 'Exact form reuse and conservative structural rules can apply automatically. Review inferred circles, dimensions, tags, hatching, and centerlines. Accept/reject decisions replay from the source scene; Undo and Redo never accumulate geometry damage.' }), (0, ui_1.element)('h3', { text: 'Explicit format boundaries' }), (0, ui_1.element)('p', { text: 'No OCR, raster tracing, or fabricated image geometry. PDF shading meshes, soft masks, complex blend composition, Type 3 glyphs, clipped text, and some pattern cases require review. Embedded font programs are not exported. Substituted CAD fonts can change text appearance. Strict mode blocks exports with unresolved error diagnostics.' }), (0, ui_1.element)('p', { text: 'DXF 2000 uses indexed colors; newer versions retain true color. Printed dimensions are inferred non-associative DIMENSION entities with retained display geometry, not recovered original CAD constraints.' }), (0, ui_1.element)('p', { class: 'mono', text: 'Ctrl/Cmd+O Open  ·  Ctrl/Cmd+Enter Convert  ·  Ctrl/Cmd+S Export  ·  F Fit  ·  Escape Cancel' })), actions: [{ label: 'Close', primary: true, run: d => d.close() }] }); }
    setStatus(text) {
        if (this.status)
            this.status.textContent = text;
    }
    error(e) { console.error(e); this.setStatus(`Error: ${e.message}`); (0, ui_1.toast)(e.message, { error: true, timeout: 10000 }); this.config.onError?.(e); }
    async dispose() { this.cancel(); this.abort.abort(); this.unlink?.(); this.disposables.dispose(); this.worker?.dispose(); this.pdfView.dispose(); this.cadView.dispose(); await this.source?.dispose(); this.root.replaceChildren(); }
}
exports.Workbench = Workbench;
function mountWorkbench(root, config = {}) {
    const workbench = new Workbench(root, config);
    if (config.autoDemo)
        void workbench.demo();
    return workbench;
}

},
};
const cache=Object.create(null);function require(id){if(cache[id])return cache[id].exports;const f=factories[id];if(!f)throw Error('Unknown module '+id);const module={exports:{}};cache[id]=module;f(require,module,module.exports);return module.exports;}
require('@revector/engine/worker.js');
