import type { ConversionResult } from '@revector/engine';
import type { PdfScene, Candidate } from '@revector/model';
import type { PdfSource } from '@revector/pdf';
export interface WorkbenchConfig {
    pdfjsModuleUrl?: string;
    pdfjsWorkerUrl?: string;
    conversionWorkerUrl?: string | URL;
    assetBase?: string;
    pdfOptions?: Record<string, unknown>;
    demoBytes?: number[] | Uint8Array;
    demoUrl?: string;
    autoDemo?: boolean;
    onConverted?: (result: ConversionResult) => void;
    onError?: (error: Error) => void;
}
export class Workbench {
    constructor(root: HTMLElement, config?: WorkbenchConfig);
    source: PdfSource | null;
    scene: PdfScene | null;
    result: ConversionResult | null;
    page: number;
    fileName: string;
    openFile(file: File): Promise<void>;
    openBytes(bytes: Uint8Array, name: string, project?: Record<string, unknown> | null): Promise<void>;
    demo(): Promise<void>;
    selectPage(page: number): Promise<void>;
    run(extract?: boolean): Promise<ConversionResult | undefined>;
    cancel(): void;
    fit(): void;
    setTab(tab: 'recovery' | 'diagnostics' | 'rules' | 'source'): void;
    decide(candidate: Candidate, decision: 'accept' | 'reject' | null): Promise<void>;
    exportDxf(): void;
    exportAll(): Promise<void>;
    dispose(): Promise<void>;
}
export function mountWorkbench(root: HTMLElement, config?: WorkbenchConfig): Workbench;
