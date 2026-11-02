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
// Use the real shipping bundle's feature selection rather than treating every
// syntactic require() as a reachable release feature. Only prove exclusions;
// anything we cannot prove stays a potentially reachable runtime dependency.
const rebuildSource = readFileSync(resolve(root, 'build/rebuild.mjs'), 'utf8');
const releaseFeatureMatch = rebuildSource.match(/features:\s*\[([^\]]+)\]/);
if (!releaseFeatureMatch) throw new Error('无法从正式构建中读取 features，拒绝推断运行时可达性');
const releaseFeatures = new Set(
  [...releaseFeatureMatch[1].matchAll(/['"]([A-Z][A-Z_0-9]+)['"]/g)].map(x => x[1]),
);
const externalRelease = /['"]process\.env\.USER_TYPE['"]\s*:\s*['"]"external"['"]/.test(rebuildSource);
if (!externalRelease) throw new Error('无法确认正式构建为外部用户，拒绝排除内部命令');

// true/false means statically provable; null means runtime-dependent.
function compileCondition(n, source) {
  if (ts.isParenthesizedExpression(n)) return compileCondition(n.expression, source);
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'feature') {
    if (n.arguments.length !== 1 || !ts.isStringLiteral(n.arguments[0])) return null;
    return releaseFeatures.has(n.arguments[0].text);
  }
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) {
    const value = compileCondition(n.operand, source);
    return value === null ? null : !value;
  }
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const left = compileCondition(n.left, source);
      const right = compileCondition(n.right, source);
      return left === false || right === false ? false : left === true && right === true ? true : null;
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      const left = compileCondition(n.left, source);
      const right = compileCondition(n.right, source);
      return left === true || right === true ? true : left === false && right === false ? false : null;
    }
    if (externalRelease && (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken)) {
      const left = n.left.getText(source).replaceAll(' ', '');
      const right = n.right.getText(source).replaceAll(' ', '');
      if (left === 'process.env.USER_TYPE' && /^['"](?:ant|external)['"]$/.test(right)) return right.includes('external');
      if (right === 'process.env.USER_TYPE' && /^['"](?:ant|external)['"]$/.test(left)) return left.includes('external');
    }
  }
  return null;
}
function isExcludedByReleaseBuild(node, source) {
  for (let n = node; n.parent; n = n.parent) {
    const parent = n.parent;
    if (ts.isIfStatement(parent)) {
      const condition = compileCondition(parent.expression, source);
      if (condition === false && n === parent.thenStatement) return true;
      if (condition === true && n === parent.elseStatement) return true;
    }
    if (ts.isConditionalExpression(parent)) {
      const condition = compileCondition(parent.condition, source);
      if (condition === false && n === parent.whenTrue) return true;
      if (condition === true && n === parent.whenFalse) return true;
    }
    // feature('X') && require('./optional.js') also compiles away when X
    // is disabled. The right-hand side is never evaluated in that case.
    if (ts.isBinaryExpression(parent) && n === parent.right) {
      const condition = compileCondition(parent.left, source);
      if (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && condition === false) return true;
      if (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken && condition === true) return true;
    }
  }
  return false;
}
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
const records=new Map([...targets].map(([target,meta])=>[target,{target,referencedIn:0,typeOnlyReferences:0,importedSymbols:new Map(),locations:[],classification:'unclassified',originalMissingReferences:meta.references,reachableAtRuntime:false,runtimeSites:0,provenExcludedSites:0}]));
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
    else {
      item.runtimeSites++;
      if (isExcludedByReleaseBuild(node, source)) item.provenExcludedSites++;
      else item.reachableAtRuntime=true;
    }
    const ref=item.importedSymbols.get(name)??{name,imports:0,typeOnlyImports:0,consumers:[]};
    ref.imports++;
    if(typeOnly) ref.typeOnlyImports++;
    const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
    ref.consumers.push({file:filePath,line,as:alias,kind});
    item.importedSymbols.set(name,ref);
    item.locations.push({file:filePath,line,kind,name,as:alias,typeOnly,
      releaseReachability: typeOnly ? 'type-only' : isExcludedByReleaseBuild(node, source) ? 'excluded-by-build' : 'potentially-reachable',
    });
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
  item.classification=names.length===0?'not-found-in-current-src':item.reachableAtRuntime?'runtime-required':item.runtimeSites>0?'build-excluded':'type-only';
  return {
    target:item.target,kind:item.classification,originalMissingReferences:item.originalMissingReferences,importSites:item.referencedIn,
    uniqueConsumers:new Set(item.locations.map(x=>x.file)).size,symbols:syms,locations:item.locations,
    runtimeSites:item.runtimeSites,provenExcludedSites:item.provenExcludedSites,
  };
}).sort((a,b)=>b.originalMissingReferences-a.originalMissingReferences);
const summary={
  total:out.length,
  typeOnly:out.filter(x=>x.kind==='type-only').length,
  buildExcluded:out.filter(x=>x.kind==='build-excluded').length,
  runtimeRequired:out.filter(x=>x.kind==='runtime-required').length,
  unreferenced:out.filter(x=>x.kind==='not-found-in-current-src').length,
  releaseGatedOnly:out.filter(x=>x.runtimeSites>0&&x.runtimeSites===x.provenExcludedSites).length,
  releaseGatedReferences:out.reduce((n,x)=>n+x.provenExcludedSites,0),
  potentiallyReachableReferences:out.reduce((n,x)=>n+x.runtimeSites-x.provenExcludedSites,0),
  enabledBuildFeatures:[...releaseFeatures].sort(),
  top:out.slice(0,25).map(x=>({target:x.target,kind:x.kind,references:x.originalMissingReferences,symbols:x.symbols.map(z=>z.name)}))
};
mkdirSync(dirname(resolve(outputPath)),{recursive:true});
writeFileSync(outputPath,`${JSON.stringify({summary,entries:out},null,2)}\n`);
console.log(`[333-contracts] ${JSON.stringify(summary)}`);
