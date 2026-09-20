# Recovery 0.4.0 — native raster assets, centerline graphs and contour-aware semantics

Version 0.4.0 extends the sixteen reusable packages. Native vector extraction and editable text remain separate from raster retention and geometric inference. None of these paths claim universal CAD reconstruction.

## Native PDF image paint → DXF IMAGE

Enable **Keep images** to retain supported decoded PDF images. Each IMAGE carries its insertion point and two independent per-pixel basis vectors. Those vectors preserve placement, anisotropic scale, reflection and shear; page rotation, CropBox, UserUnit and drawing scale use the same coordinate pipeline as native vectors. Image paints remain in the original paint order, so later vector strokes are not burned into PNG pixels or duplicated.

PDF.js resolves the source image representation and supported color profiles. Revector reads that decoded resource, rather than a screenshot of the page. Intrinsic image alpha is retained; constant graphics-state opacity and supported vector clipping are baked into PNG alpha at the **native image resolution**. This is not byte-identical preservation of the original compressed image stream, nor mathematically exact reproduction of an arbitrary subpixel clip boundary. Images use sRGB; the original ICC profile is not an embedded DXF color-management system. Per-image PDF interpolation hints are preserved in provenance and honored by Revector's preview. Other CAD viewers may apply different resampling policies.

Identical PNG resources are deduplicated using SHA-256, including across different placements. Different clip/alpha variants remain separate resources. The model validates dimensions, IDs, safe paths and nonsingular pixel bases. PNG dimensions and available digests are verified before packaging or preview decoding. Hosts can supply their own Canvas factory; callbacks, provider objects and credentials are excluded from serialized conversion options.

Supported resource operations are `paintImageXObject`, `paintInlineImageXObject` and repeated image XObjects. External graphics-state soft masks, transfer functions, non-Normal blends, unsupported transparency groups, stencil masks, grouped image atlases and text clipping are explicitly diagnosed and omitted rather than silently approximated with a page screenshot. Strict export blocks unresolved error diagnostics. Hidden raster paints are not retained by this visible-image preservation mode.

### Portable export, not embedded image bytes

DXF references **external** image files. It does not embed PNG bytes. Revector writes native `IMAGE`, shared `IMAGEDEF`, `IMAGEDEF_REACTOR`, image dictionaries and raster variables for all six supported DXF generations (2000–2018).

The UI downloads a ZIP when IMAGE entities are present. It contains the DXF, `images/<sha256>.png` sidecars, an asset manifest and the conversion report. Extract the complete archive and retain its relative directories. The CLI writes the same sidecars beside the drawing. Downloading or copying only the DXF discards those external pixels. No HTTP/HTTPS image URLs, absolute paths, traversal segments or automatic remote image fetches are used by the reader.

The right viewport still renders the **parsed serialized DXF**. Only after parsing are verified local asset bytes attached by matching resource ID, filename and dimensions. IMAGE positions are not substituted from the pre-export model. Bitmap loading is generation-guarded; changing documents or disposing the viewport closes owned bitmaps. Missing/undecodable image assets have a visible placeholder and a renderer diagnostic rather than an invisible blank image.

```js
import { PdfSource } from '@revector/pdf';
import { ConversionEngine } from '@revector/engine';
import { packageDxf } from '@revector/dxf';

const source = await PdfSource.open(pdfBytes, pdfOptions);
try {
  const scene = await source.preserveRasterImages(await source.extract(1));
  const result = await new ConversionEngine().convertScene(scene, {version:'2018'});
  const bundle = packageDxf(result.document, {filename:'drawing.dxf', version:'2018'});
  // bundle.files: { name, data: string | Uint8Array }[]
  // The embedding host owns ZIP creation or filesystem writes.
} finally {
  await source.dispose();
}
```

```sh
npm run convert -- --input drawing.pdf --output recovered.dxf --keep-images
npm run convert -- --input drawing.pdf --output sheets --page all --keep-images --version 2000
```

## Raster centerline graph

The OCR dialog now offers **Centerline graph / arbitrary paths** in addition to the existing axis-line detector. Native PDF vectors are not passed through this algorithm. It is opt-in and applies only to selected raster recovery regions.

The reusable `traceRasterPaths(binary,width,height,options)` pipeline is:

1. Copy and zero-pad the binary raster, preserving caller-owned pixels.
2. Apply the two-phase Zhang–Suen thinning conditions to convergence, with iteration, foreground and work budgets. An incomplete thinning result is rejected, not exported as a completed graph.
3. Build the eight-neighbor pixel graph. Remove redundant diagonal corner shortcuts where an orthogonal step already connects the pixels.
4. Walk every undirected edge exactly once, stopping at degree-not-two endpoints and junctions. Handle residual pure cycles separately. Report isolated pixels without inventing degenerate CAD entities.
5. Simplify sampled centerlines into polylines using bounded Ramer–Douglas–Peucker subdivision. Preserve graph endpoints/junctions and closed cycles.

