import { stableHash, pathEdges, near } from '@revector/geometry';
import { DXF_VERSIONS, documentBox, validateDocument, diagnostic, allEntities } from '@revector/model';
import { ACI } from './aci.js';
const UNIT_CODES = { unitless: 0, in: 1, mm: 4, cm: 5, m: 6, pt: 0 };
const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
export function dxfString(value) {
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
export function nearestACI(rgb) {
    let best = 7, error = Infinity;
    for (let i = 1; i < 256; i++) {
        const v = ACI[i], c = [v >>> 16 & 255, v >>> 8 & 255, v & 255], d = c.reduce((s, x, j) => s + (x - rgb[j]) ** 2, 0);
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
export function exportDxf(doc, { version = '2018', precision = 10, strict = false, xdata = true } = {}) {
    version = String(version);
    if (!DXF_VERSIONS[version])
        throw new RangeError('DXF version must be 2000, 2004, 2007, 2010, 2013 or 2018');
    for (const [label, values, normalize] of [['layer', doc.layers.map(x => x.name), name], ['block', doc.blocks.map(x => x.name), blockName], ['group', doc.groups.map(x => x.name), name]]) {
        const keys = values.map(x => normalize(x).toUpperCase());
        if (new Set(keys).size !== keys.length)
            throw Error(`DXF ${label} names collide after normalization`);
    }
    const check = validateDocument(doc);
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
    for (const e of allEntities(doc).flatMap(e => [e, ...e.attributes || []]))
        if (['TEXT', 'MTEXT', 'ATTRIB'].includes(e.type)) {
            const font = e.font || 'Arial';
            if (!fonts.has(font))
                fonts.set(font, { name: 'RV_' + stableHash(font).toUpperCase(), font: safeFont(font), handle: h() });
        }
    const linetypes = new Map([['BYBLOCK', { name: 'BYBLOCK', dash: [], handle: h() }], ['BYLAYER', { name: 'BYLAYER', dash: [], handle: h() }], ['CONTINUOUS', { name: 'CONTINUOUS', dash: [], handle: h() }]]);
    for (const e of allEntities(doc))
        if (e.dash?.length) {
            const k = stableHash(e.dash);
            if (!linetypes.has(k))
                linetypes.set(k, { name: 'RV_DASH_' + k.toUpperCase(), dash: e.dash, handle: h() });
        }
    const layerHandles = new Map(doc.layers.map(l => [l.name, h()]));
    const appids = [{ name: 'ACAD', handle: h() }, { name: 'REVECTOR', handle: h() }];
    const dimStyle = h(), vport = h();
    const groupHandles = new Map(doc.groups.map(g => [g.name, h()]));
    for (const e of allEntities(doc)) {
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
            tag(6, linetypes.get(stableHash(e.dash)).name);
        if (e.lineweight != null)
            tag(370, nearestWeight(e.lineweight));
        if (modern && e.opacity != null && e.opacity < 1)
            tag(440, 0x02000000 | Math.round(Math.max(0, e.opacity) * 255));
    }
    function provenance(e) {
        if (!xdata)
            return;
        const value = JSON.stringify({ id: e.id, source: { ids: (e.source?.ids || []).slice(0, 64), page: e.source?.page, operator: e.source?.operator, form: e.source?.form, ref: stableHash(e.source || {}) }, semantic: e.semantic || {}, font: e.font });
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
            const edges = pathEdges({ ...p, closed: true });
            if (edges.every(s => s.kind === 'L')) {
                let points = [p.start, ...p.segments.map(s => s.to)];
                if (points.length > 1 && near(points[0], points.at(-1)))
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
    const entities = allEntities(doc);
    if (!modern && entities.some(e => e.opacity != null && e.opacity < 1))
        diagnostics.push(diagnostic('DXF2000_TRANSPARENCY', 'DXF 2000 cannot retain the requested entity transparency.', 'error'));
    if (!modern && entities.some(e => e.color && ACI[nearestACI(e.color)] !== rgbInt(e.color)))
        diagnostics.push(diagnostic('DXF2000_TRUECOLOR', 'DXF 2000 uses nearest indexed colors; true-color entity tags are omitted.', 'warning'));
    if (entities.some(e => e.dashPhase))
        diagnostics.push(diagnostic('DASH_PHASE', 'DXF linetypes do not preserve arbitrary PDF per-path dash phase.', 'warning'));
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
    const ext = documentBox(doc);
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
    tag(1, DXF_VERSIONS[version]);
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
    return { text, version, acadVersion: DXF_VERSIONS[version], diagnostics, entityCount: doc.entities.length, handleCount: next - 0x100 };
}
export function writeDxf(doc, options) { return exportDxf(doc, options).text; }
