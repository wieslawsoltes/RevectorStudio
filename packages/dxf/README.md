# @revector/dxf

**DXF 2000–2018 writer and reader** — Revector Studio 0.4.0.

Version-aware DXF serialization with tables, handles, owners, blocks, supported entities, groups and metadata; reader for the writer-supported subset, not a universal DXF parser.

## Distribution

ESM with TypeScript declarations at `src/index.d.ts`. Install the supplied package tarballs together so exact sibling dependencies resolve locally. Packages are not yet published to a public npm registry.

```js
import * as Revector from '@revector/dxf';
```

## Public API

exportDxf, readDxf

The declaration file is the authoritative signature reference; source implementations and comments are shipped without minification. The full repository includes `examples/integration.ts`, a runnable workbench and CLI, fixtures, tests, and architecture/integration/rule-authoring documents.

## Contract

Use explicit diagnostics and source provenance when handling partially supported PDF content. A confidence score is not a calibrated probability; geometry preservation does not prove original CAD intent. Native conversion remains vector-first. Optional @revector/ocr adds inferred raster text and ruled lines with confidence and provenance.

Original package code: MIT; see `LICENSE`. Any included third-party notice remains applicable.

## Portable raster assets

`packageDxf(document, options)` returns the DXF, verified PNG bytes and manifest as a file collection. Images remain external DXF references; preserve all relative paths. See `docs/RECOVERY-0.4.md` in the repository.