This handles diagonal strokes, bends, branches and curved/closed outlines. It does **not** infer mathematical ARC/SPLINE control points, original line widths or engineering connectivity at ambiguous crossing pixels. A scanned filled shape can produce a medial skeleton, not its outline. The default tolerance of 0.65 pixels bounds the sampled skeleton-to-simplified-segment distance; it is not an error bound relative to the original CAD drawing, and simplification is not a proof that no new geometric intersections occur. Set tolerance to zero to retain all sampled vertices.

`recoverRasterPaths` adds native-paint exclusion and conversion to PDF paint intermediates. Known native vectors use their paths, dash patterns and clip stacks; native text excludes its metric box. OCR word boxes are also excluded. This intentionally removes ambiguous raster fragments underneath native paint instead of producing duplicates. Conservative masking can break a raster connection; hidden geometry is not reconstructed. The complete bounded region is traced after OCR tile reconciliation, so tracing itself does not add tile-seam fragments. Regions larger than four megapixels are rejected for this mode; use a lower recovery DPI or axis mode. This bound controls this algorithm's working set, not all allocations inside the PDF or OCR engines.

Inferred paths carry source-image IDs, the actual pixel-to-PDF transform, the algorithm, sample counts, skeleton tolerance, endpoint degrees and border-contact flags. Colors are median foreground samples and remain estimates. Both image retention and tracing can be selected; that deliberately retains the raster underneath the inferred vectors and may visually darken overlapping content. They are independently toggleable and not an automatic substitute for each other.

```js
import { traceRasterPaths } from '@revector/raster';
const traced = await traceRasterPaths(binary, width, height, {
  tolerance: 0.65,
  maxPixels: 4_000_000,
  signal
});
// traced.paths: pixel-center polylines; traced.stats: graph/iteration/coverage evidence
```

```sh
npm run convert -- --input scan.pdf --output traced.dxf \
  --ocr --ocr-deskew --ocr-trace-lines --ocr-trace-mode paths
```

The separate `recoverRasterPaths` API accepts raster data directly and does not call OCR. The workbench composition invokes it after its existing Tesseract OCR pass. Recognition continues to use the pinned, self-hosted permissive runtime; no new online recognition service was introduced.

## Better diagram semantics without inventing meaning

The existing `document.diagram` rule is versioned to 1.1.0. The total remains eighteen built-in rules; this release improves the algorithm rather than adding duplicate rule names.

Label assignment tests actual circle, full ellipse or simple straight-edged polygon containment. Concave contour notches are checked against the complete text metric box. Bounding-box corners outside a circle no longer qualify. Nested shapes assign a label to the smallest unambiguous containing region; equal-area ties are left unassigned. Bulged polylines, partial ellipses and self-intersecting polygons are excluded until appropriate exact predicates are available.

Connectors must terminate close to a contour boundary, not merely somewhere inside a shape's bounding box. Multiple matching boundaries are ambiguous and are rejected. The diagram graph contains connected nodes only, with undirected links unless another rule supplies direction evidence. All results are geometry-preserving GROUP proposals with source members and testable evidence, not proof of the original application's diagram objects. Neighborhood, polygon and feature budgets limit adversarial layouts.

## Color audit scope

The vector RGBA audit now counts IMAGE entities separately and sets `imagePixelsAudited:false`. It cannot report `complete:true` or full exactness while raster colors are outside that audit. Decoded PNG content has its own SHA-256 integrity; matching a digest verifies bytes, not profile correctness or appearance in every CAD viewer. Browser raster comparisons separately exercise source PDF.js pixels against the IMAGE preview. Font substitution, overprint, arbitrary blending and target-display ICC differences remain separate limitations.

## Validation entry points

```sh
npm ci --ignore-scripts --include=optional
npm run build
npm test
npm run test:types
npm run test:browser
npm run test:extensions
npm run test:recovery
npm run test:images
npm run test:images:cli
npm run test:dxf
npm run pack:all
```

`tests/images_browser.py` uses genuine HTTP navigation by default and accepts `--url` for the published HTTPS site. `--inline` is an explicitly identified local transport for environments restricting browser navigation; it does not replace CI/Pages HTTP checks. Image and tracer geometry tests do not invoke OCR. Existing extension/recovery suites still execute actual WASM OCR. Fixtures are authored regressions, not customer-corpus benchmarks or certification of commercial CAD importers.

## Primary references

- Autodesk DXF IMAGE group codes: https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-3A2FF847-BE14-4AC5-9BD4-BD3DCAEF2281.htm
- Autodesk DXF IMAGEDEF: https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-EFE5319F-A71A-4612-9431-42B6C7C3941F.htm
- ezdxf IMAGE tutorial and external-reference contract: https://ezdxf.readthedocs.io/en/stable/tutorials/image.html
- T. Y. Zhang and C. Y. Suen, *A fast parallel algorithm for thinning digital patterns*, CACM 27(3), 236–239 (1984): https://doi.org/10.1145/357994.358023
- NIST Secure Hash Standard, FIPS 180-4: https://doi.org/10.6028/NIST.FIPS.180-4

The SHA-256 implementation is used for portable asset integrity and tested against Node's native crypto implementation. That test is not a cryptographic-module certification.
