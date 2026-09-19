# GitHub Pages publication

The application is published at https://wieslawsoltes.github.io/RevectorStudio/.

`.github/workflows/pages.yml` builds and tests every push to `main`, uploads only `dist/`, and deploys through the official GitHub Pages Actions. The repository Pages source is **GitHub Actions**, not a branch directory. No personal token or external hosting service is required.

The build uses Node 22.16.0, the pinned TypeScript dependency and the checked-in PDF.js runtime. It validates the conversion engines, TypeScript consumer and DXF artifacts, then opens the production site under a `/RevectorStudio/` HTTP prefix using Chromium. Publication is gated on this check. After deployment, the same test opens the real public HTTPS site, confirms the deployed commit, observes both real browser workers, exercises all six DXF versions and page navigation, and independently audits a downloaded DXF using ezdxf.

Download the `pages-build-validation` and `pages-live-validation` Actions artifacts for screenshots and machine-readable results. `deployment.json` identifies the deployed commit and records SHA-256 hashes of the site files. An unsuccessful post-deployment check marks the workflow failed; it does not silently claim a healthy deployment.

## Source import

The complete reusable packages, CLI, documentation, fixtures, recorded validation outputs, sixteen npm archives and standalone HTML are tracked in the repository. Source payload hashes are recorded in `source-import.json`. The generated bundles and package archives were reproduced and verified against the supplied ZIP; the five visual artifacts were refreshed by the original validation harness in CI. Temporary transfer files and one-time import workflows were removed after the import succeeded. The original import is retained in Git history.

The publication commit also corrects `index.html` to resolve PDF.js assets relative to the document URL. Dynamic module imports would otherwise resolve a relative engine URL against the PDF adapter module directory.

To run locally:

```sh
node scripts/link-workspaces.mjs
npm start
```

To rebuild:

```sh
npm ci --ignore-scripts --include=optional
npm run build
```

The sixteen packages in `release/npm/` are installable tarballs. Pages publication does not publish them to the npm registry.

## Version 0.2 validation gates

CI and Pages run real browser OCR on a mixed raster/native-text PDF, rotated-page recovery, eleven color swatches and all six OCR-to-DXF versions. A separate Node test executes the CLI with native Canvas and the WASM OCR engine. The deployment workflow repeats browser OCR and color checks on the public HTTPS site. Runtime, core and English/German/Polish model files are served from `vendor/ocr/`; recognition does not upload document bytes.
