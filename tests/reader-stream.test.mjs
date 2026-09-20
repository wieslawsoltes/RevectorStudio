import test from 'node:test';
import assert from 'node:assert/strict';
import {readDxf} from '@revector/dxf';
const entity=(padding=0)=>['0','LINE','5','A','8','0','10','1','20','2','11','3','21','4','10','999','1001','REVECTOR','1000','{"id":"line-a"}',...Array.from({length:padding},()=>['999','ignored']).flat()].join('\n');
const wrap=body=>'0\nSECTION\n2\nENTITIES\n'+body+'\n0\nENDSEC\n0\nEOF\n';
test('Fused scalar tag decoding retains first occurrences for short and indexed records',()=>{
    for(const padding of [0,70]){
        const e=readDxf(wrap(entity(padding))).entities[0];
        assert.deepEqual(e.start,[1,2]);assert.deepEqual(e.end,[3,4]);assert.equal(e.id,'line-a');
    }
});
test('Fused section scanning preserves repeated-section replacement and ignores unowned tags',()=>{
    const text='0\nSECTION\n2\nENTITIES\n'+entity()+'\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n999\nunowned\n0\nENDSEC\n0\nEOF\n';
    assert.deepEqual(readDxf(text).entities,[]);
    assert.throws(()=>readDxf('0\nSECTION\n0\nEOF\n'),/SECTION has no name/);
    assert.throws(()=>readDxf('0\nSECTION\n'),/SECTION has no name/);
});
test('Fused scanner validates unknown sections and applies the complete pair budget',()=>{
    assert.throws(()=>readDxf('0\nSECTION\n2\nIGNORED\n1072\ninvalid\n0\nENDSEC\n0\nEOF\n'),/Invalid DXF group code/);
    const text=wrap(entity()),pairs=text.trimEnd().split('\n').length/2;
    assert.equal(readDxf(text,{maxPairs:pairs}).entities.length,1);
    assert.throws(()=>readDxf(text,{maxPairs:pairs-1}),/pair budget/);
});
