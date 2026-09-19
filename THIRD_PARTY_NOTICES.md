# Third-party notices

## Revector

Original source, UI and fixtures are distributed under the root MIT license. Each npm package includes its own copy. The project is independent of Mozilla, Autodesk and the vendors named by advisory PDF producer signatures.

## PDF.js

Copyright Mozilla Foundation and contributors; Apache License 2.0. Full license: `vendor/pdfjs/LICENSE`. The vendored modules preserve their upstream headers. `vendor/pdfjs/BUILD.json` identifies the exact official development build used. CMap/ICC/decoder directories retain available upstream notices. A copy of this third-party license is embedded with the standalone HTML for distribution clarity.

PDF.js includes runtime code and data derived from other projects as documented in its upstream source and file notices. Revector does not claim ownership of those components. The two PDF.js module variants share the upstream license. No font programs are distributed.

## ezdxf numeric ACI palette

`packages/dxf/src/aci.js` includes AutoCAD Color Index numeric data from ezdxf. Copyright Manfred Moitzi and contributors; MIT. The complete notice is `packages/dxf/LICENSE.ezdxf` and is included in the DXF npm tarball. ezdxf itself is a development-time independent validator, not a browser runtime dependency.

## Development tools

TypeScript is a build/type-check dependency, not vendored in the release source. Python ezdxf, Playwright, PyMuPDF and the system browser are used for validation; their packages and font installations are not included. Original screenshots are generated from the application and project-owned fixture.
