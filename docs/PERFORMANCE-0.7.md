# Performance follow-up: 0.7.0

## Scope and baseline

This continues the 0.6.0 performance pass, rather than replacing or re-counting it. The pinned baseline is `f3dcd9fa6ecdfc4e2944379d0b59b177b7395ad7`; the profiling source snapshot is `baa492d5b7f378dc8f7f9a253f1d8bfa6a2840f9` (same implementation). The earlier copy-on-write transactions, immutable snapshots, compiled clipping, deterministic BVH, indexed DXF, parallel PDF font waits, worker reuse and unchanged-PDF-reference cache remain active.

No customer slow PDF was supplied. Sixteen deterministic workloads exercise real PDF conversion, classifications, accepted semantic groups, large ruled tables, curve clipping, fills, Forms, parsing/serialization, spatial indexing, binary conversion, Sauvola preprocessing and skeleton tracing. These measurements do not benchmark Tesseract recognition throughput. OCR settings, models, languages, resolution and confidence thresholds are unchanged.

## Indexed metadata transactions

Profiling showed that repeated `validate`, ID-map construction, collection copying and garbage collection remained expensive in large runs. General `applyCandidate` transactions still support arbitrary rewrites and use the canonical full structural validator. The private `MetadataTransactions` helper handles only a provable subset: semantic/layer property patches, layer creation and GROUP appends. IDs, entity types, geometry, attributes, block references and raster-asset references cannot change on this path.

At the first eligible candidate in a consecutive batch, the current model is fully validated and IDs/layers are indexed. New collection shells are owned by the batch. Every candidate is preflighted before any mutation: members and targets must exist, the new layer must resolve, recursive metadata numbers must validate, and GROUP members must resolve across model space, blocks and attributes. Sequential patches retain intermediate before-images and identical history/revision ordering. Layer definitions remain first-wins. Any unsupported shape or failed precondition goes through the original transaction, preserving its error order and rollback semantics. Invalid source models may still be repaired by that canonical fallback.

Unchanged immutable objects are not mutated. Only the private owned arrays and new entity objects change. The batch resets before the next rule snapshot; snapshots remain deeply frozen, detached from caller input and returned documents, and reusable only under valid ownership. Public `commitCandidate` remains fully detached. An intervening general transaction invalidates the indices. The conversion engine still validates the complete final model and the parsed exported DXF.

For eligible consecutive proposals this removes repeated O(model-size) collection scans. Work is proportional to initial model size plus touched entities/metadata and output history, rather than model-size times accepted-candidate count. This is not an incremental validator for arbitrary geometry rewrites.

Single large rules now check elapsed time every 32 consumed proposals and yield after approximately 8 ms of proposal work. This lets timers, UI activity and AbortSignal delivery interrupt the loop on the main-thread fallback. Snapshot construction, individual plugin calls and other synchronous stages can still block; this is not an 8 ms worst-case latency guarantee. Dedicated-worker cancellation retains hard termination.

## Large tables

The table detector caches the aligned source intervals per grid coordinate, but retains the original tolerance predicate, clipped-interval ordering, coverage arithmetic, and ambiguous/partial-border rejection. It does not merge nearby lines more aggressively.

After verifying rectangular union regions, each text center is located once by binary search in the elementary grid. Union-find resolves its merged cell. This replaces a full text scan and repeated bounding-box computation for each cell. Half-open boundaries, source membership, merged row/column spans, input order and stable text-sort ties are unchanged. Typical membership work changes from O(cells × text) to O(text × (log rows + log columns) + cells), excluding the existing bounded connectivity work.

## Raster preprocessing memory and throughput

Sauvola now maintains two column arrays for sums and squared sums, followed by a horizontal sliding window. The mean, variance, threshold arithmetic, grayscale rounding, alpha-to-paper composition, border truncation and equality predicate are unchanged. Integer byte sums and squared-byte sums are exactly representable in Float64 under the retained limits, so rolling and integral rectangle sums agree without approximation. Even window values retain their existing radius interpretation.

