# Version 0.4.0 validation

The source update passes 150 Node unit/integration tests with zero failures, strict TypeScript checking, 35 original UI assertions, 21 OCR/color assertions, 14 tiled/deskewed OCR assertions, and 23 new IMAGE/linework browser checks. The new browser suite uses real HTTP navigation; no inline transport is used for the GitHub Actions acceptance gate.

## Native raster images

Two authored PDF pages each retain four image paints and their native vector. Repeated resources share image definitions; clipped/alpha variants get distinct PNG assets. Both pages export in all six selectable DXF generations: twelve independent audits pass without errors or automatic fixes, and all IMAGE reactors and external files resolve. Reflections, shear, CropBox, UserUnit and page rotation are exercised. The native Node CLI separately passes four page/version cases.

Thirteen RGBA sample points per page agree with the PDF.js reference within two byte levels per channel. Twenty-one additional sample points cover ICCBased RGB, CMYK and the interpolation flag. These are measured reference agreements, not certification of every ICC profile, transparency group, blend mode or CAD importer. Preserved images are sRGB PNG resources, not the original compressed PDF streams. Unsupported image states are diagnosed or rejected in strict mode.

## Raster paths and semantics

Deterministic regressions exercise thinning, diagonal strokes, branches, loops, isolated pixels, graph edge coverage, simplification and budgets. The browser test validates estimated linework and source provenance without invoking OCR; established suites independently validate actual Tesseract recognition. Contour-semantic regressions cover circles, concave polygons, boundary endpoints, overlapping regions and malformed candidates. Centerline tracing is inferred geometry, not exact CAD reconstruction.

## Distributions

All sixteen 0.4.0 npm tarballs were installed and imported in a clean offline consumer and their SHA-256 hashes verified. They have not been published to the npm registry. The general independent baseline DXF audit covers 35 generated files; that corpus is separate from image-specific audits.

Machine-readable evidence is in `artifacts/v0.4.0/`. The source-update workflow is https://github.com/wieslawsoltes/RevectorStudio/actions/runs/35495075433. Public deployment is verified separately by the Pages workflow.
