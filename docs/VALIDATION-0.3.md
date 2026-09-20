# Version 0.3 validation record

Validated on 20 September 2026. This record describes executed authored regressions, not universal PDF compatibility or a customer-corpus recognition rate.

## Source commits and reproducibility

- `675b1c53d8a809b37a2fa62405195083c02d1444`: semantic extensions, tiled OCR, small-angle deskew, cancellation/resource ownership and complete RGBA auditing.
- `f2aebe75dad8e14d2973d737bf99ab0aedd9a187`: crop-edge fragment reconciliation and stricter actual-recognition acceptance.
- Validation workflow: https://github.com/wieslawsoltes/RevectorStudio/actions/runs/35490308416

The source patch was checksum-verified against the tested local changes. CI used Node 22.16.0, Python 3.12 and the locked npm dependencies. All sixteen version 0.3.0 package archives were installed and imported in a clean offline consumer. Generated bundles, npm archives and test evidence were committed with the source. The package archives have not been published to the npm registry.

## Executed checks

| Gate | Result |
| --- | --- |
| Node unit/integration regressions | 120 passed, zero failed/skipped |
| Strict TypeScript consumer | Passed |
| Original workbench browser assertions | 35 passed |
| Real raster OCR, rotated-page recovery, colors and six DXF versions | 21 passed |
| Real tiled/deskewed image-PDF OCR, provenance and cleanup | 14 passed |
| Actual Node CLI OCR and independent export audit | Passed |
| General independent ezdxf audit | 35 files, zero errors and automatic fixes |
| Isolated offline package consumer | All sixteen imports passed |

The general 35-file DXF audit is separate from the OCR browser and CLI audits; these are generated fixtures, not 35 independent customer PDFs. PDF.js 6.4.172 is the recorded development build, not represented as a current stable release. Browser OCR tests use real WebAssembly recognition, not injected words. The failure-cleanup subcase intentionally supplies a failing provider; that is not used to establish OCR accuracy.

## Measured skewed scan

An authored image-only PDF contains six words and a clockwise scan skew of 4 degrees, with no PDF rotation metadata. Six overlapping tiles were recognized at 288 DPI. The estimator returned 3.9 degrees. Exactly `PUMP`, `P-101`, `FLOW`, `120`, `VALVE` and `OPEN` survived. Twelve overlapping duplicate/fragment observations were suppressed and one low-confidence observation was rejected. Exported text retained the source direction (-3.9 degrees in CAD coordinates), actual affine provenance and image references. Temporary canvases were released on success and injected failure. The independent DXF audit found no structural errors or automatic fixes.

The first, weaker test only checked that expected words existed and allowed clipped fragments beside complete words. Inspection of its output caught that defect. The corrected test requires the exact expected word set and the seam-specific unit tests cover higher-confidence fragments, vertical cuts, unmatched edge words and overlapping non-fragment labels.

## Color measurements

All eleven sampled PDF/reference-DXF swatches had zero channel difference in the executed browser fixture: near-black RGB, navy, RGB, gray, two CMYK paints, ICCBased RGB, CalRGB, Lab, Separation and normal alpha. Explicit true-color RGB values also round-tripped without error.

The audit separately found source alpha 0.5 serialized as 128/255: opacity error 0.0019607843137254832. It therefore reports `rgbExact: true`, `opacityExact: false`, `exact: false`, even though the rounded composited sample pixels match. DXF 2000's ACI/transparency restrictions are not concealed. Missing target entities, malformed values and unresolved inherited colors prevent an unqualified exact report.

This is agreement with the PDF.js reference and explicit CAD paint values, not certification of all ICC profiles, overprint, blend modes, arbitrary raster content, fonts or commercial CAD importers.

## Permanent deployment gates

`ci.yml` runs the full local build/validation suite. `pages.yml` also runs the new recovery test before upload and repeats all three browser suites on the actual published HTTPS site: base deployment, OCR/colors, and tiled deskew. The base suite verifies `deployment.json` against the deployed commit. Download the Actions `revector-validation`, `pages-build-validation` and `pages-live-validation` artifacts for per-run machine-readable evidence. Successful build tests alone are not represented as a successful public deployment.
