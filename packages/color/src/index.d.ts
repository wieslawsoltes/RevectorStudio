import type { RGB, CadDocument } from '@revector/model';
export function normalizeRgb(value: string | ArrayLike<number>, options?: {domain?: 'byte'|'unit'}): RGB;
export function displayColor(rgb: RGB, mode?: 'faithful'|'contrast'): string;
export function srgbToLab(rgb: RGB): [number,number,number];
export function deltaE2000(a: readonly number[], b: readonly number[]): number;
export function auditColors(original: CadDocument, preview: CadDocument, options?: {maxSamples?: number}): {space:string;metric:string;compared:number;changed:number;maxChannelError:number;maxDeltaE:number;samples:unknown[];exact:boolean;profilePolicy:string};
