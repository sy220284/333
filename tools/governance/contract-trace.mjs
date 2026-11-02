#!/usr/bin/env node
import ts from '../dev/node_modules/typescript/lib/typescript.js';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const missingPath = process.argv[2], outputPath = process.argv[3];
if(!missingPath || !outputPath) throw new Error('用法：contract-trace.mjs missing-sources.json output.json');
const missing = JSON.parse(readFileSync(missingPath,'utf8'));
if(!Array.isArray(missing.entries)) throw new Error('缺失模块索引格式异常');
const targets = new Map(missing.entries.filter(e=>e.needsRecovery || !e.internal).map(e=>[e.target,e]));
function walk(dir) {
  const out=[];
  if(!existsSync(dir)) return out;
  for(const item of readdirSync(dir,{withFileTypes:true})) {
    const absolute=join(dir,item.name);
    if(item.isDirectory()) out.push(...walk(absolute));
    else if(item.isFile() && /\.(ts|tsx|mts|cts)$/.test(item.name)) out.push(absolute);
  }
  return out;
}
const records=new Map([...targets].map(([target,meta])=>[target,{target,referencedIn:0,typeOnlyReferences:0,importedSymbols:new Map(),locations:[],classification:'unclassified',originalMissingReferences:meta.references,reachableAtRuntime:false}]));
for(const file of walk(resolve(root,'src'))) {
  const filePath=relative(root,file).replaceAll('\\','/');
  const code=readFileSync(file,'utf8');
  const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function lookup(request){
    if(!request.startsWith('.')) return targets.get(request) ? request : null;
    const absolute=resolve(dirname(file),request.replace(/\.(js|mjs|cjs)$/,''));
    const candidate=`${relative(root,absolute).replaceAll('\\','/')}.ts`;
    if(targets.has(candidate)) return candidate;
    const alt=candidate.replace(/\.ts$/,'/index.ts');
    return targets.has(alt)?alt:null;
  }
  function increment(target, name, alias, typeOnly, node, kind) {
    const item=records.get(target); if(!item) return;
    item.referencedIn++;
    if(typeOnly) item.typeOnlyReferences++;
    else item.reachableAtRuntime=true;
    const ref=item.importedSymbols.get(name)??{name,imports:0,typeOnlyImports:0,consumers:[]};
    ref.imports++;
    if(typeOnly) ref.typeOnlyImports++;
    const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
    ref.consumers.push({file:filePath,line,as:alias,kind});
    item.importedSymbols.set(name,ref);
    item.locations.push({file:filePath,line,kind,name,as:alias,typeOnly});
  }
  for(const node of source.statements) {
    if(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)){
      const target=lookup(node.moduleSpecifier.text);
      if(!target)continue;
      const clause=node.importClause;
      if(!clause){ increment(target,'(side-effect)','',false,node,'import-side-effect');continue; }
      const typeOnly=Boolean(clause.isTypeOnly);
      if(clause.name)increment(target,'default',clause.name.text,typeOnly,node,'default-import');
      if(clause.namedBindings){
        if(ts.isNamespaceImport(clause.namedBindings))increment(target,'*',clause.namedBindings.name.text,typeOnly,node,'namespace-import');
        else for(const x of clause.namedBindings.elements)increment(target,x.propertyName?.text??x.name.text,x.name.text,typeOnly||Boolean(x.isTypeOnly),node,'named-import');
      }
    }
    if(ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const target=lookup(node.moduleSpecifier.text);if(!target)continue;
      if(!node.exportClause){increment(target,'*','*',Boolean(node.isTypeOnly),node,'re-export-all');continue;}
      if(ts.isNamedExports(node.exportClause))for(const x of node.exportClause.elements)increment(target,x.propertyName?.text??x.name.text,x.name.text,Boolean(node.isTypeOnly)||Boolean(x.isTypeOnly),node,'re-export');
      if(ts.isNamespaceExport(node.exportClause))increment(target,'*',node.exportClause.name.text,Boolean(node.isTypeOnly),node,'re-export-namespace');
    }
    // Dynamic import and require are tracked separately because they change runtime behavior.
    function dynamicVisit(n) {
      if(ts.isCallExpression(n) && n.arguments.length>=1 && ts.isStringLiteral(n.arguments[0])) {
        const dynamic= n.expression.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression)&&n.expression.text==='require');
        if(dynamic){const target=lookup(n.arguments[0].text);if(target)increment(target,'*','*',false,n,'dynamic-import');}
      }
      ts.forEachChild(n,dynamicVisit);
    }
    ts.forEachChild(node,dynamicVisit);
  }
}
const out=[...records.values()].map(item=>{
  const syms=[...item.importedSymbols.values()].sort((a,b)=>b.imports-a.imports);
  const names=syms.map(x=>x.name);
  item.classification=names.length===0?'not-found-in-current-src':item.reachableAtRuntime?'runtime-required':'type-only';
  return {
    target:item.target,kind:item.classification,originalMissingReferences:item.originalMissingReferences,importSites:item.referencedIn,
    uniqueConsumers:new Set(item.locations.map(x=>x.file)).size,symbols:syms,locations:item.locations,
  };
}).sort((a,b)=>b.originalMissingReferences-a.originalMissingReferences);
const summary={
  total:out.length,
  typeOnly:out.filter(x=>x.kind==='type-only').length,
  runtimeRequired:out.filter(x=>x.kind==='runtime-required').length,
  unreferenced:out.filter(x=>x.kind==='not-found-in-current-src').length,
  top:out.slice(0,25).map(x=>({target:x.target,kind:x.kind,references:x.originalMissingReferences,symbols:x.symbols.map(z=>z.name)}))
};
mkdirSync(dirname(resolve(outputPath)),{recursive:true});
writeFileSync(outputPath,`${JSON.stringify({summary,entries:out},null,2)}\n`);
console.log(`[333-contracts] ${JSON.stringify(summary)}`);
