#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { parseTypeScriptErrors, normalizePath } from './quality-core.mjs';

const root = resolve(import.meta.dirname, '../..');
const home = process.env.DEV333_TOOLS_ROOT ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.local/share/333-dev');
const primary = resolve(home, 'dev-tools/node_modules/.bin');
const secondary = resolve(root, 'tools/dev/node_modules/.bin');
const tools = existsSync(primary) ? primary : secondary;
const ext = process.platform === 'win32' ? '.cmd' : '';
const bin = name => join(tools, name + ext);
const cliScript = name => resolve(tools, '../' + (name === 'tsc' ? 'typescript/bin/tsc' : '@biomejs/biome/bin/biome'));
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('命令失败（' + result.status + '）: ' + command + ' ' + args.join(' '));
}
function toolRun(name, args) {
  if (process.platform === 'win32') run(process.execPath, [cliScript(name), ...args]);
  else run(bin(name), args);
}
function toolOutput(name, args) {
  if (process.platform === 'win32') return output(process.execPath, [cliScript(name), ...args]);
  return output(bin(name), args);
}
function npmRun(args) {
  if (process.platform === 'win32') run(process.execPath, [npmCli, ...args]);
  else run('npm', args);
}
function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}
function changed() {
  if (process.env.DEV333_DIFF_STAGED === '1') {
    const staged = output('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
    if (staged.status !== 0) throw new Error(staged.stderr);
    return [...new Set(staged.stdout.split(/\r?\n/).map(normalizePath).filter(Boolean))].sort();
  }
  const base = process.env.DEV333_DIFF_BASE ?? process.env.GITHUB_BASE_REF;
  let result;
  if (base) {
    const baseRef = base.startsWith('origin/') ? base : 'origin/' + base;
    result = output('git', ['diff', '--name-only', baseRef + '...HEAD']);
  } else {
    result = output('git', ['diff', '--name-only', 'HEAD~1', 'HEAD']);
  }
  if (result.status !== 0) throw new Error('无法确定代码比较基线，请检查 Git 历史或 DEV333_DIFF_BASE: ' + result.stderr);
  const pending = output('git', ['diff', '--name-only', 'HEAD']);
  if (pending.status !== 0) throw new Error(pending.stderr);
  return [...new Set((result.stdout + '\n' + pending.stdout).split(/\r?\n/).map(normalizePath).filter(Boolean))].sort();
}
function isSource(file) { return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file) && !file.startsWith('research/'); }
function checkedFiles() { return changed().filter(isSource).filter(file => existsSync(resolve(root, file))); }
function typescript(checkChanged) {
  if (!existsSync(bin('tsc'))) throw new Error('缺失 TypeScript，先运行 npm install --prefix tools/dev');
  const config = resolve(root, '.rebuild/tsconfig.dev.json');
  mkdirSync(resolve(root, '.rebuild'), { recursive: true });
  const typeRoots = [resolve(tools, '../@types'), resolve(root, 'node_modules/@types')];
  writeFileSync(config, `${JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { typeRoots, types: ['node', 'react', 'bun'] } }, null, 2)}\n`);
  const result = toolOutput('tsc', ['--noEmit', '--pretty', 'false', '-p', config]);
  const errors = parseTypeScriptErrors(result.stdout + '\n' + result.stderr);
  if (!checkChanged) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status) throw new Error('完整 TypeScript 类型检查未通过，共 ' + errors.length + ' 个错误');
    console.log('[OK] 全量 TypeScript 类型检查通过');
    return;
  }
  if (result.status !== 0 && errors.length === 0) throw new Error('TypeScript 未产生可解析的诊断: ' + result.stdout.slice(0, 2000));
  const changedHunks = new Map();
  const base = process.env.DEV333_DIFF_BASE ?? process.env.GITHUB_BASE_REF;
  const comparison = process.env.DEV333_DIFF_STAGED === '1'
    ? [['diff','--cached','--no-color','--unified=0','--diff-filter=ACMR']]
    : [
        ['diff','--no-color','--unified=0','--diff-filter=ACMR',base ? `${base.startsWith('origin/') ? base : `origin/${base}`}...HEAD` : 'HEAD~1'],
        ['diff','--no-color','--unified=0','--diff-filter=ACMR','HEAD'],
      ];
  for (const args of comparison) {
    const diff = output('git',args);
    if (diff.status !== 0) throw new Error(`无法读取修改行位置: ${diff.stderr}`);
    let current = null;
    for (const row of diff.stdout.split(/\r?\n/)) {
      if (row.startsWith('+++ b/')) current = normalizePath(row.slice(6));
      else if (row.startsWith('+++ /dev/null')) current = null;
      else if (current && row.startsWith('@@')) {
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(row);
        if (!hunk) throw new Error(`无法解析 Git 修改行: ${row}`);
        const start=Number(hunk[1]),length=hunk[2]===undefined?1:Number(hunk[2]);
        if (length > 0) {
          const ranges=changedHunks.get(current)??[];
          ranges.push([start,start+length-1]);
          changedHunks.set(current,ranges);
        }
      }
    }
  }
  const introduced = errors.filter(err => (changedHunks.get(err.path)??[]).some(([from,to])=>err.line>=from&&err.line<=to));
  const selected = new Set(checkedFiles());
  const report={ total:errors.length,checkedFiles:selected.size,modifiedLines:[...changedHunks.values()].flat().length,introduced };
  mkdirSync(resolve(root,'.rebuild/governance'),{recursive:true});
  writeFileSync(resolve(root,'.rebuild/governance/type-delta.json'), `${JSON.stringify(report,null,2)}\n`);
  console.log(`[333-dev] 全仓 TypeScript 诊断 ${errors.length} 项，变更文件 ${selected.size} 个，修改行对应错误 ${introduced.length} 项`);
  for (const item of introduced.slice(0, 100)) console.error(`${item.path}:${item.line} ${item.code} ${item.message}`);
  if (introduced.length) throw new Error('本次修改行仍存在 TypeScript 诊断');
  if (errors.length) console.log('[333-dev] 全量类型检查仍未通过；独立治理 CI 严格阻断非零结果');
}
function lint(all) {
  if (!existsSync(bin('biome'))) throw new Error('缺失 Biome，请先安装已冻结的开发工具');
  if (!all) {
    run(process.execPath, ['tools/governance/lint-delta.mjs']);
    return;
  }
  run(bin('biome'), ['lint', '--no-errors-on-unmatched', 'src', 'native', 'build', 'tests', 'tools/dev', 'tools/governance']);
}

