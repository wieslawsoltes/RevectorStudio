# Publication and external acceptance

## GitHub Pages

The application is served at https://wieslawsoltes.github.io/RevectorStudio/.

`.github/workflows/pages.yml` builds and validates each push to main, uploads `dist/`, and deploys with the official Pages Actions. Publication uses the GitHub Actions Pages source. The build uses Node 22.16.0, the lockfile, the checked-in PDF.js runtime and pinned self-hosted OCR resources. PDF bytes are not uploaded to an OCR service.

CI runs 177 source regressions, strict TypeScript, the original workbench, OCR/color and rotation, tiled OCR, native IMAGE retention, sampled appearance, native CLI exports, independent DXF audits, SHA-pinned corpus validation, packing and a publication dry run. Corpus runs use a new temporary output directory; checked-in historical results cannot satisfy a fresh regeneration test.

After deployment, five browser suites navigate to the actual public HTTPS application: base deployment, OCR/colors, tiled recovery, native images and sampled appearance. They check the deployed commit, actual browser workers, six DXF versions, local assets and independently audited exports. The appearance suite compares full aligned RGBA buffers on its two authored pages, not only selected pixels. This establishes sampled agreement with the PDF.js reference, not independent PDF-renderer certification or native recovery of masks/blends.

Download `revector-validation`, `pages-build-validation` and `pages-live-validation` artifacts for per-run reports and screenshots. `deployment.json` records the deployed commit and hashes the static files. A failing post-deployment test is reported as a failure, not silently accepted.

## npm registry

All sixteen version 0.5.0 packages and their SHA-256/SHA-512 manifests are in `release/npm/`. The checked-in archives were generated from accepted source and imported in a clean offline consumer. Packing or a dry run does not publish them.

`.github/workflows/publish-npm.yml` runs on an explicit change to `.releases/npm.json` or a manual dispatch on main. The intent binds the version, scope, dist-tag and accepted source commit. The workflow refuses source/archive drift. It installs npm 11.5.1 on Node 22.16.0, requests OIDC provenance, uses no release caches, and can use an existing `NPM_TOKEN` secret as an authorized fallback. The scope remains `@revector`; no alternate namespace or registry is selected automatically. Publication uses `next`, not `latest`.

Before any network write, `scripts/publish-npm.mjs` verifies every archive, repository identity and exact local dependency graph. It publishes in dependency order, verifies registry SHA-512 integrity, skips already-identical versions and refuses to overwrite different immutable content. Partial releases can be retried. Actual registry outcomes are uploaded as `npm-publication/validation.json`; a failed authentication/permission check is not a successful publication.

The repository owner must authorize the scope and the npm-side trusted publisher for `wieslawsoltes`, `RevectorStudio`, workflow filename `publish-npm.yml`. npm configurations created after 3 September 2026 default to staging permission; direct `npm publish` must also be permitted. Alternatively, an owner-configured granular token needs the relevant package publishing permissions. This workflow does not create credentials or change npm account permissions.

Primary npm instructions: https://docs.npmjs.com/trusted-publishers/ and https://docs.npmjs.com/generating-provenance-statements/.

## Commercial CAD and customer corpora

The five included SHA-pinned cases are authored regression fixtures, not an exhaustive customer corpus. `scripts/validate-corpus.py` checks source integrity, actual CLI output, expected entities/diagnostics, zero-repair ezdxf audits and image sidecars. Its optional `--cad-adapter` executes an explicitly supplied, installed licensed CAD tool, checks its version, requires a newly regenerated DXF and audits that output. `--require-commercial` fails when that independent check cannot run. No commercial CAD execution is implied by an ezdxf result or by the existence of the adapter code. See `docs/RECOVERY-0.5.md` for the adapter contract.

## Local use

```sh
node scripts/link-workspaces.mjs
npm start
```

```sh
npm ci --ignore-scripts --include=optional
npm run build
```

One-time source transfer workflows are removed after a successful import; history retains the accepted source and validation records. The standalone HTML includes the PDF engine but still needs adjacent OCR resources for optional recognition. Exact source-PDF archival is opt-in and can include hidden/private original content; it is not redaction.
