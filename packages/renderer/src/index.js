import { I, compose, insertMatrix, inverse, transform, transformBox, validBox, contains, distance, flattenPath, pointSegmentDistance, union, emptyBox } from '@revector/geometry';
import { Signal, entityBox, entityPaths, documentBox } from '@revector/model';
import { SpatialIndex } from '@revector/topology';
import { displayColor } from '@revector/color';
const TAU = Math.PI * 2;
export class Camera {
    constructor() { this.center = [0, 0]; this.scale = 1; this.width = 1; this.height = 1; this.changed = new Signal(); }
    resize(w, h) { this.width = Math.max(1, w); this.height = Math.max(1, h); this.changed.emit(this); }
    set({ center = this.center, scale = this.scale }, notify = true) {
        if (!center.every(Number.isFinite) || !Number.isFinite(scale) || scale <= 0)
            return;
        this.center = [...center];
        this.scale = Math.max(1e-6, Math.min(1e6, scale));
        if (notify)
            this.changed.emit(this);
    }
    get matrix() { return [this.scale, 0, 0, -this.scale, this.width / 2 - this.center[0] * this.scale, this.height / 2 + this.center[1] * this.scale]; }
    screen(p) { return transform(this.matrix, p); }
    world(p) { return [(p[0] - this.width / 2) / this.scale + this.center[0], (this.height / 2 - p[1]) / this.scale + this.center[1]]; }
    zoomAt(p, factor) { const anchor = this.world(p), s = Math.max(1e-6, Math.min(1e6, this.scale * factor)); this.set({ scale: s, center: [anchor[0] - (p[0] - this.width / 2) / s, anchor[1] + (p[1] - this.height / 2) / s] }); }
    pan(dx, dy) { this.set({ center: [this.center[0] - dx / this.scale, this.center[1] + dy / this.scale] }); }
    fit(box, padding = 30) {
        if (!validBox(box))
            return;
        this.set({ center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], scale: Math.min(Math.max(20, this.width - padding * 2) / Math.max(1e-9, box[2] - box[0]), Math.max(20, this.height - padding * 2) / Math.max(1e-9, box[3] - box[1])) });
    }
    get viewBox() { const a = this.world([0, this.height]), b = this.world([this.width, 0]); return [...a, ...b]; }
}
function path2d(paths) {
    const path = new Path2D();
    for (const p of paths) {
        path.moveTo(...p.start);
        for (const s of p.segments) {
            if (s.kind === 'C')
                path.bezierCurveTo(...s.c1, ...s.c2, ...s.to);
            else
                path.lineTo(...s.to);
        }
        if (p.closed)
            path.closePath();
    }
    return path;
}
function arcBulge(p, q, bulge, path) {
    if (!bulge) {
        path.lineTo(...q);
        return;
    }
    const dx = q[0] - p[0], dy = q[1] - p[1], chord = Math.hypot(dx, dy);
    if (chord < 1e-12)
        return;
    const cx = (p[0] + q[0]) / 2 - dy * (1 - bulge * bulge) / (4 * bulge), cy = (p[1] + q[1]) / 2 + dx * (1 - bulge * bulge) / (4 * bulge), r = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge)), a = Math.atan2(p[1] - cy, p[0] - cx);
    path.arc(cx, cy, r, a, a + 4 * Math.atan(bulge), bulge < 0);
}
/** Display-only evaluation of a general B-spline. Export always retains original knots/controls. */
export function splinePoint(e, t) {
    const p = e.degree, U = e.knots, n = e.controlPoints.length - 1;
    let k = p;
    while (k < n && t >= U[k + 1])
        k++;
    const d = [];
    for (let j = 0; j <= p; j++) {
        const i = k - p + j, w = e.weights?.[i] ?? 1;
        d.push([e.controlPoints[i][0] * w, e.controlPoints[i][1] * w, w]);
    }
    for (let r = 1; r <= p; r++)
        for (let j = p; j >= r; j--) {
            const i = k - p + j, den = U[i + p - r + 1] - U[i], a = den ? (t - U[i]) / den : 0;
            d[j] = d[j].map((v, c) => (1 - a) * d[j - 1][c] + a * v);
        }
    return [d[p][0] / d[p][2], d[p][1] / d[p][2]];
}
function makePath(e) {
    if (e.type === 'CIRCLE' || e.type === 'ARC') {
        const p = new Path2D();
        p.arc(...e.center, e.radius, e.type === 'ARC' ? e.startAngle * Math.PI / 180 : 0, e.type === 'ARC' ? e.endAngle * Math.PI / 180 : TAU);
        return p;
    }
    if (e.type === 'ELLIPSE') {
        const p = new Path2D(), r = Math.hypot(...e.major);
        p.ellipse(...e.center, r, r * e.ratio, Math.atan2(e.major[1], e.major[0]), e.startParam ?? 0, e.endParam ?? TAU);
        return p;
    }
    if (e.type === 'LWPOLYLINE' && e.bulges?.some(Boolean)) {
        const p = new Path2D();
        p.moveTo(...e.points[0]);
        for (let i = 0; i < e.points.length - 1; i++)
            arcBulge(e.points[i], e.points[i + 1], e.bulges[i], p);
        if (e.closed) {
            arcBulge(e.points.at(-1), e.points[0], e.bulges.at(-1), p);
            p.closePath();
        }
        return p;
    }
    if (e.type === 'SPLINE' && !(e.degree === 3 && e.controlPoints.length === 4 && !(e.weights || []).some(w => w !== e.weights[0]))) {
        const p = new Path2D(), a = e.knots[e.degree], b = e.knots[e.controlPoints.length];
        p.moveTo(...splinePoint(e, a));
        for (let i = 1; i <= 256; i++)
            p.lineTo(...splinePoint(e, a + (b - a) * i / 256));
        return p;
    }
    return path2d(entityPaths(e));
}
function fontFamily(name) {
    if (/cour|mono/i.test(name))
        return '"Courier New", monospace';
    if (/times|serif/i.test(name) && !/sans/i.test(name))
        return '"Times New Roman", serif';
    return 'Arial, Helvetica, sans-serif';
}
/** Retained command renderer; BVH culls offscreen roots, draw order is never sorted by style. */
export class CadRenderer {
    constructor() { this.doc = null; this.roots = []; this.commands = new Map(); this.paths = new WeakMap(); this.fontMetrics = new Map(); this.index = new SpatialIndex([]); this.hiddenLayers = new Set(); this.dark = true; this.colorMode = 'faithful'; this.weights = true; this.drawn = 0; }
    setDocument(doc) {
        this.doc = doc;
        this.paths = new WeakMap();
        this.commands.clear();
        this.roots = doc.entities.map((e, index) => ({ e, index, box: entityBox(e, doc) }));
        this.index = new SpatialIndex(this.roots, r => r.box);
        const blocks = new Map(doc.blocks.map(b => [b.name, b]));
        const expand = (e, m, root, out, depth = 0, inherited = '0') => {
            if (depth > 64)
                return;
            const layer = (e.layer || '0') === '0' ? inherited : e.layer;
            if (e.type === 'INSERT') {
                const b = blocks.get(e.name);
                if (b) {
                    const origin = b.origin || [0, 0];
                    const next = compose(m, compose(insertMatrix(e), [1, 0, 0, 1, -origin[0], -origin[1]]));
                    for (const child of b.entities)
                        expand(child, next, root, out, depth + 1, layer);
                }
                for (const a of e.attributes || [])
                    expand({ ...a, type: 'ATTRIB' }, m, root, out, depth + 1, layer);
            }
            else if (e.type === 'DIMENSION') {
                for (const child of blocks.get(e.block)?.entities || [])
                    expand(child, m, root, out, depth + 1, layer);
            }
            else
                out.push({ e, m, root, layer, box: transformBox(entityBox(e, doc), m) });
        };
        for (const r of this.roots) {
            const commands = [];
            expand(r.e, I, r.e, commands);
            this.commands.set(r.e.id, commands);
        }
        this.hiddenLayers = new Set(doc.layers.filter(l => l.visible === false).map(l => l.name));
    }
    draw(ctx, camera, { selected = new Set(), ghost = false } = {}) {
        if (!this.doc)
            return;
        const roots = this.index.search(camera.viewBox).sort((a, b) => a.index - b.index);
        this.drawn = 0;
        for (const r of roots) {
            if (this.hiddenLayers.has(r.e.layer))
                continue;
            const selectedRoot = selected.has(r.e.id);
            for (const cmd of this.commands.get(r.e.id) || []) {
                if (this.hiddenLayers.has(cmd.layer))
                    continue;
                this.drawCommand(ctx, cmd, camera, selectedRoot, ghost);
                this.drawn++;
            }
        }
    }
    drawCommand(ctx, cmd, camera, selected, ghost) {
        const { e, m } = cmd, scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
        ctx.save();
        ctx.transform(...m);
        const color = selected ? '#58d9ec' : displayColor(e.color, this.dark ? this.colorMode : 'faithful');
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = ghost ? .2 : (e.opacity ?? 1);
        const units = { mm: 1, cm: .1, m: .001, in: 1 / 25.4, pt: 72 / 25.4, unitless: 1 }[this.doc.units] || 1;
        const weight = this.weights ? (e.lineweight ?? .2) * units * (this.doc.source?.options?.drawingScale || 1) : 0;
        ctx.lineWidth = Math.max(selected ? 1.8 / camera.scale : .65 / camera.scale, weight) / scale;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.setLineDash((e.dash || []).map(v => Math.abs(v)));
        ctx.lineDashOffset = -(e.dashPhase || 0);
        if (['TEXT', 'MTEXT', 'ATTRIB'].includes(e.type)) {
            this.drawText(ctx, e);
        }
        else {
            let path = this.paths.get(e);
            if (!path) {
                path = makePath(e);
                this.paths.set(e, path);
            }
            if (e.type === 'HATCH' && e.solid === false) {
                const b = entityBox(e, this.doc), a = (e.pattern?.angle || 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], origin = e.pattern?.origin || [0, 0], offset = e.pattern?.offset || [0, 1], spacing = Math.abs(offset[0] * v[0] + offset[1] * v[1]);
                if (spacing > 1e-9) {
                    ctx.clip(path, 'evenodd');
                    const corners = [[b[0], b[1]], [b[0], b[3]], [b[2], b[1]], [b[2], b[3]]], ds = corners.map(p => (p[0] - origin[0]) * v[0] + (p[1] - origin[1]) * v[1]), ts = corners.map(p => (p[0] - origin[0]) * u[0] + (p[1] - origin[1]) * u[1]), lo = Math.floor(Math.min(...ds) / spacing), hi = Math.ceil(Math.max(...ds) / spacing);
                    ctx.beginPath();
                    for (let k = lo; k <= hi && k - lo < 20000; k++) {
                        const d = k * spacing;
                        ctx.moveTo(origin[0] + d * v[0] + Math.min(...ts) * u[0], origin[1] + d * v[1] + Math.min(...ts) * u[1]);
                        ctx.lineTo(origin[0] + d * v[0] + Math.max(...ts) * u[0], origin[1] + d * v[1] + Math.max(...ts) * u[1]);
                    }
                    ctx.stroke();
                }
            }
            else if (e.type === 'HATCH' || e.type === 'SOLID')
                ctx.fill(path, 'evenodd');
            else
                ctx.stroke(path);
        }
        ctx.restore();
    }
    drawText(ctx, e) {
        const text = e.text || e.value || '', angle = (e.rotation || 0) * Math.PI / 180, family = fontFamily(e.font || ''), bold = /bold|demi|arialb|courbd|timesbd/i.test(e.font || ''), italic = /italic|oblique|ariali|arialbi/i.test(e.font || ''), font = `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}100px ${family}`;
        ctx.translate(...e.position);
        ctx.rotate(angle);
        ctx.transform(1, 0, Math.tan((e.oblique || 0) * Math.PI / 180), 1, 0, 0);
        if (e.mirror & 2)
            ctx.scale(-1, 1);
        if (e.mirror & 4)
            ctx.scale(1, -1);
        ctx.scale(1, -1);
        ctx.font = font;
        ctx.textBaseline = 'alphabetic';
        ctx.fontKerning = 'none';
        let cap = this.fontMetrics.get(font);
        if (!cap) {
            cap = ctx.measureText('H').actualBoundingBoxAscent || 70;
            this.fontMetrics.set(font, cap);
        }
        const sy = e.height / cap;
        const lines = text.replace(/\\P/g, '\n').split('\n');
        for (let i = 0; i < lines.length; i++) {
            const w = ctx.measureText(lines[i]).width, sx = e.type === 'MTEXT' ? sy : (e.width > 0 && w > 0 ? e.width / w : sy * (e.widthFactor || 1));
            ctx.save();
            ctx.translate(0, i * e.height * 1.6);
            ctx.scale(sx, sy);
            ctx.fillText(lines[i], 0, 0);
            ctx.restore();
        }
    }
    pick(point, camera) {
        if (!this.doc)
            return null;
        const r = 6 / camera.scale, roots = this.index.search([point[0] - r, point[1] - r, point[0] + r, point[1] + r]).sort((a, b) => b.index - a.index);
        let best = null, bestDistance = Infinity;
        for (const root of roots) {
            if (this.hiddenLayers.has(root.e.layer))
                continue;
            for (const cmd of this.commands.get(root.e.id) || []) {
                if (this.hiddenLayers.has(cmd.layer) || !contains(cmd.box, point, r))
                    continue;
                const e = cmd.e, p = transform(inverse(cmd.m), point), factor = Math.sqrt(Math.abs(cmd.m[0] * cmd.m[3] - cmd.m[1] * cmd.m[2])) || 1;
                let d = Infinity;
                if (['TEXT', 'MTEXT', 'ATTRIB', 'HATCH', 'SOLID'].includes(e.type))
                    d = 0;
                else if (e.type === 'CIRCLE' || e.type === 'ARC')
                    d = Math.abs(distance(p, e.center) - e.radius) * factor;
                else {
                    for (const path of entityPaths(e)) {
                        const pts = flattenPath(path, .5 / (camera.scale * factor));
                        for (let i = 1; i < pts.length; i++)
                            d = Math.min(d, pointSegmentDistance(p, pts[i - 1], pts[i]) * factor);
                    }
                    if (e.type === 'ELLIPSE')
                        d = 0;
                }
                if (d < r && d < bestDistance) {
                    best = { entity: root.e, child: e, distance: d };
                    bestDistance = d;
                }
            }
        }
        return best;
    }
}
/** Framework-neutral interactive viewport, also usable for PDF raster previews. */
export class CanvasViewport {
    constructor(canvas, { kind = 'cad', camera = new Camera() } = {}) {
        this.canvas = canvas;
        this.kind = kind;
        this.camera = camera;
        this.renderer = kind === 'cad' ? new CadRenderer() : null;
        this.selection = new Set();
        this.selectionChanged = new Signal();
        this.pointerMoved = new Signal();
        this.measureChanged = new Signal();
        this.rendered = new Signal();
        this.image = null;
        this.pageBox = [0, 0, 297, 210];
        this.grid = kind === 'cad';
        this.paper = kind === 'pdf';
        this.measureMode = false;
        this.measurePoints = [];
        this.overlays = [];
        this.frame = 0;
        this.abort = new AbortController();
        this.sub = camera.changed.subscribe(() => this.invalidate());
        this.bindInput();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(canvas);
        this.resize();
    }
    resize() { const r = this.canvas.getBoundingClientRect(), dpr = Math.min(3, globalThis.devicePixelRatio || 1); this.dpr = dpr; this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr)); this.camera.resize(r.width, r.height); }
    setDocument(doc) { this.renderer?.setDocument(doc); this.pageBox = [...doc.pageBox]; this.invalidate(); }
    setImage(image, box) { this.image = image; this.pageBox = [...box]; this.invalidate(); }
    fit(content = false) { this.camera.fit(content && this.renderer?.doc ? documentBox(this.renderer.doc) : this.pageBox); }
    invalidate() {
        if (!this.frame)
            this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
    }
    render() {
        const start = performance.now(), ctx = this.canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' }), cam = this.camera, w = cam.width, h = cam.height, dpr = this.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = this.kind === 'pdf' ? '#202731' : this.paper ? '#e9edf0' : '#101720';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.transform(...cam.matrix);
        const b = this.pageBox;
        if (this.paper) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        }
        if (this.grid && !this.paper)
            this.drawGrid(ctx);
        if (this.image) {
            ctx.save();
            ctx.translate(b[0], b[3]);
            ctx.scale(1, -1);
            ctx.drawImage(this.image, 0, 0, b[2] - b[0], b[3] - b[1]);
            ctx.restore();
        }
        if (this.renderer) {
            this.renderer.dark = !this.paper;
            this.renderer.draw(ctx, cam, { selected: this.selection });
        }
        ctx.lineWidth = 1 / cam.scale;
        ctx.strokeStyle = this.kind === 'pdf' ? '#a4acb7' : '#334052';
        ctx.setLineDash([]);
        ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        ctx.strokeStyle = '#24b7d1';
        ctx.fillStyle = '#24b7d12b';
        ctx.lineWidth = 1.5 / cam.scale;
        for (const b of this.overlays) {
            ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
            ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        }
        if (this.measurePoints.length) {
            ctx.beginPath();
            ctx.moveTo(...this.measurePoints[0]);
            for (const p of this.measurePoints.slice(1))
                ctx.lineTo(...p);
            ctx.strokeStyle = '#f8c768';
            ctx.stroke();
            for (const p of this.measurePoints) {
                ctx.beginPath();
                ctx.arc(...p, 3 / cam.scale, 0, TAU);
                ctx.fillStyle = '#f8c768';
                ctx.fill();
            }
        }
        ctx.restore();
        this.rendered.emit({ elapsedMs: performance.now() - start, drawn: this.renderer?.drawn || 0 });
    }
    drawGrid(ctx) {
        const cam = this.camera, step = 10 ** Math.floor(Math.log10(75 / cam.scale)), b = cam.viewBox;
        ctx.lineWidth = .6 / cam.scale;
        ctx.strokeStyle = '#1c2734';
        ctx.beginPath();
        for (let x = Math.floor(b[0] / step) * step; x <= b[2]; x += step) {
            ctx.moveTo(x, b[1]);
            ctx.lineTo(x, b[3]);
        }
        for (let y = Math.floor(b[1] / step) * step; y <= b[3]; y += step) {
            ctx.moveTo(b[0], y);
            ctx.lineTo(b[2], y);
        }
        ctx.stroke();
    }
    bindInput() {
        const canvas = this.canvas, signal = this.abort.signal;
        canvas.tabIndex = 0;
        canvas.style.touchAction = 'none';
        let drag = null;
        canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); this.camera.zoomAt([e.clientX - r.left, e.clientY - r.top], Math.exp(-e.deltaY * .0015)); }, { passive: false, signal });
        canvas.addEventListener('pointerdown', e => {
            if (e.button > 1)
                return;
            canvas.focus();
            canvas.setPointerCapture(e.pointerId);
            drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, id: e.pointerId, moved: false };
        }, { signal });
        canvas.addEventListener('pointermove', e => {
            const r = canvas.getBoundingClientRect(), p = this.camera.world([e.clientX - r.left, e.clientY - r.top]);
            this.pointerMoved.emit(p);
            if (drag && drag.id === e.pointerId) {
                const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                drag.moved ||= Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3;
                if (drag.moved)
                    this.camera.pan(dx, dy);
                drag.x = e.clientX;
                drag.y = e.clientY;
            }
        }, { signal });
        canvas.addEventListener('pointerup', e => {
            if (!drag || drag.id !== e.pointerId)
                return;
            const moved = drag.moved;
            drag = null;
            if (canvas.hasPointerCapture(e.pointerId))
                canvas.releasePointerCapture(e.pointerId);
            if (moved)
                return;
            const r = canvas.getBoundingClientRect(), point = this.camera.world([e.clientX - r.left, e.clientY - r.top]);
            if (this.measureMode) {
                if (this.measurePoints.length >= 2)
                    this.measurePoints = [];
                this.measurePoints.push(point);
                this.measureChanged.emit({ points: [...this.measurePoints], distance: this.measurePoints.length === 2 ? distance(...this.measurePoints) : null });
                this.invalidate();
                return;
            }
            const hit = this.renderer?.pick(point, this.camera);
            if (!e.shiftKey)
                this.selection.clear();
            if (hit)
                this.selection.add(hit.entity.id);
            this.selectionChanged.emit(hit);
            this.invalidate();
        }, { signal });
        canvas.addEventListener('pointercancel', () => drag = null, { signal });
        canvas.addEventListener('dblclick', () => this.fit(), { signal });
        canvas.addEventListener('keydown', e => {
            if (e.key === 'f' || e.key === 'F') {
                this.fit();
                e.preventDefault();
            }
            if (e.key === 'Escape') {
                this.measurePoints = [];
                this.selection.clear();
                this.selectionChanged.emit(null);
                this.invalidate();
            }
        }, { signal });
    }
    dispose() {
        this.abort.abort();
        this.observer.disconnect();
        this.sub();
        if (this.frame)
            cancelAnimationFrame(this.frame);
    }
}
export function linkViewports(a, b) {
    let applying = false;
    const sync = (from, to) => {
        if (applying)
            return;
        applying = true;
        to.camera.set({ center: from.camera.center, scale: from.camera.scale });
        applying = false;
    };
    const u = a.camera.changed.subscribe(() => sync(a, b)), v = b.camera.changed.subscribe(() => sync(b, a));
    return () => { u(); v(); };
}
