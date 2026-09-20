#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {packageDxf} from '@revector/dxf';
import { recoverPdfRaster, TesseractOcr } from '@revector/ocr';
import { PdfSource } from '@revector/pdf';
import { ConversionEngine } from '@revector/engine';
const usage = `Revector Studio — PDF vectors to semantic DXF (optional local raster OCR)
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
  --appearance                            Add sampled PDF appearance + hidden editable CAD layers
  --appearance-dpi NUMBER                  Explicit sampling DPI, default 144
  --strict-semantics                       Keep semantic errors fatal even with appearance
  --archive-source                         Also save the exact original PDF (may contain hidden data)
  --keep-images                           Export native IMAGE references + adjacent PNGs
  --ocr                                   Enable raster-region OCR
  --ocr-language eng|deu|pol|eng+pol        Recognition languages
  --ocr-scope raster|page                  Region or whole-page OCR
  --ocr-dpi NUMBER                        Default: 300
  --ocr-confidence NUMBER                 Default: 65
  --ocr-preprocess none|otsu|sauvola        Default: none
  --ocr-rotation 0|90|180|270               Recognition quarter-turn
  --ocr-deskew                             Estimate and correct small scan skew
  --ocr-invert                             Recognize light text on dark paper
  --ocr-tile-size NUMBER                   Overlapping tile side, default: 2048
  --ocr-trace-lines                        Infer linework after removing text
  --ocr-trace-mode axis|paths               Ruled lines or centerline graph
  --help
`;
const args = {};
const boolean = new Set(['strict', 'include-hidden', 'no-forms', 'help', 'ocr', 'ocr-deskew', 'ocr-invert', 'ocr-trace-lines','keep-images','appearance','strict-semantics','archive-source']);
const allowed = new Set(['appearance-dpi','ocr-language','ocr-scope','ocr-dpi','ocr-confidence','ocr-preprocess','ocr-rotation','ocr-tile-size','ocr-trace-mode','input', 'output', 'version', 'page', 'units', 'scale', 'profile', 'rules', 'decisions', 'password-env', 'report', 'scene', ...boolean]);
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
    let ocr,canvasFactory;
    try {
    if(args['keep-images']||args.appearance)canvasFactory=(await import('@napi-rs/canvas')).createCanvas;
    if (args.ocr) {
        const provider = await import('tesseract.js'), {createCanvas} = await import('@napi-rs/canvas');
        ocr = {languages:args['ocr-language']||'eng',scope:args['ocr-scope']||'raster',dpi:Number(args['ocr-dpi']||300),minConfidence:Number(args['ocr-confidence']||65),preprocess:args['ocr-preprocess']||'none',rotation:Number(args['ocr-rotation']||0),deskew:!!args['ocr-deskew'],invert:!!args['ocr-invert'],traceLines:!!args['ocr-trace-lines'],traceMode:args['ocr-trace-mode']||'axis',tileSize:Number(args['ocr-tile-size']||2048),canvasFactory:createCanvas,session:new TesseractOcr({provider,node:true,languages:args['ocr-language']||'eng',langPath:root+'/vendor/ocr/lang'})};
    }
        const engine = new ConversionEngine(), options = { version: args.version || '2018', units: args.units || 'mm', drawingScale: Number(args.scale || 1), profile: args.profile || 'cad', strict: !!args.strict, strictSemantics:!!args['strict-semantics'], includeHidden: !!args['include-hidden'], preserveForms: !args['no-forms'], signal: controller.signal };
        if (args.rules)
            options.ruleSet = JSON.parse(await readFile(args.rules, 'utf8'));
        if (args.decisions)
            options.decisions = JSON.parse(await readFile(args.decisions, 'utf8'));
        const pages = args.page === 'all' ? Array.from({ length: source.numPages }, (_, i) => i + 1) : [Number(args.page || 1)];
        const batch = args.page === 'all';
        if (batch)
            await mkdir(args.output, { recursive: true });
        for (const page of pages) {
            let scene = await source.extract(page, { signal: controller.signal });
            if(args['keep-images'])scene=await source.preserveRasterImages(scene,{canvasFactory,signal:controller.signal});
            if (ocr) scene = await recoverPdfRaster(source,scene,{...ocr,signal:controller.signal});
            if(args.appearance)scene=await source.captureAppearance(scene,{dpi:Number(args['appearance-dpi']||144),canvasFactory,signal:controller.signal});
            const result = await engine.convertScene(scene, options), output = batch ? path.join(args.output, `page-${page}.dxf`) : args.output;
            await mkdir(path.dirname(path.resolve(output)), { recursive: true });
            if(result.document.assets?.length||args['archive-source']) {
                const pack=packageDxf(result.document,{version:options.version,strict:options.strict,filename:path.basename(output),sourcePdf:args['archive-source']?data:undefined});
                for(const file of pack.files){const destination=path.join(path.dirname(path.resolve(output)),file.name);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,file.data);}
            } else await writeFile(output, result.dxf.text);
            await writeFile(pages.length === 1 && args.report ? args.report : output.replace(/\.dxf$/i, '') + '.report.json', JSON.stringify(result.report, null, 2) + '\n');
            if (args.scene)
                await writeFile(pages.length === 1 ? args.scene : output + '.scene.json', JSON.stringify(scene));
            console.log(`${output}: ${result.document.entities.length} entities, ${result.document.blocks.length} blocks, ${result.dxf.acadVersion}, ${result.report.timings.totalMs.toFixed(1)} ms`);
            for (const d of result.report.diagnostics)
                console.warn(`${d.severity}: ${d.code}: ${d.message}`);
        }
    }
    finally {
        await ocr?.session.dispose();
        await source.dispose();
    }
}
catch (e) {
    console.error('revector:', e.message);
    process.exitCode = e.name === 'AbortError' ? 130 : 1;
}
