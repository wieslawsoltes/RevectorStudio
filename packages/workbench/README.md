# @revector/workbench

**Compact two-panel conversion IDE** — Revector Studio 0.1.0.

PDF.js source view, reparsed-DXF view, page/layer/block exploration, inference review, JSON rules, project persistence, measurement and export.

## Distribution

ESM with TypeScript declarations at `src/index.d.ts`. Install the supplied package tarballs together so exact sibling dependencies resolve locally. Packages are not yet published to a public npm registry.

```js
import * as Revector from '@revector/workbench';
```

## Public API

mountWorkbench, Workbench

The declaration file is the authoritative signature reference; source implementations and comments are shipped without minification. The full repository includes `examples/integration.ts`, a runnable workbench and CLI, fixtures, tests, and architecture/integration/rule-authoring documents.

## Contract

Use explicit diagnostics and source provenance when handling partially supported PDF content. A confidence score is not a calibrated probability; geometry preservation does not prove original CAD intent. No OCR or raster tracing is performed.

Original package code: MIT; see `LICENSE`. Any included third-party notice remains applicable.
