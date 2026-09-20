import test from 'node:test';
import assert from 'node:assert/strict';
import {traceRasterPaths} from '@revector/raster';
const raster=(rows)=>({binary:Uint8Array.from(rows.join(''),c=>+(c==='#')),w:rows[0].length,h:rows.length});
async function trace(rows,o){const r=raster(rows);return traceRasterPaths(r.binary,r.w,r.h,o);}
test('Diagonal strokes become one arbitrary-angle path with pixel-center endpoints',async()=>{
 const r=await trace(['#....','.#...','..#..','...#.','....#']);assert.equal(r.paths.length,1);assert.deepEqual(r.paths[0].points,[[.5,.5],[4.5,4.5]]);assert.equal(r.stats.graphEdges,4);assert.equal(r.stats.tracedEdges,4);
});
test('Four-way junction splits into four paths, never joins unrelated branches',async()=>{
 const r=await trace(['..#..','..#..','#####','..#..','..#..']);assert.equal(r.paths.length,4);assert.equal(r.stats.junctionPixels,1);assert.equal(r.stats.endpoints,4);
 for(const p of r.paths)assert.ok(p.startDegree===4||p.endDegree===4);
});
test('Pure closed cycles survive simplification as closed polylines',async()=>{
 const r=await trace(['.......','.#####.','.#...#.','.#...#.','.#...#.','.#####.','.......']);assert.equal(r.paths.length,1);assert.equal(r.paths[0].closed,true);assert.ok(r.paths[0].points.length>=3);assert.equal(r.stats.tracedEdges,r.stats.graphEdges);
});
test('Thick strokes converge, isolated dots remain reported, and input is immutable',async()=>{
 const r=raster(['..........','.#######..','.#######..','.#######..','..........','.........#']);const copy=r.binary.slice(),out=await traceRasterPaths(r.binary,r.w,r.h);
 assert.equal(out.paths.length,1);assert.equal(out.stats.isolatedPixels,1);assert.ok(out.stats.skeletonPixels<out.stats.foreground);assert.deepEqual(r.binary,copy);
});
test('Corner shortcuts do not turn L-shaped linework into a false triangle',async()=>{
 const r=await trace(['#....','#....','###..','.....']);assert.equal(r.paths.length,1);assert.equal(r.stats.junctionPixels,0);assert.equal(r.paths[0].closed,false);
});
test('Disconnected strokes remain separate and border coordinates are retained',async()=>{
 const r=await trace(['##....','......','....##']);assert.equal(r.paths.length,2);assert.ok(r.paths.every(p=>p.touchesBorder));
});
test('Zero tolerance retains every sampled skeleton vertex',async()=>{
 const r=await trace(['#....','.#...','..#..','...#.','....#'],{tolerance:0});assert.equal(r.paths[0].points.length,5);
});
test('Trace budgets and cancellation fail before partial geometry is returned',async()=>{
 for(const o of [{maxWork:2},{maxForeground:1},{maxPixels:1},{maxPoints:1},{maxPaths:1}])await assert.rejects(trace(['###...','......','...###'],o),RangeError);
 await assert.rejects(trace(['#####','#####','#####','#####','#####'],{maxIterations:1}),/converge/);
 const c=new AbortController();c.abort();await assert.rejects(trace(['###'],{signal:c.signal}),{name:'AbortError'});
 await assert.rejects(traceRasterPaths(Uint8Array.of(2),1,1),TypeError);
});
test('Blank rasters return no invented vectors',async()=>{const r=await trace(['...','...']);assert.equal(r.paths.length,0);assert.equal(r.stats.foreground,0);});
