"""Browser test transport: inline/blob modules; no network or navigation required."""
from pathlib import Path
import os, shutil
import json,re,base64
ROOT=Path(__file__).resolve().parents[1]
def module_bootstrap(extra=None):
 modules={}
 for file in (ROOT/'packages').glob('*/src/*.js'):
  pkg=file.parts[-3];key='@revector/'+pkg+('/'+file.name if file.name!='index.js' else '')
  source=file.read_text()
  source=re.sub(r"(from\s*['\"])\./([^'\"]+)(['\"])",lambda m:m[1]+'@revector/'+pkg+('' if m[2]=='index.js' else '/'+m[2])+m[3],source)
  modules[key]=source
 modules.update(extra or {})
 return '''const sources = '''+json.dumps(modules)+''';const imports={};for(const [id,source] of Object.entries(sources))imports[id]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);'''
def run_harness(page):
 page.set_content('<!doctype html><meta charset="utf-8"><canvas id="pdf"></canvas>')
 page.evaluate(module_bootstrap())
 for name,file in [('pdfjs','vendor/pdfjs/legacy/build/pdf.mjs'),('worker','vendor/pdfjs/legacy/build/pdf.worker.mjs')]:
  page.evaluate('(p)=>globalThis[p.name+"Url"]=URL.createObjectURL(new Blob([p.source],{type:"text/javascript"}))',{'name':name,'source':(ROOT/file).read_text()})
 page.evaluate('(x)=>globalThis.pdfBytes=Uint8Array.from(atob(x),c=>c.charCodeAt(0))',base64.b64encode((ROOT/'assets/cooling-water.pdf').read_bytes()).decode())
 return page.evaluate('''async()=>{const {PdfSource,loadPdfJs}=await import('@revector/pdf');const {lowerScene}=await import('@revector/cad');const {RuleEngine}=await import('@revector/semantics');const {cadRules}=await import('@revector/rules-cad');const {exportDxf,readDxf}=await import('@revector/dxf');const pdfjs=await loadPdfJs({moduleUrl:pdfjsUrl,workerUrl});const source=await PdfSource.open(pdfBytes,{pdfjs});globalThis.source=source;globalThis.results=[];for(let page=1;page<=source.numPages;page++){const scene=await source.extract(page),base=await lowerScene(scene),rules=new RuleEngine();for(const r of cadRules)rules.register(r);const model=await rules.run(base),dxf=exportDxf(model),read=readDxf(dxf.text);results.push({scene,base,model,dxf,read});}await source.render(1,document.querySelector('canvas'),{scale:1});return {version:pdfjs.version,pages:results.length};}''')
if __name__=='__main__':
 from playwright.sync_api import sync_playwright
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('REVECTOR_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox']);page=browser.new_page();page.on('console',lambda m:print(m.type,m.text[:400]));page.on('pageerror',lambda e:print('ERROR',e));print(run_harness(page));res=page.evaluate('results');json.dump(res,open(ROOT/'artifacts/actual-extraction.json','w'))
  for i,r in enumerate(res):
   print('PAGE',i+1,'items',len(r['scene']['items']),'entities',len(r['model']['entities']),'blocks',len(r['model']['blocks']),'layers',len(r['model']['layers']));print('diagnostics:',r['model']['diagnostics'][:30]);print('candidates:',[(c['rule'],c['status']) for c in r['model']['candidates']]);(ROOT/'artifacts'/f'actual-page-{i+1}.dxf').write_text(r['dxf']['text'])
  page.locator('canvas').screenshot(path=str(ROOT/'artifacts/pdfjs-source-page-1.png'));browser.close()
