import {_markImmutableSnapshot as markImmutableSnapshot} from '@revector/model';
import { stableHash } from '@revector/geometry';
import { validateDocument, createImmutableDocumentValidator, ensureLayer, diagnostic, checkAbort, yieldTask } from '@revector/model';
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
    return { ...clone(c), id: c.id || `${rule.id}:${stableHash([members, c.title])}`, rule: rule.id, ruleVersion: rule.version || '1.0.0', members, exact: c.exact === true, status: 'pending', evidence: c.evidence || [] };
}
/** Apply a proposal to a clone, validate, and atomically return the new document. */
export function commitCandidate(document, candidate) {
    // Public callers receive a fully detached document, including unchanged entities.
    return applyCandidate(clone(document), candidate);
}
/** Private copy-on-write transaction. The rule run owns its source document; unchanged
 * branches are shared only inside that run, never exposed to plugins or public callers. */
function applyCandidate(document, candidate, validate = validateDocument) {
    const next = { ...document, entities: document.entities.slice(), blocks: document.blocks.slice(),
        layers: document.layers.slice(), groups: document.groups.slice(),
        history: document.history.slice(), diagnostics: document.diagnostics.slice() };
    const existing = new Map(next.entities.map((e, i) => [e.id, {e, i}])), p = candidate.proposal;
    for (const id of candidate.members)
        if (!existing.has(id))
            throw new Error(`Stale candidate ${candidate.id}: entity ${id} no longer exists`);
    const remove = new Set(p.remove || []);
    for (const id of remove)
        if (!existing.has(id))
            throw new Error(`Cannot remove missing entity ${id}`);
    const removed = next.entities.filter(e => remove.has(e.id)), updated = [];
    for (const u of p.update || []) {
        const entry = existing.get(u.id);
        if (!entry)
            throw new Error(`Cannot update missing entity ${u.id}`);
        if (u.patch?.id && u.patch.id !== u.id)
            throw Error('Rule patches may not change identity');
        const e = clone(entry.e);
        updated.push({ id: u.id, before: clone(entry.e) });
        next.entities[entry.i] = e;
        existing.set(u.id, {e, i:entry.i});
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
        const placed = new Set(), out = [], anchors = new Map();
        for (const a of additions) {
            const anchor = p.placements[a.id];
            if (!anchors.has(anchor)) anchors.set(anchor, []);
            anchors.get(anchor).push(a);
        }
        for (const e of original) {
            for (const a of anchors.get(e.id) || []) { out.push(a); placed.add(a.id); }
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
    if (remove.size) next.groups = next.groups.map(g => g.members.some(id => remove.has(id))
        ? { ...g, members: [...new Set(g.members.flatMap(id => remove.has(id) ? additions.map(e => e.id) : [id]))] }
        : g);
    next.groups = next.groups.filter(g => g.members.length > 0);
    for (const b of p.blocks || []) {
        if (next.blocks.some(x => x.name === b.name))
            throw new Error(`Duplicate block ${b.name}`);
        next.blocks.push(clone(b));
    }
    for (const l of p.layers || [])
        ensureLayer(next, l.name, l.color, l.visible);
    for (const g of p.groups || [])
        next.groups.push(clone(g));
    const check = validate(next);
    if (!check.valid)
        throw Error(`Rule transaction failed validation: ${check.errors.slice(0, 4).join('; ')}`);
    next.revision++;
    next.history.push({ candidate: candidate.id, rule: candidate.rule, revision: next.revision, removed, updated, added: additions.map(e => e.id), blocks: (p.blocks || []).map(b => b.name) });
    if (!candidate.exact)
        next.diagnostics.push(diagnostic('SEMANTIC_GEOMETRY_CHANGE', `Accepted inference: ${candidate.title}. Original primitives are retained in the conversion history.`, 'warning', { rule: candidate.rule, candidate: candidate.id, errorBound: candidate.errorBound }));
    return next;
}
export class RuleEngine {
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
        const candidateIds = new Set(doc.candidates.map(c => c.id)), validate = createImmutableDocumentValidator();
        // Reuse detached frozen branches across rules. A transaction replaces each
        // modified branch, so WeakMap identity is a safe invalidation key here.
        const frozen = new WeakMap();
        const snapshotBranch = value => {
            if (!value || typeof value !== 'object') return value;
            let result = frozen.get(value);
            if (!result) { result = deepFreeze(clone(value)); frozen.set(value, result); }
            return result;
        };
        const snapshotList = list => {
            let result = frozen.get(list);
            if (!result) { result = Object.freeze(list.map(snapshotBranch)); frozen.set(list, result); }
            return result;
        };
        for (let index = 0; index < rules.length; index++) {
            checkAbort(options.signal);
            const rule = rules[index], start = performance.now();
            options.onProgress?.({ phase: 'semantics', rule: rule.id, done: index, total: rules.length });
            const snapshot = Object.freeze({ entities: snapshotList(doc.entities), blocks: snapshotList(doc.blocks),
                layers: snapshotList(doc.layers), groups: snapshotList(doc.groups), source: snapshotBranch(doc.source),
                pageBox: snapshotBranch(doc.pageBox), units: doc.units, revision: doc.revision });
            markImmutableSnapshot(snapshot);
            const context = Object.freeze({ document: snapshot, options, signal: options.signal, checkAbort: () => checkAbort(options.signal) });
            let proposed = 0, accepted = 0;
            try {
                const output = await rule.run(context);
                for await (const raw of output || []) {
                    checkAbort(options.signal);
                    if (doc.candidates.length >= maxCandidates)
                        throw new RangeError('Semantic candidate budget exceeded');
                    const c = sanitizeCandidate(raw, rule);
                    if (candidateIds.has(c.id))
                        continue;
                    proposed++;
                    const decision = decisions[c.id];
                    if (decision === 'reject')
                        c.status = 'rejected';
                    const auto = c.confidence >= minConfidence && (c.exact || options.fidelity === 'inferred');
                    if (decision === 'accept' || (decision !== 'reject' && auto)) {
                        try {
                            doc = applyCandidate(doc, c, validate);
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
                    candidateIds.add(c.id);
                }
            }
            catch (error) {
                if (error.name === 'AbortError')
                    throw error;
                doc.diagnostics.push(diagnostic('RULE_FAILURE', `Rule ${rule.id}: ${error.message}`, 'error', { rule: rule.id }));
            }
            stats.push({ rule: rule.id, proposed, accepted, elapsedMs: performance.now() - start });
            await yieldTask();
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
const ALLOWED_FIELDS = new Set(['type', 'layer', 'text', 'font', 'semantic.class', 'source.kind']);
function valueAt(e, path) { return path.split('.').reduce((o, k) => o?.[k], e); }
/** Deliberately restricted regex grammar to avoid untrusted catastrophic backtracking. */
export function safeRegex(pattern) {
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
export function compileRuleSet(json) {
    if (json.schema !== 'revector.rules/1' || !Array.isArray(json.rules) || json.rules.length > 128)
        throw Error('Invalid rule set; expected revector.rules/1 and at most 128 rules');
    return json.rules.map(r => {
        const test = compilePredicate(r.when), action = r.then || {};
        if (!action.layer && !action.semantic)
            throw Error(`Rule ${r.id} needs a layer or semantic action`);
        return { id: r.id, version: r.version || '1.0.0', title: r.title || r.id, stage: r.stage ?? 50, priority: r.priority ?? 0, description: 'User-supplied declarative classification rule', run: ({ document }) => document.entities.filter(test).map(e => ({ title: r.title || `Classify ${e.id}`, members: [e.id], confidence: r.confidence ?? .99, exact: true, evidence: [{ kind: 'declarative-match', predicate: r.when }], proposal: { update: [{ id: e.id, patch: { ...(action.layer ? { layer: action.layer } : {}), semantic: { ...e.semantic, ...action.semantic, method: 'user-rule' } } }], layers: action.layer ? [{ name: action.layer, color: e.color || [0, 0, 0], visible: true }] : [] } })) };
    });
}
