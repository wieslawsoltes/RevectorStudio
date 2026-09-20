# Version 0.6.0 performance acceptance

The source update passed 206 Node unit/integration tests with zero failures/skips, strict TypeScript checking, 746 exact differential checks against v0.5.0 and thirteen correctness-hashed before/after benchmarks. Both measured processes ran without CPU-profile instrumentation; separate profiles are supplied. Median times use one excluded warmup and three measured repetitions on the same GitHub runner. Timing ratios are observations, not brittle CI gates.

# Same-machine conversion performance

| Workload | Before (ms) | After (ms) | Speedup |
|---|---:|---:|---:|
| real-pdf-linework | 5688.8 | 242.1 | 23.49× |
| real-pdf-text-fill | 691.2 | 219.5 | 3.15× |
| dxf-read-groups | 55.4 | 78.5 | 0.71× |
| binary-rgba | 79.0 | 17.4 | 4.54× |
| semantic-classification | 7676.9 | 279.8 | 27.44× |
| unchanged-rule-snapshots | 751.1 | 92.3 | 8.14× |
| joined-line-drawing | 12770.3 | 366.0 | 34.90× |
| repeated-forms | 421.9 | 92.6 | 4.55× |
| compound-fill | 178.2 | 29.3 | 6.08× |
| shared-complex-clipping | 105.8 | 22.6 | 4.68× |
| dxf-repeated-colors | 395.1 | 155.8 | 2.54× |
| spatial-build-query | 97.8 | 56.0 | 1.75× |
| raster-skeleton | 87.0 | 78.3 | 1.11× |

Authored fixed workloads; no user-supplied slow PDFs and no OCR invoked. Full correctness hashing is inside each timing. Raw PDF SHA-256 matches across checkouts; stable per-repeat digests normalize only PDF.js per-instance source.ref hashes. RSS is cumulative per process, not per-case retained memory. Timing ratios are reported, not fragile CI assertions.

## Browser and export gates

Actual HTTP browser tests passed: 35 original UI checks, 21 OCR/color checks, 14 tiled OCR checks, 23 native IMAGE checks, 14 sampled-appearance checks and 11 new worker-reuse/reference-cache/cancellation checks. The native CLI, SHA-pinned corpus and independent baseline audit passed; the latter contains 35 generated DXFs with zero errors or automatic fixes. Full tolerances, rules and validation are retained.

All sixteen 0.6.0 package archives were verified, installed and imported in an isolated offline consumer. No npm registry publication was attempted. No customer slow PDF was supplied; the measurements cover authored representative workloads. OCR recognition throughput was not benchmarked and its model/settings remain unchanged. General structural validation and transactional shell copying remain linear per accepted candidate; degenerate geometry and very large rasters can still be expensive. See PERFORMANCE.md for ownership, cancellation, budget and timing details.

Evidence: `artifacts/v0.6.0/`. Source acceptance run: https://github.com/wieslawsoltes/RevectorStudio/actions/runs/35511017059. Public HTTPS deployment is a separate gate.
