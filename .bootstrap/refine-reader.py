from pathlib import Path
import hashlib
p=Path('packages/dxf/src/reader.js');s=p.read_text()
assert hashlib.sha256(p.read_bytes()).hexdigest() == '380e96fc64a99771d946675aa4f6f7efff7ce863de8ec266ba1a7bc5ef04d6dd'
a=s.index('function* pairs(');b=s.index('\nconst n =',a)
s=s[:a]+'''/** Scan directly into section records. Do not retain an intermediate line array,
 * flat pair array, or duplicate OBJECTS records. Ordered repeated tags stay intact. */
function scanSections(text, maxPairs) {
    let offset=text.charCodeAt(0)===0xFEFF?1:0, lineNumber=1, count=0;
    let section=null, target=null, record=null, expectName=false, lastValue;
    const sections=new Map();
    const readLine=()=>{
        const end=text.indexOf('\\n',offset);
        if(end<0){const value=text.slice(offset);offset=text.length;return value;}
        const value=text.slice(offset,end>offset&&text.charCodeAt(end-1)===13?end-1:end);
        offset=end+1;return value;
    };
    while(offset<text.length) {
        const codeText=readLine();
        if(offset>=text.length)throw new Error('DXF group/value line count is odd');
        const value=readLine();
        if(++count>maxPairs)throw new RangeError('DXF pair budget exceeded');
        const code=Number(codeText.trim());
        if(!Number.isInteger(code)||code<0||code>1071)throw new Error(`Invalid DXF group code on line ${lineNumber}`);
        lineNumber+=2;lastValue=value;
        if(expectName){
            if(code!==2)throw Error('DXF SECTION has no name');
            section=value;target=[];sections.set(section,target);record=null;expectName=false;
        }else if(code===0&&value==='SECTION')expectName=true;
        else if(code===0&&value==='ENDSEC'){section=null;target=null;record=null;}
        else if(section){
            if(section==='HEADER')target.push([code,value]);
            else if(code===0){record={type:value.trim(),tags:[]};target.push(record);}
            else if(record)record.tags.push([code,value]);
        }
    }
    if(expectName)throw Error('DXF SECTION has no name');
    if(lastValue!=='EOF')throw Error('DXF has no EOF marker');
    return sections;
}
function get(r,code,def) {
    // A tiny contiguous tag list is cheaper to scan than to allocate a hash map.
    // Index only large records; retain the first occurrence for scalar fields.
    if(r.tags.length<64){
        for(let i=0;i<r.tags.length;i++){const t=r.tags[i];if(t[0]===code)return t[1]??def;}
        return def;
    }
    let values=r.firstValues;
    if(!values){
        values=r.firstValues=new Map();
        for(let i=0;i<r.tags.length;i++){const t=r.tags[i];if(!values.has(t[0]))values.set(t[0],t[1]);}
    }
    return values.get(code)??def;
}'''+s[b:]
a=s.index('    const iterator=pairs(');b=s.index('    const doc =',a)
s=s[:a]+'''    const sections=scanSections(text,maxPairs);
'''+s[b:]
for section in ['TABLES','OBJECTS','BLOCKS','ENTITIES']:
 import re
 s=re.sub(r"records\(sections.get\('"+section+r"'\)\s*\|\|\s*\[\]\)",f"(sections.get('{section}') || [])",s)
assert 'records(' not in s
s=s.replace("export const decodeDxfString = s => String(s).replace(/\\\\U\\+([0-9A-Fa-f]{4})/g, (_, v) => String.fromCharCode(parseInt(v, 16)));", "export function decodeDxfString(value) { const s=String(value); return s.includes('\\\\U+') ? s.replace(/\\\\U\\+([0-9A-Fa-f]{4})/g, (_, v) => String.fromCharCode(parseInt(v, 16))) : s; }")
assert 'export function decodeDxfString' in s
s=s.replace("        if (r.type === 'GROUP')\n            doc.groups.push({ name: parseXdata(r)?.id || get(r, 5, ''), semantic: parseXdata(r)?.semantic || {}, description: decodeDxfString(get(r, 300, '')), members: r.tags.filter(t => t[0] === 340).map(t => handles.get(t[1])).filter(Boolean) });", "        if (r.type === 'GROUP') {\n            const meta=parseXdata(r);\n            doc.groups.push({ name: meta?.id || get(r, 5, ''), semantic: meta?.semantic || {}, description: decodeDxfString(get(r, 300, '')), members: r.tags.filter(t => t[0] === 340).map(t => handles.get(t[1])).filter(Boolean) });\n        }")
p.write_text(s)
Path('tests/reader-stream.test.mjs').write_text(r'''import test from 'node:test';
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
''')
p=Path('docs/PERFORMANCE.md');s=p.read_text();s=s.replace('The reader scans group/value lines incrementally rather than retaining an extra full lines array and pairs array. First-occurrence tag maps avoid repeated scans while multi-value geometry tags retain their original order.', 'The reader scans directly into section records without a generator, full lines array or intermediate section-pair copies. Small records use allocation-free scalar scans; large records use first-occurrence tag maps, and repeated geometry tags retain their original order. Object records and GROUP metadata are decoded once.')
p.write_text(s)
