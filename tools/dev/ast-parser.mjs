#!/usr/bin/env node
/** Pinned JavaScript TypeScript compiler API, separate from native TypeScript 7. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readToolchain } from './toolchain.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

export async function loadAstParser() {
  const version = readToolchain().development.typescriptAstParser
  const source = process.env.TS_COMPILER_PATH ??
    join(root, '.rebuild/toolchain-ast/node_modules/typescript/lib/typescript.js')
  if (!existsSync(source)) {
    throw new Error('独立AST解析器缺失，请执行 node tools/dev/toolchain.mjs install-ast')
  }
  const installed = JSON.parse(readFileSync(resolve(dirname(source), '..', 'package.json'), 'utf8'))
  if (installed.version !== version) {
    throw new Error(`独立AST解析器版本错误：应为 ${version}，实际为 ${installed.version}`)
  }
  const ts = (await import(pathToFileURL(source).href)).default
  if (!ts || typeof ts.createSourceFile !== 'function' ||
      typeof ts.createProgram !== 'function' || !ts.ScriptTarget?.Latest) {
    throw new Error(`独立AST解析器缺少必需的TypeScript JavaScript编译器接口：${source}`)
  }
  return ts
}
