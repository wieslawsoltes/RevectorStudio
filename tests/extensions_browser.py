"""Real, self-hosted OCR and color-profile regression tests. No mocked workers or OCR output."""
from __future__ import annotations
import argparse, functools, http.server, json, os, shutil, threading
from pathlib import Path
from urllib.parse import urlparse
import ezdxf
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def run(url: str, output: Path):
    output.mkdir(parents=True,exist_ok=True); checks=[];errors=[];foreign=[];requests=[];report={}
    def check(name,condition):
        assert condition,name
        checks.append(name);print('PASS',name,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('REVECTOR_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':1660,'height':1040},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:foreign.append(r.url) if r.url.startswith(('http:','https:')) and urlparse(r.url).netloc!=urlparse(url).netloc else requests.append(r.url))
        page.on('console',lambda m:print('CONSOLE',m.text,flush=True) if m.type=='error' else None)
        try:
            page.goto(url,wait_until='domcontentloaded',timeout=60000)
            page.wait_for_function('globalThis.workbench?.result && !workbench.running',timeout=90000)
            check('Both original and expanded rule packs are available',page.evaluate('workbench.engine.rules.length===16'))
            check('Faithful colors and white paper are the default',page.evaluate('workbench.cadView.paper && workbench.cadView.renderer.colorMode==="faithful"'))
            colors=page.evaluate('''async () => {
                const {PdfSource}=await import('@revector/pdf');const {ConversionEngine}=await import('@revector/engine');
                const {CadRenderer,Camera}=await import('@revector/renderer');const {transform}=await import('@revector/geometry');
                const bytes=new Uint8Array(await (await fetch('./assets/extensions/colors.pdf')).arrayBuffer());
                const source=await PdfSource.open(bytes,workbench.pdfOptions('colors.pdf'));
                try {
                    const scene=await source.extract(1),result=await new ConversionEngine().convertScene(scene,{units:'pt',profile:'exact',version:'2018'});
                    const a=document.createElement('canvas');const viewport=await source.render(1,a,{scale:3,background:'#fff'});
                    const b=document.createElement('canvas');b.width=a.width;b.height=a.height;const ctx=b.getContext('2d',{colorSpace:'srgb'});ctx.fillStyle='#fff';ctx.fillRect(0,0,b.width,b.height);
                    const cam=new Camera();cam.resize(b.width,b.height);cam.set({center:[180,135],scale:3});ctx.setTransform(...cam.matrix);
                    const renderer=new CadRenderer();renderer.setDocument(result.preview);renderer.dark=false;renderer.draw(ctx,cam);
                    const samples=await (await fetch('./assets/extensions/colors.json')).json();
                    for(const sample of samples){const xy=transform(viewport.transform,sample.point).map(Math.round);sample.pdf=Array.from(a.getContext('2d').getImageData(...xy,1,1).data).slice(0,3);sample.dxf=Array.from(ctx.getImageData(...xy,1,1).data).slice(0,3);sample.error=Math.max(...sample.pdf.map((v,i)=>Math.abs(v-sample.dxf[i])));}
                    return {samples,audit:result.report.color,diagnostics:result.report.diagnostics,policy:scene.colorManagement};
                } finally {await source.dispose();}
            }''')
            report['colors']=colors;print(json.dumps(colors,indent=2),flush=True)
            check('All eleven source color-space swatches match DXF preview within two channel levels',max(s['error'] for s in colors['samples'])<=2)
            check('Near-black RGB bytes are not mistaken for normalized unit components',colors['samples'][0]['dxf']==[1,0,0])
            check('True-color DXF round trip has no quantization',colors['audit']['exact'] and colors['audit']['changed']==0)
            check('ICC resources are configured for the PDF engine',colors['policy']['iccResourcesConfigured'])
            await_ocr='''async () => {
                await workbench.openBytes(new Uint8Array(await (await fetch('./assets/extensions/raster.pdf')).arrayBuffer()),'Mixed raster and native.pdf');
                const before=workbench.result.document.entities.filter(e=>e.type==='TEXT').map(e=>e.text);
                workbench.ocrSettings={scope:'raster',languages:'eng',dpi:250,minConfidence:60,preprocess:'none',traceLines:true};
                await workbench.run(true);if(!workbench.exportReady)throw Error(document.querySelector('.status')?.textContent || 'OCR failed');
                return {before,ocr:workbench.scene.ocr,texts:workbench.result.document.entities.filter(e=>e.type==='TEXT').map(e=>({id:e.id,text:e.text,source:e.source,semantic:e.semantic,position:e.position,height:e.height})),lines:workbench.result.document.entities.filter(e=>e.source?.rasterInference).length};
            }'''
            page.set_default_timeout(180000)
            ocr=page.evaluate(await_ocr);report['ocr']=ocr;print(json.dumps(ocr,indent=2),flush=True)
            check('Raster OCR recognizes editable words from an embedded PDF image',any('PUMP' in e['text'] for e in ocr['texts']) and any('P-101' in e['text'] for e in ocr['texts']))
            check('Native text exists before OCR and overlapping recognition is suppressed',any('NATIVE' in t for t in ocr['before']) and ocr['ocr']['duplicates']>0 and not any('NATIVE' in e['text'] and e['source'].get('ocr') for e in ocr['texts']))
            check('OCR confidence, pixel transform and source image references survive conversion',all(len(e['source']['ocr']['pixelToPdf'])==6 and e['source']['ocr']['imageIds'] and 0<=e['source']['ocr']['confidence']<=1 for e in ocr['texts'] if e['source'].get('ocr')))
            check('Opt-in raster rule-line detection creates explicitly inferred entities',ocr['lines']>0)
            page.screenshot(path=str(output/'ocr-workbench.png'),full_page=True)
            pump=next(e for e in ocr['texts'] if 'PUMP' in e['text']);factor=25.4/72
            check('Recognized baseline maps back to the image location in drawing units',30*factor<pump['position'][0]<55*factor and 185*factor<pump['position'][1]<230*factor)
            for version in ['2000','2004','2007','2010','2013','2018']:
                page.select_option('#version',version)
                page.wait_for_function('v=>workbench.exportReady&&!workbench.running&&workbench.result.dxf.version===v',arg=version,timeout=60000)
                file=output/f'ocr-{version}.dxf';file.write_text(page.evaluate('workbench.result.dxf.text'),encoding='utf8')
                doc=ezdxf.readfile(file);audit=doc.audit()
                check('OCR DXF '+version+' passes an independent entity/ownership audit',not audit.errors and not audit.fixes and any('PUMP' in e.dxf.text for e in doc.modelspace().query('TEXT')))
            page.evaluate('''async()=>{workbench.ocrSettings={...workbench.ocrSettings,rotation:270,traceLines:false};await workbench.selectPage(2);}''')
            rotated=page.evaluate('({ocr:workbench.scene.ocr,texts:workbench.result.document.entities.filter(e=>e.type==="TEXT").map(e=>({text:e.text,rotation:e.rotation,position:e.position}))})');report['rotated']=rotated
            check('Rotated PDF page OCR recovers text after a quarter-turn correction',any('PUMP' in e['text'] for e in rotated['texts']))
            rp=next(e for e in rotated['texts'] if 'PUMP' in e['text'])
            check('Rotated OCR retains the transformed text direction',abs((rp['rotation']%360)-270)<1)
            page.screenshot(path=str(output/'ocr-rotated.png'),full_page=True)
            check('OCR runtime, WASM and language data are self-hosted',any('/vendor/ocr/' in u and '.traineddata' in u for u in requests) and not foreign)
            check('OCR finishes with no uncaught browser exceptions',not errors)
        finally:
            report.update({'url':url,'passed':len(checks),'checks':checks,'errors':errors,'externalRequests':foreign,'browserVersion':browser.version})
            (output/'validation.json').write_text(json.dumps(report,indent=2)+'\n');browser.close()
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url');parser.add_argument('--output',default='artifacts/extensions');args=parser.parse_args()
    if args.url:run(args.url.rstrip('/')+'/',Path(args.output));return
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'dist')));t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
    try:run(f'http://127.0.0.1:{server.server_port}/',Path(args.output))
    finally:server.shutdown();t.join(5);server.server_close()
if __name__=='__main__':main()
