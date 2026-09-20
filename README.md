# Revector Studio

**Vector-first PDF → semantic DXF. Inspect the source. Recover structure. Keep the evidence.**

Revector Studio 0.6.0 is a working, local-first HTML/JavaScript conversion IDE and a set of **16 reusable ESM/npm packages with TypeScript declarations**. The left viewport is the real PDF.js rendering of the input. The right viewport renders the **serialized DXF after parsing it back**, not a substitute drawing generated only for the demonstration.

The converter reads vector painting instructions and encoded text. Raster OCR is opt-in through a self-hosted Tesseract.js integration. No remote AI service receives document data. The bundled two-page P&ID/feature fixture is an actual PDF, and is processed by the same path as an opened document.

## New in 0.6.0 — measured performance

Conversion now uses ownership-safe copy-on-write semantic transactions, reusable immutable rule snapshots, prepared vector clipping queries, indexed form folding, a median-selection BVH, indexed/streamed DXF handling and bounded concurrent PDF resource resolution. The workbench reuses idle workers and unchanged PDF reference images, while cancellation still hard-terminates busy work. Resolution, geometric tolerances, rule coverage and correctness checks are not reduced. See [performance architecture, benchmarks and reproduction](docs/PERFORMANCE.md).

## New in 0.5.0

Twenty built-in rules include bounded sampled-curve reconstruction and evidence-bearing crossing/junction alternatives. **Appearance + CAD** retains difficult PDF.js-composited effects as an explicitly sampled IMAGE layer alongside independently editable geometry. Exact source archival, SHA-pinned corpus checking and a licensed-CAD adapter contract are available. See [0.5 contracts](docs/RECOVERY-0.5.md).

## New in 0.4.0

**Keep images** preserves supported decoded PDF raster resources as native DXF IMAGE entities with portable PNG sidecars, shared definitions and exact affine placement. Opt-in centerline graph tracing adds diagonal paths, junctions and closed curves alongside OCR. Diagram semantics now use actual contour containment and boundary-touching connectors. Raster ICC/CMYK/interpolation tests and separate asset integrity prevent misleading vector-only color audits. See [0.4 algorithm and API contracts](docs/RECOVERY-0.4.md).

## New in 0.3.0

Eighteen built-in rules now include merged-cell ruled tables, unruled schedules and numbered/bullet lists. OCR adds overlapping tiles, optional small-angle deskew, explicit inversion, generation-safe cancellation and affine provenance. Color audits distinguish RGB fidelity from opacity quantization, missing entities and unresolved inherited colors. See [algorithm contracts, API/CLI options and validation](docs/RECOVERY-0.3.md).

## New in 0.2.0

Eight additional rule families cover table grids, text flows, technical notation, labeled fields, diagram connectivity, parallel boundaries, concentric features and leader callouts. Opt-in raster OCR adds editable text and optional ruled-line inference. Original-color preview is now separate from CAD contrast, with per-export RGB/CIEDE2000 audits. See [algorithms, OCR integration, color policy and validation](docs/EXTENSIONS.md).

## Run immediately — no install required

Requires Node.js 22.13+ for the local development server and a modern browser.

```sh
cd revector-studio
node scripts/link-workspaces.mjs
npm start
```

Open `http://localhost:4173`. The sample drawing converts automatically. Use **Open PDF** or drag a PDF onto the workspace. All input and conversion stay local to the application.

The included **`revector-studio.html`** is a standalone build containing the application, PDF.js, decoder/CMap/ICC resources, and sample. It can be opened directly in browsers that allow local blob modules. Local-file and CSP restrictions vary: the HTTP-served `index.html` is the reliable integration/deployment entry point. No font programs are distributed.

A prebuilt conversion worker is included at `apps/studio/conversion-worker.js`. The `dist/` directory in the web-build archive is ready for static hosting. No server-side conversion endpoint is required.

## Implemented workflow

Open a PDF, choose a page, select the DXF version and units, set the model-to-paper scale, and convert. Inspect entities and source provenance; review semantic proposals before accepting them. Export a DXF, a machine-readable conversion report, or a multi-page ZIP containing separate drawings and reports. Save/reopen the original PDF plus settings and decisions as a `.revector.json` project.

