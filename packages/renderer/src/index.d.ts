import type { Point, Matrix, Box } from '@revector/geometry';
import type { CadDocument, Entity, SplineEntity } from '@revector/model';
import { Signal } from '@revector/model';
export class Camera {
    center: Point;
    scale: number;
    width: number;
    height: number;
    changed: Signal<Camera>;
    resize(w: number, h: number): void;
    set(state: {
        center?: Point;
        scale?: number;
    }, notify?: boolean): void;
    readonly matrix: Matrix;
    screen(p: Point): Point;
    world(p: Point): Point;
    zoomAt(p: Point, factor: number): void;
    pan(dx: number, dy: number): void;
    fit(box: Box, padding?: number): void;
    readonly viewBox: Box;
}
export function splinePoint(e: SplineEntity, t: number): Point;
export class CadRenderer {
    doc: CadDocument | null;
    hiddenLayers: Set<string>;
    dark: boolean;
    colorMode: 'faithful'|'contrast';
    weights: boolean;
    drawn: number;
    setDocument(doc: CadDocument): void;
    draw(ctx: CanvasRenderingContext2D, camera: Camera, options?: {
        selected?: Set<string>;
        ghost?: boolean;
    }): void;
    pick(point: Point, camera: Camera): {
        entity: Entity;
        child: Entity;
        distance: number;
    } | null;
}
export class CanvasViewport {
    constructor(canvas: HTMLCanvasElement, options?: {
        kind?: 'cad' | 'pdf';
        camera?: Camera;
    });
    canvas: HTMLCanvasElement;
    camera: Camera;
    renderer: CadRenderer | null;
    selection: Set<string>;
    pageBox: Box;
    grid: boolean;
    paper: boolean;
    measureMode: boolean;
    measurePoints: Point[];
    overlays: Box[];
    selectionChanged: Signal<{
        entity: Entity;
        child: Entity;
        distance: number;
    } | null>;
    pointerMoved: Signal<Point>;
    measureChanged: Signal<{
        points: Point[];
        distance: number | null;
    }>;
    rendered: Signal<{
        elapsedMs: number;
        drawn: number;
    }>;
    resize(): void;
    setDocument(doc: CadDocument): void;
    setImage(image: CanvasImageSource, box: Box): void;
    fit(content?: boolean): void;
    invalidate(): void;
    dispose(): void;
}
export function linkViewports(a: CanvasViewport, b: CanvasViewport): () => void;
