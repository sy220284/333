#!/usr/bin/env node
/**
 * Tools manifest authority. This file reads toolchain.lock.json and derives
 * the shell bootstrap configuration, development npm manifest and GHA versions.
 *
 * sync only updates derived files; check rejects every divergence,
 * including the npm lock root, so no CI job may silently choose another tool.
 * Pure Node.js + builtins: runnable before installing product dependencies.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const dev = join(root, 'tools/dev')
export const manifestPath = join(dev, 'toolchain.lock.json')

function fail(message) { throw new Error('[工具链清单] ' + message) }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function exact(version, label) {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) {
    fail(label + ' 必须为精确的 x.y.z 版本，得到 ' + JSON.stringify(version))
  }
  return version
}
function major(version) { return version.split('.')[0] }
export function readToolchain() {
  const data = readJson(manifestPath)
  if (data.schemaVersion !== 1) fail('清单 schemaVersion 与工具不兼容')
  for (const key of ['node', 'bun', 'actionlint']) exact(data.runtimes[key], key)
  if (!/^\d+\.\d+$/.test(data.runtimes.python)) fail('Python 版本须为 major.minor')
  exact(data.development.typescriptAstParser, 'AST 解析器')
  const packages = data.development.packages
  for (const [key, value] of Object.entries(packages)) exact(value, key)
  for (const name of ['typescript', '@biomejs/biome', '@types/node', '@types/react', '@types/bun']) {
    if (!packages[name]) fail('缺少必需开发工具 ' + name)
  }
  if (major(packages['@types/node']) !== major(data.runtimes.node)) fail('Node 运行时与 @types/node 主版本不符')
  if (packages['@types/bun'] !== data.runtimes.bun) fail('Bun 运行时与 @types/bun 不一致')
  for (const name of ['actionlintLinuxX64Sha256', 'sourceMapSha256']) {
    if (!/^[a-f0-9]{64}$/.test(data.integrity[name])) fail('无效 SHA-256：' + name)
  }
  const a = data.artifacts
  if (!Number.isSafeInteger(a.schema) || a.schema < 1 ||
      !Number.isSafeInteger(a.shardBytes) || a.shardBytes <= 0 ||
      !Number.isSafeInteger(a.npmPublicParts) || a.npmPublicParts <= 0) {
    fail('离线 Artifact 配置无效')
  }
  for (const key of ['buildComponents', 'fullExtraComponents']) {
    if (!Array.isArray(a[key]) || !a[key].length || a[key].some(x => !/^[a-z][a-z-]*$/.test(x))) {
      fail('无效组件清单 ' + key)
    }
  }
  if (new Set([...a.buildComponents, ...a.fullExtraComponents]).size !==
      a.buildComponents.length + a.fullExtraComponents.length) fail('组件清单出现重复')
  for (const name of ['files', 'packages']) {
    if (!Number.isSafeInteger(data.integrity.sourceDependencies[name]) ||
        data.integrity.sourceDependencies[name] <= 0) fail('依赖快照计数无效：' + name)
  }
  return data
}
export function projections(data = readToolchain()) {
  const r = data.runtimes, i = data.integrity, a = data.artifacts
  const [pythonMajor, pythonMinor] = r.python.split('.')
  const versions = [
    '# 此文件由 node tools/dev/toolchain.mjs sync 从 toolchain.lock.json 生成，请只编辑权威 JSON',
    'NODE_VERSION=' + r.node,
    'NODE_MAJOR=' + major(r.node),
    'BUN_VERSION=' + r.bun,
    'PYTHON_VERSION=' + r.python,
    'PYTHON_MAJOR=' + pythonMajor,
    'PYTHON_MINOR=' + pythonMinor,
    'ACTIONLINT_VERSION=' + r.actionlint,
    'ACTIONLINT_LINUX_X64_SHA256=' + i.actionlintLinuxX64Sha256,
    'AST_TYPESCRIPT_VERSION=' + data.development.typescriptAstParser,
    'SOURCE_MAP_SHA256=' + i.sourceMapSha256,
    'SOURCE_DEPS_FILES=' + i.sourceDependencies.files,
    'SOURCE_DEPS_PACKAGES=' + i.sourceDependencies.packages,
    'ARTIFACT_SCHEMA=' + a.schema,
    '',
  ].join('\n')
  const components = [
    '# 此文件由 node tools/dev/toolchain.mjs sync 从 toolchain.lock.json 生成',
    "BUILD_COMPONENTS='" + a.buildComponents.join(' ') + "'",
    "FULL_EXTRA_COMPONENTS='" + a.fullExtraComponents.join(' ') + "'",
    'TOOLCHAIN_SHARD_BYTES=' + a.shardBytes,
    'NPM_PUBLIC_PARTS=' + a.npmPublicParts,
    '',
  ].join('\n')
  const pkg = {
    name: '333-development-tools', private: true, version: '1.0.0',
    description: '333 独立开发工具依赖，与发行包依赖隔离',
    devDependencies: data.development.packages,
  }
  return new Map([
    [join(dev, 'toolchain-versions.env'), versions],
    [join(dev, 'toolchain-components.env'), components],
    [join(dev, 'package.json'), JSON.stringify(pkg, null, 2) + '\n'],
  ])
}
export function checkToolchain() {
  const data = readToolchain()
  for (const [path, expected] of projections(data)) {
    if (readFileSync(path, 'utf8') !== expected) fail(path + ' 与权威清单漂移；执行 sync')
  }
  const lock = readJson(join(dev, 'package-lock.json'))
  const rootDeps = lock.packages?.['']?.devDependencies
  if (!rootDeps || JSON.stringify(rootDeps, Object.keys(rootDeps).sort()) !==
      JSON.stringify(data.development.packages, Object.keys(data.development.packages).sort())) {
    fail('开发工具 package-lock.json 根依赖版本与权威清单不一致；请重建 npm lock')
  }
  for (const [name, version] of Object.entries(data.development.packages)) {
    const entry = lock.packages['node_modules/' + name]
    if (!entry || entry.version !== version || !/^sha512-[a-zA-Z0-9+/]+=*$/.test(entry.integrity ?? '')) {
      fail('开发依赖锁没有有效的版本及 integrity：' + name + '@' + version)
    }
  }
  const stable = readJson(join(root, 'docs/upgrade/latest-stable-dependencies.json')).versions
  for (const [name, version] of Object.entries(data.development.packages)) {
    if (stable[name] && stable[name] !== version) {
      fail('发行 SDK 清单与开发工具使用了两个版本：' + name)
    }
  }
  return data
}
function githubEnvironment(data) {
  const r = data.runtimes
  return [
    'TOOLCHAIN_NODE_VERSION=' + r.node,
    'TOOLCHAIN_BUN_VERSION=' + r.bun,
    'TOOLCHAIN_PYTHON_VERSION=' + r.python,
    'TOOLCHAIN_ACTIONLINT_VERSION=' + r.actionlint,
    'TOOLCHAIN_AST_TYPESCRIPT_VERSION=' + data.development.typescriptAstParser,
  ].join('\n') + '\n'
}
function verifyRuntime(data) {
  if (process.versions.node !== data.runtimes.node) fail('当前 Node 版本 ' + process.version + ' 与清单不符')
  const bun = spawnSync('bun', ['--version'], { encoding: 'utf8', timeout: 10000 })
  if (bun.error || bun.status !== 0 || bun.stdout.trim() !== data.runtimes.bun) {
    fail('Bun 运行时与权威清单不一致：' + (bun.stdout || bun.error?.message || bun.stderr))
  }
}
const mode = process.argv[2] ?? 'check'
if (mode === 'sync') {
  const data = readToolchain()
  for (const [path, content] of projections(data)) writeFileSync(path, content)
  console.log('工具链派生文件已与权威清单同步')
} else if (mode === 'check') {
  checkToolchain()
  console.log('工具链版本、派生文件、npm lock 和发行依赖清单一致')
} else if (mode === 'gha-env') {
  process.stdout.write(githubEnvironment(readToolchain()))
} else if (mode === 'verify-runtime') {
  verifyRuntime(checkToolchain())
  console.log('Node/Bun 实际运行版本匹配权威清单')
} else {
  fail('用法：node tools/dev/toolchain.mjs sync|check|gha-env|verify-runtime')
}
