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
