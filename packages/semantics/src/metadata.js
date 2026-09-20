import {validateDocument, diagnostic} from '@revector/model';

const clone = value => structuredClone(value);
const proposalKeys = new Set(['update','layers','groups','add','remove','blocks']);
const plain = value => value && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** Private owned-run accelerator. Only metadata/layer patches and GROUP appends
 * qualify. Identity, geometry, attributes, blocks and asset graphs cannot change.
 * The public commitCandidate contract is intentionally not handled here.
 *
 * A consecutive batch owns collection shells, an ID index and a layer index.
 * Rules only see detached, deeply frozen snapshots. reset() is required before
 * the next rule snapshot is constructed; no externally visible list is mutated.
 * Any unproven precondition returns null to the canonical validated transaction.
 */
export class MetadataTransactions {
    constructor(validate) { this.validate = validate; this.reset(); }
    reset() { this.document = null; this.index = null; this.layers = null; this.ids = null; this.emptyGroups = undefined; this.owned = false; }
    apply(document, candidate) {
        const p = candidate.proposal;
        if (!plain(p) || Object.keys(p).some(k => !proposalKeys.has(k))) return null;
        for (const key of proposalKeys) if (p[key] !== undefined && !Array.isArray(p[key])) return null;
        if (p.add?.length || p.remove?.length || p.blocks?.length) return null;
        for (const u of p.update || []) {
            if (!plain(u) || Object.keys(u).some(k => k !== 'id' && k !== 'patch') || !plain(u.patch) ||
                Object.keys(u.patch).some(k => k !== 'semantic' && k !== 'layer')) return null;
        }
        // Accept only ordinary names here. General/malformed plugin inputs retain
        // their original validation order, errors and rollback via applyCandidate.
        for (const l of p.layers || []) if (!plain(l) || typeof l.name !== 'string') return null;
        for (const g of p.groups || []) if (!plain(g) || !Array.isArray(g.members)) return null;
        if (this.document !== document) {
            this.reset();
            if (!this.validate(document).valid) return null;
            this.index = new Map(document.entities.map((e,i) => [e.id,i]));
            this.layers = new Map(document.layers.map(l => [l.name,l]));
            this.document = document;
            this.owned = false;
        }
        for (const id of candidate.members) if (!this.index.has(id)) return null;
        const addedLayers = new Map();
        for (const l of p.layers || []) if (!this.layers.has(l.name) && !addedLayers.has(l.name))
            addedLayers.set(l.name, {name:l.name, color:l.color === undefined ? [0,0,0] : l.color,
                visible:l.visible === undefined ? true : l.visible});
        const staged = new Map(), updated = [];
        for (const u of p.update || []) {
            const index = this.index.get(u.id);
            if (index === undefined) return null;
            const before = staged.get(index) || document.entities[index];
            const entity = clone(before);
            Object.assign(entity, clone(u.patch));
            if (!this.layers.has(entity.layer || '0') && !addedLayers.has(entity.layer || '0')) return null;
            // The source model was fully checked and only these two properties may
            // change. Validate their recursive numeric content with the canonical
            // validator, but without rescanning unchanged geometry/ID/block graphs.
            const delta = {id:entity.id};
            if (Object.hasOwn(u.patch,'semantic')) delta.semantic = entity.semantic;
            if (Object.hasOwn(u.patch,'layer')) delta.value = entity.layer;
            if (!validateDocument({entities:[delta],blocks:[],layers:[{name:'0'}],groups:[]}).valid) return null;
            updated.push({id:u.id,before:clone(before)});
            staged.set(index,entity);
        }
        if (p.groups?.length) {
            this.ids ||= new Set([...document.entities,...document.blocks.flatMap(b=>b.entities)]
                .flatMap(e=>[e.id,...(e.attributes||[]).map(a=>a.id)]));
            for (const g of p.groups) for (const id of g.members) if (!this.ids.has(id)) return null;
        }
        // Everything above is preflight; nothing observable changes on conflict.
        const groups = clone(p.groups || []);
        if (!this.owned) {
            document = {...document, entities:document.entities.slice(), layers:document.layers.slice(),
                groups:document.groups.slice(), history:document.history.slice(), diagnostics:document.diagnostics.slice()};
            this.owned = true;
        }
        for (const [index,entity] of staged) document.entities[index] = entity;
        for (const [name,layer] of addedLayers) { this.layers.set(name,layer); document.layers.push(layer); }
        // Canonical transactions discard old empty groups before appending new ones.
        // Most batches have none. Only scan once, then track newly added empties.
        if (this.emptyGroups !== false) document.groups = document.groups.filter(g=>g.members.length>0);
        this.emptyGroups = groups.some(g=>!g.members.length);
        for (const g of groups) document.groups.push(g);
        document.revision++;
        document.history.push({candidate:candidate.id,rule:candidate.rule,revision:document.revision,
            removed:[],updated,added:[],blocks:[]});
        if (!candidate.exact) document.diagnostics.push(diagnostic('SEMANTIC_GEOMETRY_CHANGE',
            `Accepted inference: ${candidate.title}. Original primitives are retained in the conversion history.`,
            'warning',{rule:candidate.rule,candidate:candidate.id,errorBound:candidate.errorBound}));
        this.document = document;
        return document;
    }
}
