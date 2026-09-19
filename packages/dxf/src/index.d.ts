import type { CadDocument, DxfVersion, Diagnostic, RGB } from '@revector/model';
export interface DxfOptions {
    version?: DxfVersion;
    precision?: number;
    strict?: boolean;
    xdata?: boolean;
}
export interface DxfResult {
    text: string;
    version: DxfVersion;
    acadVersion: string;
    diagnostics: Diagnostic[];
    entityCount: number;
    handleCount: number;
}
export function exportDxf(doc: CadDocument, options?: DxfOptions): DxfResult;
export function writeDxf(doc: CadDocument, options?: DxfOptions): string;
export function readDxf(text: string, options?: {
    maxPairs?: number;
}): CadDocument;
export function dxfString(value: unknown): string;
export function decodeDxfString(value: string): string;
export function nearestACI(rgb: RGB): number;
