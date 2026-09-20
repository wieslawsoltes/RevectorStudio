# Conversion performance — 0.6.0

## What was measured

The reference is commit `3b3bf2101c92da8f50773fe62f14c092cf31b935` (0.5.0). No customer slow PDF was supplied. The suite has thirteen authored deterministic workloads: two actual vector PDF pages, accepted classifications, twenty unchanged-rule snapshots, joined line drawings, repeated Forms, compound fills, repeated complex clipping, repeated-color DXF serialization, grouped DXF parsing, spatial indexing, binary RGBA conversion and skeleton tracing. The real PDFs go through PDF.js, extraction, semantic conversion, serialization and preview parsing. No OCR is invoked by the performance benchmark; functional OCR remains in the acceptance suite.

CPU sampling identified whole-document `structuredClone`, recursive numerical validation and repeated spatial preparation as dominant costs. `artifacts/v0.6.0/performance/comparison.json` records actual same-runner before/after medians, individual measurements, output counts and hashes. `comparison.md` is its readable table. `equivalence.json` separately records 746 deterministic differential comparisons against the original checkout.

Each benchmark process warms each workload once and records three measured repetitions with explicit GC before timing. Input generation is excluded; correctness hashing is included. Both checkouts use Node 22.16.0 and the same runner. The raw DXF hashes must also match across checkouts. Stable hashes across repeated PDF openings normalize only per-document PDF.js `source.ref` hashes; every other serialized byte remains compared. This normalization is confined to the benchmark, not conversion output. RSS values are process-wide cumulative peaks and post-case observations, not claims of per-stage retained memory. CPU profiles and GC sampling overhead qualify profiled timing results.

Timing ratios are evidence, not universal promises or fragile CI pass/fail thresholds. Every hash, count, validation and correctness test is a hard gate. A changed expected output requires an explicit baseline review; the suite does not silently update its own expectations.

## Optimized paths and safety contracts

### Semantic transactions

`RuleEngine.run` takes one detached input copy. Internal transactions copy only modified entities and collection shells, retaining original history and candidate states. Public `commitCandidate` still returns a fully detached result. Mutation is not exposed to plugins: rules receive detached, deeply frozen snapshots. Snapshot branches are reused only when their owned source branch has not changed. A private WeakSet marker distinguishes those snapshots from ordinary shallow-frozen external inputs.

Numerical validation memoization belongs to one immutable ownership session. IDs, layers, blocks, groups, asset references and shape contracts are checked on every transaction. The public `validateDocument` never caches mutable caller data. Block dependency validation uses iterative tri-color DFS, visits shared tails once, and does not overflow the JavaScript stack on deep block DAGs. Conflicting transactions cannot leak modifications into later candidates. Candidate IDs use a Set; ordered insertion uses an anchor map instead of scanning every addition for every entity.

Collection-shell copying and structural checks still scale with model size per general transaction; this is not a claim that arbitrary dependent semantic rewrites have become constant-time. All candidate and geometry budgets remain enforced.

### Geometry and document analysis

Repeated clipping compiles transformed clip boundaries once per lowering run. Prepared path queries hold a detached source snapshot, precompute edges, and use conservative control-hull boxes plus a static BVH to prune ray/intersection tests. The exact existing polynomial tests, root tolerances, de Casteljau subdivision and fill rules remain authoritative. Curve output is not replaced by polygons. Boolean broad-phase indexing also avoids the shared-minimum-X pathology of a flat active list.

The deterministic BVH uses in-place median selection with a bounded sort fallback, rather than recursively sorting/copying the entire subtree. Leaf and query ordering agree with the original implementation, including ties. Form folding indexes source membership and emits final paint order once; repeated-symbol matching uses a precomputed paint-order map. Unchanged immutable document rules share text spatial analysis and straight-segment preparation. Mutable external detector inputs never reuse these caches.

### DXF and color

Per-export ACI lookup caching uses exact RGB keys and scalar distance arithmetic; near-black bytes are not interpreted as normalized colors. ASCII and XDATA fast paths preserve UTF-16 DXF escapes, control sanitization and byte limits. Group/asset/layer lookups are indexed. The reader scans directly into section records without a generator, full lines array or intermediate section-pair copies. Small records use allocation-free scalar scans; large records use first-occurrence tag maps, and repeated geometry tags retain their original order. Object records and GROUP metadata are decoded once.

Model validation, round-trip parsing and color auditing are still performed. No comparison viewport shortcut replaces the serialized DXF with a source intermediate.

### Raster, OCR and PDF resources

Binary RGBA conversion no longer allocates an array per pixel. Skeleton thinning compacts its active foreground list between complete iterations, preserving scan order, output graph and original logical work-budget accounting. Tesseract itself, OCR DPI, languages, recognition thresholds, image resampling and appearance DPI are unchanged.

Independent font resources resolve with bounded concurrency (default eight, configurable 1..32) instead of serial waits. Font results are assembled in source order for deterministic output. Per-resource deadlines default to the original 15 seconds; cancellation rejects with AbortError instead of poisoning the cache with fallback fonts. Metadata reads overlap independent waits. The existing page cache now updates recency on hits and remains page-count bounded.

### Workbench and worker lifecycle

Successful idle conversion workers retain loaded code for reuse. Input scenes are still structured-cloned on every message; the public API does not assume that a reused caller object is immutable. Busy cancellation, execution errors and deserialization errors terminate the worker; dispose also releases an idle worker. Stale replies and previous abort signals cannot settle a new request. Idle worker faults retire that worker.

The PDF reference canvas is reused only for the same workbench-owned scene, source and page. Fresh extraction invalidates it. Changed CAD scale/units update its world box without repainting unchanged PDF pixels. Old canvases are released on replacement, document change and disposal. This cache does not cache converted DXF or bypass newly selected rules, versions or fidelity settings.

`convertPdf` reports open, extraction, raster-preservation, OCR, appearance and complete-pipeline time in addition to kernel phases. `convertScene` separates geometry, semantics, representation, model validation, serialization, round-trip and color auditing. `uiTotalMs` includes workbench preparation and reference rendering; `pdfReferenceReused` reports reuse explicitly. Reported pipeline time ends before source disposal; it is not file-picker time. The status bar no longer presents kernel-only time as end-to-end UI latency.

## Reproduction

```sh
npm ci --ignore-scripts --include=optional
npm run build
npm test
npm run test:types
npm run test:performance:browser
npm run bench -- --warmups 1 --repeats 3 --output artifacts/performance-single.json
```

For a same-machine historical comparison, create an isolated checkout at the reference commit, install its locked dependencies there, and run:

```sh
node scripts/verify-performance-equivalence.mjs \
  --baseline /path/to/baseline --output /tmp/revector-equivalence.json
node scripts/compare-performance.mjs \
  --baseline /path/to/baseline --output /tmp/revector-fresh-comparison
```

The comparison output directory must not contain previous benchmark results. Add `--profile` to produce Node/V8 `.cpuprofile` files for both processes; use unprofiled runs for headline timings. `npm run bench -- --case semantic-classification` isolates a workload. The committed stress fixture can be regenerated with `python tests/performance_fixture.py` and inspected independently.

The dedicated performance workflow runs comparisons without invoking OCR or modifying source. CI continues to run actual OCR, color, image, sampled-appearance and independent DXF audits; Pages verifies the new worker/reference-cache suite against the real HTTPS deployment. Prior font substitutions, PDF.js rendering limits, sampled appearance qualifications and unresolved engineering ambiguity remain unchanged. This is a performance release, not a new claim of universal semantic or commercial-CAD fidelity.
