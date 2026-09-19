import { mkdir, readdir, symlink, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'node_modules/@revector'), { recursive: true });
for (const name of await readdir(resolve(root, 'packages'))) {
    const to = resolve(root, 'node_modules/@revector', name);
    try {
        await lstat(to);
    }
    catch {
        await symlink(resolve(root, 'packages', name), to, 'dir');
    }
}
