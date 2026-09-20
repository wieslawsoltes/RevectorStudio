import {curveRecoveryRule} from './curves.js';
export {curveRecoveryRule} from './curves.js';
import { inferCircle, stableHash, near, sub, add, mul, dot, cross, length, distance, emptyBox, union, transform, compose, inverse, pathBox } from '@revector/geometry';
import { entityBox, entityPaths } from '@revector/model';
import { SpatialIndex, connectedComponents, endpoints, joinLineChains } from '@revector/topology';
const clone = x => structuredClone(x);
const colorKey = e => [e.layer, e.color, e.lineweight, e.opacity, e.dash].join('|');
function offsetEntity(e, origin, id) {
    const v = p => sub(p, origin), o = { ...clone(e), id };
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
export const cadRules = [curveRecoveryRule,
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
                for (const c of joinLineChains(lines))
                    if (c.members.length >= 2 && c.members.length <= 512) {
                        const id = 'join-' + stableHash(c.members.map(e => e.id)), points = c.closed ? c.points.slice(0, -1) : c.points;
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
                    const i = remaining.findIndex(e => near(edges.at(-1).controlPoints[3], e.controlPoints[0], 1e-7));
                    if (i < 0)
                        break;
                    edges.push(remaining.splice(i, 1)[0]);
                }
                if (edges.length !== 4 || !near(edges[3].controlPoints[3], edges[0].controlPoints[0], 1e-7))
                    continue;
                const paths = [{ start: edges[0].controlPoints[0], segments: edges.map(e => ({ kind: 'C', c1: e.controlPoints[1], c2: e.controlPoints[2], to: e.controlPoints[3] })), closed: true }];
                const c = inferCircle(paths);
                if (!c)
                    continue;
                const id = 'circle-' + stableHash(es.map(e => e.id));
                out.push({ title: 'Recover a native CIRCLE from a printed cubic circle', members: es.map(e => e.id), confidence: .97, exact: false, errorBound: c.maxError, evidence: [{ kind: 'four-cubic-closed-contour' }, { kind: 'radial-fit', maxDeviation: c.maxError, relativeDeviation: c.relativeError, samplesPerCubic: 33 }], proposal: { remove: es.map(e => e.id), add: [{ ...clone(es[0]), id, type: 'CIRCLE', center: c.center, radius: c.radius, source: { ids: [...new Set(es.flatMap(e => e.source?.ids || []))] }, semantic: { class: 'circle', method: 'bounded-conic-inference' } }] } });
            }
            return out;
        } },
    { id: 'cad.repeated-symbols', title: 'Repeated vector symbols', version: '1.0.0', stage: 30, description: 'Create shared BLOCKs for translation-equivalent connected components; no invented original block names.', run: ({ document, checkAbort }) => {
            const eligible = document.entities.filter(e => ['LINE', 'LWPOLYLINE', 'SPLINE'].includes(e.type) && !e.dash?.length), components = connectedComponents(eligible, endpoints, 1e-8), groups = new Map();
            for (const component of components) {
                checkAbort();
                if (component.length > 64 || component.length < 1)
                    continue;
                if (component.length === 1 && !(component[0].type === 'LWPOLYLINE' && component[0].closed && component[0].points.length >= 3))
                    continue;
                const box = emptyBox();
                component.forEach(e => union(box, entityBox(e, document)));
                const origin = [box[0], box[1]], local = component.map((e, i) => offsetEntity(e, origin, `local-${i}`));
                const geometry = local.map(e => ({ type: e.type, layer: e.layer, color: e.color, lineweight: e.lineweight, opacity: e.opacity, start: e.start, end: e.end, points: e.points, controlPoints: e.controlPoints, knots: e.knots, closed: e.closed }));
                const canonical = JSON.stringify(geometry, (_, v) => typeof v === 'number' ? Math.round(v * 1e8) / 1e8 : v), key = stableHash(canonical);
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
            const index = new SpatialIndex(blocks, e => entityBox(e, document)), out = [];
            for (const t of document.entities) {
                if (t.type !== 'TEXT' || !/^\s*[A-Z]{1,5}[- ]?\d{2,6}[A-Z]?\s*$/.test(t.text))
                    continue;
                const r = t.height * 8, b = entityBox(t, document), nearby = index.search([b[0] - r, b[1] - r, b[2] + r, b[3] + r]).map(e => { const eb = entityBox(e, document); return { e, d: distance(t.position, [(eb[0] + eb[2]) / 2, (eb[1] + eb[3]) / 2]) }; }).sort((a, b) => a.d - b.d);
                if (!nearby.length || (nearby[1] && nearby[1].d < nearby[0].d * 1.6))
                    continue;
                const e = nearby[0].e;
                const attr = { ...clone(t), id: `${e.id}-tag-${t.id}`, type: 'ATTRIB', tag: 'TAG', value: t.text };
                out.push({ title: `Attach ${t.text} to ${e.name}`, members: [e.id, t.id], confidence: .94, exact: true, evidence: [{ kind: 'cad-tag-syntax', text: t.text }, { kind: 'unique-nearest-block', distance: nearby[0].d }], proposal: { remove: [t.id], update: [{ id: e.id, appendAttributes: [attr], patch: { semantic: { ...e.semantic, tag: t.text } } }] } });
            }
            return out;
        } },
    { id: 'cad.dimensions', title: 'Dimension reconstruction', version: '1.0.0', stage: 45, description: 'Detect numeric label + baseline + two triangular arrowheads; emit a native DIMENSION with the original anonymous display block.', run: ({ document }) => {
            const lines = document.entities.filter(e => e.type === 'LINE'), arrows = document.entities.filter(e => (e.type === 'SOLID' && e.points.length === 3) || (e.type === 'HATCH' && e.paths.length === 1 && e.paths[0].segments.every(s => s.kind === 'L') && [2, 3].includes(e.paths[0].segments.length))), index = new SpatialIndex(arrows, e => entityBox(e, document)), out = [];
            for (const text of document.entities) {
                if (text.type !== 'TEXT' || !/^\s*(?:[ØøR])?\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|m|in|"|°))?\s*$/.test(text.text))
                    continue;
                const h = text.height, best = [];
                for (const l of lines) {
                    const d = sub(l.end, l.start), len = length(d);
                    if (len < h * 4)
                        continue;
                    const u = dot(sub(text.position, l.start), d) / (len * len), perp = Math.abs(cross(d, sub(text.position, l.start))) / len;
                    if (u < -.1 || u > 1.1 || perp > h * 2.5)
                        continue;
                    const tip = p => index.search([p[0] - h, p[1] - h, p[0] + h, p[1] + h]).filter(e => { const paths = entityPaths(e); return paths.some(path => [path.start, ...path.segments.map(s => s.to)].some(q => distance(p, q) < h * .25)); });
                    const a = tip(l.start), b = tip(l.end);
                    if (!a.length || !b.length || a[0].id === b[0].id)
                        continue;
                    best.push({ l, a: a[0], b: b[0], distance: perp, len });
                }
                best.sort((a, b) => a.distance - b.distance);
                if (!best.length)
                    continue;
                const hit = best[0], members = [text, hit.l, hit.a, hit.b], key = stableHash(members.map(e => e.id)), name = `*D${key}`, block = { name, origin: [0, 0], entities: [...members].sort((a, b) => document.entities.indexOf(a) - document.entities.indexOf(b)).map((e, i) => ({ ...clone(e), id: `${name}-${i}` })) };
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
                const d = sub(e.end, e.start), len = length(d);
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
                const d = sub(es[0].end, es[0].start), len = length(d), n = [-d[1] / len, d[0] / len], offsets = es.map(e => dot(e.start, n)).sort((a, b) => a - b), spacings = offsets.slice(1).map((v, i) => v - offsets[i]).filter(x => x > 1e-8);
                if (spacings.length < 7)
                    continue;
                const mean = spacings.reduce((a, b) => a + b) / spacings.length, variance = spacings.reduce((a, b) => a + (b - mean) ** 2, 0) / spacings.length;
                if (Math.sqrt(variance) > mean * .015)
                    continue;
                const id = 'hatch-family-' + stableHash(es.map(e => e.id));
                out.push({ title: `Identify ${es.length} regularly spaced hatch strokes`, members: es.map(e => e.id), confidence: .9, exact: true, evidence: [{ kind: 'parallel-line-family', spacing: mean, relativeStdDev: Math.sqrt(variance) / mean }], proposal: { groups: [{ name: id, members: es.map(e => e.id), description: 'Recovered parallel hatch family', semantic: { class: 'hatch-family', spacing: mean } }], update: es.map(e => ({ id: e.id, patch: { semantic: { ...e.semantic, class: 'hatch-stroke', family: id } } })) } });
            }
            return out;
        } },
    { id: 'cad.title-block', title: 'Title block fields', version: '1.0.0', stage: 60, description: 'Group recognizable sheet/revision/scale fields without fabricating discarded model metadata.', run: ({ document }) => {
            const labels = document.entities.filter(e => e.type === 'TEXT' && /\b(?:DRAWING|DRAWN|REV(?:ISION)?|SCALE|SHEET|PROJECT|APPROVED|DATE)\b/i.test(e.text));
            if (labels.length < 3)
                return [];
            const key = stableHash(labels.map(e => e.id));
            return [{ title: 'Identify a drawing title-block field group', members: labels.map(e => e.id), confidence: .91, exact: true, evidence: [{ kind: 'title-block-vocabulary', labels: labels.map(e => e.text) }], proposal: { groups: [{ name: 'TITLE_BLOCK_' + key, members: labels.map(e => e.id), description: 'Inferred title-block fields', semantic: { class: 'title-block' } }] } }];
        } }
];
export const CAD_PROFILES = Object.freeze({
    exact: { name: 'Exact geometry', description: 'Only coordinate-preserving transformations are accepted automatically.', fidelity: 'exact', minConfidence: .98 },
    cad: { name: 'CAD print recovery', description: 'Conservative source recovery; review conics, dimensions and attributes.', fidelity: 'exact', minConfidence: .98 },
    inferred: { name: 'Reviewed CAD inference', description: 'Accept high-confidence conic hypotheses; errors and original controls remain recorded.', fidelity: 'inferred', minConfidence: .96 },
    pid: { name: 'P&ID / schematic', description: 'Source geometry plus symbol repetition and tag association. Associations remain proposals.', fidelity: 'exact', minConfidence: .98 }
});
export function detectProducerProfile(source) { const text = [source?.producer, source?.creator, source?.Producer, source?.Creator].filter(Boolean).join(' '); return /AutoCAD|DWG To PDF|Autodesk/i.test(text) ? { family: 'Autodesk CAD print', confidence: .99 } : /MicroStation|Bentley/i.test(text) ? { family: 'Bentley CAD print', confidence: .99 } : /Bluebeam/i.test(text) ? { family: 'Bluebeam PDF', confidence: .99 } : /SolidWorks|Dassault/i.test(text) ? { family: 'Dassault CAD print', confidence: .99 } : { family: 'Generic vector PDF', confidence: 1 }; }
/** Explicit vector-glyph templates; never operates on pixels or OCR data. */
export class VectorTemplateLibrary {
    #templates = [];
    register({ name, paths, semantic, tolerance = 1e-7 }) {
        if (!name || !paths?.length)
            throw Error('A vector template requires a name and nonempty paths');
        const box = pathBox(paths), origin = [box[0], box[1]];
        const signature = JSON.stringify(paths.map(p => ({ start: sub(p.start, origin), closed: p.closed, segments: p.segments.map(s => ({ ...s, to: sub(s.to, origin), ...(s.c1 ? { c1: sub(s.c1, origin), c2: sub(s.c2, origin) } : {}) })) })), (_, v) => typeof v === 'number' ? Math.round(v / tolerance) * tolerance : v);
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
