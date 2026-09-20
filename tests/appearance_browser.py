"""Actual PDF.js appearance, independent DXF structure, exhaustive aligned pixel comparison.
No OCR is used; this suite is not a native mask/blend recovery claim.
"""
import argparse,functools,http.server,json,threading,os,shutil,base64,zipfile
from pathlib import Path
from urllib.parse import urlparse
import ezdxf
from playwright.sync_api import sync_playwright
from appearance_fixture import fixture
ROOT=Path(__file__).resolve().parents[1]
def run(url,out,inline=False):
 out.mkdir(parents=True,exist_ok=True);checks=[];errors=[];foreign=[];report={}
 def check(name,ok):
  assert ok,name
  checks.append(name);print('PASS',name,flush=True)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('REVECTOR_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1820,'height':1080});page.set_default_timeout(120000)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:foreign.append(r.url) if r.url.startswith(('http:','https:')) and urlparse(r.url).netloc!=urlparse(url).netloc else None)
  try:
   if inline:
    page.set_content('<!doctype html><meta charset="utf-8"><div id="app"></div>');page.add_style_tag(content=(ROOT/'packages/workbench/src/styles.css').read_text());page.add_script_tag(content=(ROOT/'apps/studio/offline-bootstrap.js').read_text(),type='module')
   else:page.goto(url,wait_until='domcontentloaded')
   page.wait_for_function('globalThis.workbench?.result&&!workbench.running')
   data=fixture();(out/'source.pdf').write_bytes(data)
   results=page.evaluate('''async bytes=>{
     const {PdfSource}=await import('@revector/pdf'),{ConversionEngine}=await import('@revector/engine'),{CadRenderer,Camera}=await import('@revector/renderer'),{packageDxf}=await import('@revector/dxf');
     const source=await PdfSource.open(new Uint8Array(bytes),workbench.pdfOptions('Appearance stress.pdf')),engine=new ConversionEngine(),results=[];
     try {for(const number of [1,2]){
       const scene=await source.extract(number),before=JSON.stringify(scene),allocated=[];
       const captured=await source.captureAppearance(scene,{dpi:144,canvasFactory:(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;allocated.push(c);return c;}});
       const r=await engine.convertScene(captured,{units:'pt',profile:'exact',version:'2018',preserveForms:false,strict:true});
       const reference=document.createElement('canvas'),vp=await source.render(number,reference,{scale:2});
       const canvas=document.createElement('canvas');canvas.width=reference.width;canvas.height=reference.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
       // Match actual viewport pixels, including the partial last pixel of fractional page sizes.
       const camera=new Camera();camera.resize(canvas.width,canvas.height);camera.set({center:[canvas.width/4,scene.pageSize[1]-canvas.height/4],scale:2});ctx.transform(...camera.matrix);
       const renderer=new CadRenderer();renderer.dark=false;renderer.setDocument(r.preview);await renderer.imagesReady;renderer.draw(ctx,camera);
       const a=reference.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,b=ctx.getImageData(0,0,canvas.width,canvas.height).data;let maximum=0,total=0,changed=0;
       for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);maximum=Math.max(maximum,d);total+=d;if(d>2)changed++;}
       const exports=[];for(const version of ['2000','2004','2007','2010','2013','2018']){const p=packageDxf(r.document,{version,strict:false,filename:`p${number}-${version}.dxf`});exports.push({version,dxf:p.dxf.text});}
       const semantics=await engine.convertScene(captured,{units:'pt',appearanceView:'semantic',profile:'exact'});
       results.push({number,maximum,mean:total/a.length,channelsOutsideTolerance:changed,channels:a.length,sourceUnchanged:JSON.stringify(scene)===before,released:allocated.every(c=>c.width===1&&c.height===1),appearance:r.report.appearance,errors:renderer.imageErrors,diagnosticCodes:scene.diagnostics.map(d=>d.code),semanticEntityCount:r.document.entities.filter(e=>e.type!=='IMAGE').length,visibleSemanticLayers:semantics.preview.layers.filter(l=>l.visible!==false).map(l=>l.name),asset:captured.appearance.asset,reference:reference.toDataURL(),target:canvas.toDataURL(),exports});renderer.dispose();
     }} finally{await source.dispose();}
     return results;
   }''',list(data))
   for r in results:
    n=r['number'];codes=r['diagnosticCodes'];print('CODES',n,codes,flush=True)
    check(f'Page {n}: actually exercises masks, blends, groups, shading and text clipping',all(c in codes for c in ['SOFT_MASK','BLEND_MODE','TRANSPARENCY_GROUP','SHADING','TEXT_CLIP']))
    check(f'Page {n}: every aligned RGBA channel matches the sampled reference within two levels',r['maximum']<=2)
    check(f'Page {n}: semantic CAD retained independently from the appearance IMAGE',r['semanticEntityCount']>3 and r['appearance']['layer'] not in r['visibleSemanticLayers'])
    check(f'Page {n}: original scene immutable and resources released',r['sourceUnchanged'] and r['released'] and not r['errors'])
    for kind in ['reference','target']:(out/f'p{n}-{kind}.png').write_bytes(base64.b64decode(r.pop(kind).split(',')[1]))
    asset=r.pop('asset');p=out/asset['path'];p.parent.mkdir(exist_ok=True);p.write_bytes(base64.b64decode(asset['dataBase64']))
    for entry in r.pop('exports'):
     p=out/f"p{n}-{entry['version']}.dxf";p.write_text(entry['dxf']);doc=ezdxf.readfile(p);audit=doc.audit();assert not audit.errors and not audit.fixes
     images=list(doc.modelspace().query('IMAGE'));assert len(images)==1;assert (out/images[0].image_def.dxf.filename).is_file();assert images[0].image_def_reactor.dxf.image_handle==images[0].dxf.handle
     assert all(doc.layers.get(l['name']).is_off() for l in r['appearance']['semanticLayers'])
    check(f'Page {n}: six DXF generations have valid IMAGE refs and hidden semantic layers',True)
   report['pages']=results
   page.evaluate('''async bytes=>{await workbench.openBytes(new Uint8Array(bytes),'Appearance stress.pdf');}''',list(data))
   page.select_option('#appearance-mode','appearance');page.wait_for_function('!workbench.running&&workbench.exportReady&&workbench.result?.report.appearance?.view==="appearance"');page.wait_for_function('workbench.cadView.renderer.images.size>0');
   check('UI exposes explicit representation instead of silently flattening',page.locator('#appearance-mode').input_value()=='appearance')
   with page.expect_download() as download:page.click('#export-dxf')
   target=out/'appearance-package.zip';download.value.save_as(target)
   with zipfile.ZipFile(target) as z:
    check('UI ZIP has image sidecars and a representation-qualified report',any(n.startswith('images/') for n in z.namelist()) and json.loads(z.read('conversion.report.json'))['appearance']['mode']=='page-composite')
   page.screenshot(path=str(out/'appearance-workbench.png'),full_page=True)
   check('No uncaught browser errors',not errors);check('All document processing stays on the application origin',not foreign)
  finally:
   report.update({'url':url,'passed':len(checks),'checks':checks,'errors':errors,'externalRequests':foreign,'browser':browser.version,'transport':'inline local' if inline else 'real HTTP(S)'});(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n');browser.close()
def main():
 p=argparse.ArgumentParser();p.add_argument('--url');p.add_argument('--inline',action='store_true');p.add_argument('--output',default='artifacts/appearance');args=p.parse_args()
 if args.inline:return run('about:blank',Path(args.output),True)
 if args.url:return run(args.url.rstrip('/')+'/',Path(args.output))
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'dist')));t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
 try:run(f'http://127.0.0.1:{server.server_port}/',Path(args.output))
 finally:server.shutdown();t.join(5);server.server_close()
if __name__=='__main__':main()
