# Same-machine conversion performance

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