function boot() { npmRun(['ci', '--prefix', 'tools/dev', '--ignore-scripts', '--no-audit', '--no-fund']); }
const command = process.argv[2] ?? 'help';
switch (command) {
  case 'bootstrap': boot(); break;
  case 'doctor':
    for (const name of ['tsc', 'biome']) {
      if (!existsSync(bin(name))) throw new Error(name + ' 未安装');
      toolRun(name, ['--version']);
    }
    run('git', ['--version']);
    run('bun', ['--version']);
    console.log('[OK] 333 开发工具已就绪');
    break;
  case 'typecheck': typescript(true); break;
  case 'typecheck:all': typescript(false); break;
  case 'lint': lint(false); break;
  case 'lint:all': lint(true); break;
  case 'format': {
    const files = checkedFiles();
    if (files.length) toolRun('biome', ['format', '--write', ...files]);
    break;
  }
  case 'watch': run(process.execPath, ['tools/dev/watch.mjs']); break;
  case 'hooks:install': {
    const active = output('git', ['config', '--local', '--get', 'core.hooksPath']);
    if (active.status === 0 && active.stdout.trim() !== 'tools/dev/hooks') throw new Error('已有其他 Git hooksPath 配置，拒绝覆盖');
    run('git', ['config', '--local', 'core.hooksPath', 'tools/dev/hooks']);
    console.log('[OK] 已启用仓库提交前检查');
    break;
  }
  case 'hooks:remove': {
    const active = output('git', ['config', '--local', '--get', 'core.hooksPath']);
    if (active.stdout.trim() !== 'tools/dev/hooks') throw new Error('未安装本工具链钩子，拒绝覆盖其他设置');
    run('git', ['config', '--local', '--unset', 'core.hooksPath']);
    break;
  }
  case 'native': run(process.execPath, ['tools/dev/native-smoke.mjs']); break;
  case 'coverage':
    run(process.execPath, ['--test', '--experimental-test-coverage', '--test-coverage-include=tools/dev/quality-core.mjs', '--test-coverage-lines=90', 'tests/dev-tooling.test.mjs']);
    break;
  case 'portable:pack': run(process.execPath, ['tools/dev/portable.mjs', 'pack', process.argv[3] ?? '']); break;
  case 'portable:install': run(process.execPath, ['tools/dev/portable.mjs', 'install', process.argv[3] ?? '']); break;
  case 'security': npmRun(['audit', '--prefix', '.rebuild/public', '--audit-level=high']); break;
  case 'sbom': npmRun(['sbom', '--prefix', '.rebuild/public', '--sbom-format=cyclonedx']); break;
  case 'verify':
    run(process.execPath, ['tools/dev/dev.mjs', 'doctor']);
    run(process.execPath, ['tools/dev/dev.mjs', 'lint']);
    run(process.execPath, ['tools/dev/dev.mjs', 'typecheck']);
    run(process.execPath, ['tools/dev/dev.mjs', 'coverage']);
    run(process.execPath, ['tools/dev/dev.mjs', 'native']);
    break;
  default:
    console.log('333 开发命令: bootstrap | doctor | typecheck | typecheck:all | lint | lint:all | format | watch | coverage | native | security | sbom | hooks:install | hooks:remove | portable:pack | portable:install | verify');
}
