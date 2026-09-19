import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PdfSource } from '@revector/pdf';
import { ConversionEngine } from '@revector/engine';
import { validateDocument } from '@revector/model';
const root = new URL('../', import.meta.url), pdfOptions = { moduleUrl: new URL('vendor/pdfjs/legacy/build/pdf.mjs', root).href, workerUrl: new URL('vendor/pdfjs/legacy/build/pdf.worker.mjs', root).href, name: 'Real PDF regression' };
test('Real PDF.js: two authored pages, all six DXF versions, controls and layer/block recovery', async () => {
    const source = await PdfSource.open(new Uint8Array(await readFile(new URL('assets/cooling-water.pdf', root))), pdfOptions);
    try {
        assert.equal(source.numPages, 2);
        const engine = new ConversionEngine();
        for (let page = 1; page <= 2; page++) {
            const scene = await source.extract(page);
            assert.ok(scene.items.some(i => i.kind === 'text'));
            assert.ok(scene.items.some(i => i.kind === 'path'));
            for (const version of ['2000', '2004', '2007', '2010', '2013', '2018']) {
                const r = await engine.convertScene(scene, { version });
                assert.equal(r.report.validation.roundtrip.valid, true);
                assert.equal(r.document.blocks.length, 1);
                assert.equal(r.document.entities.filter(e => e.type === 'INSERT').length, page === 1 ? 6 : 8);
                for (const e of r.document.entities.filter(e => e.type === 'SPLINE')) {
                    const b = r.preview.entities.find(x => x.id === e.id);
                    assert.ok(b);
                    for (let i = 0; i < e.controlPoints.length; i++)
                        for (let axis = 0; axis < 2; axis++)
                            assert.ok(Math.abs(e.controlPoints[i][axis] - b.controlPoints[i][axis]) < 1e-9);
                }
                await writeFile(new URL(`artifacts/actual-page${page}-${version}.dxf`, root), r.dxf.text);
            }
        }
    }
    finally {
        await source.dispose();
    }
});
test('Full semantic acceptance produces attributes, dimensions and groups with valid ownership', async () => {
    const source = await PdfSource.open(new Uint8Array(await readFile(new URL('assets/cooling-water.pdf', root))), pdfOptions);
    try {
        const scene = await source.extract(1), r = await new ConversionEngine().convertScene(scene, { minConfidence: 0, fidelity: 'inferred' });
        assert.ok(r.document.entities.some(e => e.type === 'DIMENSION'));
        assert.ok(r.document.entities.some(e => e.type === 'INSERT' && e.attributes.length > 0));
        assert.ok(r.document.groups.length > 0);
        assert.equal(validateDocument(r.document).valid, true);
        assert.equal(validateDocument(r.preview).valid, true);
        await writeFile(new URL('artifacts/semantic-accepted.dxf', root), r.dxf.text);
        await writeFile(new URL('artifacts/semantic-accepted.report.json', root), JSON.stringify(r.report, null, 2));
    }
    finally {
        await source.dispose();
    }
});
