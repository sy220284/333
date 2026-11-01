#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';

const root = resolve(import.meta.dirname,'../..');
const reportFile = process.argv[2];
const outputFile = process.argv[3];
if (!reportFile || !outputFile) throw new Error('用法：missing-sources.mjs 类型报告 输出文件');
const report = JSON.parse(readFileSync(reportFile,'utf8'));
if (!Array.isArray(report.diagnostics)) throw new Error('没有逐条类型诊断');
const map = JSON.parse(readFileSync(resolve(root,'cli.js.map'),'utf8'));
if (!Array.isArray(map.sources) || map.sources.length !== map.sourcesContent?.length) throw new Error('源码映射格式异常');
const originalFiles = new Map(map.sources.map((path,i)=>[
  posix.normalize(path.replace(/^\.\.\//,'')),
  {hasSource:typeof map.sourcesContent[i]==='string', index:i}
]));
const groups = new Map();
for (const item of report.diagnostics) {
  if (item.code !== 'TS2307') continue;
  const match = /^Cannot find module '([^']+)'/.exec(item.message);
  if (!match) continue;
  const request = match[1];
  const internal = request.startsWith('.') || request.startsWith('src/');
  let target = internal ? (request.startsWith('src/') ? request : posix.normalize(posix.join(posix.dirname(item.path),request))) : request;
  if (internal) target=target.replace(/\.(js|mjs|cjs)$/,'.ts');
  const entry = groups.get(target) ?? {target,internal,requests:0,importers:new Set()};
  entry.requests += 1;
  entry.importers.add(item.path);
  groups.set(target,entry);
}
const entries=[...groups.values()].map(g=>{
  const candidates=g.internal?[g.target,g.target.replace(/\.ts$/,'.tsx'),g.target.replace(/\.ts$/,'.d.ts'),g.target.replace(/\.ts$/,'/index.ts')]:[];
  const existing=candidates.find(p=>existsSync(resolve(root,p)));
  const mapped=candidates.map(p=>({path:p,...originalFiles.get(p)})).filter(x=>Number.isInteger(x.index));
  return {
    target:g.target,internal:g.internal,references:g.requests,referencingFiles:g.importers.size,
    sourceExists:!!existing,sourceMapCandidates:mapped,needsRecovery:g.internal&&!existing,
    exampleImporters:[...g.importers].slice(0,8)
  };
}).sort((a,b)=>b.references-a.references||a.target.localeCompare(b.target));
const result={
  baselineDiagnoses:report.total,missingModuleDiagnostics:entries.reduce((n,x)=>n+x.references,0),
  missingInternalFiles:entries.filter(x=>x.needsRecovery).length,
  referencesToMissingInternal:entries.filter(x=>x.needsRecovery).reduce((n,x)=>n+x.references,0),
  missingExternalModules:entries.filter(x=>!x.internal).length,entries
};
mkdirSync(dirname(resolve(outputFile)),{recursive:true});
writeFileSync(outputFile,`${JSON.stringify(result,null,2)}\n`);
console.log(`[333-governance] 缺失内部模块 ${result.missingInternalFiles} 处；引用 ${result.referencesToMissingInternal} 处；外部模块 ${result.missingExternalModules} 处`);
console.log(`[333-governance] 高频缺失：${entries.filter(x=>x.needsRecovery).slice(0,12).map(x=>`${x.target}(${x.references})`).join('、')}`);
