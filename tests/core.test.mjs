import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { I, compose, inverse, transform, insertMatrix, decomposeInsert, cubicPoint, splitCubic, subCubic, cubicBox, polynomialRoots01, rectPath, pathBox, booleanPaths, insidePaths, clipCurveToPaths, intersectEdges, near } from '@revector/geometry';
import { createDocument, validateDocument, entityBox, DXF_VERSIONS } from '@revector/model';
import { SpatialIndex, joinLineChains } from '@revector/topology';
import { interpretOperators, OPS } from '@revector/pdf';
import { lowerScene } from '@revector/cad';
import { RuleEngine, commitCandidate, compileRuleSet, safeRegex } from '@revector/semantics';
import { cadRules, VectorTemplateLibrary } from '@revector/rules-cad';
import { exportDxf, readDxf } from '@revector/dxf';
import { ConversionEngine } from '@revector/engine';
import { zipFiles } from '@revector/ui';
const close = (a, b, t = 1e-7) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`), point = (a, b, t = 1e-7) => a.forEach((x, i) => close(x, b[i], t));
const base = { layer: '0', color: [24, 103, 151], lineweight: .25 };
const line = (id, a, b) => ({ ...base, id, type: 'LINE', start: a, end: b });
const text = (id, s, p = [10, 20]) => ({ ...base, id, type: 'TEXT', text: s, position: p, height: 3, width: 15, font: 'Arial' });
const scene = (ops, options = {}) => interpretOperators({ fnArray: ops.map(o => OPS[o[0]]), argsArray: ops.map(o => o.slice(1)) }, { box: [0, 0, 100, 100], ...options });
function drawing() { const d = createDocument(); d.entities.push(line('a', [1, 2], [20, 3]), text('b', 'Valve Ø200 ° ±'), { ...base, id: 'c', type: 'SPLINE', degree: 3, controlPoints: [[1, 2], [2, 7], [7, 2], [9, 9]], knots: [0, 0, 0, 0, 1, 1, 1, 1] }, { ...base, id: 'd', type: 'HATCH', solid: true, paths: [{ start: [30, 20], segments: [{ kind: 'C', c1: [40, 30], c2: [40, 50], to: [30, 60] }, { kind: 'L', to: [30, 20] }], closed: true }] }); d.blocks.push({ name: 'VALVE', origin: [0, 0], entities: [line('in-block', [0, 0], [3, 2])] }); d.entities.push({ ...base, id: 'insert', type: 'INSERT', name: 'VALVE', position: [30, 30], scale: [2, 2], rotation: 25, attributes: [{ ...text('attr', 'V-101', [30, 40]), type: 'ATTRIB', tag: 'TAG' }] }); d.groups.push({ name: 'Equipment', members: ['a', 'b'] }); return d; }
test('Affine inverse randomized round-trip and composition', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 1000; i++) {
        const m = [rand() + .2, rand(), -rand(), rand() + .2, rand() * 100, rand() * 100], p = [rand() * 100, rand() * 100];
        point(transform(inverse(m), transform(m, p)), p);
        point(transform(compose(m, inverse(m)), p), p);
    }
});
test('INSERT decomposition preserves reflections and rejects shear', () => { const m = insertMatrix({ position: [2, 3], scale: [2, -3], rotation: 37 }); point(transform(insertMatrix(decomposeInsert(m)), [4, 5]), transform(m, [4, 5])); assert.equal(decomposeInsert([1, 0, .2, 1, 0, 0]), null); });
test('Cubic subdivision preserves the exact polynomial curve', () => {
    const p = [[0, 0], [10, 30], [20, -15], [40, 4]], [a, b] = splitCubic(p, .3);
    for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        point(cubicPoint(a, t), cubicPoint(p, t * .3));
        point(cubicPoint(b, t), cubicPoint(p, .3 + t * .7));
    }
});
test('Cubic subinterval matches the parent parameterization', () => {
    const p = [[0, 0], [20, 5], [1, 22], [40, 0]], s = subCubic(p, .2, .8);
    for (let i = 0; i <= 50; i++)
        point(cubicPoint(s, i / 50), cubicPoint(p, .2 + .6 * i / 50));
});
test('Analytic cubic bounds include interior extrema', () => { const b = cubicBox([[0, 0], [0, 10], [10, 10], [10, 0]]); point(b, [0, 0, 10, 7.5]); });
test('Polynomial root isolation finds repeated and ordinary roots', () => { const r = polynomialRoots01([1, -1.5, .66, -.08]); point(r, [.2, .5, .8], 1e-6); const q = polynomialRoots01([1, -1, .25]); close(q[0], .5); });
for (const [operation, expected] of [['intersection', [5, 5, 10, 10]], ['union', [0, 0, 15, 15]], ['difference', [0, 0, 10, 10]], ['xor', [0, 0, 15, 15]]])
    test(`Curve arrangement ${operation}`, () => {
        const paths = booleanPaths([rectPath([0, 0, 10, 10])], [rectPath([5, 5, 15, 15])], { operation });
        point(pathBox(paths), expected);
        if (operation === 'difference')
            assert.equal(insidePaths([7, 7], paths), false);
    });
test('Even-odd versus nonzero winding retains hole semantics', () => { const p = [rectPath([0, 0, 10, 10]), rectPath([2, 2, 8, 8])]; assert.equal(insidePaths([5, 5], p, 'evenodd'), false); assert.equal(insidePaths([5, 5], p, 'nonzero'), true); });
test('Cubic clipping splits Béziers, never tessellates them', () => { const e = { kind: 'C', points: [[0, 0], [3, 3], [7, 7], [10, 10]] }, parts = clipCurveToPaths(e, [rectPath([2, -1, 8, 11])]); assert.equal(parts.length, 1); assert.equal(parts[0].kind, 'C'); close(parts[0].points[0][0], 2); close(parts[0].points[3][0], 8); });
test('Line/cubic intersection parameters are consistent', () => { const a = { kind: 'C', points: [[0, 0], [0, 10], [10, 10], [10, 0]] }, b = { kind: 'L', points: [[5, -1], [5, 11]] }; const r = intersectEdges(a, b); assert.equal(r.length, 1); close(r[0][0], .5); });
test('Spatial index agrees with brute-force intersections', () => { const items = Array.from({ length: 500 }, (_, i) => ({ box: [i, i % 17, i + 2, i % 17 + 2] })), tree = new SpatialIndex(items, x => x.box), q = [40, 3, 85, 10]; assert.equal(tree.search(q).length, items.filter(x => x.box[0] <= q[2] && x.box[2] >= q[0] && x.box[1] <= q[3] && x.box[3] >= q[1]).length); });
test('Line chains do not merge through T-junctions', () => { const lines = [line('a', [0, 0], [1, 0]), line('b', [1, 0], [2, 0]), line('c', [1, 0], [1, 1])]; assert.ok(joinLineChains(lines).every(x => x.members.length === 1)); });
test('PDF constructPath modern packed buffers use the real paint opcode', async () => { const s = await scene([['constructPath', OPS.stroke, [new Float32Array([0, 1, 2, 2, 3, 5, 7, 5, 9, 2])], [1, 2, 9, 5]]]); assert.equal(s.items[0].paths[0].segments[0].kind, 'C'); assert.equal(s.items[0].stroke, true); });
test('PDF legacy constructPath remains supported', async () => { const s = await scene([['constructPath', [OPS.moveTo, OPS.lineTo], [1, 2, 3, 4]], ['stroke']]); point(s.items[0].paths[0].segments[0].to, [3, 4]); });
test('PDF clip applies after painting the current path', async () => { const s = await scene([['rectangle', 0, 0, 10, 10], ['clip'], ['stroke'], ['moveTo', -2, 5], ['lineTo', 12, 5], ['stroke']]); assert.equal(s.items[0].clips.length, 0); assert.equal(s.items[1].clips.length, 1); const d = await lowerScene(s, { units: 'pt' }); const last = d.entities.at(-1); point(last.start, [0, 5]); point(last.end, [10, 5]); });
test('PDF save/restore isolates graphics state and transforms', async () => { const s = await scene([['save'], ['transform', 2, 0, 0, 2, 3, 4], ['moveTo', 1, 1], ['lineTo', 2, 2], ['stroke'], ['restore'], ['moveTo', 1, 1], ['lineTo', 2, 2], ['stroke']]); point(s.items[0].paths[0].start, [5, 6]); point(s.items[1].paths[0].start, [1, 1]); });
test('PDF nested text-matrix contract and TJ spacing keep finite glyph origins', async () => { const glyph = c => ({ unicode: c, width: 500, fontChar: c }), s = await scene([['beginText'], ['setFont', 'F1', 10], ['setTextMatrix', [1, 0, 0, 1, 20, 30]], ['showText', [glyph('A'), -100, glyph('B')]], ['endText']], { fonts: { F1: { name: 'Helvetica', capHeight: .718 } } }); const t = s.items[0]; point(t.glyphs[0].matrix.slice(4), [20, 30]); point(t.glyphs[1].matrix.slice(4), [26, 30]); assert.equal(t.requiresGlyphPositioning, true); const d = await lowerScene(s, { units: 'pt' }); assert.equal(d.entities.length, 2); close(d.entities[0].height, 7.18); assert.equal(validateDocument(d).valid, true); });
test('PDF invisible text does not become geometry when hidden layers are included', async () => { const s = await scene([['setTextRenderingMode', 3], ['setFont', 'F', 10], ['showText', [{ unicode: 'secret', width: 500 }]]]); const d = await lowerScene(s, { includeHidden: true }); assert.equal(d.entities.length, 0); });
test('PDF optional content visibility and named layers survive extraction', async () => { const s = await scene([['beginMarkedContentProps', 'OC', { type: 'OCG', id: 'L1' }], ['moveTo', 1, 1], ['lineTo', 2, 2], ['stroke'], ['endMarkedContent']], { ocgs: { L1: { name: 'P-PIPE', visible: false } } }); assert.equal((await lowerScene(s)).entities.length, 0); const d = await lowerScene(s, { includeHidden: true }); assert.equal(d.entities[0].layer, 'P-PIPE'); });
test('PDF group matrix affects the group clip without double-transforming children', async () => { const s = await scene([['beginGroup', { bbox: [0, 0, 10, 10], matrix: [2, 0, 0, 2, 5, 0] }], ['moveTo', 0, 5], ['lineTo', 30, 5], ['stroke'], ['endGroup']]); const d = await lowerScene(s, { units: 'pt' }); point(d.entities[0].start, [5, 5]); point(d.entities[0].end, [25, 5]); });
test('PDF images and shading produce diagnostics, never traced entities', async () => { const s = await scene([['paintImageXObject', 'image1', 100, 100], ['shadingFill', 'shade1']]); const d = await lowerScene(s); assert.equal(d.entities.length, 0); assert.ok(d.diagnostics.some(x => x.code === 'RASTER_CONTENT')); assert.throws(() => exportDxf(d, { strict: true }), /Strict/); });
test('Operator budget and abort are enforced', async () => { await assert.rejects(() => scene([['save']], { maxOperators: 0 }), /budget/); await assert.rejects(() => scene([['save']], { signal: AbortSignal.abort() }), { name: 'AbortError' }); });
test('Unit conversion and model drawing scale are independent and exact', async () => { const s = await scene([['moveTo', 0, 0], ['lineTo', 72, 0], ['stroke']]); const d = await lowerScene(s, { units: 'mm', drawingScale: 100 }); close(d.entities[0].end[0], 2540); });
test('Failed semantic transaction leaves the original model unchanged', () => { const d = createDocument(); d.entities.push(line('a', [0, 0], [1, 1])); const before = JSON.stringify(d); assert.throws(() => commitCandidate(d, { id: 'bad', members: ['a'], proposal: { update: [{ id: 'a', patch: { layer: 'missing' } }] } }), /validation/); assert.equal(JSON.stringify(d), before); });
test('Semantic dependency cycle is rejected', async () => { const r = new RuleEngine(); r.register({ id: 'a', after: ['b'], run: () => [] }); r.register({ id: 'b', after: ['a'], run: () => [] }); await assert.rejects(() => r.run(createDocument()), /cycle/); });
test('Safe declarative rule classifies a tag and creates its layer', async () => { const d = createDocument(); d.entities.push(text('t', 'PT-101')); const rules = compileRuleSet({ schema: 'revector.rules/1', rules: [{ id: 'tags', when: { field: 'text', op: 'prefix', value: 'PT-' }, then: { layer: 'INSTRUMENTS', semantic: { class: 'pressure-tag' } } }] }); const r = new RuleEngine(); rules.forEach(x => r.register(x)); const out = await r.run(d); assert.equal(out.entities[0].layer, 'INSTRUMENTS'); assert.equal(out.entities[0].semantic.class, 'pressure-tag'); assert.equal(d.entities[0].layer, '0'); });
test('Declarative regex rejects backtracking and grouping constructs', () => {
    for (const r of ['(a+)+$', '(a|aa)+$', '.*.*.*', '(?=x)', '(a)\\1'])
        assert.throws(() => safeRegex(r));
    assert.ok(safeRegex('^V-[0-9]+$').test('V-101'));
});
test('Attribute append proposals preserve previously accepted attributes', () => {
    const d = createDocument();
    d.blocks.push({ name: 'B', origin: [0, 0], entities: [] });
    d.entities.push({ ...base, id: 'i', type: 'INSERT', name: 'B', position: [0, 0], attributes: [] });
    let out = d;
    for (let i = 0; i < 2; i++)
        out = commitCandidate(out, { id: 'c' + i, rule: 'tag', confidence: .9, exact: true, members: ['i'], proposal: { update: [{ id: 'i', appendAttributes: [{ ...text('t' + i, 'TAG' + i), type: 'ATTRIB', tag: 'TAG' + i }] }] } });
    assert.equal(out.entities[0].attributes.length, 2);
});
test('Explicit placements keep repeated block instances at source paint positions', () => { const d = createDocument(); d.entities.push(line('a', [0, 0], [1, 1]), line('middle', [2, 0], [2, 1]), line('b', [3, 0], [4, 1])); const out = commitCandidate(d, { id: 'c', rule: 'repeat', exact: true, confidence: 1, members: ['a', 'b'], proposal: { remove: ['a', 'b'], add: [line('x', [0, 0], [1, 1]), line('y', [3, 0], [4, 1])], placements: { x: 'a', y: 'b' } } }); assert.deepEqual(out.entities.map(e => e.id), ['x', 'middle', 'y']); });
test('Block origin is accounted for in world bounds', () => { const d = createDocument(); d.blocks.push({ name: 'B', origin: [10, 20], entities: [line('a', [10, 20], [20, 30])] }); point(entityBox({ ...base, id: 'i', type: 'INSERT', name: 'B', position: [3, 4], scale: [2, 2] }, d), [3, 4, 23, 24]); });
test('Validation detects duplicate attribute IDs and missing GROUP members', () => { const d = drawing(); d.entities.at(-1).attributes[0].id = 'a'; assert.equal(validateDocument(d).valid, false); d.entities.at(-1).attributes[0].id = 'attr'; d.groups[0].members.push('missing'); assert.equal(validateDocument(d).valid, false); });
for (const [version, code] of Object.entries(DXF_VERSIONS))
    test(`DXF ${version}: entity, block, attribute, cubic hatch and provenance round-trip`, async () => { const d = drawing(), out = exportDxf(d, { version }), back = readDxf(out.text); assert.equal(back.acadVersion, code); assert.equal(back.entities.length, d.entities.length); assert.equal(back.blocks.length, 1); assert.equal(back.entities.find(e => e.type === 'INSERT').attributes[0].text, 'V-101'); assert.equal(back.entities.find(e => e.type === 'HATCH').paths[0].segments[0].kind, 'C'); assert.equal(back.entities.find(e => e.type === 'TEXT').text, 'Valve Ø200 ° ±'); assert.equal(validateDocument(back).valid, true); assert.equal(/\r\n420\r\n/.test(out.text), version !== '2000'); await writeFile(new URL(`../artifacts/contract-${version}.dxf`, import.meta.url), out.text); });
test('DXF long Unicode XDATA chunks never exceed 255 bytes and retain JSON', () => {
    const d = drawing();
    d.entities[0].semantic = { label: '圧力計🧭'.repeat(200) };
    const out = exportDxf(d).text, rows = out.split('\r\n');
    for (let i = 0; i < rows.length; i += 2)
        if (rows[i] === '1000')
            assert.ok(Buffer.byteLength(rows[i + 1]) <= 255);
    assert.equal(readDxf(out).entities[0].semantic.label, d.entities[0].semantic.label);
});
test('DXF name collisions are blocked rather than silently merging layers', () => { const d = drawing(); d.layers.push({ name: 'A/B' }, { name: 'A_B' }); assert.throws(() => exportDxf(d), /collide/); });
test('DXF 2000 transparency is explicitly unsupported in strict mode', () => { const d = drawing(); d.entities[0].opacity = .4; assert.throws(() => exportDxf(d, { version: '2000', strict: true }), /Strict/); assert.ok(exportDxf(d, { version: '2000' }).diagnostics.some(x => x.code === 'DXF2000_TRANSPARENCY')); });
test('DXF polyline bulges are retained by the round-trip reader', () => { const d = createDocument(); d.entities.push({ ...base, id: 'p', type: 'LWPOLYLINE', points: [[1, 1], [2, 2], [3, 1]], bulges: [.5, -.5, 0], closed: false }); assert.deepEqual(readDxf(exportDxf(d).text).entities[0].bulges, [.5, -.5, 0]); });
test('DXF unsupported versions, nonfinite coordinates and truncated streams are rejected', () => { assert.throws(() => exportDxf(drawing(), { version: '2024' })); const d = drawing(); d.entities[0].end[0] = NaN; assert.throws(() => exportDxf(d)); assert.throws(() => readDxf('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n'), /EOF/); });
test('Vector template matching is geometry-only and translation-invariant', () => { const t = new VectorTemplateLibrary().register({ name: 'triangle', paths: [{ start: [0, 0], segments: [{ kind: 'L', to: [1, 0] }, { kind: 'L', to: [.5, 1] }], closed: true }], semantic: { class: 'arrow' } }); assert.equal(t.match([{ start: [10, 10], segments: [{ kind: 'L', to: [11, 10] }, { kind: 'L', to: [10.5, 11] }], closed: true }])[0].name, 'triangle'); });
test('ZIP32 produces valid local, central-directory and EOF signatures', async () => { const bytes = new Uint8Array(await zipFiles([{ name: 'a.txt', data: 'test' }]).arrayBuffer()), v = new DataView(bytes.buffer); assert.equal(v.getUint32(0, true), 0x04034b50); assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50); assert.throws(() => zipFiles([{ name: '../escape', data: '' }])); await writeFile(new URL('../artifacts/test-archive.zip', import.meta.url), bytes); });
test('Conversion engine previews parsed serialized DXF, with separate measured timings', async () => { const s = await scene([['moveTo', 1, 2], ['lineTo', 20, 30], ['stroke']]); const r = await new ConversionEngine().convertScene(s); assert.equal(r.preview.acadVersion, 'AC1032'); assert.equal(r.preview.entities[0].handle.length > 0, true); assert.ok(r.report.timings.totalMs >= 0); assert.equal(r.report.validation.roundtrip.valid, true); });
test('Generated worker bundle executes the same kernel in an isolated Node worker', async () => {
    const bundle = await readFile(new URL('../apps/studio/conversion-worker.js', import.meta.url), 'utf8');
    const s = await scene([['moveTo', 1, 2], ['lineTo', 20, 30], ['stroke']]);
    const shim = `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=x=>parentPort.postMessage(x);parentPort.on('message',data=>self.onmessage({data}));\n`;
    const code = shim + bundle.replaceAll('function require(id)', 'function rvRequire(id)').replaceAll('f(require,module,module.exports)', 'f(rvRequire,module,module.exports)').replace("require('@revector/engine/worker.js');", "rvRequire('@revector/engine/worker.js');");
    const w = new Worker(code, { eval: true });
    try {
        const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Worker timed out')), 15000);
            w.on('error', e => { clearTimeout(timer); reject(e); });
            w.on('message', m => {
                if (m.kind === 'result') {
                    clearTimeout(timer);
                    resolve(m.result);
                }
                if (m.kind === 'error') {
                    clearTimeout(timer);
                    reject(Error(m.error.message));
                }
            });
            w.postMessage({ id: 1, scene: s, options: { version: '2013' } });
        });
        assert.equal(result.preview.acadVersion, 'AC1027');
        assert.equal(result.document.entities.length, 1);
    }
    finally {
        await w.terminate();
    }
});
