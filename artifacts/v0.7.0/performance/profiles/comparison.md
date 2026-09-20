# Same-machine conversion performance

| Workload | Before (ms) | After (ms) | Speedup |
|---|---:|---:|---:|
| semantic-classification | 240.9 | 61.4 | 3.92× |
| semantic-metadata-groups | 1107.1 | 85.2 | 13.00× |
| dense-table-grid | 427.6 | 26.8 | 15.97× |
| sauvola-2mp | 51.1 | 57.4 | 0.89× |

Authored fixed workloads; no user-supplied slow PDFs and no OCR invoked. Full correctness hashing is inside each timing. Raw PDF SHA-256 matches across checkouts; stable per-repeat digests normalize only PDF.js per-instance source.ref hashes. RSS is cumulative per process, not per-case retained memory. Timing ratios are reported, not fragile CI assertions.
