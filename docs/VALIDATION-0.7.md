# Version 0.7.0 performance acceptance

The source passed 226 Node tests with zero failures or skips, strict TypeScript checking, 1,454 exact differential comparisons and sixteen correctness-hashed benchmarks against v0.6 commit `f3dcd9fa6ecdfc4e2944379d0b59b177b7395ad7`. Both benchmark processes ran without CPU-profile instrumentation on the same GitHub runner, with one excluded warmup and three measured repetitions. Separate profiles are retained for four bottleneck workloads.

## Same-machine v0.6 to v0.7 performance

| Workload | Before (ms) | After (ms) | Speedup |
|---|---:|---:|---:|
| semantic-metadata-groups | 1099.2 | 80.5 | 13.66× |
| dense-table-grid | 448.3 | 25.3 | 17.69× |
| sauvola-2mp | 52.3 | 59.2 | 0.88× |
| real-pdf-linework | 235.4 | 236.1 | 1.00× |
| real-pdf-text-fill | 207.9 | 203.7 | 1.02× |
| dxf-read-groups | 39.1 | 38.8 | 1.01× |
| binary-rgba | 15.4 | 15.7 | 0.98× |
| semantic-classification | 270.9 | 50.2 | 5.39× |
| unchanged-rule-snapshots | 91.0 | 90.8 | 1.00× |
| joined-line-drawing | 351.7 | 389.6 | 0.90× |
| repeated-forms | 92.1 | 94.6 | 0.97× |
| compound-fill | 36.2 | 28.3 | 1.28× |
| shared-complex-clipping | 16.9 | 21.0 | 0.80× |
| dxf-repeated-colors | 162.8 | 153.6 | 1.06× |
| spatial-build-query | 55.1 | 52.9 | 1.04× |
| raster-skeleton | 74.0 | 56.1 | 1.32× |

Authored fixed workloads; no user-supplied slow PDFs and no OCR invoked. Full correctness hashing is inside each timing. Raw PDF SHA-256 matches across checkouts; stable per-repeat digests normalize only PDF.js per-instance source.ref hashes. RSS is cumulative per process, not per-case retained memory. Timing ratios are reported, not fragile CI assertions.

## Browser, OCR and export checks

The original 35-check workbench harness uses its established inline/blob transport; it is not evidence of dedicated HTTP workers. Separate real HTTP suites pass 21 OCR/color, 14 tiled OCR, 23 native IMAGE, 14 sampled appearance and 14 performance/ownership/cancellation checks. The native OCR and IMAGE/appearance CLI, fresh five-case pinned corpus and independent baseline DXF audit passed. The baseline audit covers 35 generated files with zero errors or automatic fixes. Pages repeats the real browser suites on the deployed HTTPS revision; local success does not imply public deployment.

## Scope and ownership

Metadata-only proposals reuse privately owned transaction indices after complete preflight. General geometry-changing proposals and the public transaction API retain canonical validation. Frozen plugin snapshots, history, rollback, layer first-wins and exact DXF output are preserved. Table output, half-open text membership and thresholded raster pixels match the original implementation. Sauvola accumulator storage for 2000 by 1000 pixels falls from 32,048,016 to 32,000 bytes; this is scratch storage, not total OCR memory. Single-rule proposal iteration now cooperatively yields, without claiming that every synchronous callback is preemptible.

No customer slow PDF was supplied. Timing ratios are observations, not CI gates or universal speed promises; unchanged workloads can be slower from noise. OCR recognition throughput was not measured, and model/languages/DPI/threshold settings are not lowered. General transactions, PDF rendering, pathological geometry and large raster allocation remain workload-dependent. All sixteen 0.7.0 archives were integrity-checked and imported in a clean offline consumer. No npm registry write was attempted.

Evidence: `artifacts/v0.7.0/`. Source acceptance workflow: https://github.com/wieslawsoltes/RevectorStudio/actions/runs/35534383916.