Accumulator storage changes from `16 * (width + 1) * (height + 1)` bytes to `16 * width` bytes. At 2000 × 1000 this is **32,048,016 → 32,000 bytes** for accumulator storage alone. Input RGBA, grayscale, binary output, Canvas and OCR-engine memory are additional and are not included in that calculation. The existing 8 megapixel Sauvola work limit and all other budget/deadline controls remain in force. Inversion modifies the newly owned grayscale buffer instead of allocating a second grayscale copy.

OCR word-color sampling uses scalar RGB access and integer palette keys instead of allocating slices/arrays/strings per sampled pixel; stable first-seen color ties remain unchanged. Duplicate suppression normalizes each word once rather than per overlapping pair. Decoding one-bit PDF resources likewise writes channels directly without a temporary array per pixel. These are preprocessing/data-movement changes, not a replacement recognition engine.

## Reproduction and evidence

```sh
npm ci --ignore-scripts --include=optional
npm run build
npm test
npm run test:types
npm run test:performance:browser
```

Create an isolated worktree at the pinned baseline and install its own locked workspace dependencies. The two checkouts must not share `@revector` workspace links. Then run:

```sh
node scripts/verify-performance-equivalence.mjs \
  --baseline /path/to/v06 --output /tmp/revector-equivalence.json
node scripts/compare-performance.mjs \
  --baseline /path/to/v06 --output /tmp/revector-performance \
  --warmups 1 --repeats 3
```

The extended differential suite contains 1,454 exact comparisons, including randomized Sauvola pixel arrays, table geometry/membership at multiple scales, mixed metadata/general transactions and canonical conflicts. Independent direct-window tests also check Sauvola, rather than relying solely on agreement with the old implementation.

All sixteen timed cases require matching output hashes and counts; the real PDFs also require identical raw DXF SHA-256. Input creation/warmup are excluded and correctness hashing is included. Full before/after reports expose all cases, including ones that did not improve. Both measurements run sequentially on one machine without profiling; separate `--profile` runs collect CPU profiles. Timings include GC effects and are observations, not CI thresholds or universal speedup promises. The earlier benchmark normalization of PDF.js per-open source references is confined to the benchmark, not the conversion output. RSS is process-wide, not a per-stage retained-memory measurement.

Actual HTTP/HTTPS browser gates additionally test large-rule timer cancellation, recovery, caller immutability and rolling Sauvola against direct sums. Functional OCR, color, image, appearance, native CLI and independent DXF/corpus checks continue unchanged. The established original-workbench suite still uses its explicit inline/blob harness; it is not evidence of a dedicated HTTP worker. Source acceptance, public deployment and npm publication remain separate statuses. No npm registry publication is part of this optimization request.

## Limits not concealed

General geometry-changing transaction validation still scans global structure. Dense overlapping neighborhoods, adversarial Boolean arrangements, very large native images and expensive PDF.js/Tesseract processing can still dominate. The benchmark corpus is authored, not every CAD printer or document type. A user's slow PDF and its conversion report (per-stage and per-rule timings) are needed to identify which remaining path dominates that particular document.

Primary profiling reference: Node.js command-line `--cpu-prof`, https://nodejs.org/api/cli.html#--cpu-prof . Tesseract resource-lifecycle guidance: https://github.com/naptha/tesseract.js/blob/master/docs/performance.md .

## Browser task fairness

The real Chromium cancellation regression caught a difference from Node: boosted `scheduler.yield()` continuations could consume all 20,000 candidates before a pending timer ran. The cooperative boundary now posts an ordinary `user-visible` task through `scheduler.postTask`, with Node `setImmediate` and timer fallbacks. A second abort check after the final rule's yield prevents returning stale success. This is cooperative scheduling, not preemption of a synchronous plugin callback or a universal latency bound. Browser evidence records the actual candidate count consumed before cancellation.

Primary scheduler behavior: https://developer.chrome.com/blog/use-scheduler-yield and https://wicg.github.io/scheduling-apis/.
