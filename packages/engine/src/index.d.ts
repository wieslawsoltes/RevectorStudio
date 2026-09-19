import type { CadDocument, PdfScene, Diagnostic, DxfVersion } from '@revector/model';
import type { PdfOptions } from '@revector/pdf';
import type { ConversionOptions } from '@revector/cad';
import type { Rule, RuleOptions, JsonRuleSet } from '@revector/semantics';
import type { DxfResult } from '@revector/dxf';
export { CAD_PROFILES } from '@revector/rules-cad';
export { DEFAULT_CONVERSION_OPTIONS } from '@revector/cad';
export interface EngineOptions extends ConversionOptions, RuleOptions {
    version?: DxfVersion;
    profile?: 'exact' | 'cad' | 'inferred' | 'pid';
    ruleSet?: JsonRuleSet;
}
export interface ConversionReport {
    schema: 'revector.report/1';
    version: string;
    source: Record<string, unknown>;
    target: {
        version: DxfVersion;
        acadVersion: string;
        units: string;
    };
    summary: Record<string, unknown>;
    producer: {
        family: string;
        confidence: number;
    };
    diagnostics: Diagnostic[];
    rules: unknown[];
    timings: Record<string, number>;
    coverage: Record<string, number>;
    validation: {
        model: {
            valid: boolean;
            errors: string[];
        };
        roundtrip: {
            valid: boolean;
            errors: string[];
        };
    };
}
export interface ConversionResult {
    document: CadDocument;
    preview: CadDocument;
    dxf: DxfResult;
    report: ConversionReport;
}
export class ConversionEngine {
    constructor(options?: {
        rules?: Rule[];
    });
    register(rule: Rule): this;
    convertScene(scene: PdfScene, options?: EngineOptions): Promise<ConversionResult>;
    convertPdf(bytes: Uint8Array | ArrayBuffer, options?: EngineOptions & PdfOptions & {
        page?: number;
    }): Promise<ConversionResult & {
        scene: PdfScene;
    }>;
}
export function convertScene(scene: PdfScene, options?: EngineOptions): Promise<ConversionResult>;
export function convertPdf(bytes: Uint8Array | ArrayBuffer, options?: EngineOptions & PdfOptions & {
    page?: number;
}): Promise<ConversionResult & {
    scene: PdfScene;
}>;
export class ConversionWorker {
    constructor(url: string | URL);
    convert(scene: PdfScene, options?: EngineOptions, controls?: Pick<ConversionOptions, 'signal' | 'onProgress'>): Promise<ConversionResult>;
    cancel(): void;
    dispose(): void;
}
