import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let ts;
try {
    ts = require('typescript');
}
catch {
    ts = require('/usr/local/slides_js/node_modules/typescript/lib/typescript.js');
}
const root = path.resolve(import.meta.dirname, '..');
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory())
            await visit(file);
        else if (/\.(?:m?js|d\.ts|ts)$/.test(file)) {
            const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
            if (source.parseDiagnostics.length)
                throw new Error(`Cannot format invalid source: ${file}`);
            await writeFile(file, printer.printFile(source));
        }
    }
}
for (const folder of ['packages', 'scripts', 'tests', 'examples'])
    await visit(path.join(root, folder));
console.log('Formatted original sources and declarations; third-party files were not modified.');
