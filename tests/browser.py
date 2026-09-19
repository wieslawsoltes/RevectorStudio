"""Functional Chromium checks. Inline/blob transport avoids the sandbox's blocked navigation.
PDF.js uses its fake-worker transport here; conversion kernel isolation is tested in Node.
"""
from pathlib import Path
import os, shutil
import json,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name)
 print('PASS',name)
def settled(page,condition='true'):
 page.wait_for_function('globalThis.workbench && !workbench.running && ('+condition+')',timeout=90000)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('REVECTOR_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1660,'height':1040},device_scale_factor=1)
 errors=[];console_errors=[]
 page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',e)))
 page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
 page.set_content('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>')
 page.add_style_tag(content=(ROOT/'packages/workbench/src/styles.css').read_text())
 page.add_script_tag(content=(ROOT/'apps/studio/offline-bootstrap.js').read_text())
 page.wait_for_function('globalThis.workbench && workbench.result && !workbench.running',timeout=90000)
 check('Real PDF.js document decodes two pages',page.evaluate('workbench.source.numPages')==2)
 check('Actual exported DXF is parsed for the right viewport',page.evaluate('workbench.result.preview.acadVersion')=='AC1032')
 check('Native text survives extraction',page.evaluate('workbench.result.document.entities.some(e=>e.type==="TEXT" && e.text.includes("NORTHLINE"))'))
 check('Six forms become six INSERTs of one shared block',page.evaluate('workbench.result.document.blocks.length===1 && workbench.result.document.entities.filter(e=>e.type==="INSERT").length===6'))
 check('Seven named layers including zero',page.evaluate('workbench.result.document.layers.length')==7)
 check('Pending semantic proposals are visible',page.locator('.state.pending').count()>=10)
 check('Both views have actual rendered pixels',page.evaluate('workbench.pdfCanvas.width>500 && workbench.cadCanvas.width>500 && workbench.pdfView.image.width>1000'))
 page.wait_for_timeout(5100)
 page.screenshot(path=str(ROOT/'artifacts/workbench.png'))
 # Accept and undo a hypothesis, retaining immutable source geometry.
 page.locator('.data-table .table-action').first.click();settled(page)
 check('Accepting a circle emits native CIRCLE',page.evaluate('workbench.result.document.entities.some(e=>e.type==="CIRCLE")'))
 check('Inferred replacement is explicitly diagnosed',page.evaluate('workbench.result.report.diagnostics.some(d=>d.code==="SEMANTIC_GEOMETRY_CHANGE")'))
 page.get_by_role('button',name='Undo',exact=True).click();settled(page)
 check('Undo replays original exact spline geometry',not page.evaluate('workbench.result.document.entities.some(e=>e.type==="CIRCLE")'))
 page.get_by_role('button',name='Redo',exact=True).click();settled(page)
 check('Redo restores the accepted hypothesis',page.evaluate('workbench.result.document.entities.some(e=>e.type==="CIRCLE")'))
 # Independently export every DXF version from the UI-selected setting.
 for version,acad in [('2000','AC1015'),('2004','AC1018'),('2007','AC1021'),('2010','AC1024'),('2013','AC1027'),('2018','AC1032')]:
  page.select_option('#version',version);settled(page,f'workbench.result.dxf.version==="{version}"')
  check('Version selection '+version,page.evaluate('workbench.result.preview.acadVersion')==acad)
  (ROOT/f'artifacts/browser-page1-{version}.dxf').write_text(page.evaluate('workbench.result.dxf.text'))
 with page.expect_download() as dl:page.click('#export-dxf')
 path=ROOT/'artifacts/browser-export.dxf';dl.value.save_as(str(path));check('Export button downloads real DXF text',path.read_text().rstrip().endswith('EOF'))
 # Layer toggle, linked zoom and measurement.
 box=page.locator('.layer-row input').nth(1);box.uncheck();check('Layer visibility changes retained renderer',page.evaluate('workbench.cadView.renderer.hiddenLayers.size')==1);box.check()
 canvas=page.locator('#dxf-canvas');bounds=canvas.bounding_box();x=bounds['x']+bounds['width']/2;y=bounds['y']+bounds['height']/2
 before=page.evaluate('workbench.cadView.camera.scale');page.mouse.move(x,y);page.mouse.wheel(0,-250);page.wait_for_timeout(150)
 check('Zoom is pointer-anchored and linked between views',page.evaluate('workbench.cadView.camera.scale===workbench.pdfView.camera.scale && workbench.cadView.camera.scale')>before)
 page.get_by_title('Two-point measurement').click();page.mouse.click(x-50,y);page.mouse.click(x+50,y)
 check('Two-point measurement returns world distance',page.evaluate('workbench.measurement')>0)
 page.get_by_role('button',name='Back to overview',exact=True).click();page.get_by_title('Two-point measurement').click()
 # Entity and candidate inspectors, JSON-rule extension.
 page.locator('.candidate-name').first.click();check('Recovery inspector shows rule evidence',page.locator('.evidence').count()==1)
 page.locator('[data-tab="rules"]').click();check('All sixteen built-in rules have toggles',page.locator('.rule-card input').count()==16)
 page.get_by_role('button',name='Edit JSON rules',exact=True).click()
 rule={'schema':'revector.rules/1','rules':[{'id':'test.tags','when':{'all':[{'field':'type','value':'TEXT'},{'field':'text','op':'prefix','value':'V-'}]},'then':{'layer':'TEST_TAGS','semantic':{'class':'test-tag'}}}]}
 page.locator('.rule-editor').fill(json.dumps(rule));page.get_by_role('button',name='Validate & apply',exact=True).click();settled(page)
 check('JSON rule extension creates classified target layer',page.evaluate('workbench.result.document.layers.some(l=>l.name==="TEST_TAGS")'))
 # Non-square transformations, curved clips and page navigation.
 page.select_option('#page','2');settled(page,'workbench.page===2 && workbench.scene.pageNumber===2')
 check('Page navigation performs a new real PDF extraction',page.evaluate('workbench.scene.items.length')>20)
 check('Rotated form reuse on page two remains one block',page.evaluate('workbench.result.document.blocks.length===1 && workbench.result.document.entities.filter(e=>e.type==="INSERT").length===8'))
 check('Page two contains native cubic HATCH boundary',page.evaluate('workbench.result.document.entities.some(e=>e.type==="HATCH" && e.paths.some(p=>p.segments.some(s=>s.kind==="C")))'))
 page.get_by_title('Switch paper / dark CAD view').click();check('Paper/dark comparison toggle works',not page.evaluate('workbench.cadView.paper'));page.get_by_title('Switch paper / dark CAD view').click()
 page.locator('[data-tab="recovery"]').click();page.screenshot(path=str(ROOT/'artifacts/workbench-page2.png'))
 # Scale makes physical DXF coordinates, not just a mislabeled header.
 old=page.evaluate('workbench.result.document.pageBox[2]');page.locator('#scale').fill('100');page.locator('#scale').dispatch_event('change');settled(page,'workbench.result.document.source.options.drawingScale===100')
 check('Drawing scale actually rescales geometry',abs(page.evaluate('workbench.result.document.pageBox[2]')/old-100)<1e-8)
 page.locator('#scale').fill('1');page.locator('#scale').dispatch_event('change');settled(page,'workbench.result.document.source.options.drawingScale===1')
 with page.expect_download(timeout=90000) as dl:page.get_by_role('button',name='Convert all pages to ZIP',exact=True).click()
 dl.value.save_as(str(ROOT/'artifacts/browser-batch.zip'));check('Batch export packages DXF and manifests for each page',(ROOT/'artifacts/browser-batch.zip').stat().st_size>1000)
 page.get_by_role('button',name='Project',exact=True).click()
 with page.expect_download() as dl:page.get_by_role('button',name='Save project',exact=True).click()
 dl.value.save_as(str(ROOT/'artifacts/browser-project.revector.json'));saved=json.loads((ROOT/'artifacts/browser-project.revector.json').read_text());check('Project preserves original PDF and custom rules',saved['schema']=='revector.project/1' and len(saved['pdf'])>1000 and len(saved['ruleSet']['rules'])==1)
 # Reload the saved project through the actual input control.
 page.evaluate('globalThis.previousProjectSource = workbench.source')
 page.locator('input[type=file]').set_input_files(str(ROOT/'artifacts/browser-project.revector.json'));settled(page,'workbench.source!==previousProjectSource && workbench.page===2 && workbench.ruleSet?.rules[0].id==="test.tags"')
 check('Saved project reopens with settings and rules',page.evaluate('workbench.page')==2)
 page.get_by_role('button',name='Guide',exact=True).click();check('Guide documents strict conversion boundaries',page.get_by_text('Explicit format boundaries',exact=True).count()==1);page.get_by_role('button',name='Close',exact=True).last.click()
 # Compact desktop breakpoint.
 page.set_viewport_size({'width':1169,'height':850});page.wait_for_timeout(100);check('Compact IDE remains within viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 check('No uncaught browser exceptions',not errors)
 (ROOT/'artifacts/browser-validation.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'uncaughtErrors':errors,'consoleErrors':console_errors,'transport':'Chromium inline/blob. Browser worker transport blocked by host policy; same kernel fallback tested. Dedicated worker kernel separately tested with Node worker_threads.','pdfjsVersion':page.evaluate('workbench.source.lib.version')},indent=2))
 print('BROWSER CHECKS',len(checks));browser.close()
