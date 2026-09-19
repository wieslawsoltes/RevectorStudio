# Semantic rule authoring

## Declarative classification

The UI's Rule engine editor accepts this document. It can also be passed as `ruleSet` to `convertScene` or supplied with the CLI `--rules` option.

```json
{
  "schema": "revector.rules/1",
  "rules": [{
    "id": "plant.pressure-tags",
    "version": "1.0.0",
    "title": "Pressure instrument tags",
    "confidence": 0.99,
    "when": {"all": [
      {"field": "type", "op": "eq", "value": "TEXT"},
      {"field": "text", "op": "prefix", "value": "PT-"}
    ]},
    "then": {
      "layer": "INSTRUMENT_TAGS",
      "semantic": {"class": "pressure-instrument", "convention": "plant-tagging-v1"}
    }
  }]
}
```

Predicates support `all`, `any`, `not`, and field comparisons `eq`, `in`, `contains`, `prefix`, `regex`. Allowed fields are `type`, `layer`, `text`, `font`, `semantic.class`, and `source.kind`. The DSL does not evaluate JavaScript or mutate arbitrary prototype paths. It is limited to classification/layer transactions; geometry recognition requires a trusted plugin.

Rules are bounded to 128 entries and predicate depth 8. Regex uses a deliberately restricted subset: grouping, alternation, counted repetitions, backreferences and multiple unbounded quantifiers are rejected, and input text length is limited. Prefer `prefix`/`contains` when possible. These restrictions reduce denial-of-service opportunities; they are not a substitute for a host-level time/memory boundary around untrusted documents.

## Trusted JavaScript plugin

```js
import { ConversionEngine } from '@revector/engine';

const engine = new ConversionEngine();
engine.register({
  id: 'plant.pressure-tags',
  version: '1.0.0', stage: 70, priority: 0,
  title: 'Pressure instrument classification',
  run({ document, checkAbort }) {
    checkAbort();
    return document.entities
      .filter(e => e.type === 'TEXT' && e.text.startsWith('PT-'))
      .map(e => ({
        title: `Classify ${e.text}`,
        members: [e.id], confidence: 0.99, exact: true,
        evidence: [{ kind: 'plant-naming-convention', prefix: 'PT-' }],
        proposal: {
          layers: [{ name: 'INSTRUMENT_TAGS', color: [40, 150, 190], visible: true }],
          update: [{ id: e.id, patch: {
            layer: 'INSTRUMENT_TAGS',
            semantic: { ...e.semantic, class: 'pressure-instrument' }
          }}]
        }
      }));
  }
});
```

Here `exact: true` means **geometry is unchanged**, not that the meaning “pressure instrument” is proven. The confidence expresses the caller's naming convention, not a universal statistical guarantee. Lower the score or require review when conventions differ.

`run` may return an iterable, async iterable, or a promise of either. `after` can name dependencies; `stage` and `priority` determine ordering. Call `checkAbort()` inside long loops. Do not mutate the frozen input snapshot.

## Proposal contract

A proposal may contain:

| Field | Meaning |
|---|---|
| `remove` | Source entity IDs to consume |
| `add` | New native CAD entities with unique IDs |
| `placements` | New entity ID → replaced source ID, to preserve instance ordering |
| `update` | Existing ID plus field patch or appended attributes |
| `blocks` | New reusable definitions |
| `layers` | New layer definitions |
| `groups` | Member-ID groups with descriptions/semantic metadata |

IDs and references are validated transactionally. Existing GROUP references are updated when entities are replaced. Multiple tag candidates append distinct attributes rather than overwriting an INSERT's earlier attributes. Cyclic block references, invalid numerical geometry, malformed spline knots and missing references fail validation and prevent commit.

Use explicit `source` provenance on added entities. Preserve original geometry in the source intermediate and record any fit error, tolerance or semantic assumption in `evidence`. Candidate IDs are deterministic for a fixed pipeline, source and rule set; changing rule versions, extraction details or entity numbering can invalidate a saved decision map. Persist the original PDF/settings/rule definitions with that map.

## Accept, reject and replay

The workbench stores `candidateId: "accept" | "reject"` decisions. Every change reconverts the original paint intermediate with the chosen settings and decisions. Undo/redo changes that decision state; it does not attempt floating-point inverse edits. `RuleEngine.accept`/`reject` are also available for direct model integrations.

Applications must distinguish metadata recovery, geometric inference and engineering semantic interpretation. Do not assign confidence 1 to a valve type solely because its lines look like a generic bow-tie. Prefer competing candidates and an explicit review workflow.

## Recognizer extension points

`@revector/topology` provides BVH queries, connected components and line-chain discovery. `@revector/geometry` provides transformed curves, analytic bounds and clipping. `VectorTemplateLibrary` compares explicitly registered vector path signatures after translation normalization. It operates on geometry only, not pixels; built-in matching is not rotation/scale invariant.

A manufacturer-specific adapter can add stronger producer signatures, font-tag dictionaries, layer naming conventions, dimension styles, symbol templates, line-type classifiers, viewport/title-block structures or domain-specific graph assembly. Those additions should ship with representative PDFs and expected semantic models, not just names of CAD products.
