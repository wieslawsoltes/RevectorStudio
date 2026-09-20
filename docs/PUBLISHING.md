# GitHub Pages publication

The application is served at https://wieslawsoltes.github.io/RevectorStudio/.

`.github/workflows/pages.yml` builds and validates every push to `main`, uploads `dist/`, and deploys through the official GitHub Pages Actions. The repository Pages source is **GitHub Actions**, not a branch directory. No personal token or external hosting service is required.

The build uses Node 22.16.0, the npm lockfile and checked-in PDF.js runtime. OCR runtime/model resources are restored from pinned dependencies with their licenses and SHA-256 inventory. Recognition loads assets from the application origin; document bytes are not uploaded to an OCR service.

## Validation gates

CI runs source regressions, the strict TypeScript consumer, the original workbench tests, actual raster OCR, color-space swatches, rotated-page OCR, tiled small-angle deskew, native image retention, general linework recovery, Node CLI OCR/IMAGE exports, independent DXF audits and npm packing. Pages validates the production build under an HTTP repository prefix before uploading it.

After deployment, four browser suites open the actual public HTTPS application. They confirm the deployed revision, real PDF and conversion workers, all six DXF versions, page navigation, rendered content, raster/native duplicate suppression, color swatches, rotated scans, tiled deskewed OCR, retained native raster resources, correct image definitions/reactors and independently valid downloaded DXF packages. An unsuccessful post-deployment check marks the workflow failed; it does not silently claim a healthy deployment.

Download `revector-validation`, `pages-build-validation` and `pages-live-validation` Actions artifacts for screenshots and JSON reports. The latter includes `pages-live/`, `extensions-live/`, `recovery-live/` and `images-live/`. `deployment.json` identifies the deployed commit and records SHA-256 hashes of site files. See [the v0.4 validation record](VALIDATION-0.4.md) for measured results and test scope.

## Source and distributions

All sixteen reusable packages, CLI, documentation, fixtures, generated workbench bundles, validation outputs and npm archives are tracked. `source-import.json` records the historical original import; its hashes are not invariants for subsequently edited source. One-time transfer and upgrade workflows are removed after their commits succeed. Their records remain in Git history. The read-only source-snapshot workflow is available for reproducible archive retrieval.

```sh
node scripts/link-workspaces.mjs
npm start
```

To rebuild with OCR assets:

```sh
npm ci --ignore-scripts --include=optional
npm run build
```

The sixteen version 0.4.0 files in `release/npm/` are installable package tarballs, with manifest and checksums. Pages publication does not publish them to the npm registry. The standalone HTML still requires adjacent OCR assets for optional raster recognition; the deployed static site includes those assets.

## Raster image and linework gates

CI and Pages run `test:images` against a real HTTP site, plus `test:images:cli` against the native Node CLI. The tests retain source resource pixels rather than substituting a page screenshot; they check native vector separation, affine image placement, clipping, alpha, source ICC/CMYK colors, image interpolation, PNG assets, shared definitions, reactors, all six DXF versions and a portable UI ZIP download. The same image browser suite is repeated on the public HTTPS deployment and included in `pages-live-validation`. The baseline color audit explicitly does not certify IMAGE pixel equivalence; pixel comparisons are separately reported by these regression tests.
