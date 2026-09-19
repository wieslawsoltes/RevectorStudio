import { EPS, sub, add, mul, dot, cross, length, distance, lerp, near, emptyBox, extend, intersects, cubicPoint, splitCubic, subCubic, cubicBox, pathEdges, polynomialRoots01 } from './index.js';
const point = (e, t) => e.kind === 'L' ? lerp(...e.points, t) : cubicPoint(e.points, t);
function derivative(e, t) {
    if (e.kind === 'L')
        return sub(e.points[1], e.points[0]);
    const p = e.points, u = 1 - t;
    return [3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]), 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1])];
}
const bounds = e => {
    if (e.kind === 'C')
        return cubicBox(e.points);
    const b = emptyBox();
    e.points.forEach(p => extend(b, p));
    return b;
};
const power = v => [-v[0] + 3 * v[1] - 3 * v[2] + v[3], 3 * v[0] - 6 * v[1] + 3 * v[2], -3 * v[0] + 3 * v[1], v[0]];
function uniqueRoots(roots, tol = 1e-8) { return roots.sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((v, i, a) => !i || Math.abs(v[0] - a[i - 1][0]) > tol || Math.abs(v[1] - a[i - 1][1]) > tol); }
/** Returns parameter pairs, not a polygonal approximation of the source curves. */
export function intersectEdges(a, b, { tolerance = 1e-8, maxSubdivisions = 20000 } = {}) {
    const tol = tolerance;
    if (!intersects(bounds(a), bounds(b)))
        return [];
    if (a.kind === 'L' && b.kind === 'L') {
        const p = a.points[0], q = b.points[0], r = sub(a.points[1], p), s = sub(b.points[1], q), den = cross(r, s), qp = sub(q, p), rr = dot(r, r), ss = dot(s, s);
        if (rr < tol * tol || ss < tol * tol)
            return [];
        if (Math.abs(den) > tol * Math.max(length(r), length(s))) {
            const t = cross(qp, s) / den, u = cross(qp, r) / den;
            return t >= -tol && t <= 1 + tol && u >= -tol && u <= 1 + tol ? [[Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))]] : [];
        }
        if (Math.abs(cross(qp, r)) > tol * length(r))
            return [];
        const roots = [];
        for (const t of [0, 1]) {
            const u = dot(sub(point(a, t), q), s) / ss;
            if (u >= -tol && u <= 1 + tol)
                roots.push([t, Math.max(0, Math.min(1, u))]);
        }
        for (const u of [0, 1]) {
            const t = dot(sub(point(b, u), p), r) / rr;
            if (t >= -tol && t <= 1 + tol)
                roots.push([Math.max(0, Math.min(1, t)), u]);
        }
        return uniqueRoots(roots);
    }
    if (a.kind === 'L')
        return intersectEdges(b, a, { tolerance, maxSubdivisions }).map(([t, u]) => [u, t]);
    if (b.kind === 'L') {
        const q = b.points[0], d = sub(b.points[1], q), dd = dot(d, d);
        if (dd < tol * tol)
            return [];
        const values = a.points.map(p => cross(d, sub(p, q))), scale = Math.max(...values.map(Math.abs), 1), coeff = power(values).map(x => x / scale), roots = [];
        for (const t of polynomialRoots01(coeff, Math.min(1e-11, tol * .01))) {
            const u = dot(sub(point(a, t), q), d) / dd;
            if (u >= -tol && u <= 1 + tol)
                roots.push([t, Math.max(0, Math.min(1, u))]);
        }
        return uniqueRoots(roots);
    }
    if (a.points.every((p, i) => near(p, b.points[i], tol)))
        return [[0, 0], [1, 1]];
    if (a.points.every((p, i) => near(p, b.points[3 - i], tol)))
        return [[0, 1], [1, 0]];
    const stack = [{ a: a.points, b: b.points, ta: 0, tb: 1, ua: 0, ub: 1, depth: 0 }], roots = [];
    let iterations = 0;
    while (stack.length) {
        if (++iterations > maxSubdivisions)
            throw new RangeError('Bezier intersection subdivision budget exceeded; coincident curves require review.');
        const n = stack.pop(), ba = cubicBox(n.a), bb = cubicBox(n.b);
        if (!intersects([ba[0] - tol, ba[1] - tol, ba[2] + tol, ba[3] + tol], bb))
            continue;
        const sizeA = Math.max(ba[2] - ba[0], ba[3] - ba[1]), sizeB = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
        if (n.depth > 44 || (Math.max(sizeA, sizeB) < tol * 4) || ((n.tb - n.ta) < 1e-9 && (n.ub - n.ua) < 1e-9)) {
            let t = (n.ta + n.tb) / 2, u = (n.ua + n.ub) / 2;
            for (let i = 0; i < 12; i++) {
                const f = sub(point(a, t), point(b, u)), da = derivative(a, t), db = derivative(b, u), det = cross(da, db);
                if (Math.abs(det) < 1e-20)
                    break;
                const dt = -cross(f, db) / det, du = -cross(f, da) / det;
                const nt = t + dt, nu = u + du;
                if (nt < -.001 || nt > 1.001 || nu < -.001 || nu > 1.001)
                    break;
                t = Math.max(0, Math.min(1, nt));
                u = Math.max(0, Math.min(1, nu));
                if (Math.abs(dt) + Math.abs(du) < 1e-13)
                    break;
            }
            if (distance(point(a, t), point(b, u)) <= tol * 8)
                roots.push([t, u]);
            continue;
        }
        if (sizeA * (n.tb - n.ta) >= sizeB * (n.ub - n.ua)) {
            const [l, r] = splitCubic(n.a, .5), m = (n.ta + n.tb) / 2;
            stack.push({ ...n, a: l, tb: m, depth: n.depth + 1 }, { ...n, a: r, ta: m, depth: n.depth + 1 });
        }
        else {
            const [l, r] = splitCubic(n.b, .5), m = (n.ua + n.ub) / 2;
            stack.push({ ...n, b: l, ub: m, depth: n.depth + 1 }, { ...n, b: r, ua: m, depth: n.depth + 1 });
        }
    }
    return uniqueRoots(roots, 1e-6);
}
/** Exact polynomial ray tests, using half-open crossings to avoid vertex double counts. */
export function pathWinding(p, paths) {
    let winding = 0;
    for (const path of paths)
        for (const e of pathEdges({ ...path, closed: true })) {
            if (e.kind === 'L') {
                const [a, b] = e.points;
                if (a[1] <= p[1] && b[1] > p[1] && cross(sub(b, a), sub(p, a)) > 0)
                    winding++;
                else if (a[1] > p[1] && b[1] <= p[1] && cross(sub(b, a), sub(p, a)) < 0)
                    winding--;
            }
            else {
                const v = e.points.map(q => q[1] - p[1]);
                const scale = Math.max(1, ...v.map(Math.abs));
                for (const t of polynomialRoots01(power(v).map(x => x / scale))) {
                    if (t >= 1 - 1e-9)
                        continue;
                    const q = point(e, t);
                    if (q[0] <= p[0])
                        continue;
                    const dy = derivative(e, t)[1];
                    if (Math.abs(dy) > 1e-9)
                        winding += Math.sign(dy);
                    else {
                        const eps = 1e-5, y0 = point(e, Math.max(0, t - eps))[1] - p[1], y1 = point(e, Math.min(1, t + eps))[1] - p[1];
                        if (y0 * y1 < 0)
                            winding += Math.sign(y1 - y0);
                    }
                }
            }
        }
    return winding;
}
export function insidePaths(p, paths, rule = 'nonzero') { const w = pathWinding(p, paths); return rule === 'evenodd' ? Math.abs(w) % 2 === 1 : w !== 0; }
function edgePart(e, a, b) { return { kind: e.kind, points: e.kind === 'L' ? [point(e, a), point(e, b)] : subCubic(e.points, a, b) }; }
function reverseEdge(e) { return { kind: e.kind, points: [...e.points].reverse() }; }
export function clipCurveToPaths(edge, paths, rule = 'nonzero', options = {}) {
    const ts = [0, 1];
    for (const p of paths)
        for (const other of pathEdges({ ...p, closed: true }))
            for (const [t] of intersectEdges(edge, other, options))
                ts.push(t);
    ts.sort((a, b) => a - b);
    const cuts = ts.filter((t, i) => !i || t - ts[i - 1] > 1e-9), out = [];
    for (let i = 1; i < cuts.length; i++)
        if (insidePaths(point(edge, (cuts[i] + cuts[i - 1]) / 2), paths, rule))
            out.push(edgePart(edge, cuts[i - 1], cuts[i]));
    return out;
}
function edgeToSegment(e) { return e.kind === 'L' ? { kind: 'L', to: e.points[1] } : { kind: 'C', c1: e.points[1], c2: e.points[2], to: e.points[3] }; }
/**
 * Arrangement-based boolean over lines and polynomial cubic curves.
 * Intersection locations use double precision + subdivision/Newton refinement;
 * output curves remain analytic cubics (de Casteljau), never tessellated polylines.
 * Ambiguous/degenerate arrangements throw rather than fabricate geometry.
 */