The compact workspace includes named layers, recovered block definitions, entity picking, source highlighting, linked pan/zoom, fit, paper/dark presentation, a grid, measurement/calibration, rule toggles, a JSON rule editor, diagnostics, and undo/redo for semantic decisions. Layer visibility checkboxes control the **DXF preview only**, not export inclusion.

### Geometry and source recovery

- Affine transforms, save/restore, page rotation, crop normalization and PDF UserUnit are interpreted before units/scale conversion.
- Straight segments become LINE/LWPOLYLINE. Cubic Bézier curves become native degree-3 SPLINE entities with original controls and clamped knots. Conversion does not replace those curves with sampled polylines.
- Line/cubic clipping and closed-path arrangements preserve cubic segments. Ambiguous or over-budget arrangements are diagnosed; strict mode rejects unresolved errors.
- Solid fills become HATCH boundaries with line/cubic edges. Even-odd and nonzero fill regions are normalized. Bounded vector-only tiling cells can be expanded.
- Encoded PDF text becomes editable Unicode TEXT, with placement, height, rotation, width fitting, affine oblique/mirror handling and adaptive glyph positioning for explicit spacing.
- Optional-content groups recover named DXF layers where present. Styles can create fallback layers when original layer data is absent.
- Eligible repeated PDF Form XObjects become shared BLOCK/INSERT geometry. Sheared or non-representable cases remain expanded. PDF form identity is **not proof of an original CAD block name or meaning**.

### Extensible semantic recovery

The original eight CAD rules cover degree-2 line joining, printed circle recovery, translation-equivalent repeated components, tag-to-INSERT attribute association, linear dimension candidates, centerline classification, regular hatch-line families, and title-block vocabulary.

Rules produce **candidates**, not silent mutations. Each candidate has members, evidence, a confidence score, an exact/inferred flag, a rule version, and a validated transaction. Source geometry remains replayable. The confidence is a rule score, **not a calibrated probability**.

Custom extensions can be trusted JavaScript plugins or constrained declarative JSON classification rules. `examples/integration.ts` demonstrates a typed plugin. See [Rule authoring](docs/RULES.md).

### DXF versions

| Selection | `$ACADVER` | Export policy |
|---|---|---|
| 2000 | AC1015 | ACI color, supported R2000 entities, Unicode escapes |
| 2004 | AC1018 | True color / transparency where representable |
| 2007 | AC1021 | UTF-8-compatible output; Unicode escapes retained |
| 2010 | AC1024 | Versioned drawing header and supported entity contracts |
| 2013 | AC1027 | Versioned drawing header and supported entity contracts |
| 2018 | AC1032 | Versioned drawing header and supported entity contracts |

The writer emits drawing headers, symbol tables, block records, owners/handles, model/paper layout objects, layer/style/linetype records, GROUP dictionaries/reactors, attributes/SEQEND, dimension display blocks and REVECTOR XDATA. The native entity model includes LINE, LWPOLYLINE, CIRCLE, ARC, ELLIPSE, SPLINE, HATCH, SOLID, TEXT, MTEXT, INSERT, ATTRIB, DIMENSION and IMAGE. The reader is intended for this writer's subset, **not as a general-purpose importer for every DXF entity**.

## Command line

```sh
node scripts/link-workspaces.mjs
npm run convert -- --input assets/cooling-water.pdf --output output/cooling.dxf \
  --page 1 --version 2018 --units mm --scale 1 --profile cad

npm run convert -- --input assets/cooling-water.pdf --output output/sheets \
  --page all --version 2000 --strict
```

A `.report.json` is written beside every drawing. `--scene scene.json` saves the vector intermediate. Use `--rules rules.json`, `--decisions decisions.json`, `--include-hidden`, `--no-forms`, or `--password-env PDF_PASSWORD` as needed. `--scale 100` means model length is 100 times paper length; the converter does not invent an undocumented print scale. `--help` lists the full contract.

## Use the reusable engine

```js
import { PdfSource } from '@revector/pdf';
import { ConversionEngine } from '@revector/engine';

const source = await PdfSource.open(pdfBytes, {
  moduleUrl: '/vendor/pdfjs/legacy/build/pdf.mjs',
  workerUrl: '/vendor/pdfjs/legacy/build/pdf.worker.mjs',
  pdfOptions: {
    cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true,
    wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/'
  }
});
try {
  const scene = await source.extract(1);
  const result = await new ConversionEngine().convertScene(scene, {
    version: '2018', units: 'mm', drawingScale: 100,
    profile: 'cad', strict: true
  });
  // result.dxf.text: exported DXF; result.preview: reparsed DXF model
  // result.document: rich semantic model; result.report: evidence/diagnostics
  console.log(result.report.summary);
} finally {
  await source.dispose();
}
```

