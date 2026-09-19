# Capability matrix — version 0.1.0

This matrix describes **conversion**, not just the PDF.js source viewer. “Implemented” means a real code path exists and is covered by the provided fixtures or unit tests; it does not imply an exhaustive third-party PDF corpus.

| PDF / CAD feature | Current conversion contract |
|---|---|
| PDF containers, compression and passwords | Delegated to bundled PDF.js; password callback/UI supported |
| Multiple pages | Page-by-page conversion; batch ZIP contains one DXF per PDF page |
| Page rotation, CropBox, UserUnit, transforms | Interpreted and converted to normalized y-up output units |
| Move/line/rectangle/close/stroke | Native LINE or LWPOLYLINE |
| Cubic Bézier paths | Native cubic SPLINE, no default curve tessellation |
| Cubic and straight clipping | Primitive-preserving numerical clipping with diagnostic failure policy |
| Filled paths and holes | HATCH line/cubic boundaries; nonzero/even-odd normalization |
| Self intersections/coincident pathological boundaries | Bounded arrangement algorithm; ambiguity may require review/strict rejection |
| OCG / OCMD optional content | Visibility evaluation, layer recovery where names survive |
| Absent CAD layers | Explicit style-based fallback layers; no claim to original layer names |
| PDF Form XObjects | Eligible leaf form reuse → BLOCK/INSERT; general shear stays expanded |
| Nested forms | Geometry interpreted recursively; not every nested form is folded into nested DXF blocks |
| Encoded text / ToUnicode | Editable Unicode TEXT; font mappings provided by PDF.js |
| TJ spacing, rotation, horizontal scale, oblique/mirror | Adaptive run/glyph output with placement data |
| Original fonts | Names/metrics retained where available; rendering depends on installed fonts; no font programs shipped |
| Complex scripts / vertical fonts | PDF.js decoding is available; comprehensive native CAD text shaping/layout parity not certified |
| Arbitrary clipped editable text / text clipping modes | Diagnosed; no general vector glyph outline clipping/export implementation |
| Invisible text rendering modes | Not silently emitted as visible CAD text |
| Outlined text | Remains vector geometry; explicit translation-only template API can be used by extensions |
| General outlined-font recognition | Not implemented; no OCR substitute |
| Type 3 glyph program recovery | Not fully implemented; diagnosed |
| Stroke color / dash / lineweight | Mapped to DXF properties; CTM/stroke anisotropy and PDF compositing may differ |
| PDF transparency / blend modes / soft masks | Limited opacity mapping; general compositing/masks diagnosed, not lossless |
| Spot / calibrated / ICC color | PDF.js resolves display color; original print color-space semantics not retained |
| Vector-only tiling patterns | Bounded expansion into editable primitives; 2,500-cell default budget |
| Text/image pattern cells | Not fully converted; diagnosed |
| Gradient/mesh shading | Not converted into a faithful editable CAD representation; diagnosed |
| Raster images, masks, scans | Source viewer can render; converter reports omission; no IMAGE export, OCR or tracing |
| Annotation appearance vectors | Applicable appearance operators interpreted; interactivity not retained |
| Metadata, structure and attachments | Accessible as metadata/inventory, not arbitrary CAD entities |
| AcroForm/XFA behavior, JavaScript, video/audio/3D | No interactive behavior migration or original 3D reconstruction |
| Repeated vector symbols | Translation-equivalent component recovery; not a general scale/rotation-invariant symbol recognizer |
| Circles inferred from printed cubic circles | Reviewable hypothesis; default conservative profile does not silently replace curves |
| Ellipse/arc inference from arbitrary splines | Entity model/writer support exists; a general recognition rule is not implemented |
| Attributes | Nearby recognized tags can be accepted into native INSERT ATTRIB entries |
| Dimensions | Supported linear candidates yield non-associative DIMENSION plus source display block |
| Original associativity/constraints/model topology | Not recreated as fact when absent from PDF |
| Hatch line families | Semantic GROUP recovery; no invented hatch boundary |
| DXF reader | Reads writer-supported subset; not a universal existing-DXF import engine |
| DXF versions | 2000, 2004, 2007, 2010, 2013, 2018 with structural audit fixtures |
| AutoCAD/BricsCAD GUI round-trip | Not performed in this environment |

## Review policies

`exact`, `cad` and `pid` profiles are deliberately conservative: they auto-accept high-scoring geometry-preserving transactions and leave geometry-changing interpretations pending. `inferred` permits high-scoring inferred replacements. The profiles are threshold presets, not independently trained manufacturer-specific models. Producer-family detection reads metadata signatures and is advisory.

Strict mode rejects conversions with unresolved **error** diagnostics. Warnings still require judgment; strict is not a promise that every subtle font/layout/semantic difference has been detected. Non-strict export is useful for partial recovery, but consumers must retain the accompanying report.

## Irrecoverable versus unimplemented

Some boundaries are implementation work (for example vector shade approximations, deeper font-outline support, additional semantic rules). Others are missing source information: a printed PDF can discard CAD object IDs, original block names, constraints, associativity, hidden model geometry, elevations and engineering intent. A recovery engine can propose hypotheses from surviving evidence, but it must not present guessed original data as recovered fact.
