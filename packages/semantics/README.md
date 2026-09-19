# @revector/semantics

**Transactional semantic rule engine** — Revector Studio 0.1.0.

Ordered and versioned rules, evidence-bearing proposals, frozen snapshots, validated transactions and constrained JSON classification rules. Confidence is a score, not a probability.

## Distribution

ESM with TypeScript declarations at `src/index.d.ts`. Install the supplied package tarballs together so exact sibling dependencies resolve locally. Packages are not yet published to a public npm registry.

```js
import * as Revector from '@revector/semantics';
```

## Public API

RuleEngine, compileRuleSet, commitCandidate, safeRegex

The declaration file is the authoritative signature reference; source implementations and comments are shipped without minification. The full repository includes `examples/integration.ts`, a runnable workbench and CLI, fixtures, tests, and architecture/integration/rule-authoring documents.

## Contract

Use explicit diagnostics and source provenance when handling partially supported PDF content. A confidence score is not a calibrated probability; geometry preservation does not prove original CAD intent. No OCR or raster tracing is performed.

Original package code: MIT; see `LICENSE`. Any included third-party notice remains applicable.
