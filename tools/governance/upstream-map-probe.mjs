#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';

const [gapsFile, mapFile, outputFile] = process.argv.slice(2);
if (!gapsFile || !mapFile || !outputFile) throw new Error('用法：upstream-map-probe.mjs 缺失模块报告 最新源码映射 输出文件');
const gaps = JSON.parse(readFileSync(gapsFile,'utf8'));
const sourceMap = JSON.parse(readFileSync(mapFile,'utf8'));
if (!Array.isArray(sourceMap.sources) || sourceMap.sources.length !== sourceMap.sourcesContent?.length) throw new Error('新版源码映射格式无效');
const index = new Map(sourceMap.sources.map((path,i)=>[
  posix.normalize(path.replace(/^\.\.\//,'')),
  {index:i,hasContent:typeof sourceMap.sourcesContent[i]==='string'}
]));
const findings=gaps.entries.filter(item=>item.needsRecovery).map(item=>{
  const names=[item.target,item.target.replace(/\.ts$/,'.tsx'),item.target.replace(/\.ts$/,'.d.ts'),item.target.replace(/\.ts$/,'/index.ts')];
  const matching=names.filter(name=>index.has(name)).map(name=>({path:name,...index.get(name)}));
  return {...item,matching};
});
const candidates=findings.filter(item=>item.matching.some(x=>x.hasContent));
const report={release:'2.1.310',totalMissing:findings.length,matchedContent:candidates.length,matchedReferences:candidates.reduce((n,x)=>n+x.references,0),candidates,unavailable:findings.filter(x=>!x.matching.some(m=>m.hasContent)).map(x=>({path:x.target,references:x.references}))};
mkdirSync(dirname(resolve(outputFile)),{recursive:true});
writeFileSync(outputFile,`${JSON.stringify(report,null,2)}\n`);
console.log(`[333-upstream] 旧版缺失 ${report.totalMissing} 个模块；新版源码映射可恢复 ${report.matchedContent} 个；覆盖 ${report.matchedReferences} 处引用`);
