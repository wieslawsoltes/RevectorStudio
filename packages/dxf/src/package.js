import {exportDxf} from './writer.js';
import {isSafeAssetPath,sha256Bytes} from '@revector/model';

/** Decode a portable PNG asset. No filesystem or network access; used by browser and Node hosts. */
export function assetBytes(asset) {
    if(!isSafeAssetPath(asset?.path) || typeof asset.dataBase64!=='string')throw new Error('Raster asset is missing or unsafe');
    if(asset.dataBase64.length>128*1024*1024 || (asset.dataBase64.length%4!==0 || /[^A-Za-z0-9+/=]/.test(asset.dataBase64) || !/^[^=]*={0,2}$/.test(asset.dataBase64)))throw new Error('Invalid raster asset encoding');
    const text=atob(asset.dataBase64),bytes=Uint8Array.from(text,c=>c.charCodeAt(0));
    if(bytes.length<33 || [137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v) || String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('Raster asset is not a PNG');
    const view=new DataView(bytes.buffer);
    if(view.getUint32(16)!==asset.width||view.getUint32(20)!==asset.height)throw new Error('PNG dimensions disagree with raster asset');
    if(asset.sha256!==undefined && (!/^[0-9a-f]{64}$/.test(asset.sha256) || sha256Bytes(bytes)!==asset.sha256))throw new Error('Raster asset checksum mismatch');
    return bytes;
}
/** Return a complete, portable set of files. The host owns ZIP creation or atomic disk writes. */
export function packageDxf(document,{filename='drawing.dxf',maxBytes=128*1024*1024,sourcePdf,...options}={}) {
    if(!/^[A-Za-z0-9_][A-Za-z0-9_. -]{0,180}\.dxf$/i.test(filename))throw new Error('DXF package filename must be a simple .dxf name');
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new RangeError('Invalid package byte budget');
    const dxf=exportDxf(document,options),files=[{name:filename,data:dxf.text}],assets=[];
    const used=new Set([...document.entities,...document.blocks.flatMap(b=>b.entities)].filter(e=>e.type==='IMAGE').map(e=>e.imageId));
    let size=new TextEncoder().encode(dxf.text).length;
    for(const asset of document.assets||[])if(used.has(asset.id)) {
        if(typeof asset.dataBase64!=='string')throw new Error('Raster asset bytes are missing');
        if(size+Math.max(0,asset.dataBase64.length*3/4-2)>maxBytes)throw new RangeError('DXF package byte budget exceeded');
        const bytes=assetBytes(asset);size+=bytes.length;
        if(size>maxBytes)throw new RangeError('DXF package byte budget exceeded');
        files.push({name:asset.path,data:bytes});assets.push({id:asset.id,path:asset.path,width:asset.width,height:asset.height,bytes:bytes.length,sha256:asset.sha256||sha256Bytes(bytes)});
    }
    if(size>maxBytes)throw new RangeError('DXF package byte budget exceeded');
    let sourceArchive;
    if(sourcePdf!==undefined){
        if(!(sourcePdf instanceof Uint8Array)||sourcePdf.byteLength<5||!new TextDecoder('latin1').decode(sourcePdf.subarray(0,1024)).includes('%PDF-'))throw new TypeError('sourcePdf must contain the original PDF bytes');
        if(size+sourcePdf.byteLength>maxBytes)throw new RangeError('DXF package byte budget exceeded');
        const bytes=new Uint8Array(sourcePdf);size+=bytes.byteLength;
        const path=filename+'.source.pdf';files.push({name:path,data:bytes});
        sourceArchive={path,bytes:bytes.byteLength,sha256:sha256Bytes(bytes),warning:'Exact original PDF; may include hidden content, attachments and sensitive metadata. Not a redacted artifact.'};
    }
    const manifest={schema:'revector.dxf-package/1',drawing:filename,version:dxf.version,assets,...(sourceArchive?{sourceArchive}:{})};
    const json=JSON.stringify(manifest,null,2)+'\n';
    if(size+new TextEncoder().encode(json).length>maxBytes)throw new RangeError('DXF package byte budget exceeded');
    files.push({name:filename+'.assets.json',data:json});
    return {dxf,files,manifest};
}
