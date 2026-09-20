# Same-machine conversion performance

| Workload | Before (ms) | After (ms) | Speedup |
|---|---:|---:|---:|
| real-pdf-linework | 4070.2 | 174.7 | 23.30× |
| real-pdf-text-fill | 499.2 | 149.1 | 3.35× |
| dxf-read-groups | 49.0 | 30.1 | 1.63× |
| binary-rgba | 61.0 | 14.0 | 4.35× |
| semantic-classification | 5595.5 | 202.9 | 27.57× |
| unchanged-rule-snapshots | 563.9 | 68.8 | 8.20× |
| joined-line-drawing | 9309.9 | 261.7 | 35.57× |
| repeated-forms | 275.3 | 66.1 | 4.16× |
| compound-fill | 141.3 | 21.8 | 6.48× |
| shared-complex-clipping | 82.8 | 16.2 | 5.10× |
| dxf-repeated-colors | 314.8 | 119.6 | 2.63× |
| spatial-build-query | 74.1 | 22.7 | 3.27× |
| raster-skeleton | 57.5 | 50.4 | 1.14× |

Authored fixed workloads; no user-supplied slow PDFs and no OCR invoked. Full correctness hashing is inside each timing. Raw PDF SHA-256 matches across checkouts; stable per-repeat digests normalize only PDF.js per-instance source.ref hashes. RSS is cumulative per process, not per-case retained memory. Timing ratios are reported, not fragile CI assertions.
