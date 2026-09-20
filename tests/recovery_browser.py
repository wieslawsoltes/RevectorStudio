"""Real WASM OCR through a skewed, tiled PDF, plus cleanup and UI option contracts.
The PDF is authored in memory; no injected OCR results, fonts or remote services are used.
"""
from __future__ import annotations
import argparse, functools, http.server, io, json, os, shutil, threading
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image, ImageDraw, ImageFont
import pymupdf
import ezdxf
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def fixture() -> bytes:
    image=Image.new('RGB',(1200,700),'white')
    paths=[Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf')]
    font=ImageFont.truetype(str(next(p for p in paths if p.exists())),40)
    draw=ImageDraw.Draw(image)
    for row,label in enumerate(['PUMP P-101','FLOW 120','VALVE OPEN']):draw.text((420,150+110*row),label,font=font,fill=(20,40,70))
    # Positive clockwise scan skew. Metadata says nothing about this rotation.
    skew=image.rotate(-4,resample=Image.Resampling.BICUBIC,expand=True,fillcolor='white')
    png=io.BytesIO();skew.save(png,format='PNG')
    with pymupdf.open() as pdf:
        page=pdf.new_page(width=skew.width/4,height=skew.height/4)
        page.insert_image(page.rect,stream=png.getvalue())
        return pdf.tobytes(garbage=4,deflate=True)

def run(url: str, output: Path):
    output.mkdir(parents=True,exist_ok=True);checks=[];errors=[];foreign=[];report={}
    def check(name,ok):
        assert ok,name
        checks.append(name);print('PASS',name,flush=True)
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path=os.environ.get('REVECTOR_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':1660,'height':1040})
        page.set_default_timeout(180000)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda request:foreign.append(request.url) if request.url.startswith(('http:','https:')) and urlparse(request.url).netloc!=urlparse(url).netloc else None)
        try:
            page.goto(url,wait_until='domcontentloaded',timeout=60000)
            page.wait_for_function('globalThis.workbench?.result&&!workbench.running',timeout=90000)
            # Partial persisted settings from v0.2 must retain defaults for added fields.
            page.evaluate("workbench.ocrSettings={scope:'raster',languages:'eng'};workbench.configureOcr()")
            check('OCR dialog upgrades partial project settings',page.locator('#ocr-tile-size').input_value()=='2048' and page.locator('#ocr-deskew').count()==1)
            check('OCR dialog exposes inversion independently of thresholding',page.locator('#ocr-invert').count()==1)
            page.get_by_role('button',name='Cancel',exact=True).last.click()
            data=fixture();(output/'skewed-input.pdf').write_bytes(data)
            result=page.evaluate('''async bytes=>{
                const {PdfSource}=await import('@revector/pdf');const {recoverPdfRaster}=await import('@revector/ocr');
                const {ConversionEngine}=await import('@revector/engine');
                const source=await PdfSource.open(new Uint8Array(bytes),workbench.pdfOptions('Skewed scan.pdf'));
                const allocated=[];let releasedOnFailure=false;
                const factory=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;allocated.push(c);return c;};
                try {
                    const scene=await source.extract(1),original=JSON.stringify(scene),engine=new ConversionEngine();
                    const recovered=await recoverPdfRaster(source,scene,{languages:'eng',scope:'raster',dpi:288,minConfidence:65,deskew:true,tileSize:768,tileOverlap:96,canvasFactory:factory,assetBase:new URL('./vendor/ocr/',document.baseURI).href});
                    const converted=await engine.convertScene(recovered,{units:'mm',version:'2018',profile:'exact'});
                    const releasedOnSuccess=allocated.every(c=>c.width===1&&c.height===1);allocated.length=0;
                    try {await recoverPdfRaster(source,scene,{canvasFactory:factory,session:{recognize:async()=>{throw Error('Intentional provider failure');}},dpi:72});}
                    catch(error){if(error.message!=='Intentional provider failure')throw error;releasedOnFailure=allocated.every(c=>c.width===1&&c.height===1);}
                    workbench.ocrSettings=null;
                    await workbench.openBytes(new Uint8Array(bytes),'Skewed scan.pdf');
                    workbench.scene=recovered;workbench.result=converted;workbench.cadView.setDocument(converted.preview);workbench.cadView.invalidate();workbench.fit();
                    return {ocr:recovered.ocr,words:converted.document.entities.filter(e=>e.source?.ocr).map(e=>({text:e.text,rotation:e.rotation,source:e.source,position:e.position})),dxf:converted.dxf.text,sourceUnchanged:JSON.stringify(scene)===original,releasedOnSuccess,releasedOnFailure};
                }finally{await source.dispose();}
            }''',list(data))
            dxf=result.pop('dxf');report['result']=result
            print(json.dumps(result,indent=2),flush=True)
            check('Real PDF raster is processed in multiple overlapping OCR tiles',result['ocr']['tiles']>1)
            check('Image skew is estimated without PDF rotation metadata',abs(result['ocr']['deskew'][0]['angle']-4)<1)
            labels=[w['text'] for w in result['words']]
            check('Skewed raster text becomes editable CAD text',all(label in labels for label in ['PUMP','P-101','FLOW','VALVE','OPEN']))
            check('Overlapping tile duplicates and clipped fragments are suppressed',result['ocr']['tileDuplicates']>0 and sorted(labels)==sorted(['PUMP','P-101','FLOW','120','VALVE','OPEN']))
            def wrap(degrees):return (degrees+180)%360-180
            check('Deskew is inverted when mapping text back to the source drawing',all(abs(wrap(w['rotation']+4))<1.1 for w in result['words']))
            check('Every inferred word carries its tile, skew and image provenance',all(len(w['source']['ocr']['pixelToPdf'])==6 and w['source']['ocr']['imageIds'] and w['source']['ocr']['deskew'] and isinstance(w['source']['ocr']['tile'],int) for w in result['words']))
            check('Raster recovery leaves the extracted PDF scene unchanged',result['sourceUnchanged'])
            check('Temporary canvas allocations are released after successful recovery',result['releasedOnSuccess'])
            check('Temporary canvas allocations are released when a provider fails',result['releasedOnFailure'])
            path=output/'skewed-export.dxf';path.write_text(dxf,encoding='utf8');document=ezdxf.readfile(path);audit=document.audit()
            check('Deskewed OCR export passes independent DXF validation',not audit.errors and not audit.fixes and len(document.modelspace().query('TEXT'))>=5)
            page.screenshot(path=str(output/'tiled-deskew-workbench.png'),full_page=True)
            check('All OCR requests stay on the application origin',not foreign)
            check('No uncaught browser exceptions',not errors)
        finally:
            report.update({'url':url,'passed':len(checks),'checks':checks,'errors':errors,'externalRequests':foreign,'browserVersion':browser.version})
            (output/'validation.json').write_text(json.dumps(report,indent=2)+'\n');browser.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url');parser.add_argument('--output',default='artifacts/recovery-next');args=parser.parse_args()
    if args.url:run(args.url.rstrip('/')+'/',Path(args.output));return
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'dist')));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:run(f'http://127.0.0.1:{server.server_port}/',Path(args.output))
    finally:server.shutdown();thread.join(5);server.server_close()
if __name__=='__main__':main()
