import { createDocument } from '@revector/model';
import { exportDxf, readDxf } from '@revector/dxf';
import { writeFileSync } from 'node:fs';
const doc = createDocument();
const base = { layer: '0', color: [24, 110, 160], lineweight: .25 };
let n = 0;
const e = (type, o) => ({ ...base, id: 'e' + (++n), type, ...o });
doc.entities.push(e('LINE', { start: [10, 10], end: [50, 20] }), e('TEXT', { position: [10, 30], height: 3, width: 25, text: 'Valve Ø200 ° ±', font: 'Arial' }), e('SPLINE', { degree: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], controlPoints: [[10, 40], [20, 70], [30, 10], [40, 40]] }), e('HATCH', { solid: true, paths: [{ start: [10, 60], segments: [{ kind: 'L', to: [30, 60] }, { kind: 'L', to: [30, 70] }, { kind: 'L', to: [10, 70] }], closed: true }] }));
doc.blocks.push({ name: 'TEST', origin: [0, 0], entities: [e('CIRCLE', { center: [0, 0], radius: 3 })] });
doc.entities.push(e('INSERT', { name: 'TEST', position: [80, 50], scale: [1, 1], rotation: 20, attributes: [e('ATTRIB', { position: [80, 55], height: 3, width: 15, text: 'V-101', tag: 'TAG', font: 'Arial' })] }));
doc.blocks.push({ name: '*D1', origin: [0, 0], entities: [e('LINE', { start: [50, 90], end: [100, 90] }), e('TEXT', { text: '50', position: [70, 93], height: 3, width: 5, font: 'Arial' })] });
doc.entities.push(e('DIMENSION', { block: '*D1', definition: [100, 90], textPosition: [70, 93], extension1: [50, 80], extension2: [100, 80], text: '50', measurement: 50 }));
doc.groups.push({ name: 'Example', members: [doc.entities[0].id, doc.entities[1].id] });
for (const version of ['2000', '2004', '2007', '2010', '2013', '2018']) {
    const r = exportDxf(doc, { version });
    writeFileSync('artifacts/smoke-' + version + '.dxf', r.text);
    console.log(version, readDxf(r.text).entities.length, r.diagnostics);
}
