"""Actual Node native-image extraction and portable DXF sidecars. No OCR is invoked."""
from pathlib import Path
import subprocess,json,hashlib
import ezdxf
from PIL import Image
from image_fixture import fixture
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/images-cli';OUT.mkdir(parents=True,exist_ok=True)
source=OUT/'source.pdf';source.write_bytes(fixture())
results=[]
for version in ['2000','2018']:
 folder=OUT/version
 command=['node','scripts/convert.mjs','--input',str(source),'--output',str(folder),'--page','all','--version',version,'--keep-images','--profile','exact']
 subprocess.run(command,cwd=ROOT,check=True,timeout=120)
 for page in [1,2]:
  file=folder/f'page-{page}.dxf';doc=ezdxf.readfile(file);audit=doc.audit();assert not audit.errors and not audit.fixes
  images=list(doc.modelspace().query('IMAGE'));assert len(images)==4
  manifest=json.loads((folder/(file.name+'.assets.json')).read_text());assert len(manifest['assets'])==2
  for asset in manifest['assets']:
   path=folder/asset['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==asset['sha256']
   im=Image.open(path);im.load();assert im.size==(asset['width'],asset['height'])
  report=json.loads((folder/f'page-{page}.report.json').read_text());assert report['rasterImages']['complete'] and not report['color']['imagePixelsAudited']
  results.append({'version':version,'page':page,'images':4,'assets':2,'auditErrors':len(audit.errors),'auditFixes':len(audit.fixes)})
(OUT/'validation.json').write_text(json.dumps({'passed':True,'cases':results,'transport':'Actual Node CLI, PDF.js and native Canvas'},indent=2)+'\n')
