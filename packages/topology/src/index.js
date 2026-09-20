import { BoxIndex } from '@revector/geometry';
import { intersects, emptyBox, union, distance, near, sub, dot, cross, length } from '@revector/geometry';
/** Immutable median-split BVH, used for queries and picking. No giant-grid pathology. */
export class SpatialIndex extends BoxIndex {}
export class DisjointSet {
    constructor(n) { this.parents = Int32Array.from({ length: n }, (_, i) => i); this.rank = new Uint8Array(n); }
    find(x) {
        let y = x;
        while (y !== this.parents[y])
            y = this.parents[y];
        while (x !== y) {
            const n = this.parents[x];
            this.parents[x] = y;
            x = n;
        }
        return y;
    }
    union(a, b) {
        a = this.find(a);
        b = this.find(b);
        if (a === b)
            return;
        if (this.rank[a] < this.rank[b])
            [a, b] = [b, a];
        this.parents[b] = a;
        if (this.rank[a] === this.rank[b])
            this.rank[a]++;
    }
}
export function connectedComponents(entities, getEndpoints, tolerance = 1e-7) {
    const ds = new DisjointSet(entities.length), grid = new Map(), step = Math.max(tolerance, 1e-9);
    for (let i = 0; i < entities.length; i++)
        for (const p of getEndpoints(entities[i])) {
            const x = Math.floor(p[0] / step), y = Math.floor(p[1] / step);
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++)
                    for (const q of grid.get(`${x + dx},${y + dy}`) || [])
                        if (distance(p, q.p) <= tolerance)
                            ds.union(i, q.i);
            const key = `${x},${y}`;
            if (!grid.has(key))
                grid.set(key, []);
            grid.get(key).push({ i, p });
        }
    const out = new Map();
    for (let i = 0; i < entities.length; i++) {
        const k = ds.find(i);
        if (!out.has(k))
            out.set(k, []);
        out.get(k).push(entities[i]);
    }
    return [...out.values()];
}
export function endpoints(e) {
    if (e.type === 'LINE')
        return [e.start, e.end];
    if (e.type === 'LWPOLYLINE')
        return e.closed ? e.points : [e.points[0], e.points.at(-1)];
    if (e.type === 'SPLINE')
        return [e.controlPoints[0], e.controlPoints.at(-1)];
    return [];
}
/** Only joins unambiguous degree-2 chains. Junctions remain junctions. No snapping. */
export function joinLineChains(lines, tolerance = 1e-9) {
    const graph = new Map(), key = p => p.map(x => Math.round(x / tolerance)).join(',');
    for (const l of lines)
        for (const p of [l.start, l.end]) {
            const k = key(p);
            if (!graph.has(k))
                graph.set(k, []);
            graph.get(k).push(l);
        }
    const used = new Set(), chains = [];
    const walk = (line, from) => {
        const points = [from], members = [];
        let l = line, p = from;
        while (l && !used.has(l.id)) {
            used.add(l.id);
            members.push(l);
            const q = near(l.start, p, tolerance) ? l.end : l.start;
            points.push(q);
            const links = graph.get(key(q)) || [];
            if (links.length !== 2)
                break;
            const n = links.find(v => !used.has(v.id));
            if (!n)
                break;
            p = q;
            l = n;
        }
        return { points, members, closed: points.length > 2 && near(points[0], points.at(-1), tolerance) };
    };
    for (const l of lines) {
        if (used.has(l.id))
            continue;
        const a = graph.get(key(l.start)), b = graph.get(key(l.end));
        if (a.length !== 2 || b.length !== 2)
            chains.push(walk(l, a.length !== 2 ? l.start : l.end));
    }
    for (const l of lines)
        if (!used.has(l.id))
            chains.push(walk(l, l.start));
    return chains;
}
