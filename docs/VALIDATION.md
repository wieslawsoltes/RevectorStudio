# Delivery validation — 2026-09-18

## Executed results

| Check | Result | Evidence |
|---|---|---|
| Node unit/integration suite | 51 passed, 0 failed | `artifacts/node-tests.txt` |
| Functional Chromium workbench suite | 35 assertions passed; no uncaught browser exceptions | `artifacts/browser-validation.json` |
| Independent DXF audit, ezdxf 1.4.4 | 35 files; 0 errors, 0 automatic fixes | `artifacts/dxf-validation.json` |
| ZIP integrity / batch contents | ZIP CRC checks and contained DXF audits passed | `tests/validate_dxf.py`, `artifacts/dxf-test-log.txt` |
| Full standalone HTML | Decoded the actual embedded two-page PDF and exported AC1032 / 137 entities | `artifacts/standalone-validation.json` |
| TypeScript strict consumer | Passed with TypeScript 5.8.3 | `examples/integration.ts`, `artifacts/typecheck.txt` |
| Independent local npm installation | All 12 tarballs installed offline and all packages imported; DXF package round trip passed | `artifacts/package-validation.json` |
| Dedicated conversion kernel | Passed in Node worker_threads | Named test in `artifacts/node-tests.txt` |
| Source / workbench visual inspection | Two-page real source and two-panel workbench inspected | `artifacts/source-page-*.png`, `artifacts/workbench*.png` |

The independent DXF audit covers generated contract fixtures, full primitive fixtures, actual PDF conversions of both pages in all six versions, exports selected through the UI, CLI output, and a semantic-accepted drawing. Separate drawings inside the batch ZIP are also read and audited. File count is not a claim of 35 independent customer PDFs: **the input PDF corpus here is the original two-page project fixture**, supplemented by synthetic operator and model tests.

## What the tests exercise

Geometry checks include randomized affine inverse round trips; cubic evaluation/subdivision/extrema and roots; line/cubic/cubic intersections; clipping; all four Boolean operators; winding/hole cases; BVH queries and connected chains. Interpreter cases cover operator formats, state, clipping timing, text matrix/TJ spacing, optional-content layers, invisible text, group bounds, unsupported image/shading reports, budgets and cancellation.

Semantic tests cover dependency cycles, frozen snapshots, failed transaction rollback, constrained regex rules, multiple attribute append, per-instance block placement, group references and template matching. DXF tests include all six ACADVER targets, Unicode XDATA chunking, name collisions, colors/transparency, bulges, spline knots, cubic hatch edges, owners and block/group structures.

The real PDF integration checks recover six repeated forms on page one and eight rotated form placements on page two into one shared block per page. Native cubic controls survive the write/read round trip within the asserted 1e-9 coordinate tolerance. Full semantic acceptance produces real ATTRIB, DIMENSION and GROUP structures, rather than only UI labels.

The browser suite exercises source loading, actual exported-file rendering, curve inference accept/undo/redo, all version settings, downloads, layers, linked zoom, measurement, evidence inspection, JSON rules, page changes, native cubic HATCH, paper mode, physical scale changes, batch ZIP, project save/reopen and compact layout.

## Environment qualifications

Execution used Node 22.16, Chromium available in the delivery environment, PDF.js **6.4.172 development snapshot**, TypeScript 5.8.3, and ezdxf 1.4.4. Python dependency versions are pinned in `tests/requirements.txt`.

The host blocks normal browser navigation and browser Worker startup. Functional tests therefore use `page.set_content` with the actual application and decoder supplied as inline/blob modules. PDF.js performs real PDF decoding through its fake-worker transport; the workbench explicitly falls back to the same conversion kernel when browser worker startup is denied. Its dedicated worker bundle is separately exercised with Node worker_threads. This is **not** a claim that browser-worker startup, deployment CSP or every browser has passed on a normal hosted URL.

The source tree includes a GitHub Actions workflow to repeat the tests on an ordinary runner; it has not been pushed or executed remotely. To choose a Chromium installation, set `REVECTOR_CHROMIUM`; otherwise tests use a system Chromium when found or Playwright's managed browser. Install that browser with `python -m playwright install chromium`.

No AutoCAD, BricsCAD, MicroStation or other commercial CAD application was available for GUI import/regen/plot validation. No customer CAD-print corpus, encrypted-document corpus, font/script matrix, pathological fuzz corpus, accessibility audit, or million-entity performance qualification was performed. A structural DXF audit does not establish semantic correctness or identical plotted appearance.

## Reproduce

```sh
node scripts/link-workspaces.mjs
npm install --ignore-scripts --omit=optional
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
npm run build
npm test
npm run test:types
npm run test:browser
npm run test:dxf
npm run pack:all
```

Rebuilding retains the checked-in vendor snapshot. `npm run vendor` explicitly replaces it with the installed optional PDF.js release, and requires a new validation run. Byte identity of regenerated DXF files should not be assumed when names, settings or source fixture versions change; compare versioned models, contracts and numerical tolerances.
