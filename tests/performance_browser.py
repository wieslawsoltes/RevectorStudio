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
            cooperative=page.evaluate('''async()=>{
                const {RuleEngine}=await import('@revector/semantics'),{createDocument}=await import('@revector/model');
                const input=createDocument({entities:[{id:'e',type:'LINE',layer:'0',start:[0,0],end:[1,1]}]}),original=JSON.stringify(input);
                const abort=new AbortController();let consumed=0,cancelled=false,ticks=0;
                const rules=new RuleEngine().register({id:'bulk',run:()=> (function*(){for(let i=0;i<20000;i++){consumed++;yield {id:'c'+i,title:'tag',members:['e'],confidence:1,exact:true,proposal:{update:[{id:'e',patch:{semantic:{i}}}]}};}})()});
                const timer=setTimeout(()=>{ticks++;abort.abort();},0);
                try{await rules.run(input,{signal:abort.signal});}catch(e){if(e.name!=='AbortError')throw e;cancelled=true;}finally{clearTimeout(timer);}
                const result=await new RuleEngine().register({id:'valid',run:()=>[{id:'ok',title:'tag',members:['e'],confidence:1,exact:true,proposal:{update:[{id:'e',patch:{semantic:{value:42}}}]}}]}).run(input);
                return {cancelled,consumed,ticks,unchanged:JSON.stringify(input)===original,recovered:result.entities[0].semantic.value===42};
            }''')
            print('Cooperative cancellation:',json.dumps(cooperative),flush=True)
            check('One large main-thread rule yields to timer cancellation',cooperative['cancelled'] and cooperative['ticks']==1 and cooperative['consumed']<20000)
            check('Cancelled metadata batches leave caller input untouched and permit recovery',cooperative['unchanged'] and cooperative['recovered'])
            pixels=page.evaluate('''async()=>{
                const {binarize,grayscale}=await import('@revector/raster');
                const raster={width:17,height:13,data:Uint8ClampedArray.from({length:17*13*4},(_,i)=>(i*29+i%7)%256)},g=grayscale(raster);
                const target=binarize(raster,{method:'sauvola',window:7});let equal=true;
                for(let y=0;y<13;y++)for(let x=0;x<17;x++){let s=0,q=0,n=0;for(let yy=Math.max(0,y-3);yy<Math.min(13,y+4);yy++)for(let xx=Math.max(0,x-3);xx<Math.min(17,x+4);xx++){const v=g[yy*17+xx];s+=v;q+=v*v;n++;}const m=s/n,expected=g[y*17+x]<m*(1+.2*(Math.sqrt(Math.max(0,q/n-m*m))/128-1))?1:0;if(target[y*17+x]!==expected)equal=false;}
                return equal;
            }''')
            check('Browser rolling Sauvola equals independent local-window sums',pixels)
            check('No uncaught browser exceptions',not errors)
        finally:
            (output/'validation.json').write_text(json.dumps({'url':url,'passed':len(checks),'checks':checks,'errors':errors,'timings':locals().get('timings'),'cooperativeCancellation':locals().get('cooperative'),'browserVersion':browser.version,'transport':'real HTTP(S), dedicated worker, no injected conversion results'},indent=2)+'\n')
            browser.close()
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--url');p.add_argument('--output',default='artifacts/performance-browser');args=p.parse_args()
    if args.url:run(args.url.rstrip('/')+'/',Path(args.output));return
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'dist')));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:run(f'http://127.0.0.1:{server.server_port}/',Path(args.output))
    finally:server.shutdown();thread.join(5);server.server_close()
if __name__=='__main__':main()
