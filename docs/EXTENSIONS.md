# Semantic, raster OCR and color recovery (0.2.0)

## What changed

The original vector-first pipeline remains the default. Eight additional rule families extend it to technical sheets and general documents. OCR is explicitly enabled by the user and adds inferred, editable text without replacing native PDF text. Four independently packaged modules provide document recognition, raster preprocessing, OCR orchestration, and color auditing.

### Document rule families

| Rule | Algorithm and output | Important boundary |
|---|---|---|
| Table grids | Spatially connected orthogonal line components, complete border-coverage tests, coordinate clustering and text-to-cell assignment; rows, columns and cell contents retained in GROUP metadata. | Requires closed ruled rectangular grids; not a borderless-table or arbitrary merged-cell recognizer. |
| Text flows | Spatial baseline neighborhoods, rotation/height compatibility, projection-based reading order. | Groups original TEXT runs; does not silently replace them with reflowed MTEXT. |
| Technical notation | Bounded lexical grammars for diameter, radius, thread, tolerance, quantities, scale, component designators and instrument tags. | Classification candidates, not verified units or engineering meaning. |
| Labeled fields | Label vocabulary plus spatially adjacent value association. | Proximity is evidence, not proof. |
| Diagram connectivity | Labeled closed-shape candidates, spatial endpoint association and graph assembly. | Undirected connections; nearby boxes can be ambiguous. |
| Parallel boundaries | Orientation, separation and overlap tests with spatial pruning. | Wall/pipe/border alternatives are retained instead of asserting one meaning. |
| Concentric features | Center-distance neighborhoods and radius sets. | A concentric feature is not automatically a hole or bearing. |
| Leader callouts | Shaft, opposite arrow wings and nearby text association. | Handles a constrained arrow geometry, not every annotation convention. |

Each family returns ordinary semantic transactions. Default scores leave these candidates pending. Accept/reject, replay, undo, rule toggles and custom JSON rules use the existing engine. Source entities remain unchanged by the new group-only transactions. Group semantics survive DXF XDATA round trips. Large XDATA payloads are explicitly summarized with a hash rather than overflowing the DXF extended-data limit; complete evidence remains in the rich document/report.

All detectors have entity, neighborhood, component or proposal budgets. The limits reject over-budget work instead of silently inventing results. A rule confidence is a heuristic score, not a calibrated probability.

## Raster OCR

Use **Raster OCR** in the toolbar, enable it, choose visible raster regions or the whole page, and apply. Settings are persisted in projects and used by batch export. The default is English; `eng+deu` or `eng+pol` selects combined language data. Three language datasets are self-hosted; additional installed datasets can be exposed through a custom `assetBase` or injected provider.

The implementation uses **Tesseract.js 7.0.0** and its WASM LSTM engine, under Apache-2.0. It is an integration of an established OCR engine, not a claim that this project trained a new state-of-the-art recognizer. Language npm wrappers declare MIT; the upstream trained data uses Apache-2.0. Runtime licenses and transitive bundle notices accompany the vendored files.

1. PDF.js decodes and renders a bounded-resolution page with its image color, masks, clipping and rotation handling.
2. Raster marks define crops. Actual transformed image outlines and path clips mask those crops; bounding boxes are used for allocation, not as replacements for the masks. The crops contain the visible composited page appearance.
3. Optional Otsu or integral-image Sauvola preprocessing operates on pixels composited onto white. Recognition rotation is an explicit quarter-turn control.
4. A dedicated Tesseract worker returns word boxes, baseline evidence and confidence. Native text neighborhoods suppress overlapping OCR output; below-threshold results are counted and a bounded sample is retained.
5. The inverse actual rendering transform maps OCR pixel geometry back to PDF coordinates, then the normal PDF→drawing transform applies units and scale. This handles page rotation without guessing from nominal DPI.
6. Accepted words become editable TEXT on `OCR_TEXT`. Source image identifiers, confidence, pixel box, transform, substituted font and estimated metrics are retained in provenance and DXF XDATA.

Worker calls are serialized, cancellable and time-limited. Page pixel, region and word budgets bound allocations; effective DPI is reported when a page is downscaled. Sauvola has a separate eight-megapixel integral-image limit. OCR does not upload document data to a service. The browser loads runtime, WASM and language assets from the same site; IndexedDB may cache language data.

