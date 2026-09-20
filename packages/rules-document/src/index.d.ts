import type { CadDocument } from '@revector/model';
import type { Rule } from '@revector/semantics';
export interface AnalysisOptions {semanticTolerance?:number;maxAnalysisEntities?:number;profile?:string;signal?:AbortSignal}
export function classifyTechnicalText(text:string):string[];
export function detectTables(document:CadDocument,options?:AnalysisOptions):any[];
export function detectTextFlows(document:CadDocument,options?:AnalysisOptions):any[];
export function detectTechnicalText(document:CadDocument,options?:AnalysisOptions):any[];
export function detectFields(document:CadDocument,options?:AnalysisOptions):any[];
export function detectDiagram(document:CadDocument,options?:AnalysisOptions):any[];
export function detectParallelBoundaries(document:CadDocument,options?:AnalysisOptions):any[];
export function detectConcentric(document:CadDocument,options?:AnalysisOptions):any[];
export function detectLeaders(document:CadDocument,options?:AnalysisOptions):any[];
export const documentRules:Rule[];

export function detectBorderlessTables(document:CadDocument,options?:AnalysisOptions):any[];
export function detectLists(document:CadDocument,options?:AnalysisOptions):any[];
