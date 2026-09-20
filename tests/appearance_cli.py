"""Actual CLI appearance/source archival with independent DXF and byte-integrity checks."""
from pathlib import Path
import json,subprocess,hashlib
import ezdxf
from appearance_fixture import fixture
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/appearance-cli';OUT.mkdir(parents=True,exist_ok=True)
source=OUT/'source.pdf';data=fixture();source.write_bytes(data)
cases=[]
for version in ('2000','2018'):
 target=OUT/version
 command=['node','scripts/convert.mjs','--input',str(source),'--output',str(target),'--page','all','--version',version,'--profile','exact','--appearance','--archive-source']
 if version=='2018':command.append('--strict')
 subprocess.run(command,cwd=ROOT,check=True,timeout=120,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 for page in (1,2):
  drawing=target/f'page-{page}.dxf';doc=ezdxf.readfile(drawing);audit=doc.audit()
  assert not audit.errors and not audit.fixes
  assert len(list(doc.modelspace().query('IMAGE')))==1
  report=json.loads((target/f'page-{page}.report.json').read_text());a=report['appearance']
  assert a['dpi']==144 and a['editableGeometryPreserved'] and not a['nativeSemanticsComplete']
  for layer in a['semanticLayers']:assert doc.layers.get(layer['name']).is_off()
  manifest=json.loads((target/f'page-{page}.dxf.assets.json').read_text());archive=manifest['sourceArchive']
  assert (target/archive['path']).read_bytes()==data
  assert archive['sha256']==hashlib.sha256(data).hexdigest()
  for asset in manifest['assets']:assert hashlib.sha256((target/asset['path']).read_bytes()).hexdigest()==asset['sha256']
  cases.append({'version':version,'page':page,'auditErrors':0,'auditFixes':0,'sourceArchiveExact':True,'strict':version=='2018'})
# Full semantic strictness must remain a failure, not be certified by a page screenshot.
p=subprocess.run(['node','scripts/convert.mjs','--input',str(source),'--output',str(OUT/'must-fail.dxf'),'--appearance','--strict','--strict-semantics'],cwd=ROOT,capture_output=True,timeout=120)
assert p.returncode!=0
(OUT/'validation.json').write_text(json.dumps({'passed':True,'cases':cases,'strictSemanticsRejectsUnresolvedEffects':True,'qualification':'Real Node PDF.js/Canvas and independent ezdxf audit; not a commercial CAD importer.'},indent=2)+'\n')
print('PASS four CLI appearance + exact source archival cases; semantic strictness remains enforced')
