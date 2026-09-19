"""Independent structural validation of every DXF artifact using ezdxf."""
from pathlib import Path
import json,zipfile
import ezdxf
ROOT=Path(__file__).resolve().parents[1]
results=[]
for path in sorted((ROOT/'artifacts').glob('*.dxf')):
 doc=ezdxf.readfile(path);audit=doc.audit()
 errors=[str(e.message) for e in audit.errors];fixes=[str(e.message) for e in audit.fixes]
 counts={}
 for entity in doc.modelspace():counts[entity.dxftype()]=counts.get(entity.dxftype(),0)+1
 result={'file':path.name,'version':doc.dxfversion,'entities':len(doc.modelspace()),'types':counts,'errors':errors,'fixes':fixes}
 results.append(result)
 assert not errors and not fixes, result
 # Independent knot and cubic boundary interpretation.
 for entity in doc.modelspace():
  if entity.dxftype()=='SPLINE':assert len(entity.knots)==len(entity.control_points)+entity.dxf.degree+1
  if entity.dxftype()=='INSERT':assert entity.dxf.name in doc.blocks
 print('PASS',path.name,doc.dxfversion,len(doc.modelspace()),'errors=0 fixes=0')
for file in ['browser-batch.zip','test-archive.zip']:
 path=ROOT/'artifacts'/file
 if path.exists():
  with zipfile.ZipFile(path) as z:
   assert z.testzip() is None
   for name in z.namelist():
    if name.endswith('.dxf'):
     import io
     d=ezdxf.read(io.StringIO(z.read(name).decode()));a=d.audit();assert not a.errors and not a.fixes
  print('PASS ZIP',file)
report={'library':'ezdxf','libraryVersion':ezdxf.__version__,'files':len(results),'auditErrors':sum(len(x['errors']) for x in results),'auditFixes':sum(len(x['fixes']) for x in results),'results':results,'qualification':'Independent file structure/entity validation; not certification in Autodesk AutoCAD, BricsCAD, or every downstream CAD product.'}
(ROOT/'artifacts/dxf-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('Independent DXF audit:',len(results),'files, zero errors and zero fixes')
