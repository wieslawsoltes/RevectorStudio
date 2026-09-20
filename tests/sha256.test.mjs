import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {sha256Bytes} from '@revector/model';
test('Portable SHA-256 agrees with native crypto across padding, multi-block and byte-offset boundaries',()=>{
 for(const n of [0,1,31,55,56,63,64,65,119,120,127,128,1024,1_000_000]){
  const backing=randomBytes(n+12),bytes=backing.subarray(7,7+n),before=bytes.slice();
  assert.equal(sha256Bytes(bytes),createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(bytes,before);
 }
 assert.equal(sha256Bytes(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.throws(()=>sha256Bytes('abc'),TypeError);
});
