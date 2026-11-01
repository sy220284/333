#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { nativeMagic } from './quality-core.mjs';

const repo = resolve(import.meta.dirname, '../..');
const platform = process.platform;
const arch = process.arch;
if (!['linux', 'darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
  throw new Error('原生二进制没有覆盖当前平台: ' + platform + '/' + arch);
}
const folder = arch + '-' + platform;
const suffix = platform === 'win32' ? 'rg.exe' : 'rg';
const rg = resolve(repo, 'vendor/ripgrep', folder, suffix);
const audio = resolve(repo, 'vendor/audio-capture', folder, 'audio-capture.node');
const require = createRequire(import.meta.url);
for (const file of [rg, audio]) {
  if (!existsSync(file)) throw new Error('缺少原生资源: ' + file);
  if (!nativeMagic(readFileSync(file).subarray(0, 8), platform)) throw new Error('原生文件格式与平台不匹配: ' + file);
  console.log('[OK] 原生架构 ' + file);
}
const run = spawnSync(rg, ['--version'], { encoding: 'utf8', timeout: 15000 });
if (run.error || run.status !== 0 || !run.stdout.includes('ripgrep')) {
  throw new Error('ripgrep 无法启动: ' + (run.error?.message ?? run.stderr));
}
console.log('[OK] ripgrep 已真实执行');
const loaded = require(audio);
for (const key of ['startRecording', 'stopRecording', 'isRecording']) {
  if (typeof loaded[key] !== 'function') throw new Error('audio-capture 缺少导出: ' + key);
}
console.log('[OK] audio-capture 原生库可加载并具备预期接口');
