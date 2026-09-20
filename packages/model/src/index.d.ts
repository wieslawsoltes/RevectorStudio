import type { Point, Box, Path, Matrix } from '@revector/geometry';
export type Units = 'mm' | 'cm' | 'm' | 'in' | 'pt' | 'unitless';
export type DxfVersion = '2000' | '2004' | '2007' | '2010' | '2013' | '2018';
export type RGB = [
    number,
    number,
    number
];
export interface Diagnostic {
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    [key: string]: unknown;
}
export interface Provenance {
    ids?: string[];
    page?: number;
    operator?: number;
    form?: string;
    formPath?: string[];
    kind?: string;
    [key: string]: unknown;
}
export interface Semantic {
    class?: string | null;
    method?: string;
    confidence?: number;
    exact?: boolean;
    [key: string]: unknown;
}
export interface EntityBase {
    id: string;
    layer: string;
    color?: RGB;
    lineweight?: number;
    opacity?: number;
    dash?: number[];
    dashPhase?: number;
    bounds?: Box;
    source?: Provenance;
    semantic?: Semantic;
    handle?: string;
}
export interface RasterAsset {
    id:string; path:string; width:number; height:number; mimeType:'image/png';
    dataBase64?:string; sha256?:string; source?:Record<string,unknown>;
}
export interface ImageEntity extends EntityBase {
    type:'IMAGE'; imageId:string; imageSize:Point; position:Point; uPixel:Point; vPixel:Point;
}
export interface LineEntity extends EntityBase {
    type: 'LINE';
    start: Point;
    end: Point;
}
export interface PolylineEntity extends EntityBase {
    type: 'LWPOLYLINE';
    points: Point[];
    closed?: boolean;
    bulges?: number[];
    constantWidth?: number;
}
export interface CircleEntity extends EntityBase {
    type: 'CIRCLE';
    center: Point;
    radius: number;
}
export interface ArcEntity extends EntityBase {
    type: 'ARC';
    center: Point;
    radius: number;
    startAngle: number;
    endAngle: number;
}
export interface EllipseEntity extends EntityBase {
    type: 'ELLIPSE';
    center: Point;
    major: Point;
    ratio: number;
    startParam?: number;
    endParam?: number;
}
export interface SplineEntity extends EntityBase {
    type: 'SPLINE';
    degree: number;
    controlPoints: Point[];
    knots: number[];
    weights?: number[];
    closed?: boolean;
}
export interface HatchEntity extends EntityBase {
    type: 'HATCH';
    paths: Path[];
    solid?: boolean;
    fillRule?: 'nonzero' | 'evenodd';
    pattern?: {
        angle?: number;
        origin?: Point;
        offset?: Point;
    };
}
export interface SolidEntity extends EntityBase {
    type: 'SOLID';
    points: Point[];
}
export interface TextProperties {
    position: Point;
    text: string;
    height: number;
    width?: number;
    widthFactor?: number;
    font?: string;
    rotation?: number;
    oblique?: number;
    mirror?: number;
}
export interface TextEntity extends EntityBase, TextProperties {
    type: 'TEXT' | 'MTEXT';
}
export interface AttributeEntity extends EntityBase, TextProperties {
    type: 'ATTRIB';
    tag: string;
    value?: string;
}
export interface InsertEntity extends EntityBase {
    type: 'INSERT';
    name: string;
    position: Point;
    scale?: Point;
    rotation?: number;
    attributes?: AttributeEntity[];
}
export interface DimensionEntity extends EntityBase {
    type: 'DIMENSION';
    block: string;
    dimensionType?: number;
    definition: Point;
    extension1: Point;
    extension2: Point;
    textPosition: Point;
    text: string;
    measurement: number;
}
export type Entity = ImageEntity | LineEntity | PolylineEntity | CircleEntity | ArcEntity | EllipseEntity | SplineEntity | HatchEntity | SolidEntity | TextEntity | AttributeEntity | InsertEntity | DimensionEntity;
export interface Layer {
    name: string;
    color?: RGB;
    visible?: boolean;
}
export interface Block {
    name: string;
    origin?: Point;
    entities: Entity[];
    source?: Record<string, unknown>;
}
export interface Group {
    name: string;
    members: string[];
    description?: string;
    semantic?: Semantic;
}
export interface Proposal {
    remove?: string[];
    add?: Entity[];
    placements?: Record<string, string>;
    update?: Array<{
        id: string;
        patch?: Partial<Entity>;
        appendAttributes?: AttributeEntity[];
    }>;
    blocks?: Block[];
    layers?: Layer[];
    groups?: Group[];
}
export interface Candidate {
    id: string;
    rule: string;
    ruleVersion?: string;
    title: string;
    members: string[];
    confidence: number;
    exact: boolean;
    evidence: unknown[];
    proposal: Proposal;
    status: 'pending' | 'accepted' | 'rejected' | 'conflict';
    conflict?: string;
    result?: string[];
    errorBound?: number;
}
export interface CadDocument {
    schema: 'revector.cad/1';
    revision: number;
    name: string;
    units: Units;
    pageBox: Box;
    entities: Entity[];
    assets?: RasterAsset[];
    layers: Layer[];
    blocks: Block[];
    groups: Group[];
    diagnostics: Diagnostic[];
    candidates: Candidate[];
    history: unknown[];
    source: Record<string, unknown>;
    ruleStats?: Array<{
        rule: string;
        proposed: number;
        accepted: number;
        elapsedMs: number;
    }>;
    acadVersion?: string;
}
export interface PdfPaintItem {
    id: string;
    kind: 'path' | 'text' | 'image' | 'shading';
    operator: number;
    layerId?: string | null;
    visible?: boolean;
    formPath?: string[];
    paths?: Path[];
    text?: string;
    matrix?: Matrix;
    [key: string]: unknown;
}
export interface AppearanceSnapshot {
    schema:'revector.appearance/1'; mode:'page-composite'; dpi:number; scale:number;
    width:number; height:number; background:string; pageNumber:number; pageSize:Point;
    pixelToPage:Matrix; pdfToPixels:Matrix; sourceFingerprints:string[];
    ocgs:PdfScene['ocgs']; annotationMode?:number;
    renderer:{name:string;version:string;colorSpace:'sRGB'};
    exactSourceStreams:false; editable:false; originalDiagnostics:Diagnostic[]; asset:RasterAsset;
}
export interface PdfScene {
    appearance?:AppearanceSnapshot;
    annotationMode?:number;
    schema: 'revector.pdf/1';
    pageNumber: number;
    box: Box;
    pageTransform: Matrix;
    pageSize?: Point;
    rotation: number;
    userUnit: number;
    items: PdfPaintItem[];
    forms: Array<{
        id: string;
        transform: Matrix;
        box: Box;
        start: number;
        end?: number;
        parent: string | null;
    }>;
    ocgs: Record<string, {
        name: string;
        visible: boolean;
    }>;
    fonts: Record<string, Record<string, unknown>>;
    patterns: unknown[];
    diagnostics: Diagnostic[];
    operatorCount: number;
    source: Record<string, unknown>;
    structure: unknown;
    annotations: unknown[];
}
export const MODEL_SCHEMA: 'revector.cad/1';
export const SCENE_SCHEMA: 'revector.pdf/1';
export const DXF_VERSIONS: Readonly<Record<DxfVersion, string>>;
export function createDocument(options?: Partial<CadDocument>): CadDocument;
export function diagnostic(code: string, message: string, severity?: Diagnostic['severity'], detail?: Record<string, unknown>): Diagnostic;
export function ensureLayer(doc: CadDocument, name: string, color?: RGB, visible?: boolean): Layer;
export function allEntities(doc: CadDocument): Entity[];
export function entityBox(e: Entity, doc?: Pick<CadDocument, 'blocks'>, seen?: Set<string>): Box;
export function documentBox(doc: CadDocument): Box;
export function entityPaths(e: Entity): Path[];
export function validateDocument(doc: CadDocument): {
    valid: boolean;
    errors: string[];
};
export function countTypes(doc: CadDocument): Record<string, number>;
export function summary(doc: CadDocument): {
    entities: number;
    blockDefinitions: number;
    layers: number;
    types: Record<string, number>;
    diagnostics: number;
    accepted: number;
    pending: number;
};
export class Signal<T = unknown> {
    subscribe(fn: (value: T) => void): () => void;
    emit(value: T): void;
    clear(): void;
}
export class AbortConversionError extends Error {
}
export function checkAbort(signal?: AbortSignal): void;
export function yieldTask(): Promise<void>;

export function isSafeAssetPath(value:unknown):boolean;

/** Deterministic SHA-256 of the supplied byte view for portable asset integrity. */
export function sha256Bytes(bytes:Uint8Array):string;
