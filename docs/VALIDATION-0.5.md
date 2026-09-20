# Version 0.5.0 acceptance

Executed on 20 September 2026. The source build passes 177 Node tests with zero failures, strict TypeScript checking, 35 original workbench checks, 21 real OCR/color checks, 14 tiled OCR checks, 23 native-image checks and 14 new sampled-appearance checks.

The appearance suite uses actual HTTP navigation in GitHub Actions, not the explicitly identified local inline harness. It compares every aligned RGBA channel on two authored pages exercising masks, blends, groups, shading, stencils, text clipping and Type 3 text. Per-page maxima and error counts are recorded in `artifacts/v0.5.0/appearance-validation.json`. Twelve appearance exports (two pages, six DXF versions) pass independent structural audits. Native CLI coverage includes four appearance cases, exact original-PDF archival and rejection of unresolved strict semantic conversion.

The SHA-pinned corpus runner passed five authored cases with independently checked DXF, diagnostics and PNG assets. It did not run a licensed commercial CAD executable; its optional version-checked regeneration adapter is implemented but not represented as an executed commercial test. Curve error bounds refer to the input polyline within floating-point arithmetic, not the lost original CAD curve. Unrepresentable tolerances fail explicitly. Unmarked crossings remain alternatives unless evidence or a declared convention resolves them.

All sixteen 0.5.0 archives were dry-run validated and imported in an isolated offline consumer. That does not establish npm registry publication. The separately triggered publication workflow records actual registry responses and integrity verification.

Machine-readable evidence is in `artifacts/v0.5.0/`. The source workflow is https://github.com/wieslawsoltes/RevectorStudio/actions/runs/35506816594. Public HTTPS deployment and registry publication are separate acceptance gates.
