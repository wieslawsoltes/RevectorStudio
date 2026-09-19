# Integration, distribution and deployment

## ESM/npm consumption

Every package exports an ESM entry plus `src/index.d.ts`. TypeScript discriminated unions describe each supported entity. The root workspace is private; the sixteen packages are independently packable. The renderer and workbench depend on browser DOM/Canvas, while geometry, model, topology, semantics, rules, lowering and DXF logic can run headlessly.

Install all supplied tarballs together into a consumer so exact `@revector/*@0.2.0` dependencies resolve locally:

```sh
npm install /path/to/revector-studio/release/npm/*.tgz
```

PDF.js is an optional peer of the PDF adapter. Supply the included vendor files through an explicit `moduleUrl`/`workerUrl`, or install a tested `pdfjs-dist` build and configure resource URLs. For offline testing, `npm install --offline --ignore-scripts /path/to/release/npm/*.tgz` installs the tarballs without registry access. Refer to `artifacts/package-validation.json` for the delivery's installation smoke test.

The checked-in development snapshot is 6.4.172. Package metadata refers to 6.3.289 as the inspected release contract; this is not a claim that both were executed in this environment. Do not mix one build's module with another build's worker. `npm run vendor` intentionally replaces vendor files with the installed npm build; rerun extraction and browser regressions afterward.

## Embed the workbench

```js
import { mountWorkbench } from '@revector/workbench';
import '@revector/workbench/styles.css';

const app = mountWorkbench(document.getElementById('converter'), {
  pdfjsModuleUrl: '/vendor/pdfjs/legacy/build/pdf.mjs',
  pdfjsWorkerUrl: '/vendor/pdfjs/legacy/build/pdf.worker.mjs',
  conversionWorkerUrl: '/apps/studio/conversion-worker.js',
  assetBase: '/vendor/pdfjs/',
  ocrAssetBase: '/vendor/ocr/',
  autoDemo: false
});
// app.dispose() when the hosting view is destroyed.
```

Give the host element a definite width and height. The stylesheet uses a compact desktop IDE layout; the delivered acceptance run is desktop, not a full mobile/touch accessibility audit. Consumers can use `PdfSource`, `Camera`, `CanvasViewport`, `CadRenderer` and `ConversionEngine` separately to build another shell.

## Conversion worker

```js
import { ConversionWorker } from '@revector/engine';
const worker = new ConversionWorker('/apps/studio/conversion-worker.js');
const abort = new AbortController();
try {
  const result = await worker.convert(scene, {
    version: '2018', units: 'mm', drawingScale: 1, profile: 'cad'
  }, { signal: abort.signal, onProgress: p => console.log(p.phase) });
  consume(result.dxf.text, result.report);
} finally {
  worker.dispose();
}
```

One active job is allowed per worker. Cancellation terminates the worker, making termination independent of a geometry loop's yield frequency. JavaScript rule functions are not structured-cloneable: register trusted plugins in an in-process `ConversionEngine`, or incorporate them into a custom worker entry/build. Declarative `ruleSet` data can be sent across the worker boundary.

The bundled worker is a statically generated factory bundle, not eval-based source execution. CI exercises the actual PDF.js and conversion browser workers under HTTP and HTTPS, in addition to the Node worker kernel. Raster OCR runs in a separate Tesseract worker.

## File and memory lifecycle

Keep the `PdfSource` while changing pages or rendering the source; call `dispose()` when closing a document. Its page cache defaults to three snapshots. Treat the returned `PdfScene` as immutable. A CAD model or source report can include document text and project metadata: do not upload it as telemetry without user authorization.

The application processes files locally. It does not persist sensitive PDFs to a remote service. Saving a project deliberately embeds the original PDF bytes; protect the resulting file as you would the source drawing. Password entry is passed to PDF.js and not intentionally written into project settings.

## Static deployment

`npm run build` generates `dist/`, the conversion worker and standalone HTML. Publish `dist/` to a static host with JavaScript, CSS, WASM and PDF MIME types. Nested-path deployments use relative paths from `index.html`. GitHub Pages publication and real-browser verification are configured in `.github/workflows/pages.yml`; see `docs/PUBLISHING.md`.

The standalone build uses inline code and blob module/worker URLs. A restrictive Content Security Policy must permit the corresponding mechanisms, or use the multi-file build and a reviewed bundler/CSP strategy instead. Decoders may need WebAssembly compilation. Do not weaken a production site's entire policy solely to embed a converter; give it a dedicated origin or reviewed isolation boundary.

No standard font programs are included. PDF.js/browser font substitution and an explicit conversion diagnostic are preferable to silently bundling unlicensed fonts. A host may provide its own licensed font-resource setup, but the delivered text-to-DXF appearance still depends on the CAD consumer's fonts.

## Failure policy and security

Input-byte/operator/candidate budgets, path intersection limits, pattern expansion bounds and abort support are present. The app does not call PDF document JavaScript actions. Raster OCR is explicitly opt-in and uses self-hosted runtime and language assets. Nevertheless PDF parsing, decompression and WASM decoders form an attack surface. For adversarial service workloads, use a dedicated process/container with wall-clock, CPU and heap limits, patched dependencies and an explicit sandbox policy; do not regard client-side validation as complete protection.

Untrusted JSON rules are limited to the documented DSL. Arbitrary JavaScript rule plugins are trusted code with the host's privileges. Escape text in any alternate UI, validate file names and document IDs, and retain diagnostics with partially recovered geometry.

## Optional raster OCR

See [EXTENSIONS.md](EXTENSIONS.md) for reusable OCR, preprocessing, language, confidence, cancellation and coordinate contracts. OCR is not part of exact vector transcription. The standalone HTML embeds the PDF engine but needs adjacent `vendor/ocr/` assets for raster recognition.
