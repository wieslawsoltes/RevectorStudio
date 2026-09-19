import { cp, mkdir, access, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'node_modules/pdfjs-dist');
try {
    await access(src);
}
catch {
    console.error('PDF.js is not installed. Run npm install, then npm run vendor.');
    process.exit(1);
}
const dst = resolve(root, 'vendor/pdfjs');
await mkdir(dst, { recursive: true });
for (const name of ['build', 'legacy/build', 'cmaps', 'wasm', 'iccs', 'LICENSE'])
    await cp(resolve(src, name), resolve(dst, name), { recursive: true });
// Do not redistribute font programs. PDF.js can use browser standard fonts;
// applications may provide a licensed standardFontDataUrl in their integration.
console.log('Vendored PDF.js build, CMaps, ICC/WASM decoders and license. No font files copied.');
const manifest = JSON.parse(await readFile(resolve(src, 'package.json'), 'utf8'));
await writeFile(resolve(dst, 'BUILD.json'), JSON.stringify({ version: manifest.version, channel: 'npm release', repository: 'mozilla/pdf.js', standardFontsIncluded: false }, null, 2) + '\n');
