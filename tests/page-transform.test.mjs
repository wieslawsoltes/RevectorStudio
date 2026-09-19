import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfSource } from '@revector/pdf';
import { ConversionEngine } from '@revector/engine';
import { transform } from '@revector/geometry';

// Real PDF with nonzero CropBox, UserUnit=2 and each page rotation.
function fixture() {
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [5 0 R 6 0 R 7 0 R 8 0 R] /Count 4 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    const content = 'BT /F 10 Tf 40 75 Td (ROTATION) Tj ET\n';
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    for (const rotation of [0,90,180,270]) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 210 310] /CropBox [15 25 195 285] /UserUnit 2 /Rotate ${rotation} /Resources << /Font << /F 3 0 R >> >> /Contents 4 0 R >>`);
    let pdf = '%PDF-1.7\n';
    const offsets = [0];
    objects.forEach((body,index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index+1} 0 obj\n${body}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10,'0')} 00000 n \n`;
    pdf += `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Uint8Array(Buffer.from(pdf));
}
const root = new URL('../', import.meta.url);
for (const [index,rotation] of [0,90,180,270].entries()) {
    test(`PDF page rotation ${rotation} maps native text into display-aligned CAD coordinates`, async () => {
        const source = await PdfSource.open(fixture(), {
            moduleUrl:new URL('vendor/pdfjs/legacy/build/pdf.mjs',root).href,
            workerUrl:new URL('vendor/pdfjs/legacy/build/pdf.worker.mjs',root).href
        });
        try {
            const scene = await source.extract(index+1);
            const expected = rotation === 0 ? [50,100] : rotation === 90 ? [100,310] : rotation === 180 ? [310,420] : [420,50];
            const actual = transform(scene.pageTransform,[40,75]);
            expected.forEach((v,i) => assert.ok(Math.abs(actual[i]-v)<1e-9));
            const {document} = await new ConversionEngine().convertScene(scene,{units:'pt',profile:'exact'});
            const text = document.entities.find(e=>e.type==='TEXT'&&e.text==='ROTATION');
            assert.ok(text);
            expected.forEach((v,i)=>assert.ok(Math.abs(text.position[i]-v)<1e-9));
            assert.ok(Math.abs(((text.rotation%360)+360)%360-((360-rotation)%360))<1e-9);
        } finally { await source.dispose(); }
    });
}
