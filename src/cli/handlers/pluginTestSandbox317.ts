/**
 * Isolated plugin test file VM, based on 2.1.317's per-file runtime contract.
 * TypeScript/TSX source is transpiled before SourceTextModule linking.
 * Imports are restricted to the test kit and modules within the plugin root.
 */
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import * as vm from 'node:vm'
import { createPluginTestKit317 } from './pluginTestKit317.ts'
import { createPluginTestTimers317 } from './pluginTestTimers317.ts'

const EXTENSIONS = ['', '.js', '.mjs', '.ts', '.tsx', '/index.js', '/index.ts']
const isInside = (root, target) => {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(rel))
}
async function resolveImport(importer, specifier, root) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    throw new Error(`plugin test import refused: ${specifier}`)
  }
  const base = resolve(dirname(importer), specifier)
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (!isInside(root, candidate)) throw new Error(`plugin test import leaves the plugin: ${specifier}`)
    try {
      const actual = await realpath(candidate)
      if (!isInside(root, actual)) throw new Error(`plugin test symlink leaves the plugin: ${specifier}`)
      if ((await stat(actual)).isFile()) return actual
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
    }
  }
  throw new Error(`plugin test cannot resolve import: ${specifier}`)
}

function compileSource(source, path) {
  if (typeof Bun === 'undefined' || !Bun.Transpiler) {
    throw new Error('The native Bun runtime is required to run plugin tests')
  }
  const extension = extname(path)
  const loader = extension === '.tsx' ? 'tsx' : extension === '.ts' ? 'ts' : 'js'
  return new Bun.Transpiler({ loader, target: 'bun' }).transformSync(source)
}

export async function runPluginTestFile317(rootPath, filePath, { defaultTimeoutMs = 5000 } = {}) {
  if (!vm.SourceTextModule || !vm.SyntheticModule) {
    throw new Error('The native VM module engine is required for plugin test')
  }
  const root = await realpath(rootPath)
  const file = await realpath(filePath)
  if (!isInside(root, file) || file === root) {
    throw new Error(`claude plugin test: ${file} is not in ${root}`)
  }
  const kit = createPluginTestKit317()
  const timers = createPluginTestTimers317()
  const events = new Map()
  const context = vm.createContext({
    console: Object.freeze({
      log: (...args) => process.stderr.write(args.join(' ') + '\n'),
      error: (...args) => process.stderr.write(args.join(' ') + '\n'),
    }),
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    AbortController, URL, TextEncoder, TextDecoder,
  })
  try {
  const namespace = kit.namespace
  const kitModule = new vm.SyntheticModule(Object.keys(namespace), function () {
    for (const [name, value] of Object.entries(namespace)) this.setExport(name, value)
  }, { context, identifier: 'claude-code/testing' })
  const loaded = new Map()
  async function load(path) {
    if (loaded.has(path)) return loaded.get(path)
    const source = await readFile(path, 'utf8')
    const result = new vm.SourceTextModule(compileSource(source, path), {
      context, identifier: path,
    })
    loaded.set(path, result)
    return result
  }
  const linker = async (specifier, importer) =>
    specifier === 'claude-code/testing'
      ? kitModule
      : load(await resolveImport(importer.identifier, specifier, root))
  const hooksFile = join(root, 'hooks', 'hooks.json')
  const config = JSON.parse(await readFile(hooksFile, 'utf8'))
  if (!Array.isArray(config.modules) || config.modules.length === 0 ||
      !config.modules.every(name => typeof name === 'string' && name.trim())) {
    throw new Error(`${root}: no hooks module to load; hooks/hooks.json names none in "modules"`)
  }
  for (const moduleName of config.modules) {
    const path = await resolveImport(hooksFile, moduleName, root)
    const module = await load(path)
    if (module.status === 'unlinked') await module.link(linker)
    if (module.status !== 'evaluated') await module.evaluate()
    const register = module.namespace.register
    if (typeof register !== 'function') {
      throw new Error(`hook module ${moduleName} must export register(on)`)
    }
    await register((event, callback) => {
      if (typeof event !== 'string' || typeof callback !== 'function') {
        throw new TypeError('on(event, callback) requires a hook name and function')
      }
      const callbacks = events.get(event) ?? []
      callbacks.push(callback)
      events.set(event, callbacks)
    })
  }
  const seat = Object.freeze({
    emit: async (event, payload) => {
      const results = []
      for (const callback of events.get(event) ?? []) results.push(await callback(payload))
      return results
    },
  })
  const mod = await load(file)
  if (mod.status === 'unlinked') await mod.link(linker)
  await mod.evaluate()
  kit.finishCollecting()
  if (kit.cases.length === 0) {
    return { file, results: [], error: 'it declares no test(): nothing ran' }
  }
  const results = []
  for (const item of kit.cases) {
    const start = performance.now()
    const ms = item.options.timeoutMs ?? defaultTimeoutMs
    let timer
    try {
      await Promise.race([
        Promise.resolve().then(() => item.body(seat, (event, callback) => {
          const callbacks = events.get(event) ?? []
          callbacks.push(callback)
          events.set(event, callbacks)
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`test timed out after ${ms} ms`)), ms)
        }),
      ])
      results.push({ title: item.title, ms: performance.now() - start, failure: null })
    } catch (error) {
      results.push({
        title: item.title, ms: performance.now() - start,
        failure: error instanceof Error ? (error.stack ?? error.message) : String(error),
      })
    } finally {
      clearTimeout(timer)
    }
  }
  // The original test harness grants three late event-loop turns to surface
  // asynchronous timer failures before its VM environment is released.
  for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve))
  const thrown = timers.failures
  if (thrown.length) {
    results.push({
      title: 'a timer callback threw', ms: 0,
      failure: thrown.map(error => error.stack ?? error.message).join('\n'),
    })
  }
  return { file, results }
  } finally {
    timers.dispose()
  }
}
