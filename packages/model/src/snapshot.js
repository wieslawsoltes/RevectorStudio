/** Internal ownership marker, not a heuristic based on shallow Object.freeze.
 * Only snapshots assembled from detached, deeply frozen branches by RuleEngine
 * are eligible for cross-rule caches. Ordinary external detector inputs are not. */
const snapshots = new WeakSet();
export function markImmutableSnapshot(document) { snapshots.add(document); return document; }
export function isImmutableSnapshot(document) { return snapshots.has(document); }