Optional horizontal/vertical raster line inference masks OCR word boxes, scans runs with small gap tolerance and merges adjacent runs into estimated centerlines. The resulting entities are tagged as inferred. This is **not** general illustration tracing, arbitrary angled curve reconstruction or recovery of original CAD objects.

The original raster image is not embedded in DXF by this release. OCR text is not a substitute for retaining the source PDF. Handwriting, mathematical layout, tiny scanned annotations, arbitrary skew and unusual scripts require further model/configuration work and representative validation. OCR geometry and sampled text color are estimates; engineering dimensions must be reviewed.

### Reusable API

```js
import { recoverPdfRaster } from '@revector/ocr';
import { ConversionEngine } from '@revector/engine';

const vectorScene = await source.extract(1);
const scene = await recoverPdfRaster(source, vectorScene, {
  assetBase: new URL('./vendor/ocr/', document.baseURI).href,
  scope: 'raster', languages: 'eng+pol', dpi: 300,
  minConfidence: 75, preprocess: 'otsu', rotation: 0,
  traceLines: false, signal: abortController.signal
});
const result = await new ConversionEngine().convertScene(scene, {
  version: '2018', units: 'mm', profile: 'cad'
});
console.log(result.report.ocr, result.report.color);
```

An injected `TesseractOcr` session permits worker reuse across pages. `provider` can replace the OCR engine behind the same word/block contract. Node hosts supply a Canvas factory; the CLI wires `@napi-rs/canvas` and the Node Tesseract provider:

```sh
npm install --include=optional
npm run vendor:ocr
npm run convert -- --input scan.pdf --output scan.dxf --ocr \
  --ocr-language eng+deu --ocr-dpi 300 --ocr-confidence 75
```

The self-contained HTML continues to embed the PDF engine, not the large OCR runtime. OCR needs the adjacent `vendor/ocr/` folder or an explicitly configured self-hosted URL. GitHub Pages and `dist/` include those assets.

## Color policy and the mismatch fix

Previously, dark CAD preview mode unconditionally lightened dark entity RGB values for contrast. That display-only transformation made correct exported colors look different from the PDF. **Original colors** now disables it and white paper is the default. **CAD contrast** is a separate, explicit display choice; it never changes DXF bytes.

PDF.js normalizes supported PDF source color spaces before handing painted RGB to the adapter. The adapter now treats normalized byte components explicitly: `[1,0,0]` is near-black red, not full-intensity red. Source ICC/CMYK/CalRGB/Lab/Separation conversion is not applied a second time. Missing ICC-resource configuration is diagnosed; engine version and configured color resources are recorded. DXF stores RGB, not the original embedded ICC profile.

Every conversion compares native model colors against the reparsed DXF. It reports changed entities, maximum channel error and CIEDE2000/D65 differences with bounded samples. DXF 2000 has ACI-palette quantization, which cannot preserve arbitrary RGB. Newer supported versions use true color. Alpha is supported only where the target representation permits it; PDF blending, overprint, gradients and soft masks are not generally reproduced by flat CAD entities.

The color regression authors actual DeviceRGB (including near-black), gray, CMYK, ICCBased sRGB, CalRGB, Lab, Separation and normal-opacity PDF swatches, renders the PDF, exports/reparses DXF, and samples corresponding rendered pixels. This tests agreement with the PDF.js source viewer; it is not commercial-printer soft-proof certification or exhaustive ICC-profile coverage.

## Validation commands

```sh
npm test
npm run test:types
python -m pip install -r tests/requirements.txt
python -m playwright install --with-deps chromium
python scripts/create-extension-fixtures.py
npm run build
npm run test:browser
npm run test:extensions
npm run test:dxf
npm run pack:all
```

`tests/extensions_browser.py --url <published-site>/` exercises the same OCR/color checks on HTTPS without mocked workers. Its evidence includes screenshots, per-swatch channel errors, OCR provenance, six independent DXF audits and network-origin checks. Original 0.1.0 reports remain historical; CI artifacts identify the revision actually tested.
