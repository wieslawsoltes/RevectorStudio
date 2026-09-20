/** Exact-primitive geometry. Display tessellation is deliberately separate from export. */
export const EPS = 1e-10;
export const I = Object.freeze([1, 0, 0, 1, 0, 0]);
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const length = a => Math.hypot(...a);
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const near = (a, b, t = EPS) => distance(a, b) <= t;
export function finitePoint(p) { return p?.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]); }
export function transform(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
export function vector(m, p) { return [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]]; }
/** Column vectors: compose(a,b) applies b first, then a. */
export function compose(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
export function inverse(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(d) < 1e-18)
        throw new RangeError('Singular affine matrix');
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}
export function similarity(m, tol = 1e-9) { const x = [m[0], m[1]], y = [m[2], m[3]], sx = length(x), sy = length(y); return sx > EPS && Math.abs(dot(x, y)) <= tol * sx * sy && Math.abs(sx - sy) <= tol * Math.max(sx, sy); }
export function decomposeInsert(m, tol = 1e-9) {
    const sx = Math.hypot(m[0], m[1]);
    if (sx < EPS)
        return null;
    const sy = (m[0] * m[3] - m[1] * m[2]) / sx;
    if (Math.abs(m[0] * m[2] + m[1] * m[3]) > tol * sx * Math.hypot(m[2], m[3]))
        return null;
    return { position: [m[4], m[5]], scale: [sx, sy], rotation: Math.atan2(m[1], m[0]) * 180 / Math.PI };
}
export function insertMatrix(e) { const a = (e.rotation || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), [x, y] = e.scale || [1, 1]; return [c * x, s * x, -s * y, c * y, ...e.position]; }
export function emptyBox() { return [Infinity, Infinity, -Infinity, -Infinity]; }
export function extend(b, p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); return b; }
export function union(a, b) {
    if (!validBox(b))
        return a;
    extend(a, [b[0], b[1]]);
    extend(a, [b[2], b[3]]);
    return a;
}
export const validBox = b => b?.length === 4 && b.every(Number.isFinite) && b[2] >= b[0] && b[3] >= b[1];
export const intersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const contains = (b, p, t = 0) => p[0] >= b[0] - t && p[0] <= b[2] + t && p[1] >= b[1] - t && p[1] <= b[3] + t;
export const containsBox = (a, b, t = 0) => contains(a, [b[0], b[1]], t) && contains(a, [b[2], b[3]], t);
export function transformBox(b, m) {
    const out = emptyBox();
    for (const p of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]])
        extend(out, transform(m, p));
    return out;
}
export function cubicPoint(p, t) { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; }
export function splitCubic(p, t) { const a = lerp(p[0], p[1], t), b = lerp(p[1], p[2], t), c = lerp(p[2], p[3], t), d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t); return [[p[0], a, d, f], [f, e, c, p[3]]]; }
export function subCubic(p, t0, t1) {
    if (t0 <= EPS && t1 >= 1 - EPS)
        return p.map(p => [...p]);
    const left = splitCubic(p, t1)[0];
    return t0 <= EPS ? left : splitCubic(left, t0 / t1)[1];
}
/** Real roots in [0,1], isolated by derivative extrema; tangencies are retained. */
export function polynomialRoots01(coeff, tol = 1e-11) {
    let c = [...coeff];
    while (c.length > 1 && Math.abs(c[0]) < tol)
        c.shift();
    const n = c.length - 1;
    if (n <= 0)
        return [];
    if (n === 1) {
        const x = -c[1] / c[0];
        return x >= -tol && x <= 1 + tol ? [Math.min(1, Math.max(0, x))] : [];
    }
    const evalAt = t => c.reduce((v, x) => v * t + x, 0), d = c.slice(0, -1).map((x, i) => x * (n - i));
    const points = [0, ...polynomialRoots01(d, tol), 1].sort((a, b) => a - b), out = [];
    for (const t of points)
        if (Math.abs(evalAt(t)) <= tol)
            out.push(t);
    for (let i = 1; i < points.length; i++) {
        let a = points[i - 1], b = points[i], fa = evalAt(a), fb = evalAt(b);
        if (fa * fb >= 0)
            continue;
        for (let j = 0; j < 60 && b - a > tol; j++) {
            const m = (a + b) / 2, f = evalAt(m);
            if (fa * f <= 0) {
                b = m;
                fb = f;
            }
            else {
                a = m;
                fa = f;
            }
        }
        out.push((a + b) / 2);
    }
    return [...new Set(out.map(x => Math.round(x / tol) * tol))].sort((a, b) => a - b).filter(x => x >= -tol && x <= 1 + tol).map(x => Math.max(0, Math.min(1, x)));
}
export function cubicBox(p) {
    const b = emptyBox();
    extend(b, p[0]);
    extend(b, p[3]);
    for (let ax = 0; ax < 2; ax++) {
        const [a, z, c, d] = p.map(v => v[ax]);
        const roots = polynomialRoots01([3 * (-a + 3 * z - 3 * c + d), 6 * (a - 2 * z + c), 3 * (z - a)]);
        for (const t of roots)
            extend(b, cubicPoint(p, t));
    }
    return b;
}
export function pathBox(paths) {
    const b = emptyBox();
    for (const p of paths) {
        extend(b, p.start);
        let at = p.start;
        for (const s of p.segments) {
            if (s.kind === 'C')
                union(b, cubicBox([at, s.c1, s.c2, s.to]));
            else
                extend(b, s.to);
            at = s.to;
        }
    }
    return b;
}
export function mapPaths(paths, m) { return paths.map(p => ({ ...p, start: transform(m, p.start), segments: p.segments.map(s => s.kind === 'C' ? { ...s, c1: transform(m, s.c1), c2: transform(m, s.c2), to: transform(m, s.to) } : { ...s, to: transform(m, s.to) }) })); }
export function rectPath(b) { return { start: [b[0], b[1]], segments: [{ kind: 'L', to: [b[2], b[1]] }, { kind: 'L', to: [b[2], b[3]] }, { kind: 'L', to: [b[0], b[3]] }], closed: true }; }
export function pathEdges(path) {
    let p = path.start;
    const edges = [];
    for (const s of path.segments) {
        edges.push(s.kind === 'C' ? { kind: 'C', points: [p, s.c1, s.c2, s.to] } : { kind: 'L', points: [p, s.to] });
        p = s.to;
    }
    if (path.closed && !near(p, path.start))
        edges.push({ kind: 'L', points: [p, path.start] });
    return edges;
}
export function pointSegmentDistance(p, a, b) { const v = sub(b, a), d = dot(v, v), t = d > EPS ? Math.max(0, Math.min(1, dot(sub(p, a), v) / d)) : 0; return distance(p, lerp(a, b, t)); }
/** Display only; never used by the exact spline exporter. */
export function flattenCubic(p, tolerance = 0.1, out = [p[0]], depth = 0) {
    if (depth >= 18 || Math.max(pointSegmentDistance(p[1], p[0], p[3]), pointSegmentDistance(p[2], p[0], p[3])) <= tolerance) {
        out.push(p[3]);
        return out;
    }
    const [a, b] = splitCubic(p, .5);
    flattenCubic(a, tolerance, out, depth + 1);
    flattenCubic(b, tolerance, out, depth + 1);
    return out;
}
export function flattenPath(p, tol = .1) {
    const out = [p.start];
    for (const e of pathEdges(p)) {
        if (e.kind === 'C')
            flattenCubic(e.points, tol, out);
        else
            out.push(e.points[1]);
    }
    return out;
}
export function polygonArea(p) {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
        a += cross(p[j], p[i]);
    return a / 2;
}
export function windingNumber(p, poly) {
    let w = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i];
        if (pointSegmentDistance(p, a, b) < EPS)
            return Infinity;
        if (a[1] <= p[1]) {
            if (b[1] > p[1] && cross(sub(b, a), sub(p, a)) > 0)
                w++;
        }
        else if (b[1] <= p[1] && cross(sub(b, a), sub(p, a)) < 0)
            w--;
    }
    return w;
}
export function insidePolygons(p, polys, rule = 'nonzero') {
    let w = 0;
    for (const q of polys) {
        const v = windingNumber(p, q);
        if (v === Infinity)
            return true;
        w += v;
    }
    return rule === 'evenodd' ? Math.abs(w) % 2 === 1 : w !== 0;
}
/** Exact line or Bézier clipping against polygon boundaries; retains cubic controls. */
export function clipEdge(edge, polys, rule = 'nonzero') {
    const cuts = [0, 1];
    const ps = edge.points;
    for (const poly of polys)
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[j], d = sub(poly[i], a);
            const v = ps.map(p => cross(d, sub(p, a)));
            let roots;
            if (edge.kind === 'L') {
                const div = v[0] - v[1];
                roots = Math.abs(div) > EPS ? [v[0] / div] : [];
            }
            else
                roots = polynomialRoots01([-v[0] + 3 * v[1] - 3 * v[2] + v[3], 3 * v[0] - 6 * v[1] + 3 * v[2], -3 * v[0] + 3 * v[1], v[0]]);
            const len = dot(d, d);
            for (const t of roots)
                if (t > EPS && t < 1 - EPS) {
                    const p = edge.kind === 'L' ? lerp(ps[0], ps[1], t) : cubicPoint(ps, t);
                    const u = len > EPS ? dot(sub(p, a), d) / len : 0;
                    if (u >= -EPS && u <= 1 + EPS)
                        cuts.push(t);
                }
        }
    cuts.sort((a, b) => a - b);
    const unique = cuts.filter((x, i) => i === 0 || x - cuts[i - 1] > 1e-9), out = [];
    for (let i = 1; i < unique.length; i++) {
        const a = unique[i - 1], b = unique[i], m = (a + b) / 2, p = edge.kind === 'L' ? lerp(ps[0], ps[1], m) : cubicPoint(ps, m);
        if (insidePolygons(p, polys, rule))
            out.push({ kind: edge.kind, points: edge.kind === 'L' ? [lerp(ps[0], ps[1], a), lerp(ps[0], ps[1], b)] : subCubic(ps, a, b) });
    }
    return out;
}
export function convexPolygon(poly) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length], v = cross(sub(b, a), sub(c, b));
        if (Math.abs(v) < EPS)
            continue;
        const s = Math.sign(v);
        if (sign && sign !== s)
            return false;
        sign = s;
    }
    return sign !== 0;
}
/** Sutherland-Hodgman: exact intersections for linear closed paths, convex clip. */
export function clipPolygon(subject, clip) {
    let out = subject.map(p => [...p]);
    const sign = Math.sign(polygonArea(clip));
    for (let i = 0, j = clip.length - 1; i < clip.length; j = i++) {
        const a = clip[j], d = sub(clip[i], a), inside = p => sign * cross(d, sub(p, a)) >= -EPS;
        const input = out;
        out = [];
        if (!input.length)
            break;
        for (let k = 0, h = input.length - 1; k < input.length; h = k++) {
            const s = input[h], e = input[k], si = inside(s), ei = inside(e);
            if (si !== ei) {
                const v = sub(e, s), den = cross(d, v);
                if (Math.abs(den) > EPS)
                    out.push(lerp(s, e, -cross(d, sub(s, a)) / den));
            }
            if (ei)
                out.push(e);
        }
    }
    return out;
}
export function pathPolygons(paths) {
    if (paths.some(p => p.segments.some(s => s.kind !== 'L')))
        return null;
    return paths.map(p => [p.start, ...p.segments.map(s => s.to)]);
}
export function circleThrough(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < EPS)
        return null;
    const aa = dot(a, a), bb = dot(b, b), cc = dot(c, c), center = [(aa * (b[1] - c[1]) + bb * (c[1] - a[1]) + cc * (a[1] - b[1])) / d, (aa * (c[0] - b[0]) + bb * (a[0] - c[0]) + cc * (b[0] - a[0])) / d];
    return { center, radius: distance(center, a) };
}
/** A conic hypothesis, NOT an exact identity between a polynomial cubic and circle. */
export function inferCircle(paths, tol = 0.00035) {
    if (paths.length !== 1)
        return null;
    const p = paths[0], edges = pathEdges(p);
    if (edges.length !== 4 || edges.some(e => e.kind !== 'C'))
        return null;
    const c = circleThrough(edges[0].points[0], edges[1].points[0], edges[2].points[0]);
    if (!c || c.radius < EPS)
        return null;
    let error = 0;
    for (const e of edges)
        for (let i = 0; i <= 32; i++)
            error = Math.max(error, Math.abs(distance(cubicPoint(e.points, i / 32), c.center) - c.radius));
    if (error > c.radius * tol)
        return null;
    return { ...c, maxError: error, relativeError: error / c.radius };
}
export function stableHash(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
export { intersectEdges, pathWinding, insidePaths, clipCurveToPaths, booleanPaths } from './boolean.js';

export {fitCircularPolyline,fitCubicPolyline} from './fitting.js';
