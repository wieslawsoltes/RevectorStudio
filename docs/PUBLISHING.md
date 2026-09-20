# Publication and performance acceptance

## GitHub Pages

The application is served at https://wieslawsoltes.github.io/RevectorStudio/.

`pages.yml` builds and validates main, uploads `dist/`, and deploys with the official Pages Actions. The build uses Node 22.16.0, the lockfile, checked-in PDF.js and pinned self-hosted OCR resources. Documents are not uploaded to an OCR service.

CI retains the original workbench, OCR/color, tiled OCR, IMAGE, appearance, native CLI and independent DXF checks. Version 0.7 retains those gates and extends performance acceptance with indexed metadata transactions, dense-table membership, rolling Sauvola and single-rule cancellation. The source acceptance record is in [VALIDATION-0.7.md](VALIDATION-0.7.md); the earlier [0.6 record](VALIDATION-0.6.md) is retained separately.

After deployment, six browser suites navigate to the public HTTPS application: base deployment, OCR/colors, tiled recovery, native images, sampled appearance and conversion performance behavior. The base suite checks the exact deployed commit. The new suite verifies actual worker reuse, PDF-reference cache hits/invalidation, world-coordinate rescaling, allocation release, hard cancellation/recovery, single-rule timer cancellation and exact browser Sauvola pixels. No fabricated conversion results or local inline harness substitute for this public-site gate.

Download the Actions artifacts `revector-validation`, `pages-build-validation` and `pages-live-validation` for per-run evidence. The latter includes `performance-live/`. `deployment.json` records the exact revision and static-file hashes. A failing post-deployment test marks the workflow failed.

## Reproducible performance measurements

`performance.yml` is a read-only workflow that compares the checked-out source with the isolated 0.6.0 baseline at `f3dcd9fa6ecdfc4e2944379d0b59b177b7395ad7`. It installs separate workspace dependency links, performs 1,454 differential checks and runs sixteen unprofiled before/after workloads on the same runner. It does not invoke OCR, alter source, publish packages or reduce conversion quality.

The `conversion-performance` artifact binds measured samples and correctness hashes to a commit. Ratios are observations rather than timing-based pass/fail limits; output equivalence is mandatory. Future intended semantic/output changes require explicit review of the historical baseline. The workflow also captures separate V8 profiles for four bottleneck workloads without instrumenting headline benchmark timings. Historical 0.5-to-0.6 ratios are not multiplied by the new 0.6-to-0.7 results from a different runner. See [PERFORMANCE-0.7.md](PERFORMANCE-0.7.md) for methodology, scope and reproducible commands.

## npm distribution and registry status

Sixteen version 0.7.0 package archives, exact dependency metadata and integrity manifests are tracked in `release/npm/`. Source acceptance installs and imports them in a clean offline consumer. CI also validates publication through a dry run. Neither step establishes registry publication.

The performance release does not change `.releases/npm.json` and does not retry registry publication. The previous 0.5.0 release intent and `publish-npm.yml` remain available; that actual attempt failed with ENEEDAUTH. Publishing a new release requires owner-authorized npm access and an updated release intent binding the accepted version, commit and archives. No credentials are created, printed or transferred, and no alternate scope is selected automatically.

## External acceptance remains distinct

The included corpus consists of SHA-pinned authored regression fixtures, not exhaustive customer PDFs. `scripts/validate-corpus.py` validates fresh CLI output, expected entities/diagnostics, zero-repair DXF audits and image sidecars. Its optional trusted adapter requires an installed licensed CAD executable, verifies its version and audits newly regenerated output. No commercial CAD run is implied by ezdxf checks or adapter availability. The previous appearance and OCR qualifications remain unchanged by the performance release.

## Local use

```sh
node scripts/link-workspaces.mjs
npm start
```

```sh
npm ci --ignore-scripts --include=optional
npm run build
npm test
npm run test:performance:browser
npm run bench -- --warmups 1 --repeats 3
```

One-time transfer workflows are removed after source acceptance succeeds. Historical validation records stay in their original version directories. The standalone HTML includes the PDF engine but still needs adjacent OCR resources for optional recognition. Exact source-PDF archival remains opt-in and is not redaction.
