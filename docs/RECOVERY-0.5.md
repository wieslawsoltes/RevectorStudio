# Revector 0.5 — appearance, bounded curve recovery, crossing hypotheses and acceptance tooling

## Representations are explicit

The **VIEW** selector distinguishes native-only CAD, **Appearance + CAD**, and **CAD + reference**. Appearance mode runs the complete PDF.js page compositor at a declared DPI and exports its opaque sRGB PNG as a native DXF IMAGE on a separate layer. Native geometry and semantic proposals are still exported on their own layers; they are initially off in appearance view. In semantic view the reference layer is initially off instead. Do not enable both representations and interpret overlapping paint as a fidelity error.

Full-page composition preserves the PDF.js-rendered contribution of soft masks, blending, isolated/knockout groups, stencil/atlas image operations, transfer functions, gradients, Type 3 glyphs and text clipping. These features cannot in general be represented as independently editable standard DXF primitives. The implementation does not pretend otherwise. It is a resolution-qualified appearance, not native reconstruction of masks, byte-identical image streams, original font programs, original diagram constraints or equality at arbitrary zoom.

The source paint intermediate is unchanged. Appearance assets have SHA-256 integrity, source fingerprints, page/OCG/annotation state, actual inverse pixel mapping, rendering version, DPI and original diagnostics. Fractional page dimensions and ceil-rounded image dimensions preserve the exact top-left alignment. Budgets reject an oversized requested resolution rather than silently downsampling. Owned canvases are released on success, exceptions and cancellation. Pure XFA still requires its separate DOM renderer; the Canvas path explicitly refuses to certify it.

Known visual-limitation diagnostics can be downgraded to warnings **only** when this explicitly selected alternative representation is exported. Their original severity and semantic-layer limitation remain recorded. Unknown operators, structural corruption, invalid geometry and exceeded budgets stay fatal. `--strict-semantics` disables even the visual downgrade. Source opacity on hidden geometry may still be unrepresentable in DXF 2000; its error is retained. A reference PNG does not make the hidden native geometry exact.

```sh
npm run convert -- --input drawing.pdf --output appearance.dxf \
  --appearance --appearance-dpi 144 --version 2018 --strict
```

The default appearance sampler uses 144 DPI, 32 million pixels, a 16,384-pixel side bound and 64 MiB encoded PNG budget. The host API exposes these controls. The renderer's supported PDF feature set remains the ultimate bound on the appearance path. No comparison with an independent commercial PDF renderer is implied by agreement with the same PDF.js reference.

## Bounded curve reconstruction

`fitCircularPolyline` normalizes input coordinates, solves a least-squares circle, requires monotone angular traversal, and certifies a bound from endpoint radial residual and each chord's sagitta. Unsupported angular spans, sparse polygon-like samples and excessive residuals are rejected. Returned clockwise paths have their DXF arc endpoints mapped to the required counterclockwise representation; source direction remains evidence.

`fitCubicPolyline` solves endpoint-constrained cubic least squares with chord-length parameterization, then certifies every complete source segment. On each parameter interval, it subtracts the degree-elevated source line from the restricted Bézier segment. The maximum norm of the four difference control points bounds the continuous distance using the Bernstein convex-hull property. Segments that fail tolerance are split under explicit sample, output-segment and work budgets. Tolerance is not relaxed when a budget is exceeded. Joins are C0, not promised C1/C2. Neither fitter proves the absence of newly introduced intersections.

The `cad.sampled-curves` rule proposes ARC/CIRCLE or cubic SPLINE replacements only for raster-derived polylines by default. Set `fitNativePolylines:true` to allow printed vector polylines. Exact transcription profiles bypass the rule. Replacements require review; they preserve source membership and their numerical evidence. Bounds are relative to the supplied sampled polyline, **not** the unknowable original CAD curve or scan's physical dimensions.

```js
import {fitCircularPolyline,fitCubicPolyline} from '@revector/geometry';
const circle=fitCircularPolyline(points,{tolerance:0.02,closed:true});
const splines=fitCubicPolyline(points,{tolerance:0.02,maxSegments:2048,signal});
```

