import { readFile, writeFile, mkdir, cp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
let ts;
try {
    ts = require('typescript');
}
catch {
    try {
        ts = require('/usr/local/slides_js/node_modules/typescript/lib/typescript.js');
    }
    catch {
        throw Error('Build requires TypeScript: npm install --save-dev typescript');
    }
}
try { require.resolve('tesseract.js'); await import('./vendor-ocr.mjs'); }
catch (error) { if (process.env.CI) throw error; console.warn('OCR runtime not installed; vector-only build. Run npm install and npm run vendor:ocr.'); }
const modules = {};
for (const pkg of await readdir(root + '/packages'))
    for (const file of await readdir(`${root}/packages/${pkg}/src`)) {
        if (!file.endsWith('.js'))
            continue;
        const id = '@revector/' + pkg + (file === 'index.js' ? '' : '/' + file);
        let source = await readFile(`${root}/packages/${pkg}/src/${file}`, 'utf8');
        source = source.replace(/(from\s*['"])\.\/([^'"]+)(['"])/g, (_, a, f, b) => a + '@revector/' + pkg + (f === 'index.js' ? '' : '/' + f) + b);
        modules[id] = source;
    }
// Static factory bundle: no eval/new Function. The kernel runs in a disposable worker.
let factories = '';
for (const [id, source] of Object.entries(modules)) {
    const input = source.replace(/import\(\/\* @vite-ignore \*\/ moduleUrl\)/g, 'globalThis.__revectorImport(moduleUrl)').replace(/import\('pdfjs-dist\/build\/pdf.mjs'\)/g, "globalThis.__revectorImport('pdfjs-dist/build/pdf.mjs')");
    const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, removeComments: false } }).outputText;
    factories += `${JSON.stringify(id)}:(require,module,exports)=>{\n${output}\n},\n`;
}
const worker = `/* Revector Studio MIT — generated static worker bundle. */\nglobalThis.__revectorImport=url=>import(url);\nconst factories={${factories}};\nconst cache=Object.create(null);function require(id){if(cache[id])return cache[id].exports;const f=factories[id];if(!f)throw Error('Unknown module '+id);const module={exports:{}};cache[id]=module;f(require,module,module.exports);return module.exports;}\nrequire('@revector/engine/worker.js');\n`;
await mkdir(root + '/apps/studio', { recursive: true });
await writeFile(root + '/apps/studio/conversion-worker.js', worker);
async function collectNotices(directory) {
    const notices = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) notices.push(...await collectNotices(file));
        else if (entry.name.startsWith('LICENSE')) notices.push(path.relative(root, file) + '\n' + await readFile(file, 'utf8'));
    }
    return notices;
}
const thirdPartyNotice = [await readFile(root + '/LICENSE', 'utf8'), ...await collectNotices(root + '/vendor/pdfjs'), await readFile(root + '/packages/dxf/LICENSE.ezdxf', 'utf8')].join('\n\n');
const escape = x => JSON.stringify(x).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const pdf = await readFile(root + '/vendor/pdfjs/legacy/build/pdf.mjs', 'utf8'), pdfWorker = await readFile(root + '/vendor/pdfjs/legacy/build/pdf.worker.mjs', 'utf8'), demo = Array.from(await readFile(root + '/assets/cooling-water.pdf')), css = await readFile(root + '/packages/workbench/src/styles.css', 'utf8');
const binaries = {};
for (const dir of ['cmaps', 'wasm', 'iccs'])
    for (const file of await readdir(root + '/vendor/pdfjs/' + dir)) {
        if (!/\.(bcmap|wasm|icc|js)$/.test(file))
            continue;
        binaries[dir + '/' + file] = (await readFile(root + '/vendor/pdfjs/' + dir + '/' + file)).toString('base64');
    }
const boot = `const binaryAssets=${escape(binaries)};class EmbeddedBinaryDataFactory{async fetch({kind,filename}){const dir={cMapUrl:'cmaps',wasmUrl:'wasm'}[kind],data=binaryAssets[dir+'/'+filename];if(!data)throw Error('Optional PDF resource is not bundled: '+kind+'/'+filename);return Uint8Array.from(atob(data),c=>c.charCodeAt(0));}}const sources=${escape(modules)},imports={};for(const[id,source]of Object.entries(sources))imports[id]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);const blob=s=>URL.createObjectURL(new Blob([s],{type:'text/javascript'}));globalThis.REVECTOR_CONFIG={pdfjsModuleUrl:blob(${escape(pdf)}),pdfjsWorkerUrl:blob(${escape(pdfWorker)}),conversionWorkerUrl:blob(${escape(worker)}),demoBytes:${escape(demo)},assetBase:'./vendor/pdfjs/',pdfOptions:{BinaryDataFactory:EmbeddedBinaryDataFactory,useWorkerFetch:false,iccUrl:'data:application/octet-stream;base64,'+binaryAssets['iccs/CGATS001Compat-v2-micro.icc']+'#/'},ocrAssetBase:location.protocol==='about:'?undefined:new URL('./vendor/ocr/',document.baseURI).href,autoDemo:true};import('@revector/workbench').then(({mountWorkbench})=>globalThis.workbench=mountWorkbench(document.querySelector('#app'),REVECTOR_CONFIG)).catch(e=>{document.querySelector('#app').textContent='Startup failed: '+e.message;console.error(e);});`;
await writeFile(root + '/apps/studio/offline-bootstrap.js', boot);
await writeFile(root + '/revector-studio.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revector Studio · PDF → DXF</title><style>${css}</style></head><body><script type="text/plain" id="third-party-licenses">${thirdPartyNotice.replace(/<\/script/gi, '<\\/script')}</script><div id="app"></div><script>${boot}</script></body></html>`);
const dist = root + '/dist';
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const p of ['index.html', 'packages', 'vendor', 'assets', 'apps', 'LICENSE'])
    await cp(root + '/' + p, dist + '/' + p, { recursive: true });
await rm(dist + '/apps/studio/offline-bootstrap.js', { force: true });
console.log('Built conversion worker, standalone HTML, and dist/ static site.');
