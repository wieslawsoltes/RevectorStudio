import { readdir, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const destination = path.join(root, 'release', 'npm');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const records = [];
for (const name of (await readdir(path.join(root, 'packages'))).sort()) {
    const cwd = path.join(root, 'packages', name);
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--ignore-scripts', '--workspaces=false', '--json', '--pack-destination', destination], { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
    if (result.error || result.status !== 0) {
        throw result.error ?? new Error(`npm pack failed for ${name}: ${result.stderr}`);
    }
    const metadata = JSON.parse(result.stdout)[0];
    const data = await readFile(path.join(destination, metadata.filename));
    records.push({ name: metadata.name, version: metadata.version, file: metadata.filename,
        bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'),
        integrity: metadata.integrity, files: metadata.files.map(f => f.path) });
    console.log(`${metadata.name}: ${metadata.filename} (${data.length} bytes)`);
}
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(records, null, 2) + '\n');
await writeFile(path.join(destination, 'SHA256SUMS'), records.map(p => `${p.sha256}  ${p.file}`).join('\n') + '\n');
console.log(`Packed ${records.length} independent npm packages. No packages were published.`);
