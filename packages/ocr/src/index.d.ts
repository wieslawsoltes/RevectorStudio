import type { PdfScene, PdfPaintItem } from '@revector/model';
export interface OcrOptions {scope?:'raster'|'page';languages?:string;dpi?:number;minConfidence?:number;preprocess?:'none'|'otsu'|'sauvola';invert?:boolean;rotation?:0|90|180|270;traceLines?:boolean;deskew?:boolean;tileSize?:number;tileOverlap?:number;maxTiles?:number;maxPixels?:number;maxRegions?:number;maxWords?:number;timeoutMs?:number;assetBase?:string;signal?:AbortSignal;onProgress?:(progress:any)=>void;canvasFactory?:(width:number,height:number)=>any;provider?:{createWorker:Function}|{default:{createWorker:Function}};session?:TesseractOcr}
export const OCR_VERSION:string;
export const DEFAULT_OCR_OPTIONS:Readonly<OcrOptions>;
export function normalizeOcrOptions(options?:OcrOptions):OcrOptions;
export class TesseractOcr {constructor(options?:{node?:boolean;languages?:string;moduleUrl?:string;workerPath?:string;corePath?:string;langPath?:string;provider?:{createWorker:Function}|{default:{createWorker:Function}};onProgress?:(p:any)=>void});recognize(image:any,options?:OcrOptions&{psm?:number}):Promise<any>;dispose():Promise<void>}
export function ocrWords(data:any):any[];
export function rotationMatrix(rotation:number,width:number,height:number):[number,number,number,number,number,number];
export function nativeTextBoxes(scene:PdfScene,pdfToPixels:number[]):number[][];
export function wordToPaint(word:any,pixelToPdf:number[],options?:{page?:number;regionId?:string;color?:number[];imageIds?:string[]}):PdfPaintItem;
export function recoverPdfRaster(source:any,scene:PdfScene,options?:OcrOptions):Promise<PdfScene&{ocr:any}>;

export function deduplicateOcrWords(words:any[],options?:{maxComparisons?:number}):any[];
