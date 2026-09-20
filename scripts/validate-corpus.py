#!/usr/bin/env python3
"""Versioned PDF corpus validation. External CAD regeneration is opt-in, never simulated.
An adapter is a user-owned JSON file with executable, arguments containing {input}/{output},
versionArguments, expectedVersion, and name. All subprocesses run without a shell.
"""
from __future__ import annotations
import argparse,hashlib,json,os,re,shutil,subprocess,sys
from collections import Counter
from pathlib import Path
import ezdxf
ROOT=Path(__file__).resolve().parents[1]
VERSIONS={'2000','2004','2007','2010','2013','2018'}
def within(root:Path,value:str)->Path:
 if not isinstance(value,str) or Path(value).is_absolute():raise ValueError('Corpus paths must be relative')
 p=(root/value).resolve()
 if not p.is_relative_to(root.resolve()):raise ValueError('Corpus path escapes source root')
 return p

def audit_dxf(path:Path)->dict:
 doc=ezdxf.readfile(path);audit=doc.audit();types=dict(Counter(e.dxftype() for e in doc.modelspace()))
 if audit.errors or audit.fixes:raise ValueError(f'DXF audit: {len(audit.errors)} errors, {len(audit.fixes)} automatic fixes')
 return {'version':doc.dxfversion,'types':types,'layers':len(doc.layers),'auditErrors':0,'auditFixes':0,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def execute(args:list[str],timeout:int,cwd:Path):
 # Avoid passing documents through shell syntax; write logs to disk rather than buffering them.
 with (cwd/'stdout.log').open('wb') as out,(cwd/'stderr.log').open('wb') as err:
  p=subprocess.run(args,cwd=cwd,stdout=out,stderr=err,timeout=timeout,shell=False)
 if p.returncode:raise RuntimeError(f'Process failed with exit {p.returncode}; see case logs')

def validate(manifest:Path,output:Path,adapter:Path|None=None,require_commercial:bool=False)->dict:
 spec=json.loads(manifest.read_text());base=(manifest.parent/spec.get('root','.')).resolve();cases=spec.get('cases')
 if spec.get('schema')!='revector.corpus/1' or not isinstance(cases,list) or not 1<=len(cases)<=128:raise ValueError('Invalid or excessive corpus')
 if output.exists() and any(output.iterdir()):raise ValueError('Use an empty output directory to exclude stale regeneration artifacts')
 output.mkdir(parents=True,exist_ok=True);external=None;seen=set();records=[]
 if adapter:
  external=json.loads(adapter.read_text())
  for key in ('executable','name','expectedVersion'):
   if not isinstance(external.get(key),str) or not external[key]:raise ValueError('Invalid external CAD adapter '+key)
  for key in ('arguments','versionArguments'):
   if not isinstance(external.get(key),list) or not all(isinstance(a,str) for a in external[key]):raise ValueError('Invalid CAD command arguments')
  # The local operator explicitly provided this adapter; manifests cannot request execution.
  executable=shutil.which(external['executable'])
  if not executable:raise FileNotFoundError('Configured commercial CAD executable is not installed')
  version=subprocess.run([executable,*external['versionArguments']],capture_output=True,text=True,timeout=30,check=True).stdout.strip()
  if external['expectedVersion'] not in version:raise ValueError('CAD executable version does not match configured version')
  external={**external,'executable':executable,'measuredVersion':version[:2000]}
 for case in cases:
  name=case.get('id','')
  if not re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,63}',name) or name in seen:raise ValueError('Invalid or duplicate case ID')
  seen.add(name);target=output/name;target.mkdir();record={'id':name,'status':'failed','commercialRegeneration':{'status':'not-run'}}
  try:
   src=within(base,case['file']);digest=hashlib.sha256(src.read_bytes()).hexdigest()
   if digest!=case.get('sha256'):raise ValueError('Source SHA-256 mismatch; corpus changes require explicit rebaselining')
   version=str(case.get('version','2018'));page=case.get('page',1)
   if version not in VERSIONS or type(page)!=int or page<1:raise ValueError('Invalid page/version')
   mode=case.get('mode','native')
   if mode not in ('native','images','appearance'):raise ValueError('Invalid conversion mode')
   drawing=target/'drawing.dxf'
   command=['node',str(ROOT/'scripts/convert.mjs'),'--input',str(src),'--output',str(drawing),'--page',str(page),'--version',version,'--profile','exact']
   if mode=='images':command.append('--keep-images')
   if mode=='appearance':command.append('--appearance')
   execute(command,120,target);result=audit_dxf(drawing)
   report=json.loads((target/'drawing.report.json').read_text())
   if not report['validation']['roundtrip']['valid']:raise ValueError('Converter roundtrip rejected')
   for kind,expected in case.get('expectTypes',{}).items():
    if result['types'].get(kind,0)!=expected:raise ValueError(f'Expected {expected} {kind} entities, got {result["types"].get(kind,0)}')
   codes=sorted(set(d['code'] for d in report['diagnostics']))
   for code in case.get('requireDiagnostics',[]):
    if code not in codes:raise ValueError('Expected diagnostic missing: '+code)
   allowed=set(case.get('allowErrors',[]));unexpected=[d['code'] for d in report['diagnostics'] if d['severity']=='error' and d['code'] not in allowed]
   if unexpected:raise ValueError('Unapproved error diagnostics: '+','.join(unexpected))
   manifest_path=target/'drawing.dxf.assets.json'
   if manifest_path.exists():
    for a in json.loads(manifest_path.read_text())['assets']:
     if hashlib.sha256(within(target,a['path']).read_bytes()).hexdigest()!=a['sha256']:raise ValueError('Image resource integrity failed')
   record.update({'sourceSha256':digest,'output':result,'diagnostics':codes,'status':'passed'})
   if external:
    destination=target/'regenerated.dxf';args=[a.replace('{input}',str(drawing)).replace('{output}',str(destination)) for a in external['arguments']]
    execute([external['executable'],*args],300,target)
    if not destination.is_file():raise RuntimeError('CAD command did not produce its declared regenerated DXF')
    regen=audit_dxf(destination)
    for kind,expected in case.get('expectTypes',{}).items():
     if regen['types'].get(kind,0)!=expected:raise ValueError('CAD regeneration entity-contract mismatch: '+kind)
    record['commercialRegeneration']={'status':'executed','tool':external['name'],'measuredVersion':external['measuredVersion'],'audit':regen,'qualification':'Configured executable ran; this is import/regeneration evidence, not visual or vendor certification.'}
   elif require_commercial:record['status']='blocked';record['commercialRegeneration']['reason']='No commercial CAD adapter configured'
  except Exception as error:record.update(status='failed',error=str(error))
  records.append(record);print(record['id'],record['status'],flush=True)
 summary={'schema':'revector.corpus-result/1','passed':all(r['status']=='passed' for r in records),'manifestSha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'cases':records,'qualification':'SHA-pinned authored/customer corpus checks; absence of a commercial executable is not a passing commercial CAD test.'}
 (output/'validation.json').write_text(json.dumps(summary,indent=2)+'\n');return summary

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--cad-adapter',type=Path);p.add_argument('--require-commercial',action='store_true');a=p.parse_args()
 try:result=validate(a.manifest.resolve(),a.output.resolve(),a.cad_adapter,a.require_commercial);return 0 if result['passed'] else 1
 except Exception as error:print('corpus:',error,file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
