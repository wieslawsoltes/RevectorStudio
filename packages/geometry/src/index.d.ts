export type Point = [
    number,
    number
];
export type Matrix = [
    number,
    number,
    number,
    number,
    number,
    number
];
export type Box = [
    number,
    number,
    number,
    number
];
export type Cubic = [
    Point,
    Point,
    Point,
    Point
];
export type Segment = {
    kind: 'L';
    to: Point;
} | {
    kind: 'C';
    c1: Point;
    c2: Point;
    to: Point;
};
export interface Path {
    start: Point;
    segments: Segment[];
    closed: boolean;
}
export type Edge = {
    kind: 'L';
    points: [
        Point,
        Point
    ];
} | {
    kind: 'C';
    points: Cubic;
};
export type FillRule = 'nonzero' | 'evenodd';
export interface BooleanOptions {
    operation?: 'intersection' | 'union' | 'difference' | 'xor' | 'normalize';
    subjectRule?: FillRule;
    clipRule?: FillRule;
    tolerance?: number;
    maxPairs?: number;
    maxSubdivisions?: number;
}
export const EPS: number;
export const I: Readonly<Matrix>;
export function add(a: Point, b: Point): Point;
export function sub(a: Point, b: Point): Point;
export function mul(a: Point, s: number): Point;
export function dot(a: Point, b: Point): number;
export function cross(a: Point, b: Point): number;
export function length(a: Point): number;
export function distance(a: Point, b: Point): number;
export function lerp(a: Point, b: Point, t: number): Point;
export function near(a: Point, b: Point, t?: number): boolean;
export function finitePoint(p: unknown): p is Point;
export function transform(m: Readonly<Matrix>, p: Point): Point;
export function vector(m: Readonly<Matrix>, p: Point): Point;
export function compose(a: Readonly<Matrix>, b: Readonly<Matrix>): Matrix;
export function inverse(m: Readonly<Matrix>): Matrix;
export function similarity(m: Readonly<Matrix>, tol?: number): boolean;
export interface InsertTransform {
    position: Point;
    scale?: Point;
    rotation?: number;
}
export function decomposeInsert(m: Readonly<Matrix>, tol?: number): Required<InsertTransform> | null;
export function insertMatrix(e: InsertTransform): Matrix;
export function emptyBox(): Box;
export function extend(b: Box, p: Point): Box;
export function union(a: Box, b: Box): Box;
export function validBox(b: unknown): b is Box;
export function intersects(a: Box, b: Box): boolean;
export function contains(b: Box, p: Point, t?: number): boolean;
export function containsBox(a: Box, b: Box, t?: number): boolean;
export function transformBox(b: Box, m: Readonly<Matrix>): Box;
export function cubicPoint(p: Cubic, t: number): Point;
export function splitCubic(p: Cubic, t: number): [
    Cubic,
    Cubic
];
export function subCubic(p: Cubic, t0: number, t1: number): Cubic;
export function polynomialRoots01(coeff: number[], tol?: number): number[];
export function cubicBox(p: Cubic): Box;
export function pathBox(paths: Path[]): Box;
export function mapPaths(paths: Path[], m: Readonly<Matrix>): Path[];
export function rectPath(b: Box): Path;
export function pathEdges(path: Path): Edge[];
export function pointSegmentDistance(p: Point, a: Point, b: Point): number;
/** Display/picking helpers only; conversion and DXF output do not call these. */
export function flattenCubic(p: Cubic, tolerance?: number, out?: Point[], depth?: number): Point[];
export function flattenPath(p: Path, tol?: number): Point[];
export function polygonArea(p: Point[]): number;
export function windingNumber(p: Point, poly: Point[]): number;
export function insidePolygons(p: Point, polys: Point[][], rule?: FillRule): boolean;
export function clipEdge(edge: Edge, polys: Point[][], rule?: FillRule): Edge[];
export function convexPolygon(poly: Point[]): boolean;
export function clipPolygon(subject: Point[], clip: Point[]): Point[];
export function pathPolygons(paths: Path[]): Point[][] | null;
export function circleThrough(a: Point, b: Point, c: Point): {
    center: Point;
    radius: number;
} | null;
export function inferCircle(paths: Path[], tol?: number): {
    center: Point;
    radius: number;
    maxError: number;
    relativeError: number;
} | null;
export function stableHash(value: unknown): string;
export function intersectEdges(a: Edge, b: Edge, options?: BooleanOptions): Point[];
export function pathWinding(p: Point, paths: Path[]): number;
export function insidePaths(p: Point, paths: Path[], rule?: FillRule): boolean;
export function clipCurveToPaths(edge: Edge, paths: Path[], rule?: FillRule, options?: BooleanOptions): Edge[];
export function booleanPaths(subject: Path[], clip?: Path[], options?: BooleanOptions): Path[];
