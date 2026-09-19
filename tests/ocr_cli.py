"""Real Node/WASM OCR, native Canvas PDF rendering and independent DXF audit."""
from pathlib import Path
import json
import subprocess
import ezdxf
ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'artifacts/ocr-cli'
out.mkdir(parents=True, exist_ok=True)
result = subprocess.run([
    'node', 'scripts/convert.mjs', '--input', 'assets/extensions/raster.pdf',
    '--output', str(out / 'scan.dxf'), '--page', '1', '--ocr',
    '--ocr-language', 'eng', '--ocr-dpi', '250', '--ocr-confidence', '60'
], cwd=ROOT, capture_output=True, text=True, timeout=240)
(out / 'stdout.txt').write_text(result.stdout)
(out / 'stderr.txt').write_text(result.stderr)
if result.returncode:
    raise RuntimeError(result.stdout + '\n' + result.stderr)
drawing = ezdxf.readfile(out / 'scan.dxf')
audit = drawing.audit()
texts = [e.dxf.text for e in drawing.modelspace().query('TEXT')]
assert any('PUMP' in t for t in texts), texts
assert any('P-101' in t for t in texts), texts
assert not audit.errors and not audit.fixes
report = json.loads((out / 'scan.report.json').read_text())
assert report['ocr']['accepted'] > 0, report
(out / 'validation.json').write_text(json.dumps({'passed': True, 'texts': texts, 'errors': len(audit.errors), 'fixes': len(audit.fixes), 'ocr': report['ocr']}, indent=2)+'\n')
print('PASS: Node CLI recognizes raster PDF text and produces an independently valid DXF.')
