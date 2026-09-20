# @revector/geometry

**Affine and cubic geometry kernel** — Revector Studio 0.7.0.

Affine matrix composition/inversion; analytic cubic evaluation, bounds and subdivision; line/cubic intersections; curve-preserving clipping and Boolean regions. IEEE-754/tolerance-based, not certified exact arithmetic.

## Distribution

ESM with TypeScript declarations at `src/index.d.ts`. Install the supplied package tarballs together so exact sibling dependencies resolve locally. Packages are not yet published to a public npm registry.

```js
import * as Revector from '@revector/geometry';
```

## Public API

I, compose, inverse, transform, cubicAt, cubicSplit, cubicBounds, booleanPaths, clipCurveToPaths

The declaration file is the authoritative signature reference; source implementations and comments are shipped without minification. The full repository includes `examples/integration.ts`, a runnable workbench and CLI, fixtures, tests, and architecture/integration/rule-authoring documents.

## Contract

Use explicit diagnostics and source provenance when handling partially supported PDF content. A confidence score is not a calibrated probability; geometry preservation does not prove original CAD intent. Native conversion remains vector-first. Optional @revector/ocr adds inferred raster text and ruled lines with confidence and provenance.

Original package code: MIT; see `LICENSE`. Any included third-party notice remains applicable.

Performance ownership contracts and reproducible benchmarks: `docs/PERFORMANCE.md` in the repository.
