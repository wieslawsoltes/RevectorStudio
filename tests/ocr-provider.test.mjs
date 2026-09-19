import test from 'node:test';
import assert from 'node:assert/strict';
import { TesseractOcr } from '@revector/ocr';

test('Tesseract browser ES-module default export is normalized to the provider API', async () => {
    let terminated = 0;
    const worker = {
        async setParameters() {},
        async recognize(_image, _options, output) {
            assert.equal(output.blocks, true);
            return { data: { text: 'PUMP P-101', blocks: [] } };
        },
        async terminate() { terminated++; }
    };
    const provider = { default: { async createWorker(language, engine) {
        assert.equal(language, 'eng');
        assert.equal(engine, 1);
        return worker;
    } } };
    const session = new TesseractOcr({ provider });
    try {
        assert.equal((await session.recognize({})).text, 'PUMP P-101');
    } finally { await session.dispose(); }
    assert.equal(terminated, 1);
});

test('Malformed OCR provider fails with a precise contract error and releases busy state', async () => {
    const session = new TesseractOcr({ provider: { default: {} } });
    await assert.rejects(session.recognize({}), /must export createWorker/);
    assert.equal(session.busy, false);
    assert.equal(session.worker, null);
});
