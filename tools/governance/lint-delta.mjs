#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const tools = resolve(root, 'tools/dev/node_modules');
const cli = join(tools, '@biomejs/biome/bin/biome');
const base = process.env.DEV333_DIFF_BASE || process.env.GITHUB_BASE_REF || 'main';

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}
function git(args) {
  const result = run('git', args);
  if (result.status !== 0) throw new Error(`Git 无法执行：${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}
function problems(file, source, temporary = false) {
  let actualPath = resolve(root,file);
  if (temporary) {
    actualPath = resolve(root,'.lint-governance-baseline',file);
    mkdirSync(dirname(actualPath), { recursive: true });
    writeFileSync(actualPath,source);
  }
  const outcome = run(process.execPath, [cli, 'lint', '--reporter=rdjson', '--max-diagnostics=none', actualPath]);
  let parsed;
  try { parsed = JSON.parse(outcome.stdout); }
  catch { throw new Error(`Biome RDJSON 输出解析失败: ${file}\n${outcome.stdout.slice(0,500)}\n${outcome.stderr.slice(0,500)}`); }
  if (!Array.isArray(parsed.diagnostics)) throw new Error(`Biome 未返回诊断数组：${file}`);
  if (outcome.status && parsed.diagnostics.length===0) throw new Error(`Biome 执行异常：${file}\n${outcome.stderr}`);
  const lines=source.split(/\r?\n/);
  return parsed.diagnostics.map(d=>{
    const category=d.code?.value ?? d.code ?? '';
    const line=d.location?.range?.start?.line;
    const token=Number.isInteger(line) ? (lines[line]??'').trim().replace(/\s+/g,' ') : '';
    const description=typeof d.message === 'string' ? d.message : JSON.stringify(d.message);
    return {key:JSON.stringify([category,description,token]),category,description,token};
  });
}
function frequencies(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.key, (counts.get(item.key) || 0) + 1);
  return counts;
}
const staged = process.env.DEV333_DIFF_STAGED === '1';
const ref = base.startsWith('origin/') ? base : `origin/${base}`;
const delta = staged ? git(['diff','--cached','--name-only','--diff-filter=ACMR']) : git(['diff','--name-only','--diff-filter=ACMR',`${ref}...HEAD`]);
const uncommitted = staged ? '' : git(['diff','--name-only','--diff-filter=ACMR']);
const files = [...new Set(`${delta}\n${uncommitted}`.split(/\r?\n/).map(x => x.replaceAll('\\','/')).filter(x => /\.(ts|tsx|mjs|js|jsx|cjs)$/.test(x) && existsSync(resolve(root, x)) && !x.startsWith('research/')))].sort();
const report = { base: staged ? 'HEAD（暂存版本）' : ref, checkedFiles: files.length, baseline: 0, current: 0, introduced: [], existing: [] };
const temporaryRoot=resolve(root,'.lint-governance-baseline');
try {
for (const file of files) {
  const oldResult = run('git', ['show', `${staged ? 'HEAD' : ref}:${file}`]);
  if (oldResult.status !== 0 && !/exists on disk|does not exist|path .* exists on disk/i.test(oldResult.stderr)) {
    if (oldResult.stderr.includes('does not exist') || oldResult.stderr.includes('exists on disk')) {
      // 这是新增文件，没有历史基线。
    } else throw new Error(`读取历史文件失败：${file}\n${oldResult.stderr}`);
  }
  const old = oldResult.status === 0 ? problems(file, oldResult.stdout, true) : [];
  const now = problems(file, readFileSync(resolve(root,file),'utf8'));
  report.baseline += old.length;
  report.current += now.length;
  const oldCounts = frequencies(old);
  const existingCounts = new Map();
  for (const d of now) {
    const used = existingCounts.get(d.key) || 0;
    if (used < (oldCounts.get(d.key) || 0)) {
      existingCounts.set(d.key, used+1);
      report.existing.push({file,category:d.category,description:d.description,token:d.token});
    } else {
      report.introduced.push({file,category:d.category,description:d.description,token:d.token});
    }
  }
}
} finally { rmSync(temporaryRoot, {recursive:true,force:true}); }

const destination = resolve(root, '.rebuild/governance/lint-delta.json');
mkdirSync(dirname(destination), {recursive:true});
writeFileSync(destination, `${JSON.stringify(report,null,2)}\n`);
console.log(`[333-lint] 扫描文件 ${report.checkedFiles}，原版诊断 ${report.baseline}，当前诊断 ${report.current}，新增 ${report.introduced.length}`);
for (const d of report.introduced.slice(0,100)) console.error(`${d.file} ${d.category}：${d.description}`);
if (report.introduced.length) process.exitCode = 1;
