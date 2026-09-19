import type { Rule, RuleOptions } from '@revector/semantics';
import type { Path } from '@revector/geometry';
export const cadRules: Rule[];
export const CAD_PROFILES: Readonly<Record<'exact' | 'cad' | 'inferred' | 'pid', RuleOptions & {
    name: string;
    description: string;
}>>;
export function detectProducerProfile(source: Record<string, unknown>): {
    family: string;
    confidence: number;
};
export class VectorTemplateLibrary {
    register(template: {
        name: string;
        paths: Path[];
        semantic: Record<string, unknown>;
        tolerance?: number;
    }): this;
    match(paths: Path[]): Array<{
        name: string;
        semantic: Record<string, unknown>;
        confidence: number;
    }>;
}
