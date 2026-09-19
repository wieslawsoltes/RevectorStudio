# Primary references and provenance

References were checked on 2026-09-18. Runtime validation of this delivery is described in VALIDATION.md, separately from format/API documentation.

1. Mozilla PDF.js, project and API: https://mozilla.github.io/pdf.js/ and https://mozilla.github.io/pdf.js/api/
2. PDFPageProxy operator-list, text-content and structure APIs: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html
3. Mozilla source contract inspected via the connected GitHub reader: `mozilla/pdf.js`, `src/shared/util.js`, `src/display/canvas.js`, `src/display/display_utils.js`, `src/core/pattern.js`, tag `v6.3.289` and commit `579c4b700f23f7782234f03358b5e9eaa3f58889`.
4. Executed PDF.js binary provenance: official workflow https://github.com/mozilla/pdf.js/actions/runs/35314750710, artifact 10534003871. The vendor manifest records development version 6.4.172. Only runtime modules, data/decoders and license files were selected; font programs were excluded.
5. Autodesk SPLINE DXF group codes: https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm
6. Autodesk HATCH DXF group codes: https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-C6C71CED-CE0F-4184-82A5-07AD6241F15B.htm
7. ezdxf release/version identifiers: https://ezdxf.readthedocs.io/en/stable/introduction.html and https://ezdxf.readthedocs.io/en/stable/const.html
8. DXF encoding/document management: https://ezdxf.readthedocs.io/en/stable/drawing/management.html
9. ezdxf independent validator: https://ezdxf.readthedocs.io/en/stable/ ; executed version 1.4.4.

The source fixture is original project data, not a third-party engineering drawing. No claims of compatibility with a CAD printer family are inferred solely from these references. Format documentation is not equivalent to application-level certification.
