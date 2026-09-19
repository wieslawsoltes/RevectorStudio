#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PdfSource } from '@revector/pdf';
import { ConversionEngine } from '@revector/engine';
const usage = `Revector Studio — PDF vectors to semantic DXF (no OCR)
Usage: npm run convert -- --input drawing.pdf --output drawing.dxf [options]
  --version 2000|2004|2007|2010|2013|2018   Default: 2018
  --page N|all                             Default: 1; all outputs to a directory
  --units mm|cm|m|in|pt|unitless            Default: mm
  --scale NUMBER                          Model / paper factor, default: 1
  --profile exact|cad|inferred|pid         Default: cad
  --rules rules.json                      Declarative classification rules
  --decisions decisions.json              Candidate-id → accept/reject mapping
  --password-env ENV_NAME                 Read PDF password from environment
  --strict                                Block unresolved conversion errors
  --include-hidden                        Include hidden optional-content layers
  --no-forms                              Keep form primitives expanded
  --report report.json                    Default: adjacent .report.json
  --scene scene.json                      Save immutable PDF paint intermediate
  --help
`;
const args = {};
const boolean = new Set(['strict', 'include-hidden', 'no-forms', 'help']);
const allowed = new Set(['input', 'output', 'version', 'page', 'units', 'scale', 'profile', 'rules', 'decisions', 'password-env', 'report', 'scene', ...boolean]);
try {
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (!arg.startsWith('--') || !allowed.has(arg.slice(2)))
            throw Error('Unknown argument: ' + arg);
        const key = arg.slice(2);
        args[key] = boolean.has(key) ? true : process.argv[++i];
        if (args[key] === undefined)
            throw Error('Missing value for ' + arg);
    }
    if (args.help || !args.input) {
        console.log(usage);
        process.exit(args.help ? 0 : 2);
    }
    if (!args.output)
        throw Error('--output is required');
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    const root = path.resolve(import.meta.dirname, '..'), vendor = root + '/vendor/pdfjs/';
    const data = new Uint8Array(await readFile(args.input));
    const pdfOptions = { moduleUrl: pathToFileURL(vendor + 'legacy/build/pdf.mjs').href, workerUrl: pathToFileURL(vendor + 'legacy/build/pdf.worker.mjs').href, name: path.basename(args.input), pdfOptions: { cMapUrl: vendor + 'cmaps/', cMapPacked: true, wasmUrl: vendor + 'wasm/', iccUrl: vendor + 'iccs/' } };
    if (args['password-env'])
        pdfOptions.onPassword = () => process.env[args['password-env']] ?? null;
    const source = await PdfSource.open(data, pdfOptions);
    try {
        const engine = new ConversionEngine(), options = { version: args.version || '2018', units: args.units || 'mm', drawingScale: Number(args.scale || 1), profile: args.profile || 'cad', strict: !!args.strict, includeHidden: !!args['include-hidden'], preserveForms: !args['no-forms'], signal: controller.signal };
        if (args.rules)
            options.ruleSet = JSON.parse(await readFile(args.rules, 'utf8'));
        if (args.decisions)
            options.decisions = JSON.parse(await readFile(args.decisions, 'utf8'));
        const pages = args.page === 'all' ? Array.from({ length: source.numPages }, (_, i) => i + 1) : [Number(args.page || 1)];
        const batch = args.page === 'all';
        if (batch)
            await mkdir(args.output, { recursive: true });
        for (const page of pages) {
            const scene = await source.extract(page, { signal: controller.signal }), result = await engine.convertScene(scene, options), output = batch ? path.join(args.output, `page-${page}.dxf`) : args.output;
            await mkdir(path.dirname(path.resolve(output)), { recursive: true });
            await writeFile(output, result.dxf.text);
            await writeFile(pages.length === 1 && args.report ? args.report : output.replace(/\.dxf$/i, '') + '.report.json', JSON.stringify(result.report, null, 2) + '\n');
            if (args.scene)
                await writeFile(pages.length === 1 ? args.scene : output + '.scene.json', JSON.stringify(scene));
            console.log(`${output}: ${result.document.entities.length} entities, ${result.document.blocks.length} blocks, ${result.dxf.acadVersion}, ${result.report.timings.totalMs.toFixed(1)} ms`);
            for (const d of result.report.diagnostics)
                console.warn(`${d.severity}: ${d.code}: ${d.message}`);
        }
    }
    finally {
        await source.dispose();
    }
}
catch (e) {
    console.error('revector:', e.message);
    process.exitCode = e.name === 'AbortError' ? 130 : 1;
}
