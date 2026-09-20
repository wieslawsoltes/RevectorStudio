import type { RGB, CadDocument } from '@revector/model';
export function normalizeRgb(value: string | ArrayLike<number>, options?: {domain?: 'byte'|'unit'}): RGB;
export function displayColor(rgb: RGB, mode?: 'faithful'|'contrast'): string;
export function srgbToLab(rgb: RGB): [number,number,number];
export function deltaE2000(a: readonly number[], b: readonly number[]): number;
export function auditColors(original: CadDocument, preview: CadDocument, options?: {maxSamples?: number}): {rasterImages:number;imagePixelsAudited:false;space:string;metric:string;compared:number;changed:number;missing:number;invalid:number;unresolved:number;complete:boolean;rgbExact:boolean;opacityCompared:number;opacityChanged:number;maxOpacityError:number;opacityExact:boolean;scope:string;maxChannelError:number;maxDeltaE:number;samples:unknown[];exact:boolean;profilePolicy:string};
