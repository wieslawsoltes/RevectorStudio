"""Real browser IMAGE extraction and serialized-DXF preview, without OCR or page-raster substitution."""
import argparse,functools,http.server,json,threading,shutil,os,zipfile,io,hashlib
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
import ezdxf
from playwright.sync_api import sync_playwright
from image_fixture import fixture,profile_fixture
ROOT=Path(__file__).resolve().parents[1]

def run(url,out,inline=False):
 out.mkdir(parents=True,exist_ok=True);errors=[];foreign=[];checks=[];report={}
 def check(name,ok):
  assert ok,name
  checks.append(name);print('PASS',name,flush=True)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('REVECTOR_CHROMIUM') or shutil.which('chromium') or None,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1740,'height':1080});page.set_default_timeout(90000)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:foreign.append(r.url) if r.url.startswith(('http:','https:')) and urlparse(r.url).netloc!=urlparse(url).netloc else None)
  try:
   if inline:
    page.set_content('<!doctype html><meta charset="utf-8"><div id="app"></div>')
    page.add_style_tag(content=(ROOT/'packages/workbench/src/styles.css').read_text())
    page.add_script_tag(content=(ROOT/'apps/studio/offline-bootstrap.js').read_text(),type='module')
   else:page.goto(url,wait_until='domcontentloaded')
   page.wait_for_function('globalThis.workbench?.result&&!workbench.running')
   data=fixture();(out/'source.pdf').write_bytes(data)
   result=page.evaluate('''async bytes=>{
    const {PdfSource}=await import('@revector/pdf'),{ConversionEngine}=await import('@revector/engine'),{CadRenderer,Camera}=await import('@revector/renderer');
    const {transform}=await import('@revector/geometry'),{packageDxf}=await import('@revector/dxf');
    const source=await PdfSource.open(new Uint8Array(bytes),workbench.pdfOptions('Image regression.pdf')),result=[];
    try { for(const number of [1,2]){
      const scene=await source.extract(number),snapshot=JSON.stringify(scene),allocated=[];
      const factory=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;allocated.push(c);return c;};
      const kept=await source.preserveRasterImages(scene,{canvasFactory:factory});
      const engine=new ConversionEngine(),r=await engine.convertScene(kept,{units:'pt',profile:'exact',version:'2018',preserveForms:false});
      const pdf=document.createElement('canvas'),vp=await source.render(number,pdf,{scale:2});
      const canvas=document.createElement('canvas');canvas.width=pdf.width;canvas.height=pdf.height;
      const ctx=canvas.getContext('2d'),camera=new Camera();camera.resize(canvas.width,canvas.height);camera.set({center:[kept.pageSize[0]/2,kept.pageSize[1]/2],scale:2});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.transform(...camera.matrix);
      const renderer=new CadRenderer();renderer.dark=false;renderer.setDocument(r.preview);await renderer.imagesReady;renderer.draw(ctx,camera);
      const locations=[[40,210],[80,210],[40,170],[80,170],[180,210],[140,210],[180,170],[140,170],[35,75],[60,45],[85,45],[290,195],[60,180]];
      const samples=locations.map(p=>{const q=transform(vp.transform,p),x=Math.floor(q[0]),y=Math.floor(q[1]);const a=Array.from(pdf.getContext('2d').getImageData(x,y,1,1).data),b=Array.from(ctx.getImageData(x,y,1,1).data);return {point:p,pdf:a,dxf:b,error:Math.max(...a.map((v,i)=>Math.abs(v-b[i])))};});
      const exports=[];for(const version of ['2000','2004','2007','2010','2013','2018']){const pack=packageDxf(r.document,{version,filename:`page-${number}-${version}.dxf`});exports.push({version,text:pack.dxf.text});}
      result.push({page:number,stats:kept.rasterImages,samples,unchanged:JSON.stringify(scene)===snapshot,released:allocated.every(c=>c.width===1&&c.height===1),images:r.document.entities.filter(e=>e.type==='IMAGE').length,native:r.document.entities.filter(e=>e.type==='LINE').length,errors:renderer.imageErrors,assets:r.document.assets.map(a=>({id:a.id,path:a.path,width:a.width,height:a.height,dataBase64:a.dataBase64,sha256:a.sha256})),exports});
      const bitmaps=[...renderer.images.values()];renderer.dispose();result.at(-1).bitmapsClosed=bitmaps.every(b=>b.width===0);
    }}finally{await source.dispose();}
    workbench.retainImages.checked=true;await workbench.openBytes(new Uint8Array(bytes),'Image regression.pdf');await workbench.cadView.renderer.imagesReady;workbench.cadView.paper=true;workbench.cadView.render();return result;
   }''',list(data))
   report['pages']=result
   print(json.dumps([{k:v for k,v in r.items() if k not in ['exports','assets']} for r in result],indent=2),flush=True)
   api=page.evaluate('''async bytes=>{
    const {ConversionEngine}=await import('@revector/engine');
    const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
    const r=await new ConversionEngine().convertPdf(new Uint8Array(bytes),{...workbench.pdfOptions('Native API.pdf'),rasterImages:{canvasFactory:make},profile:'exact'});
    return {images:r.document.entities.filter(e=>e.type==='IMAGE').length,clean:!('canvasFactory' in r.document.source.options.rasterImages),cloned:!!structuredClone(r.document)};
   }''',list(data))
   check('High-level convertPdf accepts an injected image factory without serializing host callbacks',api['images']==4 and api['clean'] and api['cloned'])
   for record in result:
    label=f"Page {record['page']}"
    check(label+' retains four source-image paints and one native vector',record['images']==4 and record['native']==1)
    check(label+' shares identical raster resources',record['stats']['retained']==4 and record['stats']['assets']==2 and record['stats']['complete'])
    check(label+' original scene unchanged and temporary canvases released',record['unchanged'] and record['released'])
    check(label+' image assets decode and are closed when the renderer is disposed',not record['errors'] and record['bitmapsClosed'])
    check(label+' source/DXF color, alpha, clipping, reflection and shear samples agree',all(s['error']<=2 for s in record['samples']))
    for asset in record['assets']:
     import base64
     pixels=base64.b64decode(asset.pop('dataBase64'));assert hashlib.sha256(pixels).hexdigest()==asset['sha256'];im=Image.open(io.BytesIO(pixels));im.load();assert im.size==(16,16)
     path=out/asset['path'];path.parent.mkdir(exist_ok=True);path.write_bytes(pixels)
    for export in record.pop('exports'):
     path=out/f"page-{record['page']}-{export['version']}.dxf";path.write_text(export['text']);doc=ezdxf.readfile(path);audit=doc.audit()
     assert not audit.errors and not audit.fixes,([str(x) for x in audit.errors],[str(x) for x in audit.fixes])
     assert len(doc.modelspace().query('IMAGE'))==4
     for im in doc.modelspace().query('IMAGE'):
      assert (out/im.image_def.dxf.filename).is_file();assert im.image_def_reactor.dxf.image_handle==im.dxf.handle
    check(label+' six DXF generations audit with resolved assets and reactors',True)
   with page.expect_download() as event:page.click('#export-dxf')
   name=out/'download.dxf-package.zip';event.value.save_as(name)
   with zipfile.ZipFile(name) as z:
    check('UI download includes DXF, PNG assets and asset manifest',sum(p.endswith('.dxf') for p in z.namelist())==1 and sum(p.endswith('.png') for p in z.namelist())==2 and any(p.endswith('.assets.json') for p in z.namelist()))
   profiles=page.evaluate('''async bytes=>{
    const {PdfSource}=await import('@revector/pdf'),{ConversionEngine}=await import('@revector/engine'),{CadRenderer,Camera}=await import('@revector/renderer');
    const source=await PdfSource.open(new Uint8Array(bytes),workbench.pdfOptions('Raster profiles.pdf'));
    try{
     const scene=await source.preserveRasterImages(await source.extract(1)),r=await new ConversionEngine().convertScene(scene,{units:'pt',profile:'exact'});
     const pdf=document.createElement('canvas');await source.render(1,pdf,{scale:2});
     const canvas=document.createElement('canvas');canvas.width=600;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,200);
     const renderer=new CadRenderer(),camera=new Camera();camera.resize(600,200);camera.set({center:[150,50],scale:2});renderer.dark=false;renderer.setDocument(r.preview);await renderer.imagesReady;ctx.transform(...camera.matrix);renderer.draw(ctx,camera);
     const samples=[];for(const x of [30,70,130,170,240,250,260])for(const y of [30,50,70]){
      const a=Array.from(pdf.getContext('2d').getImageData(x*2,(100-y)*2,1,1).data),b=Array.from(ctx.getImageData(x*2,(100-y)*2,1,1).data);samples.push({point:[x,y],source:a,target:b,error:Math.max(...a.map((v,i)=>Math.abs(v-b[i])))});
     }
     const result={stats:scene.rasterImages,samples,errors:renderer.imageErrors,interpolate:r.preview.entities.filter(e=>e.type==='IMAGE').map(e=>e.source.raster.interpolate)};renderer.dispose();return result;
    }finally{await source.dispose();}
   }''',list(profile_fixture()))
   check('ICCBased and CMYK raster image paints retain decoded colors',profiles['stats']['retained']==3 and all(s['error']<=2 for s in profiles['samples'] if s['point'][0]<200))
   check('PDF interpolation hint survives serialization and preview',profiles['interpolate']==[False,False,True] and all(s['error']<=2 for s in profiles['samples'] if s['point'][0]>=200))
   report['rasterColorProfiles']=profiles
   tracing=page.evaluate('''async()=>{
    const {recoverRasterPaths}=await import('@revector/ocr'),{ConversionEngine}=await import('@revector/engine');
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=90;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,120,90);ctx.strokeStyle='rgb(20 40 70)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(10,60);ctx.lineTo(40,30);ctx.moveTo(70,15);ctx.lineTo(70,50);ctx.moveTo(52,32);ctx.lineTo(88,32);ctx.stroke();
    ctx.beginPath();ctx.arc(100,60,12,0,Math.PI*2);ctx.stroke();
    // The original PDF also contains native vector paint crossing this raster.
    ctx.beginPath();ctx.moveTo(10,80);ctx.lineTo(110,80);ctx.stroke();
    const source={schema:'revector.pdf/1',pageNumber:1,box:[0,0,120,90],pageSize:[120,90],pageTransform:[1,0,0,1,0,0],userUnit:1,source:{},fonts:{},forms:[],ocgs:{},patterns:[],diagnostics:[],items:[{id:'native',kind:'path',paths:[{start:[10,10],segments:[{kind:'L',to:[110,10]}]}],stroke:true,style:{stroke:[20,40,70],lineWidth:3},visible:true,clips:[]}]};
    const allocated=[],factory=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;allocated.push(c);return c;};
    const result=await recoverRasterPaths(ctx.getImageData(0,0,120,90),[1,0,0,-1,0,90],source,{canvasFactory:factory,imageIds:['source-image']});
    const r=await new ConversionEngine().convertScene({...source,items:[...source.items,...result.items],ocgs:{REVECTOR_RASTER_PATHS:{name:'INFERRED_PATHS',visible:true}}},{units:'pt',profile:'exact'});
    return {stats:result.stats,paths:result.items,entities:r.document.entities,dxf:r.dxf.text,released:allocated.every(c=>c.width===1&&c.height===1)};
   }''')
   check('Raster graph recovers diagonal paths, junctions and closed curved outlines',tracing['stats']['junctionPixels']>0 and any(p['paths'][0]['closed'] for p in tracing['paths']) and any(len(p['paths'][0]['segments'])>3 for p in tracing['paths']))
   check('Native PDF paint is excluded from raster path inference',tracing['stats']['nativePixelsExcluded']>0 and all(p['paths'][0]['start'][1]>15 for p in tracing['paths']))
   check('Traced paths retain explicit source-image provenance and release masks',tracing['released'] and all(p['rasterInference']['imageIds']==['source-image'] for p in tracing['paths']))
   path=out/'traced-paths.dxf';path.write_text(tracing.pop('dxf'));audit=ezdxf.readfile(path).audit()
   check('Recovered general linework passes independent DXF audit',not audit.errors and not audit.fixes)
   report['tracing']=tracing
   # Toggle off must discard image assets and return to the exact vector pipeline.
   page.screenshot(path=str(out/'image-workbench.png'),full_page=True)
   page.uncheck('#retain-images');page.wait_for_function('!workbench.running&&workbench.result.document.assets.length===0')
   check('Disabling raster retention removes IMAGE entities and resources',page.evaluate('workbench.result.document.entities.every(e=>e.type!=="IMAGE")'))
   check('No document requests leave the application origin',not foreign)
   check('No uncaught browser errors',not errors)
   report['pages']=result
  finally:
   report.update({'checks':checks,'passed':len(checks),'errors':errors,'externalRequests':foreign,'url':url,'transport':'inline/blob modules' if inline else 'real HTTP(S)','browser':browser.version});(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n');browser.close()

def main():
 p=argparse.ArgumentParser();p.add_argument('--url');p.add_argument('--inline',action='store_true');p.add_argument('--output',default='artifacts/images-browser');a=p.parse_args()
 if a.inline:run('about:blank',Path(a.output),True);return
 if a.url:run(a.url.rstrip('/')+'/',Path(a.output));return
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'dist')));t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
 try:run(f'http://127.0.0.1:{server.server_port}/',Path(a.output))
 finally:server.shutdown();t.join(5);server.server_close()
if __name__=='__main__':main()
