export function element<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, unknown>, ...children: unknown[]): HTMLElementTagNameMap[K];
export function button(text: string, onClick: (event: MouseEvent) => void, options?: {
    title?: string;
    className?: string;
    [key: string]: unknown;
}): HTMLButtonElement;
export function download(data: BlobPart | Blob, name: string, type?: string): Blob;
export function toast(message: string, options?: {
    error?: boolean;
    timeout?: number;
}): HTMLDivElement;
export function dialog(options: {
    title: string;
    content: Node;
    actions?: Array<{
        label: string;
        primary?: boolean;
        run: (dialog: HTMLDialogElement) => void;
    }>;
}): HTMLDialogElement;
export function askValue(title: string, label: string, value?: string, options?: {
    type?: string;
}): Promise<string | null>;
export class DisposableStore {
    add(fn: () => void): () => void;
    dispose(): void;
}
export function crc32(bytes: Uint8Array): number;
export function zipFiles(files: Array<{
    name: string;
    data: string | Uint8Array | ArrayBuffer;
}>): Blob;
