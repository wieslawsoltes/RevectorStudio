import type { PdfScene } from '@revector/model';
export interface Raster {width:number;height:number;data:Uint8ClampedArray|Uint8Array}
export function validateRaster(r:Raster,maxPixels?:number):Raster;
export function grayscale(r:Raster,maxPixels?:number):Uint8Array;
export function otsu(gray:Uint8Array):number;
export function binarize(r:Raster,options?:{method?:'otsu'|'sauvola';window?:number;k?:number;invert?:boolean;maxPixels?:number;signal?:AbortSignal}):Uint8Array;
export function binaryRgba(binary:Uint8Array,width:number,height:number):Raster;
export function rasterRegions(scene:PdfScene,options?:{scope?:'raster'|'page';padding?:number;maxRegions?:number}):Array<{box:number[];items:any[];wholePage?:boolean}>;
export function rasterMaskPaths(scene:PdfScene,region:any):any[];
export function detectRasterLines(binary:Uint8Array,width:number,height:number,options?:{minLength?:number;maxThickness?:number;maxGap?:number;maxLines?:number;signal?:AbortSignal}):Array<{start:number[];end:number[];thickness:number;confidence:number}>;
export interface RasterTile {x:number;y:number;width:number;height:number;core:[number,number,number,number]}
export function planRasterTiles(width:number,height:number,options?:{tileSize?:number;overlap?:number;maxTiles?:number}):RasterTile[];
export function estimateSkew(binary:Uint8Array,width:number,height:number,options?:{maxAngle?:number;step?:number;maxSamples?:number;signal?:AbortSignal}):{angle:number;confidence:number;samples:number;reason:string};
export function boundedRotation(angle:number,width:number,height:number,maxPixels?:number):{width:number;height:number;scale:number;matrix:number[]};