export function booleanPaths(subject, clip = [], { operation = 'intersection', subjectRule = 'nonzero', clipRule = 'nonzero', tolerance = 1e-8, maxPairs = 250000 } = {}) {
    const edges = [...subject.flatMap(p => pathEdges({ ...p, closed: true })), ...clip.flatMap(p => pathEdges({ ...p, closed: true }))].filter(e => e.kind === 'C' || distance(...e.points) > tolerance);
    if (!edges.length)
        return [];
    const boxes = edges.map(bounds), cuts = edges.map(() => [0, 1]);
    let pairs = 0;
    // Sweep on min-X; avoids the quadratic empty-pair scan of naive booleans.
    const order = edges.map((_, i) => i).sort((a, b) => boxes[a][0] - boxes[b][0]);
    const active = [];
    for (const i of order) {
        for (let k = active.length - 1; k >= 0; k--)
            if (boxes[active[k]][2] < boxes[i][0] - tolerance)
                active.splice(k, 1);
        for (const j of active) {
            if (!intersects(boxes[i], boxes[j]))
                continue;
            if (++pairs > maxPairs)
                throw new RangeError('Vector boolean intersection budget exceeded');
            for (const [t, u] of intersectEdges(edges[i], edges[j], { tolerance })) {
                cuts[i].push(t);
                cuts[j].push(u);
            }
        }
        active.push(i);
    }
    const predicate = p => { const a = insidePaths(p, subject, subjectRule), b = insidePaths(p, clip, clipRule); return operation === 'normalize' ? a : operation === 'union' ? a || b : operation === 'difference' ? a && !b : operation === 'xor' ? a !== b : a && b; };
    const kept = [], seen = new Set();
    for (let i = 0; i < edges.length; i++) {
        const ts = cuts[i].sort((a, b) => a - b).filter((t, j, a) => !j || t - a[j - 1] > 1e-9);
        for (let k = 1; k < ts.length; k++) {
            const e = edgePart(edges[i], ts[k - 1], ts[k]), mid = point(e, .5), d = derivative(e, .5), len = length(d);
            if (len < tolerance)
                continue;
            const scale = Math.max(distance(e.points[0], e.points.at(-1)), 1), offset = Math.max(tolerance * 16, scale * 1e-8), n = [-d[1] / len * offset, d[0] / len * offset];
            let left = predicate(add(mid, n)), right = predicate(sub(mid, n));
            if (left === right)
                continue;
            const oriented = left ? e : reverseEdge(e);
            const key = oriented.kind + oriented.points.map(p => p.map(x => Math.round(x / (tolerance * 8))).join(',')).join(';');
            if (seen.has(key))
                continue;
            seen.add(key);
            kept.push(oriented);
        }
    }
    const result = [], used = new Set(), matchTolerance = tolerance * 64;
    const bucketKey = p => p.map(x => Math.round(x / matchTolerance)).join(',');
    const starts = new Map();
    kept.forEach((e, i) => {
        const key = bucketKey(e.points[0]);
        if (!starts.has(key))
            starts.set(key, []);
        starts.get(key).push(i);
    });
    const neighbors = p => {
        const [x, y] = p.map(x => Math.round(x / matchTolerance)), out = [];
        for (let i = -1; i <= 1; i++)
            for (let j = -1; j <= 1; j++)
                for (const n of starts.get(`${x + i},${y + j}`) || [])
                    if (!used.has(n) && distance(p, kept[n].points[0]) <= matchTolerance)
                        out.push(n);
        return out;
    };
    for (let first = 0; first < kept.length; first++) {
        if (used.has(first))
            continue;
        const loop = [], start = kept[first].points[0];
        let index = first;
        for (let guard = 0; guard <= kept.length; guard++) {
            if (used.has(index))
                throw new Error('Ambiguous vector-boolean boundary');
            const e = kept[index];
            used.add(index);
            loop.push(e);
            const end = e.points.at(-1);
            if (distance(end, start) <= matchTolerance)
                break;
            const next = neighbors(end);
            if (!next.length)
                throw new Error('Open vector-boolean boundary; export requires review');
            const tangent = derivative(e, 1);
            next.sort((a, b) => { const da = derivative(kept[a], 0), db = derivative(kept[b], 0); return Math.atan2(cross(tangent, da), dot(tangent, da)) - Math.atan2(cross(tangent, db), dot(tangent, db)); });
            index = next[0];
        }
        if (distance(loop.at(-1).points.at(-1), start) > matchTolerance)
            throw new Error('Vector-boolean boundary did not close');
        result.push({ start: [...start], segments: loop.map(edgeToSegment), closed: true });
    }
    return result;
}
