# Recovery extensions — 0.3.0

This release extends the existing sixteen-package architecture. It does not replace the PDF renderer, OCR engine, or DXF serializer. Native vectors remain authoritative; detected document structure and raster text remain evidence-bearing hypotheses.

## Semantic algorithms

The engine now registers eighteen built-in rules: eight CAD and ten document rules. The exact profile does not apply document inference.

**Merged ruled tables.** Connected orthogonal components supply candidate X/Y grid coordinates. Every outer edge must have complete segment coverage. Each elementary internal edge is classified as complete, absent, or partial using the union of projected intervals. Absent edges join neighboring elementary cells with disjoint sets. Partial edges reject the candidate. A joined component must occupy an entire rectangular span; an existing separator inside that span, or an L-shaped union, rejects the candidate. The result contains top-down row/column indices, rowSpan/columnSpan, text IDs, bounds and merged-cell counts. Original entities are not replaced.

**Unruled schedules.** Nearly horizontal text is grouped by baseline and adjacent runs. At least three rows with two or more consistently aligned columns and continuous whitespace gutters are required. Misaligned columns, two-row coincidences and missing gutters do not qualify. The output records row/column membership and preserves the alternative interpretation of multi-column prose. This is not a universal table-layout model.

**Lists.** At least three vertically aligned bullet or numeric markers with text bodies are required. Numeric sequences must be consecutive. Bodies can be inline or separate native/OCR text entities. Isolated callout numbers are not labeled as lists. Original entities are retained and the grouped item order is explicit.

These analyses are bounded by entity, neighborhood, component, proposal and cell budgets. Cancellation is checked before analysis and within traversal loops. `exact: true` on a group-only proposal means no geometry is changed; it does **not** mean its inferred semantic interpretation is certain. Scores are heuristics, not calibrated probabilities.

## Tiled OCR and small-angle deskew

`@revector/raster` exports `planRasterTiles`, `estimateSkew`, and `boundedRotation`. `@revector/ocr` composes them with the existing Tesseract.js 7 provider.

For tile side T and halo H, ownership cores use stride T − 2H. Cores partition the raster without gaps or overlap; allocated rectangles include neighboring halos. The entire tile count is validated before processing a region. A single worker recognizes tiles sequentially. Confidence-ordered spatial suppression removes overlapping word hypotheses while retaining equal text at distinct positions. Word boxes and baselines are shifted to the region coordinate system before suppression. Different readings with almost coincident boxes favor higher confidence. Long words exceeding the halo or fragmented recognition can still need manual review.

Optional small-angle skew analysis builds projection profiles of a bounded foreground sample on a reduced-resolution raster. For trial angle θ, the profile coordinate is −x sin θ + y cos θ. Maximizing the sum of squared bin counts favors aligned text baselines. A coarse search and local refinement operate within ±12°. Sparse ink, weak peaks and boundary maxima leave orientation unchanged. Drawings without text-dominant structure can be ambiguous; deskew is opt-in and records its score and estimated angle. It is not arbitrary orientation detection.

An enclosing affine rotation, optionally reduced to the allocation cap, corrects the OCR image. The **inverse actual affine transform**, including crop origin, explicit quarter-turn, deskew and scale, maps recognized words back into PDF coordinates. OCR provenance retains the matrix, tile number, source image IDs and skew estimate. Exported text keeps its original drawing direction rather than the temporarily straightened OCR direction.

Page rendering is still bounded by `maxPixels` (24 million by default). Tiling bounds OCR input size and allows Sauvola on smaller tiles; it does **not** restore detail lost when a huge page was downsampled. PDF/WASM internal allocations are not governed by these application limits. Effective rendering DPI and any deskew scaling are reported. The OCR deadline applies per recognition call, not to the entire batch.

Each recovery call owns its temporary canvases and clears them on success, provider failure, rendering failure and cancellation. An externally supplied OCR session remains externally owned. Generation-specific worker ownership prevents a cancelled late initialization from terminating a newer worker. Calls remain serialized and duplicate termination is suppressed.

## UI and CLI

The OCR dialog adds small-angle correction, explicit light-on-dark inversion, and tile size. Opening a project with older partial OCR settings fills new fields from defaults. Invalid options leave the dialog open with an error.

```sh
npm run convert -- --input scan.pdf --output scan.dxf --version 2018 \
  --ocr --ocr-language eng+pol --ocr-dpi 300 --ocr-confidence 75 \
  --ocr-deskew --ocr-tile-size 2048 --ocr-preprocess sauvola
```

Use `--ocr-rotation 90` for an explicit quarter-turn, `--ocr-invert` for light-on-dark text, and `--ocr-trace-lines` for inferred ruled lines. Line segments are clipped to disjoint tile cores to avoid duplicate halo strokes. They may remain segmented at tile seams. General raster curve tracing and DXF IMAGE embedding are not included.

```js
const recovered = await recoverPdfRaster(source, vectorScene, {
  assetBase: new URL('./vendor/ocr/', document.baseURI).href,
  languages: 'eng+pol', scope: 'raster', dpi: 300,
  deskew: true, tileSize: 2048, tileOverlap: 96, maxTiles: 256,
  preprocess: 'sauvola', minConfidence: 75, signal
});
```

## Color fidelity and truthful audit scope

The previous original-color/contrast separation and PDF.js-managed ICC conversion remain. No second profile transform is applied to decoded RGB. The audit now reports missing exported entities, malformed paint values, unresolved inherited colors, and opacity changes instead of skipping them and claiming an exact match.

`rgbExact` describes fully audited explicit RGB values. `opacityExact` separately describes alpha values. `complete` excludes missing, invalid and unexamined inherited paints. `exact` requires both RGB and alpha exactness. For example, 0.5 opacity is quantized to 128/255 in the supported newer DXF representation; DXF 2000 drops unsupported alpha and quantizes arbitrary RGB to ACI. The report records these effects without changing source colors to hide the difference.

CIEDE2000 measures differences in explicit sRGB-derived Lab values. It is not proof that PDF blend modes, overprint, clipping, image profiles, substituted fonts or display-device color management are identical. The actual-pixel regression compares eleven authored PDF swatches against the serialized/reparsed DXF renderer: DeviceRGB, near-black RGB, gray, CMYK, ICCBased sRGB, CalRGB, Lab, Separation and normal alpha. This is agreement with the PDF.js reference viewer, not exhaustive ICC/printer certification.

## Validation

`tests/recovery-next.test.mjs` adds merged-cell, negative-layout, tiling, affine, skew, duplicate-suppression, worker-race, canvas-cleanup and RGBA-audit regressions. `tests/recovery_browser.py` authors a real skewed image PDF in memory and exercises the real WASM OCR worker through multiple tiles, checks text direction and provenance, audits the resulting DXF independently, and verifies failure cleanup. It supports `--url` for the deployed HTTPS application. It never supplies mocked OCR words.

Run the complete gates:

```sh
npm ci --ignore-scripts --include=optional
node scripts/link-workspaces.mjs
python -m pip install -r tests/requirements.txt
python -m playwright install --with-deps chromium
npm run build
npm test
npm run test:types
npm run test:browser
npm run test:extensions
npm run test:recovery
python tests/ocr_cli.py
npm run test:dxf
npm run pack:all
```

Machine-readable CI artifacts identify the actual tested revision and counts. These are authored regressions, not a measured recognition rate on arbitrary customer drawings. OCR remains opt-in; original embedded raster images, handwriting, mathematical layout and universal CAD reconstruction are not claimed.
