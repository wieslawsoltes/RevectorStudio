# Architecture and numerical contract

## Data flow

```text
PDF bytes
  └─ PDF.js decoder / operator list / fonts / optional content / metadata
       └─ @revector/pdf → immutable revector.pdf/1 paint intermediate
            ├─ PDF.js source rendering → left viewport
            └─ @revector/cad → revector.cad/1 exact-geometry baseline
                 └─ @revector/semantics + @revector/rules-cad
                      └─ candidate transactions, review, decisions, provenance
                           └─ @revector/dxf writer → DXF bytes
                                └─ @revector/dxf reader → preview model
                                     └─ @revector/renderer → right viewport
```

There is no image-recognition branch. PDF.js owns parsing, decompression, encryption and font decoding. Revector interprets the decoded display operators; it is not a second hand-written PDF file parser. Existing PDF.js decoding does not imply every PDF operation has a semantic CAD counterpart.

## Modules and dependency boundaries

| Package | Responsibility |
|---|---|
| `@revector/geometry` | Affine math, cubic primitives, analytic bounds, intersections, clipping and curve arrangements |
| `@revector/model` | Versioned intermediate CAD model, entity contracts, IDs, provenance, validation and events |
| `@revector/pdf` | PDF.js adapter, display-operator interpreter, source extraction/rendering, optional content |
| `@revector/topology` | BVH, endpoint grid, disjoint sets, connected components and chain discovery |
| `@revector/cad` | Unit-normalized geometry, text, fills, clipping and source-form lowering |
| `@revector/semantics` | Deterministic rules, dependency ordering, candidate transactions, JSON DSL |
| `@revector/rules-cad` | Reusable built-in CAD-print rules, profiles and explicit vector template library |
| `@revector/dxf` | Versioned writer and round-trip reader for the implemented entities |
| `@revector/renderer` | Retained Canvas commands, culling, picking, camera, measurement and linked viewports |
| `@revector/engine` | Conversion orchestration, reports, cancellation and worker protocol |
| `@revector/ui` | DOM controls, dialogs, downloads, ZIP32 writer and disposal |
| `@revector/workbench` | Compact two-panel IDE assembled from the other packages |

Framework-independent geometry/model/rule/DXF packages have no DOM requirement. `PdfSource.render`, renderer, UI and workbench are browser services. The conversion kernel is host-independent once it receives a `PdfScene`.

## Coordinates

An affine matrix `[a,b,c,d,e,f]` represents:

```text
x' = a*x + c*y + e
y' = b*x + d*y + f
```

The interpreter follows PDF concatenation and graphics-state save/restore. Paths are transformed when constructed so later painting does not accidentally reapply a changed CTM. Page-normalization accounts for CropBox origin, rotation and UserUnit while producing a y-up page coordinate system. CAD lowering applies the output-unit factor and requested model/paper ratio once:

```text
M_cad = Scale(unitFactor × drawingScale) × M_page
mm per default PDF point = 25.4 / 72
```

Units offered are mm, cm, m, in, pt and unitless. `drawingScale` is positive and finite. Source scale is not estimated from arbitrary text unless an extension explicitly proposes such an interpretation. A measured known length can be used for UI calibration.

## Cubic preservation

For a PDF cubic with controls P0..P3:

```text
B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t)t^2 P2 + t^3 P3
```

The default CAD representation is a degree-3 non-rational SPLINE with four controls and knot vector `[0,0,0,0,1,1,1,1]`. An affine transform applies directly to the controls, preserving the curve's polynomial representation.

De Casteljau subdivision produces controls for subintervals when clipping. Extrema are found by solving the derivative quadratics; control-point hulls provide conservative subdivisions for curve intersection. Line/cubic intersections use polynomial root isolation. Cubic/cubic intersection uses bounded subdivision and numerical refinement. Boolean regions split intersecting boundaries, classify sides with winding tests, and reconnect accepted directed edges.

“Exact geometry” means the primitive is preserved instead of tessellated. Arithmetic is IEEE-754 double precision; clipping tolerances, finite iteration budgets, coincident boundaries and tangencies can still produce uncertainty. This is **not a formally certified exact-arithmetic kernel**. Ambiguous operations create diagnostics. Non-strict mode can retain original unclipped geometry as an explicit fallback; strict mode blocks unresolved errors.

A four-cubic printed circle is not an exact mathematical circle. Replacing it with CIRCLE is an inference and may change geometry. The built-in rule records fit evidence; its sampled deviation is **not a rigorous global Hausdorff bound**.

## Text and forms

PDF encoded glyphs are read from PDF.js's font mapping. Text and line matrices, horizontal scaling, text rise, character/word spacing and numeric TJ adjustments determine placement. Adaptive output uses glyph-level entities when a single run cannot preserve spacing. Cap height and a fitted width determine DXF text placement. Font substitution is diagnosed because the DXF cannot embed arbitrary original PDF font programs through this writer.

PDF Form XObjects are resource-level reuse, not CAD entities. Eligible leaf instances can be localized into a shared block and transformed with INSERT rotation/scales. Matrix decomposition rejects shear, and problematic nonuniform text cases remain expanded. Structural signatures quantize coordinates at small tolerances to identify repeatable content; they are not bitwise proofs of semantic equivalence. Original source references and generated names remain available.

## Semantic transactions

A rule consumes a frozen snapshot and returns candidates. Stages, priority and dependency names give a deterministic schedule; cyclic dependencies are rejected. A candidate identifies its source members and contains proposed removals, additions, patches, new layers/blocks/groups and evidence.

Acceptance clones the current CAD document, applies a transaction, validates references and entity invariants, and commits only on success. Conflicts remain visible. A decision map is replayed from the source intermediate for undo/redo. The geometry-preservation flag is separate from confidence in the *meaning*: a classification can preserve geometry while still being semantically uncertain.

These safeguards prevent dangling blocks/groups and invalid spline structures, but do not prove that a rule inferred the correct engineering intent. Source paint order is retained where represented, including per-instance block placement; arbitrary CAD plotting/compositing equivalence is not certified.

## DXF and the preview contract

The exported file contains the actual selectable ACADVER, tables, owners, handles, block records, supported entities, layout objects and metadata. Version-specific color/encoding choices happen in the writer, not just the filename. Every conversion parses its own DXF and validates the parsed model before returning a preview. Independent ezdxf audits supplement this internal round trip.

The preview is a retained Canvas renderer with a BVH over drawing commands. It culls off-screen geometry and schedules rendering on invalidation, not a continuous animation loop. Native cubic drawing stays cubic. General non-Bézier spline display can use a sampled De Boor evaluation **only for presentation**, not export. Dark mode adjusts display colors for legibility; paper mode is the closer visual comparison.

## Performance and isolation

Source extraction snapshots operator arrays before PDF.js rendering may cache/mutate path data. Only a small page cache is retained by `PdfSource`. One conversion job runs per `ConversionWorker`; cancellation terminates its worker. The same kernel has an in-process path for environments denying workers.

The implementation uses endpoint hashing, median BVH construction, bounded pattern expansion and explicit operator/candidate budgets. It still materializes operator lists and CAD entities and clones candidate transactions. It is not a streaming million-entity converter, and no high-volume customer-PDF benchmark is claimed. A future performance pass should first measure extraction heap, arrangement intersections and candidate-clone pressure on the actual workload.
