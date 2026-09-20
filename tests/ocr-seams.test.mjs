import test from 'node:test';
import assert from 'node:assert/strict';
import {deduplicateOcrWords} from '@revector/ocr';
const word=(text,box,confidence,tile,clippedEdges=[])=>({text,bbox:{x0:box[0],y0:box[1],x1:box[2],y1:box[3]},confidence,tile,clippedEdges});
test('Complete adjacent-tile observations suppress high-confidence clipped fragments',()=>{
    const partial=word('P-1(', [597,241,672,272],99,0,['right']);
    const complete=word('P-101',[597,241,703,272],92,1);
    assert.deepEqual(deduplicateOcrWords([partial,complete]),[complete]);
});
test('Vertical crop fragments and small contained glyphs do not duplicate full words',()=>{
    const full=word('OPEN',[605,461,710,492],96,1);
    const parts=[word('OPI',[605,461,672,492],95,0,['right']),word('Vi',[606,480,643,492],66,3,['top']),word('L',[663,480,672,492],77,3,['top','right'])];
    assert.deepEqual(deduplicateOcrWords([...parts,full]),[full]);
});
test('Unmatched clipped text remains available with explicit provenance',()=>{
    const clipped=word('LONG-TA',[600,20,672,50],85,0,['right']);
    assert.deepEqual(deduplicateOcrWords([clipped]),[clipped]);
    assert.deepEqual(clipped.clippedEdges,['right']);
});
test('Ordinary overlapping labels and distant repeated text are not seam fragments',()=>{
    const words=[word('PART',[0,0,50,20],90,0),word('PART NUMBER',[0,0,140,20],92,1),word('PART',[200,0,250,20],90,2)];
    assert.equal(deduplicateOcrWords(words).length,3);
});
test('Same-tile nested observations are not cross-tile truncation evidence',()=>{
    const words=[word('A',[0,0,10,20],90,0,['left']),word('AB',[0,0,22,20],89,0)];
    assert.equal(deduplicateOcrWords(words).length,2);
});
