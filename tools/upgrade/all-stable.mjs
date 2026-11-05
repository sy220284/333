#!/usr/bin/env node
/** 333 最新稳定依赖升级器：查询 npm latest、迁移断裂 API、重新锁定完整依赖树。 */
import { readFile,writeFile,mkdir,rm,copyFile,readdir } from 'node:fs/promises';
import { execFile as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve,join } from 'node:path';
const root=resolve(import.meta.dirname,'../..'), execFile=promisify(execCb);
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
async function run(cmd,args){const r=await execFile(cmd,args,{cwd:root,timeout:1200000,maxBuffer:1e7});process.stdout.write(r.stdout);process.stderr.write(r.stderr)}
const operation=process.argv[2];
if(operation==='migrate'){
  const p=join(root,'tsconfig.json'),c=await json(p);delete c.compilerOptions.baseUrl;
  for(const [key,a] of Object.entries(c.compilerOptions.paths||{}))c.compilerOptions.paths[key]=a.map(v=>v.startsWith('./')||v.startsWith('../')||v.startsWith('/')?v:'./'+v);
  c.compilerOptions.types=['node','react','bun'];await save(p,c);
  const changed=[];
  async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const p=join(dir,ent.name);if(ent.isDirectory())await walk(p);else if(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(p)){const v=await readFile(p,'utf8');const n=v.replaceAll('@opentelemetry/api-logs','@opentelemetry/api').replaceAll('@opentelemetry/sdk-trace-base','@opentelemetry/sdk-trace');if(n!==v){await writeFile(p,n);changed.push(p.slice(root.length+1))}}}}
  for(const p of ['src','native','tests'])await walk(join(root,p));
  const p2=join(root,'build/rebuild.mjs'),v=await readFile(p2,'utf8');await writeFile(p2,v.replace(/^\s*'@opentelemetry\/otlp-exporter-base\/node-http':.*\n/m,''));
  console.log('已迁移TS7配置及OpenTelemetry导入，共修改 '+changed.length+' 个源码文件');
}else if(operation==='freeze'){
  const installerPath=join(root,'build/install-public-deps.mjs'),source=await readFile(installerPath,'utf8');
  const match=source.match(/const versions = (\{[\s\S]*?\n\});/);
  if(!match)throw Error('找不到构建依赖声明');
  const previous=JSON.parse(match[1]),devPath=join(root,'tools/dev/package.json'),dev=await json(devPath);
  const pkgPath=join(root,'package.json'),pkg=await json(pkgPath);
  const removed=new Set(['@modelcontextprotocol/sdk','@opentelemetry/api-logs','@opentelemetry/sdk-trace-base']);
  const added=['@modelcontextprotocol/client','@modelcontextprotocol/server','@modelcontextprotocol/core','@opentelemetry/sdk-trace','commander'];
  const names=[...new Set([...Object.keys(previous).filter(n=>!removed.has(n)),...added,...Object.keys(dev.devDependencies),...Object.keys(pkg.optionalDependencies||{}),'tmp'])].sort();
  const resolved={};let cursor=0;const errors=[];
  await Promise.all(Array.from({length:10},async()=>{while(cursor<names.length){const name=names[cursor++];try{const r=await execFile('npm',['view',name+'@latest','version','--json','--registry=https://registry.npmjs.org/'],{timeout:45000,maxBuffer:1e6});const v=JSON.parse(r.stdout.trim());const version=Array.isArray(v)?v.at(-1):v;if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('latest标签包含预发布版本: '+version);resolved[name]=version;console.log(name+'@'+version)}catch(e){errors.push({name,error:String(e.stderr||e)})}}}));
  if(errors.length)throw Error('版本查询存在失败，依赖未改写: '+JSON.stringify(errors));
  const deps=Object.fromEntries([...Object.keys(previous).filter(n=>!removed.has(n)),...added].sort().map(n=>[n,resolved[n]])),overrides={tmp:resolved.tmp,zod:'$zod'};
  const rewritten=source.replace(match[0],'const versions = '+JSON.stringify(deps,null,2)+';').replace(/const overrides = \{tmp: '0\.2\.7', zod: '\$zod'\};/,'const overrides = '+JSON.stringify(overrides)+';');
  if(rewritten===source)throw Error('依赖清单未变化');
  await writeFile(installerPath,rewritten);
  for(const n of Object.keys(dev.devDependencies))dev.devDependencies[n]=resolved[n];await save(devPath,dev);
  for(const n of Object.keys(pkg.optionalDependencies||{}))pkg.optionalDependencies[n]=resolved[n];pkg.engines.node='>=22.15.0';await save(pkgPath,pkg);
  const np=join(root,'.rebuild/public');await mkdir(np,{recursive:true});await save(join(np,'package.json'),{name:'release-rebuild-dependencies',private:true,version:pkg.version,dependencies:deps,overrides});
  await rm(join(np,'package-lock.json'),{force:true});
  await run('npm',['install','--prefix','.rebuild/public','--package-lock-only','--ignore-scripts','--no-audit','--no-fund','--legacy-peer-deps','--registry=https://registry.npmjs.org/']);
  await copyFile(join(np,'package-lock.json'),join(root,'build/public-dependencies.lock.json'));
  await run('npm',['install','--prefix','tools/dev','--package-lock-only','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org/']);
  const report={source:'npm latest stable dist-tags',date:new Date().toISOString(),removed:[...removed],added,dependencyCount:Object.keys(deps).length,versions:resolved};
  await save(join(root,'docs/upgrade/latest-stable-dependencies.json'),report);
  console.log('所有公共依赖锁文件已更新');
}else if(operation==='actions'){
  const vers={'actions/checkout':7,'actions/setup-node':7,'actions/setup-python':7,'actions/upload-artifact':7,'actions/download-artifact':8,'actions/cache':6,'actions/cache/restore':6,'actions/cache/save':6};
  const dir=join(root,'.github/workflows');let count=0;
  for(const f of await readdir(dir)){if(!/\.ya?ml$/.test(f))continue;const p=join(dir,f),src=await readFile(p,'utf8');
    let s=src.replace(/(\buses:\s*)(actions\/(?:checkout|setup-node|setup-python|upload-artifact|download-artifact|cache(?:\/(?:restore|save))?))@v\d+(?:\.\d+\.\d+)?/g,(_a,p,n)=>p+n+'@v'+vers[n]);
    s=s.replace(/(node-version:\s*['"]?)24(['"]?)/g,(_a,p,t)=>p+'26'+t).replace(/(python-version:\s*['"]?)3\.12(['"]?)/g,(_a,p,t)=>p+'3.15'+t);
    if(s!==src){await writeFile(p,s);count++}}
  const p=join(root,'tools/dev/toolchain-versions.env'),v=await readFile(p,'utf8');await writeFile(p,v.replace(/^NODE_MAJOR=24$/m,'NODE_MAJOR=26').replace(/^PYTHON_MINOR=12$/m,'PYTHON_MINOR=15'));
  console.log('已升级 '+count+' 个工作流与工具链版本');
}else throw Error('用法: node tools/upgrade/all-stable.mjs migrate|freeze|actions');
