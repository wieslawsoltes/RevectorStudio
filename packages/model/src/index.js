export {markImmutableSnapshot as _markImmutableSnapshot, isImmutableSnapshot as _isImmutableSnapshot} from './snapshot.js';
export {sha256Bytes} from './sha256.js';
import { emptyBox, extend, union, transformBox, pathBox, insertMatrix, validBox, cubicBox, transform, I, compose } from '@revector/geometry';
export const MODEL_SCHEMA = 'revector.cad/1';
export const SCENE_SCHEMA = 'revector.pdf/1';
export const DXF_VERSIONS = Object.freeze({ '2000': 'AC1015', '2004': 'AC1018', '2007': 'AC1021', '2010': 'AC1024', '2013': 'AC1027', '2018': 'AC1032' });
export function createDocument(options = {}) { return { schema: MODEL_SCHEMA, revision: 0, name: options.name || 'Untitled', units: options.units || 'mm', entities: [], blocks: [], assets: [], layers: [{ name: '0', color: [210, 220, 230], visible: true }], groups: [], diagnostics: [], candidates: [], history: [], source: {}, pageBox: [0, 0, 297, 210], ...options }; }
export function diagnostic(code, message, severity = 'warning', detail = {}) { return { code, message, severity, ...detail }; }
export function ensureLayer(doc, name, color = [0, 0, 0], visible = true) {
    let l = doc.layers.find(l => l.name === name);
    if (!l) {
        l = { name, color, visible };
        doc.layers.push(l);
    }
    return l;
}
export function allEntities(doc) { return [...doc.entities, ...doc.blocks.flatMap(b => b.entities)]; }
export function entityBox(e, doc, seen = new Set()) {
    if (e.bounds && validBox(e.bounds))
        return [...e.bounds];
    const b = emptyBox();
    switch (e.type) {
        case 'IMAGE': {
            const [w,h] = e.imageSize;
            return transformBox([0,0,w,h], [...e.uPixel,...e.vPixel,...e.position]);
        }
        case 'LINE':
            extend(b, e.start);
            extend(b, e.end);
            break;
        case 'LWPOLYLINE':
            for (const p of e.points)
                extend(b, p);
            break;
        case 'SPLINE':
            if (e.degree === 3 && e.controlPoints.length === 4)
                return cubicBox(e.controlPoints);
            for (const p of e.controlPoints)
                extend(b, p);
            break;
        case 'CIRCLE':
        case 'ARC': return [e.center[0] - e.radius, e.center[1] - e.radius, e.center[0] + e.radius, e.center[1] + e.radius];
        case 'ELLIPSE': {
            const r = Math.hypot(...e.major), s = r * e.ratio, ux = e.major[0] / r, uy = e.major[1] / r;
            const x = Math.hypot(r * ux, s * uy), y = Math.hypot(r * uy, s * ux);
            return [e.center[0] - x, e.center[1] - y, e.center[0] + x, e.center[1] + y];
        }
        case 'HATCH': return pathBox(e.paths);
        case 'SOLID':
            for (const p of e.points)
                extend(b, p);
            break;
        case 'TEXT':
        case 'MTEXT':
        case 'ATTRIB': {
            const h = e.height || 1, w = e.width || h * .55 * (e.text || '').length, angle = (e.rotation || 0) * Math.PI / 180;
            const m = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), ...e.position];
            return transformBox([0, -h * .22, w, h], m);
        }
        case 'INSERT': {
            if (seen.has(e.name))
                break;
            const block = doc?.blocks.find(b => b.name === e.name);
            if (block) {
                const next = new Set([...seen, e.name]);
                for (const child of block.entities)
                    union(b, entityBox(child, doc, next));
                if (validBox(b)) {
                    const box = transformBox(b, compose(insertMatrix(e), [1, 0, 0, 1, -(block.origin?.[0] || 0), -(block.origin?.[1] || 0)]));
                    for (const a of e.attributes || [])
                        union(box, entityBox({ ...a, type: 'ATTRIB' }, doc));
                    return box;
                }
            }
            break;
        }
        case 'DIMENSION': {
            const block = doc?.blocks.find(b => b.name === e.block);
            if (block)
                for (const c of block.entities)
                    union(b, entityBox(c, doc, seen));
            break;
        }
    }
    return validBox(b) ? b : [0, 0, 0, 0];
}
export function documentBox(doc) {
    const b = emptyBox();
    for (const e of doc.entities)
        union(b, entityBox(e, doc));
    return validBox(b) ? b : [...doc.pageBox];
}
export function entityPaths(e) {
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
export function validateDocument(doc) { return validate(doc); }
/** A private ownership session for copy-on-write model pipelines. Entity objects and
 * their descendants MUST NOT be mutated after validation. Public mutable documents
 * must use validateDocument instead. Names, references and IDs are always rechecked. */
export function createImmutableDocumentValidator() {
    const entities = new WeakMap();
    return doc => validate(doc, entities);
}
function* validationEntities(doc) {
    for (const list of [doc.entities, ...doc.blocks.map(b => b.entities)])
        for (const e of list) { yield e; yield* e.attributes || []; }
}
function validate(doc, entityCache) {
    const errors = [];
    const ids = new Set(), blocks = new Map(doc.blocks.map(b => [b.name, b]));
    const layers = new Set(doc.layers.map(l => l.name));
    const assets = new Map((doc.assets || []).map(a => [a.id, a]));
    const paths = new Set();
    if (assets.size !== (doc.assets || []).length) errors.push('Duplicate raster asset IDs');
    for (const a of assets.values()) {
        if (!a.id || !isSafeAssetPath(a.path)) errors.push('Invalid raster asset ID or unsafe path');
        if (paths.has(String(a.path).toLowerCase())) errors.push('Duplicate raster asset paths');
        paths.add(String(a.path).toLowerCase());
        if (![a.width,a.height].every(n => Number.isInteger(n) && n > 0 && n <= 65535)) errors.push('Invalid raster asset dimensions');
    }
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
    for (const e of validationEntities(doc)) {
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
        if (e.type === 'IMAGE') {
            const a = assets.get(e.imageId), pts = [e.position,e.uPixel,e.vPixel];
            if (!a) errors.push(`Missing raster asset ${e.imageId}`);
            if (!pts.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) errors.push(`Invalid image placement ${e.id}`);
            else if (Math.abs(e.uPixel[0]*e.vPixel[1]-e.uPixel[1]*e.vPixel[0]) < 1e-30) errors.push(`Singular image placement ${e.id}`);
            if (!Array.isArray(e.imageSize) || e.imageSize.length !== 2 || !e.imageSize.every(n => Number.isInteger(n) && n > 0) || a && (a.width !== e.imageSize[0] || a.height !== e.imageSize[1])) errors.push(`Image dimensions disagree with asset ${e.id}`);
        }
        const previous = entityCache?.get(e);
        if (previous) {
            for (const error of previous) errors.push(error);
        } else {
            const start = errors.length;
            check(e, e.id);
            entityCache?.set(e, errors.slice(start));
        }
    }
    for (const g of doc.groups) {
        for (const id of g.members)
            if (!ids.has(id))
                errors.push(`Group ${g.name} references missing entity ${id}`);
    }
    // Iterative tri-color DFS visits each block/edge once without copying ancestor
    // sets or overflowing the JavaScript call stack on deeply nested block DAGs.
    const states = new Map();
    for (const root of blocks.keys()) {
        if (states.has(root)) continue;
        const stack = [{name:root, index:0}]; states.set(root,1);
        while (stack.length) {
            const frame=stack[stack.length-1], entities=blocks.get(frame.name)?.entities || [];
            if (frame.index===entities.length) {states.set(frame.name,2);stack.pop();continue;}
            const entity=entities[frame.index++]; if(entity.type!=='INSERT')continue;
            if(states.get(entity.name)===1)errors.push(`Cyclic block reference ${entity.name}`);
            else if(!states.has(entity.name)){states.set(entity.name,1);stack.push({name:entity.name,index:0});}
        }
    }
    return { valid: !errors.length, errors };
}
export function countTypes(doc) {
    const out = {};
    for (const e of doc.entities)
        out[e.type] = (out[e.type] || 0) + 1;
    return out;
}
export function summary(doc) { return { entities: doc.entities.length, blockDefinitions: doc.blocks.length, layers: doc.layers.length, types: countTypes(doc), diagnostics: doc.diagnostics.length, accepted: doc.candidates.filter(c => c.status === 'accepted').length, pending: doc.candidates.filter(c => c.status === 'pending').length }; }
export class Signal {
    #subscribers = new Set();
    subscribe(fn) { this.#subscribers.add(fn); return () => this.#subscribers.delete(fn); }
    emit(value) {
        for (const fn of this.#subscribers)
            fn(value);
    }
    clear() { this.#subscribers.clear(); }
}
export class AbortConversionError extends Error {
    constructor() { super('Conversion cancelled'); this.name = 'AbortError'; }
}
export function checkAbort(signal) {
    if (signal?.aborted)
        throw new AbortConversionError();
}
export const yieldTask = () => {
    if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
    if (typeof globalThis.setImmediate === 'function') return new Promise(resolve => globalThis.setImmediate(resolve));
    return new Promise(resolve => setTimeout(resolve, 0));
};

/** Portable relative paths only: never implicitly fetch URLs or escape an export directory. */
export function isSafeAssetPath(value) {
    return typeof value === 'string' && value.length <= 200 &&
        /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.png$/.test(value) &&
        !value.split('/').some(p => p === '.' || p === '..' || p.startsWith('.'));
}
