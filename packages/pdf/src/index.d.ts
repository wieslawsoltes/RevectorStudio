import type { PdfScene } from '@revector/model';
import type { Box, Matrix } from '@revector/geometry';
export interface Progress {
    phase: string;
    done?: number;
    total?: number;
    rule?: string;
}
export interface PdfOptions {
    name?: string;
    pdfjs?: object;
    moduleUrl?: string;
    workerUrl?: string;
    pdfOptions?: Record<string, unknown>;
    onPassword?: (reason: number) => string | null | Promise<string | null>;
    onProgress?: (progress: Progress) => void;
    maxBytes?: number;
    maxCachedPages?: number;
    signal?: AbortSignal;
    includeAnnotations?: boolean;
    maxOperators?: number;
}
export interface InterpreterOptions extends PdfOptions {
    OPS?: Record<string, number>;
    box?: Box;
    pageTransform?: Matrix;
    initialTransform?: Matrix;
    pageNumber?: number;
    rotation?: number;
    userUnit?: number;
    ocgs?: PdfScene['ocgs'];
    fonts?: PdfScene['fonts'];
    source?: Record<string, unknown>;
    structure?: unknown;
    annotations?: unknown[];
    patternDepth?: number;
}
export interface OperatorList {
    fnArray: number[] | Uint32Array;
    argsArray: unknown[][];
}
export const PDFJS_VERSION: string;
export const SUPPORTED_PDFJS_VERSIONS: readonly string[];
export const OPS: Readonly<Record<string, number>>;
export const DRAW_OPS: Readonly<Record<string, number>>;
export function loadPdfJs(options?: Pick<PdfOptions, 'moduleUrl' | 'workerUrl'>): Promise<object>;
export function interpretOperators(list: OperatorList, options?: InterpreterOptions): Promise<PdfScene>;
export interface ImageOptions {
    maxPixels?:number; maxTotalPixels?:number; maxBytes?:number; maxImages?:number;
    signal?:AbortSignal; canvasFactory?:(width:number,height:number)=>any;
}
export const DEFAULT_IMAGE_OPTIONS:Readonly<Required<Omit<ImageOptions,'signal'|'canvasFactory'>>>;
export function preserveRasterImages(source:PdfSource,scene:PdfScene,options?:ImageOptions):Promise<PdfScene>;
export class PdfSource {
    captureAppearance(scene:PdfScene,options?:AppearanceOptions):Promise<PdfScene>;
    preserveRasterImages(scene:PdfScene,options?:ImageOptions):Promise<PdfScene>;
    rasterResource(scene:PdfScene,item:import('@revector/model').PdfPaintItem):Promise<any>;
    static open(bytes: Uint8Array | ArrayBuffer, options?: PdfOptions): Promise<PdfSource>;
    numPages: number;
    metadata: unknown;
    ocgs: PdfScene['ocgs'];
    extract(page: number, options?: PdfOptions): Promise<PdfScene>;
    render(page: number, canvas: HTMLCanvasElement, options?: {
        scale?: number;
        background?: string;
        annotationMode?: number;
        signal?: AbortSignal;
    }): Promise<unknown>;
    setLayerVisible(id: string, visible: boolean): void;
    outline(): Promise<unknown>;
    attachmentInventory(): Promise<Array<{
        id: string;
        name: string;
        size: number;
    }>>;
    dispose(): Promise<void>;
}

export interface AppearanceOptions {dpi?:number;maxPixels?:number;maxBytes?:number;maxDimension?:number;background?:string;signal?:AbortSignal;canvasFactory?:(width:number,height:number)=>any}
export const DEFAULT_APPEARANCE_OPTIONS:Readonly<Required<Omit<AppearanceOptions,'signal'|'canvasFactory'>>>;
export function captureAppearance(source:PdfSource,scene:PdfScene,options?:AppearanceOptions):Promise<PdfScene>;
