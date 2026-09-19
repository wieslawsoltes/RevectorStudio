import type { Box, Point } from '@revector/geometry';
import type { Entity, LineEntity } from '@revector/model';
export class SpatialIndex<T = unknown> {
    constructor(items?: T[], getBox?: (item: T) => Box);
    items: T[];
    search(box: Box): T[];
}
export class DisjointSet {
    constructor(n: number);
    find(x: number): number;
    union(a: number, b: number): void;
}
export function connectedComponents<T>(entities: T[], getEndpoints: (entity: T) => Point[], tolerance?: number): T[][];
export function endpoints(entity: Entity): Point[];
export function joinLineChains(lines: LineEntity[], tolerance?: number): Array<{
    points: Point[];
    members: LineEntity[];
    closed: boolean;
}>;
