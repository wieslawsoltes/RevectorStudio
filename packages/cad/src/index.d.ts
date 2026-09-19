import type { CadDocument, PdfScene, Units } from '@revector/model';
import type { Progress } from '@revector/pdf';
export interface ConversionOptions {
    units?: Units;
    drawingScale?: number;
    includeHidden?: boolean;
    clip?: boolean;
    preserveForms?: boolean;
    textMode?: 'adaptive' | 'glyphs' | 'runs';
    styleLayers?: boolean;
    strict?: boolean;
    precision?: number;
    patternLimit?: number;
    booleanTolerance?: number;
    signal?: AbortSignal;
    onProgress?: (p: Progress) => void;
}
export const DEFAULT_CONVERSION_OPTIONS: Readonly<ConversionOptions>;
export function lowerScene(scene: PdfScene, options?: ConversionOptions): Promise<CadDocument>;
