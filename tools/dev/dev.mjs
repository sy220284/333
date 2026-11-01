#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { parseTypeScriptErrors, normalizePath } from './quality-core.mjs';

const root = resolve(import.meta.dirname, '../..');
const home = process.env.DEV333_TOOLS_ROOT ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.local/share/333-dev');
const primary = resolve(home, 'dev-tools/node_modules/.bin');
const secondary = resolve(root, 'tools/dev/node_modules/.bin');
const tools = existsSync(primary) ? primary : secondary;
const ext = process.platform === 'win32' ? '.cmd' : '';
const bin = name => join(tools, name + ext);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('命令失败（' + result.status + '）: ' + command + ' ' + args.join(' '));
}
function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}
function changed() {
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
  const result = output(bin('tsc'), ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json']);
  const errors = parseTypeScriptErrors(result.stdout + '\n' + result.stderr);
  if (!checkChanged) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status) throw new Error('完整 TypeScript 类型检查未通过，共 ' + errors.length + ' 个错误');
    console.log('[OK] 全量 TypeScript 类型检查通过');
    return;
  }
  if (result.status !== 0 && errors.length === 0) throw new Error('TypeScript 未产生可解析的诊断: ' + result.stdout.slice(0, 2000));
  const selected = new Set(checkedFiles());
  const introduced = errors.filter(err => selected.has(err.path));
  console.log('[333-dev] TypeScript 全库诊断 ' + errors.length + ' 项，变更文件 ' + selected.size + ' 个，其中错误 ' + introduced.length + ' 项');
  for (const item of introduced.slice(0, 100)) console.error(item.path + ':' + item.line + ' ' + item.code + ' ' + item.message);
  if (introduced.length) throw new Error('变更代码存在 TypeScript 类型错误');
  if (errors.length) console.log('[333-dev] 既有源文件的类型问题仍需修复；可运行 npm run typecheck:all 查看完整诊断');
}
function lint(all) {
  if (!existsSync(bin('biome'))) throw new Error('缺失 Biome，先运行 npm install --prefix tools/dev');
  const files = all ? ['src', 'native', 'build', 'tests', 'tools/dev'] : [...new Set([...checkedFiles(), 'tools/dev/quality-core.mjs', 'tools/dev/dev.mjs', 'tools/dev/watch.mjs', 'tools/dev/native-smoke.mjs'])];
  if (!files.length) { console.log('[333-dev] 没有需要检查的文件'); return; }
  run(bin('biome'), ['lint', '--no-errors-on-unmatched', ...files]);
}
function boot() { run('npm', ['install', '--prefix', 'tools/dev', '--ignore-scripts', '--no-audit', '--no-fund']); }
const command = process.argv[2] ?? 'help';
switch (command) {
  case 'bootstrap': boot(); break;
  case 'doctor':
    for (const name of ['tsc', 'biome']) {
      if (!existsSync(bin(name))) throw new Error(name + ' 未安装');
      run(bin(name), ['--version']);
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
    if (files.length) run(bin('biome'), ['format', '--write', ...files]);
    break;
  }
  case 'watch': run(process.execPath, ['tools/dev/watch.mjs']); break;
  case 'native': run(process.execPath, ['tools/dev/native-smoke.mjs']); break;
  case 'coverage':
    run(process.execPath, ['--test', '--experimental-test-coverage', '--test-coverage-include=tools/dev/quality-core.mjs', '--test-coverage-lines=90', 'tests/dev-tooling.test.mjs']);
    break;
  case 'security': run('npm', ['audit', '--prefix', '.rebuild/public', '--audit-level=high']); break;
  case 'sbom': run('npm', ['sbom', '--prefix', '.rebuild/public', '--sbom-format=cyclonedx']); break;
  case 'verify':
    run(process.execPath, ['tools/dev/dev.mjs', 'doctor']);
    run(process.execPath, ['tools/dev/dev.mjs', 'lint']);
    run(process.execPath, ['tools/dev/dev.mjs', 'typecheck']);
    run(process.execPath, ['tools/dev/dev.mjs', 'coverage']);
    run(process.execPath, ['tools/dev/dev.mjs', 'native']);
    break;
  default:
    console.log('333 开发命令: bootstrap | doctor | typecheck | typecheck:all | lint | lint:all | format | watch | coverage | native | security | sbom | verify');
}
