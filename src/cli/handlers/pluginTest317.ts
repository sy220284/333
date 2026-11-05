/**
 * Real plugin test CLI runner. Each *.test.ts(x) is evaluated in a separate
 * child of the rebuilt CLI, and its result is reported in original case order.
 * The hidden --file route is only a worker protocol; no legacy binary is used.
 */
import { spawn } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { discoverPluginTests317 } from '../../utils/plugins/pluginTestDiscovery317.ts'
import { runPluginTestFile317 } from './pluginTestSandbox317.ts'

// Original 2.1.317 chunk-dh4tgvjk.js REPORT_MARK, consumed by the parent CLI.
import { PLUGIN_TEST_REPORT_MARK_317 } from './pluginTestWire317.ts'
const PER_FILE_TIMEOUT_MS = 600000
const ENV_KEYS = [
  'PATH','HOME','USERPROFILE','SystemRoot','TMPDIR','TEMP','TMP',
  'LANG','LC_ALL','TERM','NO_COLOR','FORCE_COLOR','USER_TYPE',
  'CLAUDE_CONFIG_DIR',
]

function childEnvironment() {
  const env = {}
  for (const key of ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return env
}

async function verifyPluginRoot(root) {
  const info = await stat(root)
  if (!info.isDirectory()) throw new Error('not a plugin directory: ' + root)
  const configFile = join(root, 'hooks', 'hooks.json')
  let manifest
  try { manifest = JSON.parse(await readFile(configFile, 'utf8')) }
  catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`${root}: no hooks module to load; there is no hooks/hooks.json naming one in "modules"`)
    }
    throw error
  }
  if (!Array.isArray(manifest.modules) || manifest.modules.length === 0 ||
      !manifest.modules.every(value => typeof value === 'string' && value.trim())) {
    throw new Error(`${root}: no hooks module to load; hooks/hooks.json names none in "modules"`)
  }
  return manifest
}

function sameExecutable(a, b) {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function workerArgs(root, file) {
  const cli = process.argv[1] ? resolve(process.argv[1]) : undefined
  const args = cli && /\.(?:[cm]?js|tsx?)$/.test(cli) && !sameExecutable(cli, resolve(process.execPath))
    ? [cli]
    : []
  return [...args, 'plugin', 'test', '--file', file, root]
}

async function runOne(root, file) {
  const child = spawn(process.execPath, workerArgs(root, file), {
    cwd: root,
    env: childEnvironment(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: PER_FILE_TIMEOUT_MS,
  })
  // Register process completion before consuming stdout; the close event
  // may otherwise fire while the async iterator is draining.
  const exitPromise = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolveExit({ code, signal }))
  })
  const output = []
  for await (const chunk of child.stdout) output.push(chunk)
  const exit = await exitPromise
  const text = Buffer.concat(output).toString('utf8')
  const record = text.split('\n').findLast(line => line.startsWith(PLUGIN_TEST_REPORT_MARK_317))
  if (!record) {
    return { file, results: [], error: `its run ended without a report (exit code ${exit.code ?? exit.signal ?? '?'})` }
  }
  let result
  try { result = JSON.parse(record.slice(PLUGIN_TEST_REPORT_MARK_317.length)) }
  catch (error) { return { file, results: [], error: 'invalid worker report: ' + error } }
  if (result.file !== file || !Array.isArray(result.results)) {
    return { file, results: [], error: 'worker report path or shape mismatch' }
  }
  if (exit.code !== 0) {
    result.results.push({ title: 'the file ran to its end', ms: 0, failure: `worker exited with ${exit.code ?? exit.signal}` })
  }
  return result
}

function displayResult(root, data) {
  const rel = relative(root, data.file)
  process.stdout.write('\n' + rel + ':\n')
  if (data.error) process.stdout.write('(fail) the file did not load\n  ' + data.error + '\n')
  for (const result of data.results) {
    const pass = result.failure == null
    process.stdout.write(`(${pass ? 'pass' : 'fail'}) ${result.title} [${result.ms.toFixed(2)}ms]\n`)
    if (!pass) process.stdout.write('  ' + String(result.failure).replaceAll('\n', '\n  ') + '\n')
  }
  return { passed: data.results.filter(x => x.failure === null).length,
    failed: data.results.filter(x => x.failure !== null).length + Number(Boolean(data.error)) }
}

export async function pluginTestHandler317(
  directory: string = '.', options: {file?: string} = {},
): Promise<number> {
  const root = await realpath(resolve(directory))
  if (options.file) {
    const file = await realpath(resolve(options.file))
    const rel = relative(root, file)
    if (rel === '' || rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) {
      throw new Error('plugin test worker file must be inside the plugin directory')
    }
    await verifyPluginRoot(root)
    const result = await runPluginTestFile317(root, file)
    process.stdout.write(PLUGIN_TEST_REPORT_MARK_317 + JSON.stringify(result) + '\n')
    return 0
  }

  await verifyPluginRoot(root)
  const files = await discoverPluginTests317(root)
  if (!files.length) {
    process.stderr.write(`claude plugin test: no *.test.ts or *.test.tsx under ${root}\n`)
    return 1
  }
  const start = performance.now()
  const results = new Array(files.length)
  let index = 0
  const workers = Array.from({ length: Math.min(files.length, Math.max(1, availableParallelism())) },
    async () => {
      for (;;) {
        const next = index++
        if (next >= files.length) return
        results[next] = await runOne(root, files[next])
      }
    })
  await Promise.all(workers)
  let passed = 0, failed = 0
  for (const result of results) {
    const totals = displayResult(root, result)
    passed += totals.passed
    failed += totals.failed
  }
  const total = passed + failed
  process.stdout.write(`\n ${passed} pass\n ${failed} fail\nRan ${total} ${total === 1 ? 'test' : 'tests'} across ${files.length} ${files.length === 1 ? 'file' : 'files'}. [${((performance.now() - start) / 1000).toFixed(2)}s]\n`)
  return failed === 0 ? 0 : 1
}
