import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { nativeMagic, normalizePath, parseTypeScriptErrors, relativeFiles } from '../tools/dev/quality-core.mjs';

test('格式化平台路径和解析 TypeScript 错误', () => {
  assert.equal(normalizePath('src\\utils\\file.ts'), 'src/utils/file.ts');
  assert.equal(normalizePath('./src/a.ts'), 'src/a.ts');
  const input = 'src/a.ts(23,4): error TS2322: Type mismatch\nsrc/b.ts(1,1): error TS2304: Not found\nFound 2 errors.';
  assert.deepEqual(parseTypeScriptErrors(input).map(error => [error.path, error.line, error.code]), [
    ['src/a.ts', 23, 'TS2322'],
    ['src/b.ts', 1, 'TS2304'],
  ]);
});

test('处理重复文件并拒绝仓库外文件', () => {
  const root = process.cwd();
  assert.deepEqual(relativeFiles(root, ['src/a.ts', 'src/a.ts', './tests/a.mjs']), ['src/a.ts', 'tests/a.mjs']);
  assert.throws(() => relativeFiles(root, ['../outside.ts']), /拒绝仓库外路径/);
  assert.equal(normalizePath(join(root, 'src/a.ts')).endsWith('src/a.ts'), true);
});

test('检查 ELF、Mach-O、PE 原生文件标识', () => {
  assert.equal(nativeMagic(Buffer.from([0x7f, 0x45, 0x4c, 0x46]), 'linux'), true);
  assert.equal(nativeMagic(Buffer.from('MZ', 'ascii'), 'win32'), false);
  assert.equal(nativeMagic(Buffer.from('MZxx', 'ascii'), 'win32'), true);
  assert.equal(nativeMagic(Buffer.from('cffaedfe', 'hex'), 'darwin'), true);
  assert.equal(nativeMagic(Buffer.from('00000000', 'hex'), 'darwin'), false);
  assert.throws(() => nativeMagic(Buffer.alloc(4), 'android'), /不支持/);
});
