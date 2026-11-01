#!/usr/bin/env node
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const dirs = ['src', 'native', 'build'];
let running = false;
let dirty = false;
let debounce;
let active = null;
const watchers = [];

function rebuild() {
  if (running) { dirty = true; return; }
  running = true;
  console.log('[333-dev] 开始增量重建');
  active = spawn('bun', ['build/rebuild.mjs'], { cwd: root, stdio: 'inherit' });
  active.on('error', error => {
    console.error('[333-dev] Bun 启动失败:', error);
    process.exitCode = 1;
    running = false;
  });
  active.on('exit', code => {
    if (code === 0) {
      const pack = spawn(process.execPath, ['build/package-release.mjs'], { cwd: root, stdio: 'inherit' });
      active = pack;
      pack.on('error', error => { console.error(error); process.exitCode = 1; running = false; });
      pack.on('exit', packCode => finish(packCode));
    } else finish(code);
  });
}
function finish(code) {
  if (code !== 0) { console.error('[333-dev] 构建失败，退出码:', code); process.exitCode = 1; }
  else console.log('[333-dev] 构建完成');
  active = null;
  running = false;
  if (dirty) { dirty = false; rebuild(); }
}
for (const dir of dirs) {
  watchers.push(watch(resolve(root, dir), { recursive: true }, (_kind, filename) => {
    if (!filename || !/\.(mjs|js|ts|tsx|json|md|txt)$/.test(String(filename))) return;
    clearTimeout(debounce);
    debounce = setTimeout(rebuild, 250);
  }));
}
process.on('SIGINT', () => {
  for (const watcher of watchers) watcher.close();
  if (active) active.kill('SIGINT');
  process.exit(0);
});
rebuild();