## Crossing semantics: alternatives instead of invented connectivity

`document.junctions` spatially indexes straight segments and identifies endpoint joins, tees and full crossings. Filled round markers provide additional connection evidence; an unfilled circle is not a junction dot. Ports retain incident entity/segment IDs, direction, endpoint status and line parameters. Conflicting marker or geometry evidence stays ambiguous. Degenerate, bulged or excessively complex input is bounded or excluded.

An unmarked X defaults to `unknown` with connected/not-connected alternatives. An explicit `crossingPolicy:'connect'|'cross'` is recorded as a user convention, not recovered authorial intent. Proposals add metadata GROUPs without cutting or merging the native geometry. This closes the missing ambiguity representation; it does not turn an information-theoretically ambiguous crossing into known engineering meaning.

There are twenty built-in rules: nine CAD and eleven document rules. Existing ruled/borderless tables, lists, fields, diagram containment, engineering notation, blocks and tags remain available.

## Original source archive

`--archive-source` and the Project option include the **exact original PDF bytes**, SHA-256 and an explicit warning in the DXF package. This preserves the original compressed resources in their original document. It is not separate raw-JPEG/JPX/font extraction. Source archival is off by default: original PDFs may contain hidden layers, attachments, sensitive metadata and content not visible on the selected page. An archive of an original file is not a redacted deliverable. PNGs used by the CAD view remain decoded display assets.

```js
import {packageDxf} from '@revector/dxf';
const bundle=packageDxf(document,{filename:'drawing.dxf',version:'2018',sourcePdf:originalBytes});
// bundle.manifest.sourceArchive identifies the exact retained source.
```

## Corpus and external CAD acceptance

`python scripts/validate-corpus.py examples/corpus.json --output artifacts/corpus` validates a SHA-pinned corpus. Every case specifies source, page, format, representation and optional entity-count/diagnostic contracts. Outputs pass an independent ezdxf audit with **zero automatic repairs**. Sidecars are checked against manifest hashes. Case IDs and paths are constrained and old output directories are rejected to prevent stale evidence. No OCR is invoked by this five-case corpus.

Supply `--cad-adapter /path/to/trusted-adapter.json` for an installed, licensed CAD import/regeneration tool. The adapter names an executable, `versionArguments`, `expectedVersion`, and `arguments` containing `{input}` and `{output}`. The tool runs without a shell, its version is checked, it must create a regenerated DXF, and that result is independently audited against entity contracts. Tool execution is never inferred from the existence of an old file. `--require-commercial` reports blocked cases without an adapter. The file must be trusted: it expressly authorizes execution of its configured program. Test doubles validate this adapter contract only; they do not establish commercial CAD compatibility.

This delivery includes authored regression evidence. Customer corpus coverage and licensed commercial CAD validation are distinct acceptance records and must not be claimed on the basis of ezdxf alone.

## npm publication

All sixteen packages are versioned 0.5.0 with repository metadata, exact local dependencies, SHA-256/SHA-512 manifests and installable archives. `scripts/publish-npm.mjs` verifies **all** archives before any publication, orders dependencies, uses the existing `@revector` scope and the `next` dist-tag, verifies registry integrity, and refuses to overwrite a different immutable version. It supports idempotent retries of an interrupted multi-package publication. A dry run is not registry publication.

`publish-npm.yml` uses a GitHub-hosted runner with OIDC and provenance, optionally the existing `NPM_TOKEN` secret. npm-side trusted-publisher configuration and permission to publish the existing scope must belong to the repository owner. No credentials are created or leaked, and no alternate scope is selected automatically. Per-package registry outcomes are uploaded as `npm-publication`; the final response must distinguish a successful build, a dry run and actual publication.

## Primary references

- PDF.js display/render API: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
- Autodesk DXF LAYER: https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-D94802B0-8BE8-4AC9-8054-17197688AFDB.htm
- Autodesk DXF SPLINE: https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers/
