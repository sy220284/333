import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { formatSymlinkPermissionWarning } from '../src/components/permissions/FilePermissionDialog/symlinkPermissionWarning.ts'

const cwd = resolve('/work', 'project')

test('读取工作目录外的符号链接时，明确展示真实目标及其位置', () => {
  const target = resolve(cwd, '..', 'private', 'credentials.txt')
  const message = formatSymlinkPermissionWarning(target, 'read', cwd)
  assert.match(message, /读取工作目录之外/)
  assert.ok(message.includes(target))
})

test('读取工作目录内的链接也显示真实目标，不误报越界', () => {
  const target = resolve(cwd, 'docs', 'guide.md')
  const message = formatSymlinkPermissionWarning(target, 'read', cwd)
  assert.equal(message, `符号链接实际读取位置：${target}`)
})

test('编辑和创建仍保留可见的真实目标警示', () => {
  const target = resolve(cwd, '..', 'secrets.txt')
  for (const operation of ['write', 'create']) {
    const message = formatSymlinkPermissionWarning(target, operation, cwd)
    assert.match(message, /修改工作目录之外/)
    assert.ok(message.includes(target))
  }
})

test('相邻前缀目录不会被误判为工作目录内部', () => {
  const target = resolve(cwd + '-backup', 'file.txt')
  const message = formatSymlinkPermissionWarning(target, 'read', cwd)
  assert.match(message, /工作目录之外/)
})

test('读取权限的界面同样触发真实路径解析和显示', () => {
  const source = readFileSync(
    new URL('../src/components/permissions/FilePermissionDialog/FilePermissionDialog.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /safeResolvePath\(fs, expandedPath\)/)
  assert.match(source, /formatSymlinkPermissionWarning\(symlinkTarget, operationType, getCwd\(\)\)/)
  assert.doesNotMatch(source, /operationType === 'read'\)\s*\{\s*return null/)
})
