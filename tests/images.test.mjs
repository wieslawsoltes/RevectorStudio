import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createDocument,validateDocument,entityBox,isSafeAssetPath,DXF_VERSIONS} from '@revector/model';
import {exportDxf,readDxf,packageDxf} from '@revector/dxf';
import {transformEntity,lowerScene} from '@revector/cad';
import {interpretOperators,OPS} from '@revector/pdf';
const asset={id:'IMG_regression',path:'images/regression.png',width:16,height:16,mimeType:'image/png'};
const image={id:'image',type:'IMAGE',imageId:asset.id,imageSize:[16,16],position:[10,20],uPixel:[2,.5],vPixel:[.25,1],color:[255,255,255],opacity:1,layer:'0'};
function doc(){return createDocument({assets:[structuredClone(asset)],entities:[structuredClone(image),{...structuredClone(image),id:'mirrored',position:[100,30],uPixel:[-2,.5]}]});}
for(const version of Object.keys(DXF_VERSIONS))test(`IMAGE ${version}: shared definitions, reactors, affine placement and default pixel boundaries`,async()=>{
    const d=doc(),text=exportDxf(d,{version}).text,read=readDxf(text);
    assert.equal(read.assets.length,1);assert.equal(read.entities.length,2);assert.equal(read.entities[0].imageId,asset.id);
    for(const key of ['position','uPixel','vPixel','imageSize'])assert.deepEqual(read.entities[0][key],image[key]);
    assert.equal(validateDocument(read).valid,true);
    assert.equal((text.match(/\r\nIMAGEDEF\r\n/g)||[]).length,2); // CLASS and OBJECTS
    assert.equal((text.match(/\r\nIMAGEDEF_REACTOR\r\n/g)||[]).length,3);
    await mkdir('artifacts/images',{recursive:true});await writeFile(`artifacts/images/shared-${version}.dxf`,text);
});
test('Image bounds include shear and reflected bases',()=>{
    assert.deepEqual(entityBox(image,doc()),[10,20,46,44]);
    const next=transformEntity(image,[0,1,-1,0,0,0]);
    assert.deepEqual(entityBox(next,doc()),[-44,10,-20,46]);
});
test('Missing, singular, and inconsistent IMAGE resources fail model validation',()=>{
    let d=doc();d.assets=[];assert.equal(validateDocument(d).valid,false);
    d=doc();d.entities[0].vPixel=[4,1];assert.equal(validateDocument(d).valid,false);
    d=doc();d.entities[0].imageSize=[99,16];assert.equal(validateDocument(d).valid,false);
});
test('Image file paths reject traversal, remote URLs, control characters and duplicate case',()=>{
    for(const path of ['../x.png','images/../x.png','/x.png','https://a/x.png','images\\x.png','C:/x.png','images/%2e.png','images/a\n.png','images/.x.png'])assert.equal(isSafeAssetPath(path),false,path);
    assert.equal(isSafeAssetPath('images/abc.png'),true);
    const d=doc();d.assets.push({...asset,id:'other',path:'images/REGRESSION.png'});assert.equal(validateDocument(d).valid,false);
});
test('Package fails closed on unavailable image bytes and unsafe drawing paths',()=>{
    assert.throws(()=>packageDxf(doc()),/missing/);assert.throws(()=>packageDxf(doc(),{filename:'../bad.dxf'}),/filename/);
});
test('Preserved image is lowered between the original native paint operations',async()=>{
    const scene=await interpretOperators({fnArray:[OPS.setFillRGBColor,OPS.paintImageXObject,OPS.setFillRGBColor],argsArray:[[5,10,15],['img',16,16],[0,0,0]]},{pageTransform:[1,0,0,1,0,0],box:[0,0,100,100]});
    assert.deepEqual(scene.items[0].style.fill,[5,10,15]);scene.items[0].rasterAsset=asset;
    const d=await lowerScene(scene,{units:'pt'});assert.equal(d.entities[0].type,'IMAGE');assert.equal(d.assets.length,1);assert.equal(d.entities[0].opacity,1);
});
test('Transfer functions and blend-dependent images are explicitly skipped',async()=>{
    const {preserveRasterImages}=await import('@revector/pdf');
    const s=await interpretOperators({fnArray:[OPS.setGState,OPS.paintImageXObject],argsArray:[[[['TR',[1,2,3]]]],['img',16,16]]});
    let read=false;const kept=await preserveRasterImages({rasterResource:()=>{read=true;throw Error('must not read');}},s);
    assert.equal(read,false);assert.equal(kept.rasterImages.complete,false);assert.equal(kept.rasterImages.skipped,1);
    assert.ok(kept.diagnostics.some(d=>d.code==='RASTER_IMAGE_UNSUPPORTED'));
});
test('Image pixels are never counted as exact vector color audit results',async()=>{
    const {auditColors}=await import('@revector/color');const d=doc(),r=auditColors(d,readDxf(exportDxf(d).text));
    assert.equal(r.rasterImages,2);assert.equal(r.imagePixelsAudited,false);assert.equal(r.complete,false);assert.equal(r.exact,false);
});
test('Host callback objects and credentials are not serialized as CAD options',async()=>{
    const s=await interpretOperators({fnArray:[],argsArray:[]});const d=await lowerScene(s,{rasterImages:{canvasFactory:()=>{},maxPixels:200},pdfOptions:{password:'do-not-export'}});
    assert.deepEqual(d.source.options.rasterImages,{maxPixels:200});assert.deepEqual(d.source.options.pdfOptions,{});assert.ok(structuredClone(d));
});
