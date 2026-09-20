import {assetBytes} from '@revector/dxf';
import {ensureLayer,diagnostic} from '@revector/model';
// Only known visual limitations can be addressed by an explicit page-composite representation.
// Broken scopes, unknown operators, budgets, malformed geometry and rule failures remain errors.
const VISUAL=new Set(['SOFT_MASK','BLEND_MODE','TEXT_COMPOSITING','TEXT_CLIP','TYPE3_FONT','TRANSPARENCY_GROUP','SHADING','SHADING_PATTERN','UNRESOLVED_TEXT_CLIP','PARTIAL_TEXT_CLIP','SHADING_FILL_OMITTED','PATTERN_NON_PATH','RASTER_IMAGE_UNSUPPORTED','RASTER_IMAGE_RESOURCE']);
export function applyAppearance(document,scene,options={}) {
    const a=scene.appearance;
    if(!a)return document;
    if(a.schema!=='revector.appearance/1'||a.pageNumber!==scene.pageNumber||a.annotationMode!==scene.annotationMode||JSON.stringify(a.pageSize)!==JSON.stringify(scene.pageSize)||JSON.stringify(a.ocgs)!==JSON.stringify(scene.ocgs))throw new Error('Stale or malformed appearance snapshot; recapture this page');
    if(!Number.isFinite(a.scale)||a.scale<=0||a.width!==a.asset?.width||a.height!==a.asset?.height||Math.ceil(a.pageSize[0]*a.scale)!==a.width||Math.ceil(a.pageSize[1]*a.scale)!==a.height)throw new Error('Invalid appearance pixel mapping');
    if(scene.source?.fingerprints&&JSON.stringify(scene.source.fingerprints)!==JSON.stringify(a.sourceFingerprints))throw new Error('Appearance source fingerprint mismatch');
    assetBytes(a.asset); // Verify digest and PNG dimensions before using the snapshot as evidence.
    const view=options.appearanceView??'appearance';
    if(!['appearance','semantic'].includes(view))throw new RangeError('Unknown appearance view');
    const doc=document,semanticLayers=doc.layers.map(l=>({name:l.name,visible:l.visible!==false}));
    let name='REVECTOR_APPEARANCE',suffix=0;
    while(doc.layers.some(l=>l.name.toUpperCase()===name.toUpperCase()))name='REVECTOR_APPEARANCE_'+(++suffix);
    for(const layer of doc.layers)if(view==='appearance')layer.visible=false;
    ensureLayer(doc,name,[255,255,255],view==='appearance');
    const factor=(doc.pageBox[2]-doc.pageBox[0])/a.pageSize[0];
    if(!Number.isFinite(factor)||factor<=0)throw new Error('Invalid appearance drawing scale');
    let id='appearance-'+a.asset.sha256,s=0;
    while(doc.entities.some(e=>e.id===id))id='appearance-'+a.asset.sha256+'-'+(++s);
    const existing=doc.assets.find(asset=>asset.id===a.asset.id);
    if(existing&&(existing.sha256!==a.asset.sha256||existing.path!==a.asset.path))throw new Error('Appearance asset identity collision');
    if(!existing)doc.assets.push(structuredClone(a.asset));
    doc.entities.push({id,type:'IMAGE',layer:name,imageId:a.asset.id,imageSize:[a.width,a.height],
        position:[doc.pageBox[0],doc.pageBox[3]-a.height/a.scale*factor],uPixel:[factor/a.scale,0],vPixel:[0,factor/a.scale],
        color:[255,255,255],opacity:1,lineweight:0,source:{kind:'page-composite',page:scene.pageNumber,raster:{interpolate:false},dpi:a.dpi},
        semantic:{class:'page-appearance',method:'sampled-reference',confidence:1,exact:false}});
    const visualDiagnostics=doc.diagnostics.filter(d=>VISUAL.has(d.code));
    if(!options.strictSemantics)doc.diagnostics=doc.diagnostics.map(d=>VISUAL.has(d.code)?{...d,originalSeverity:d.severity,severity:'warning',representation:'semantic-layer-limitation',appearanceFallback:true}:d);
    doc.source.appearance={schema:a.schema,mode:a.mode,view,layer:name,semanticLayers,dpi:a.dpi,pixelSize:[a.width,a.height],
        background:a.background,renderer:a.renderer,sha256:a.asset.sha256,editableGeometryPreserved:true,
        nativeSemanticsComplete:false,visualLimitations:structuredClone(visualDiagnostics),
        qualification:'Sampled PDF.js appearance at declared DPI; not native recovery of masks/blends or arbitrary zoom equivalence'};
    doc.diagnostics.push(diagnostic('APPEARANCE_REPRESENTATION','PDF.js page appearance is a sampled IMAGE; editable CAD geometry remains on separate layers. Enable those layers and hide the appearance layer to edit without duplicate paint.','warning'));
    return doc;
}
