#!/usr/bin/env node
// Strict compilation for modules already migrated from JavaScript to TypeScript.
// The same target manifest drives the content audit and this compiler check.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/dev/type-migration-targets.json'), 'utf8'))
const targets = manifest.strict
if (!Array.isArray(targets) || targets.length === 0 ||
    targets.some(path => typeof path !== 'string' || !path.startsWith('src/') ||
      !path.endsWith('.ts') || !existsSync(resolve(root, path)))) {
  throw new Error('Invalid strict TypeScript migration manifest')
}
const parent = resolve(root, '.rebuild/tsconfig.dev.json')
if (!existsSync(parent)) {
  throw new Error('First run node tools/dev/dev.mjs typecheck:all to prepare frozen dependency aliases')
}
const strictConfig = resolve(root, '.rebuild/tsconfig.strict-migrated.json')
mkdirSync(dirname(strictConfig), { recursive: true })
writeFileSync(strictConfig, JSON.stringify({
  extends: './tsconfig.dev.json',
  compilerOptions: { strict: true },
  files: targets.map(path => '../' + path),
  include: [],
  exclude: [],
}, null, 2) + '\n')
const tsc = resolve(root, 'tools/dev/node_modules/typescript/bin/tsc')
if (!existsSync(tsc)) throw new Error('冻结的 TypeScript 7 编译入口缺失，请运行 npm run dev:bootstrap')
const result = spawnSync(process.execPath,
  [tsc, '--noEmit', '--pretty', 'false', '-p', strictConfig],
  { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status || 1
else console.log('[OK] Strict TypeScript compile: ' + targets.length + ' migrated modules')
