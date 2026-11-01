#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const devDir = resolve(import.meta.dirname);
const lock = join(devDir, 'package-lock.json');
const target = join(devDir, 'node_modules');
const expected = JSON.parse(readFileSync(join(devDir, 'package.json'), 'utf8')).devDependencies;

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function exec(exe, args) {
  const r = spawnSync(exe, args, { cwd: devDir, encoding: 'utf8', timeout: 120000 });
  if (r.error || r.status !== 0) throw new Error('命令执行失败: ' + exe + ' ' + args.join(' ') + ': ' + (r.error?.message ?? r.stderr));
  return r.stdout.trim();
}
function validate(dir) {
  const tsc = exec(process.execPath, [join(dir, 'typescript/bin/tsc'), '--version']);
  const biome = exec(process.execPath, [join(dir, '@biomejs/biome/bin/biome'), '--version']);
  if (tsc !== 'Version ' + expected.typescript || !biome.includes(expected['@biomejs/biome'])) {
    throw new Error('开发工具版本与锁文件不符: ' + tsc + '/' + biome);
  }
}
const operation = process.argv[2], folder = process.argv[3] && resolve(process.argv[3]);
if (!folder || !['pack', 'install'].includes(operation)) {
  throw new Error('用法: node tools/dev/portable.mjs pack|install ARTIFACT_DIR');
}
const archive = join(folder, 'payload.tar.gz');
const manifestPath = join(folder, 'manifest.json');
if (operation === 'pack') {
  validate(target);
  mkdirSync(folder, { recursive: true });
  exec('tar', ['-czf', archive.replaceAll('\\', '/'), '-C', devDir.replaceAll('\\', '/'), 'node_modules']);
  writeFileSync(manifestPath, JSON.stringify({
    schema: 1, component: '333-dev-tools', platform: process.platform, arch: process.arch,
    nodeMajor: Number(process.versions.node.split('.')[0]),
    typescript: expected.typescript, biome: expected['@biomejs/biome'],
    lockSha256: hash(lock), archiveSha256: hash(archive),
  }, null, 2) + '\n');
  console.log('[OK] 已制作可迁移的离线开发包: ' + folder);
} else {
  const meta = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (meta.schema !== 1 || meta.component !== '333-dev-tools' ||
      meta.platform !== process.platform || meta.arch !== process.arch ||
      meta.nodeMajor !== Number(process.versions.node.split('.')[0]) ||
      meta.typescript !== expected.typescript || meta.biome !== expected['@biomejs/biome'] ||
      meta.lockSha256 !== hash(lock) || meta.archiveSha256 !== hash(archive)) {
    throw new Error('离线包平台、锁文件或 SHA-256 校验不通过');
  }
  if (existsSync(target)) throw new Error('现有 node_modules 已存在，拒绝覆盖');
  const temp = mkdtempSync(join(devDir, '.dev-tools-unpack-'));
  try {
    const paths = exec('tar', ['-tzf', archive.replaceAll('\\', '/')]).split(/\r?\n/);
    if (paths.some(path => path.startsWith('/') || path.split('/').includes('..') || !path.startsWith('node_modules/'))) {
      throw new Error('离线包存在不安全路径');
    }
    exec('tar', ['-xzf', archive.replaceAll('\\', '/'), '-C', temp.replaceAll('\\', '/')]);
    const extracted = join(temp, 'node_modules');
    validate(extracted);
    renameSync(extracted, target);
    console.log('[OK] 离线工具恢复并完成真实版本验证');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
