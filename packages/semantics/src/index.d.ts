import type { CadDocument, Candidate, Proposal } from '@revector/model';
import type { Progress } from '@revector/pdf';
export type CandidateProposal = Pick<Candidate, 'title' | 'members' | 'confidence' | 'exact' | 'evidence' | 'proposal'> & Partial<Pick<Candidate, 'id' | 'errorBound'>>;
export type RuleDocument = Pick<CadDocument, 'entities' | 'blocks' | 'layers' | 'groups' | 'source' | 'pageBox' | 'units' | 'revision'>;
export interface RuleOptions {
    minConfidence?: number;
    maxCandidates?: number;
    decisions?: Record<string, 'accept' | 'reject'>;
    disabledRules?: string[];
    fidelity?: 'exact' | 'inferred';
    signal?: AbortSignal;
    onProgress?: (p: Progress) => void;
}
export interface RuleContext {
    document: Readonly<RuleDocument>;
    options: RuleOptions;
    signal?: AbortSignal;
    checkAbort(): void;
}
export interface Rule {
    id: string;
    version?: string;
    title?: string;
    description?: string;
    stage?: number;
    priority?: number;
    after?: string[];
    run(context: RuleContext): Iterable<CandidateProposal> | AsyncIterable<CandidateProposal> | Promise<Iterable<CandidateProposal> | AsyncIterable<CandidateProposal>>;
}
export function commitCandidate(document: CadDocument, candidate: Candidate): CadDocument;
export class RuleEngine {
    register(rule: Rule): this;
    unregister(id: string): boolean;
    list(): Omit<Rule, 'run'>[];
    run(document: CadDocument, options?: RuleOptions): Promise<CadDocument>;
    accept(document: CadDocument, id: string): CadDocument;
    reject(document: CadDocument, id: string): CadDocument;
}
export type Predicate = {
    all: Predicate[];
} | {
    any: Predicate[];
} | {
    not: Predicate;
} | {
    field: 'type' | 'layer' | 'text' | 'font' | 'semantic.class' | 'source.kind';
    op?: 'eq' | 'in' | 'contains' | 'prefix' | 'regex';
    value: unknown;
};
export interface JsonRuleSet {
    schema: 'revector.rules/1';
    rules: Array<{
        id: string;
        version?: string;
        title?: string;
        confidence?: number;
        stage?: number;
        priority?: number;
        when: Predicate;
        then: {
            layer?: string;
            semantic?: Record<string, unknown>;
        };
    }>;
}
export function compileRuleSet(json: JsonRuleSet): Rule[];
export function safeRegex(pattern: string): RegExp;
