# Version 0.2.0 validation

The recorded build passes 90 Node tests, strict TypeScript checking, 35 original UI checks, 21 real-browser OCR/color checks, native Node/WASM OCR, and installation/import of all sixteen npm archives in an isolated offline consumer.

All eleven authored color swatches agree between PDF.js rendering and the rendered serialized DXF at the sampled interior pixels. Six OCR-to-DXF version exports pass independent audits. The separate baseline DXF audit covers 35 files with zero errors and zero fixes. These fixtures are not an exhaustive customer-document corpus, OCR accuracy benchmark, or commercial CAD certification.

Machine-readable evidence is in `artifacts/v0.2.0/`. The live Pages workflow repeats the OCR/color tests on the deployed HTTPS URL and records the actual deployment commit.
