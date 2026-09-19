"""Exercise the real HTTP(S) application, PDF worker, conversion worker and DXF download.
Unlike the offline harness, this test does not inject modules or replace browser workers.
"""
from __future__ import annotations
import argparse
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from playwright.sync_api import sync_playwright
import ezdxf

ROOT = Path(__file__).resolve().parents[1]

def wait_for_release(url: str, expected: str) -> dict:
    failure = None
    for _ in range(30):
        try:
            target = urllib.parse.urljoin(url, 'deployment.json') + '?commit=' + expected
            with urllib.request.urlopen(target, timeout=15) as response:
                metadata = json.load(response)
            if metadata['commit'] == expected:
                return metadata
            failure = f"Expected {expected}, received {metadata.get('commit')}"
        except (urllib.error.URLError, KeyError, json.JSONDecodeError) as error:
            failure = str(error)
        time.sleep(3)
    raise RuntimeError(f'Deployed revision did not become available: {failure}')

def exercise(url: str, expected: str, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    metadata = wait_for_release(url, expected)
    checks: list[str] = []
    errors: list[str] = []
    failed_http: list[dict] = []
    workers: list[str] = []
    def check(name: str, condition: bool) -> None:
        assert condition, name
        checks.append(name)
        print('PASS', name, flush=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1660,'height':1040}, device_scale_factor=1)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('worker', lambda worker: workers.append(worker.url))
        page.on('response', lambda response: failed_http.append({'url':response.url,'status':response.status}) if response.status >= 400 else None)
        try:
            response = page.goto(url, wait_until='domcontentloaded', timeout=60000)
            check('Site responds with HTTP 200', response is not None and response.status == 200)
            page.wait_for_function('globalThis.workbench?.result && workbench.exportReady && !workbench.running', timeout=90000)
            check('Loaded revision matches published commit', metadata['commit'] == expected)
            check('Two-page PDF is decoded by the vendored PDF.js engine', page.evaluate('workbench.source.numPages === 2 && workbench.source.lib.version === "6.4.172"'))
            check('PDF.js uses a real module worker', any('/vendor/pdfjs/legacy/build/pdf.worker.mjs' in worker for worker in workers))
            check('Conversion uses a real module worker without fallback', page.evaluate('!!workbench.worker && !workbench.workerFallback') and any('/apps/studio/conversion-worker.js' in worker for worker in workers))
            check('Named layers and reusable forms survive conversion', page.evaluate('workbench.result.document.layers.length === 7 && workbench.result.document.blocks.length === 1 && workbench.result.document.entities.filter(e => e.type === "INSERT").length === 6'))
            check('Right viewport represents serialized DXF', page.evaluate('workbench.result.preview.acadVersion === "AC1032" && workbench.result.report.validation.roundtrip.valid'))
            check('Both PDF and CAD canvases have rendered content', page.evaluate('''() => {
                const ink = canvas => {
                    const ctx = canvas.getContext('2d');
                    const bytes = ctx.getImageData(0,0,canvas.width,canvas.height).data;
                    const colors = new Set();
                    for(let i=0; i<bytes.length; i+=4*31) colors.add((bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2]);
                    return colors.size > 8;
                };
                return workbench.pdfView.image.width > 1000 && ink(workbench.pdfCanvas) && ink(workbench.cadCanvas);
            }'''))
            page.screenshot(path=str(output/'page-1.png'), full_page=True)
            for version,acad in [('2000','AC1015'),('2004','AC1018'),('2007','AC1021'),('2010','AC1024'),('2013','AC1027'),('2018','AC1032')]:
                page.select_option('#version', version)
                page.wait_for_function('v => !workbench.running && workbench.exportReady && workbench.result.dxf.version === v', arg=version, timeout=60000)
                check('DXF '+version+' exports the correct version', page.evaluate('workbench.result.preview.acadVersion') == acad)
            with page.expect_download() as download:
                page.click('#export-dxf')
            target = output/'live-export.dxf'
            download.value.save_as(str(target))
            doc = ezdxf.readfile(target)
            audit = doc.audit()
            check('Downloaded DXF passes independent audit without fixes', len(doc.modelspace()) > 0 and not audit.errors and not audit.fixes)
            page.select_option('#page','2')
            page.wait_for_function('!workbench.running && workbench.exportReady && workbench.scene?.pageNumber === 2', timeout=60000)
            check('Page navigation re-extracts and converts the second PDF page', page.evaluate('workbench.result.document.blocks.length === 1 && workbench.result.document.entities.filter(e=>e.type==="INSERT").length === 8'))
            page.screenshot(path=str(output/'page-2.png'), full_page=True)
            check('No missing application or PDF engine resources', not failed_http)
            check('No uncaught browser exceptions', not errors)
        finally:
            report={'url':url,'commit':expected,'checks':checks,'passed':len(checks),'uncaughtErrors':errors,'failedHttp':failed_http,'workerUrls':workers,'browserVersion':browser.version,'transport':'Real HTTP(S) navigation, vendored ES modules and dedicated browser workers.'}
            (output/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
            if errors or failed_http:
                print(json.dumps(report,indent=2))
            browser.close()

def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url')
    parser.add_argument('--sha',required=True)
    parser.add_argument('--output',default='artifacts/pages-local')
    args=parser.parse_args()
    output=Path(args.output).resolve()
    if args.url:
        exercise(args.url.rstrip('/')+'/',args.sha,output)
        return
    with tempfile.TemporaryDirectory() as directory:
        parent=Path(directory)
        (parent/'RevectorStudio').symlink_to(ROOT/'dist',target_is_directory=True)
        handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(parent))
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            exercise(f'http://127.0.0.1:{server.server_port}/RevectorStudio/',args.sha,output)
        finally:
            server.shutdown()
            thread.join(timeout=5)
            server.server_close()
if __name__=='__main__':
    main()
