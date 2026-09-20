import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..');
test('Every static cross-package browser import resolves through the shipped import map',()=>{
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const map=JSON.parse(html.match(/<script type="importmap">([^]*?)<\/script>/)[1]).imports;
    let checked=0;
    for(const file of fs.readdirSync(path.join(root,'packages'),{recursive:true}).filter(x=>x.includes('/src/')&&x.endsWith('.js'))){
        const source=ts.createSourceFile(file,fs.readFileSync(path.join(root,'packages',file),'utf8'),ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
        for(const statement of source.statements){
            if(!(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))||!statement.moduleSpecifier)continue;
            const spec=statement.moduleSpecifier.text;
            if(!spec.startsWith('@revector/'))continue;
            checked++;
            const prefix=Object.keys(map).filter(k=>k.endsWith('/')&&spec.startsWith(k)).sort((a,b)=>b.length-a.length)[0];
            const target=map[spec]||(prefix?map[prefix]+spec.slice(prefix.length):null);
            assert.ok(target,`${file}: unmapped browser import ${spec}`);
            assert.ok(fs.statSync(path.resolve(root,target)).isFile(),`${file}: missing import target ${target}`);
        }
    }
    assert.ok(checked>50,'The actual package dependency graph was traversed');
});
