"""Exercise real worker reuse, reference cache invalidation and honest UI timings."""
from __future__ import annotations
import argparse,functools,http.server,json,os,shutil,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def run(url: str, output: Path):
    output.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
    def check(name,ok):
        assert ok,name
        checks.append(name);print('PASS',name,flush=True)
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path=os.environ.get('REVECTOR_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1660,'height':1040});page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            page.goto(url,wait_until='domcontentloaded');page.wait_for_function('globalThis.workbench?.exportReady && !workbench.running',timeout=90000)
            check('Conversion uses a dedicated browser worker',page.evaluate('!!workbench.worker?.worker && !workbench.workerFallback'))
            page.evaluate('''() => {
                const w=workbench;globalThis.perfState={worker:w.worker.worker,image:w.pdfView.image,scene:w.scene,renders:0};
                const render=w.source.render.bind(w.source);w.source.render=(...args)=>{perfState.renders++;return render(...args);};
            }''')
            page.select_option('#version','2000');page.wait_for_function('workbench.exportReady && !workbench.running && workbench.result.dxf.version === "2000"',timeout=90000)
            check('Version changes reuse the idle worker',page.evaluate('perfState.worker === workbench.worker.worker'))
            check('Version changes do not rerender the unchanged PDF',page.evaluate('perfState.renders === 0 && perfState.image === workbench.pdfView.image && workbench.result.report.timings.pdfReferenceReused === 1'))
            check('UI reports end-to-end elapsed time rather than kernel-only time',page.evaluate('workbench.result.report.timings.uiTotalMs >= workbench.result.report.timings.totalMs && Number.isFinite(workbench.result.report.timings.pdfPreparationMs)'))
            page.evaluate('''async () => { workbench.scale.value='2';await workbench.run(); }''')
            check('Cached PDF reference follows changed CAD units and drawing scale',page.evaluate('perfState.renders === 0 && JSON.stringify(workbench.pdfView.pageBox) === JSON.stringify(workbench.result.document.pageBox)'))
            page.evaluate('workbench.run(true)')
            check('Explicit extraction invalidates the reference cache',page.evaluate('perfState.renders === 1 && perfState.scene !== workbench.scene && perfState.image !== workbench.pdfView.image'))
            check('Replaced reference canvas allocations are released',page.evaluate('perfState.image.width === 1 && perfState.image.height === 1'))
            check('All requested conversions retain a valid serialized-DXF preview',page.evaluate('workbench.result.report.validation.roundtrip.valid && workbench.result.preview.acadVersion === "AC1015"'))
            timings=page.evaluate('workbench.result.report.timings');page.screenshot(path=str(output/'workbench.png'),full_page=True)
            page.evaluate('''async () => {
                const w=workbench, old=w.worker.worker, pending=w.worker.convert(w.scene,w.options());
                pending.catch(()=>{});w.worker.cancel();let cancelled=false;
                try {await pending;} catch(e){cancelled=e.name==='AbortError';}
                globalThis.perfCancelled=cancelled && w.worker.worker === null;
                await w.run();
                globalThis.perfRecovered=!!w.worker.worker && w.worker.worker !== old && w.exportReady;
            }''')
            check('Busy cancellation hard-terminates the worker',page.evaluate('perfCancelled'))
            check('A fresh worker recovers after cancellation',page.evaluate('perfRecovered'))
            check('No uncaught browser exceptions',not errors)
        finally:
            (output/'validation.json').write_text(json.dumps({'url':url,'passed':len(checks),'checks':checks,'errors':errors,'timings':locals().get('timings'),'browserVersion':browser.version,'transport':'real HTTP(S), dedicated worker, no injected conversion results'},indent=2)+'\n')
            browser.close()
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--url');p.add_argument('--output',default='artifacts/performance-browser');args=p.parse_args()
    if args.url:run(args.url.rstrip('/')+'/',Path(args.output));return
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'dist')));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:run(f'http://127.0.0.1:{server.server_port}/',Path(args.output))
    finally:server.shutdown();thread.join(5);server.server_close()
if __name__=='__main__':main()