Use `ConversionEngine.register(rule)` for trusted plugins. Use `ConversionWorker` for a separately disposable worker; `signal` provides cancellation to the in-process engine. Host frameworks can use any package independently of the workbench. See [Architecture](docs/ARCHITECTURE.md), [Integration](docs/INTEGRATION.md) and the declarations in every package.

## Package distribution and development

`release/npm/` contains sixteen installable `.tgz` packages, a manifest and SHA-256 checksums. They have **not** been published to the public npm registry. The `@revector` scope is a project namespace, not an assertion of registry ownership. Rename the scope consistently before publishing under an account you control.

```sh
# In an application that will consume the supplied local packages:
npm install /absolute/path/to/revector-studio/release/npm/*.tgz

# To rebuild this repository after changes:
npm install --include=dev
npm run build
npm test
npm run test:types
npm run pack:all
```

The vector application runs without those installs because its dependencies and worker are prebuilt. OCR assets are produced by `npm run vendor:ocr` during the full build and are included in the published site. A rebuild needs TypeScript 5.8.3. Replacing PDF.js explicitly uses `npm run vendor`; it is **not** an implicit installation side effect. Keep module and worker versions identical.

**PDF.js provenance:** the runnable bundle uses Mozilla's official development snapshot **6.4.172**, commit `579c4b700f23f7782234f03358b5e9eaa3f58889`, obtained from its website build artifact. `vendor/pdfjs/BUILD.json` records this. The adapter also accepts the inspected 6.3.289 operator contract, and package metadata pins that release as an optional peer. **Execution tests in this delivery used 6.4.172, not 6.3.289.** Retest the fixtures before replacing the vendor snapshot.

## Validation and boundaries

The original 0.1.0 release validation included **51 passing Node tests**, **35 browser workflow assertions**, strict TypeScript consumer checking, and **35 independent DXF audits with ezdxf 1.4.4, with zero audit errors and zero automatic fixes**. The reports, generated DXFs and real UI screenshots are in `artifacts/`; [Validation](docs/VALIDATION.md) explains exactly what was executed.

This is a functioning implementation, **not a claim of lossless support for all PDF features or certification against every CAD application's PDF printer**. Shading/mesh gradients, soft masks/blending, arbitrary clipped editable text, Type 3 glyph recovery, unsupported raster masks/groups, general outlined-text recognition, original CAD constraints/associativity, 3D/multimedia and interactive PDF behaviors are not fully represented in the CAD exporter. The source viewer can show features that the converter diagnoses or omits. Raster OCR must be explicitly enabled; confidence and inference are recorded.

Native DXF text uses available CAD/browser fonts; the original appearance is not guaranteed when font programs differ. Inferred dimensions are non-associative. Default conservative profiles leave geometry-changing hypotheses pending. See the [Capability matrix](docs/CAPABILITIES.md) before using results in engineering production.

## License

Original Revector source: MIT. PDF.js and vendored data/decoders retain upstream licenses. The ACI numeric palette carries the ezdxf MIT notice. See [Third-party notices](THIRD_PARTY_NOTICES.md). No font programs, paid SDKs or remote-service credentials are included. Self-hosted permissively licensed OCR runtime and language data are built from pinned npm dependencies.

## Current validation

See [version 0.4.0 validation](docs/VALIDATION-0.4.md) and [algorithm contracts](docs/RECOVERY-0.4.md) for native raster assets, general path inference, contour-aware semantics and browser/CLI verification. Historical 0.1–0.3 evidence is retained separately.

## Version 0.5.0 — remaining-boundary handling

[Recovery 0.5](docs/RECOVERY-0.5.md) adds an explicit appearance/reference layer for PDF.js-composited effects, while preserving editable CAD on separate layers; continuous-error-bounded arc/circle/cubic hypotheses; junction/crossing alternatives; optional byte-exact original PDF archival; a SHA-pinned corpus runner with optional licensed CAD regeneration; and verified npm publication tooling. There are twenty built-in rules. Representation limits, ambiguity and external acceptance are not hidden by a raster reference or a passing structural audit.
