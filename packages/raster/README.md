# @revector/raster

Bounded raster preprocessing, region planning and line extraction. See `docs/EXTENSIONS.md` in RevectorStudio for contracts and limits.

Version 0.6.0 contracts, algorithms, limits and examples: `docs/RECOVERY-0.3.md` in the RevectorStudio repository.

## Centerline inference

`traceRasterPaths` converts a bounded binary raster to a junction-aware graph of simplified pixel-center paths. It is an inference algorithm, not an exact recovery of CAD geometry; tolerance measures skeleton samples, not the original drawing.

Performance ownership contracts and reproducible benchmarks: `docs/PERFORMANCE.md` in the repository.
