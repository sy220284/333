/**
 * Resolve and guard 2.1.317 evaluation targets before invoking models.
 * A suite remains local and opt-in: untrusted plugin source cannot be
 * evaluated headlessly without --trust-plugin.
 */
import { mkdtemp, cp, readFile, realpath, stat, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute, resolve, relative } from 'node:path'
import { discoverEvalCases317 } from './pluginEvalCatalog317.mjs'
import { executePluginEvalSuite317 } from './pluginEvalEngine317.mjs'
import { savePluginEvalReport317 } from './pluginEvalReport317.mjs'

function within(root, path) {
  const p = relative(root, path)
  return p === '' || (p !== '..' && !p.startsWith('../') && !p.startsWith('..\\') && !isAbsolute(p))
}
async function findPluginRoot317(target) {
  const requested = resolve(target ?? '.')
  try {
    if ((await stat(requested)).isDirectory()) return realpath(requested)
  } catch (error) { if (error?.code !== 'ENOENT') throw error }
  const { loadInstalledPluginsV2 } = await import('../../utils/plugins/installedPluginsManager.js')
  const registry = loadInstalledPluginsV2().plugins
  const installed = registry[target] ?? registry[Object.keys(registry).find(name => name === target)]
  const destination = installed?.find(item => item.installPath)?.installPath
  if (!destination) throw new Error('plugin eval could not resolve the plugin target: ' + target)
  return realpath(destination)
}
async function chooseEvalDirectory317(root, override) {
  let folder = override
  if (folder === undefined) {
    try {
      const manifest = JSON.parse(await readFile(join(root, '.claude-plugin','plugin.json'), 'utf8'))
      folder = typeof manifest.experimental?.evals === 'string' ? manifest.experimental.evals : undefined
    } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
  folder ??= 'evals'
  if (typeof folder !== 'string' || isAbsolute(folder) || folder.split(/[\\/]/).includes('..')) {
    throw new Error('plugin eval directory must remain inside the plugin')
  }
  const directory = await realpath(resolve(root, folder))
  if (!within(root, directory)) throw new Error('plugin eval directory escaped plugin root')
  return directory
}

async function requireEvalTrust317(root, trustFlag) {
  if (trustFlag) return
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('plugin eval requires --trust-plugin for unattended execution')
  }
  const { createInterface } = await import('node:readline/promises')
  const reader = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const response = await reader.question(
      'This evaluation runs plugin code as your user with your model credentials. Trust ' + root + '? [y/N] ',
    )
    if (!/^(y|yes)$/i.test(response.trim())) throw new Error('Plugin evaluation cancelled')
  } finally { reader.close() }
}

/**
 * Default record/mock mode must not start real MCP processes.
 * Copy plugin to temporary staging, disabling its MCP server declarations.
 */
async function prepareEvalPlugin317(root, settings) {
  const workspace = await mkdtemp(join(tmpdir(), 'claude-eval-plugin-317-'))
  const plugin = join(workspace, 'plugin')
  try {
    await cp(root, plugin, {
      recursive: true, filter: file => !file.split(/[\\/]/).includes('.git'),
    })
    if (settings.mocks === 'record' || settings.mocks === undefined) {
      await rm(join(plugin, '.mcp.json'), { force: true })
      const manifestFile = join(plugin, '.claude-plugin','plugin.json')
      try {
        const data = JSON.parse(await readFile(manifestFile, 'utf8'))
        if (data && typeof data === 'object' && 'mcpServers' in data) {
          delete data.mcpServers
          await writeFile(manifestFile, JSON.stringify(data, null, 2))
        }
      } catch (error) { if (error?.code !== 'ENOENT') throw error }
    }
    return { plugin, workspace }
  } catch (error) {
    await rm(workspace, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 })
    throw error
  }
}

export async function pluginEvalHandler317(target, options = {}, adapters = {}) {
  const pluginRoot = await findPluginRoot317(target)
  await requireEvalTrust317(pluginRoot, options.trustPlugin)
  const mocks = options.mocks ?? 'record'
  if (!['record','off'].includes(mocks)) throw new Error('--mocks must be record or off')
  if (mocks === 'off' && !options.allowRealServers) {
    throw new Error('Running real plugin MCP servers requires --allow-real-servers')
  }
  const evalDir = await chooseEvalDirectory317(pluginRoot, options.evalDir)
  const cases = await discoverEvalCases317(evalDir, {
    case: options.case, tags: options.tag,
  })
  if (!cases.length) throw new Error('plugin eval found no cases in ' + evalDir)
  const temp = await prepareEvalPlugin317(pluginRoot, { ...options, mocks })
  try {
    const data = await executePluginEvalSuite317(cases, {
      ...options, pluginRoot: temp.plugin, sourcePluginRoot: pluginRoot,
    }, adapters)
    data.suite = { root: pluginRoot, evalDir }
    data.startedAt = new Date().toISOString()
    data.finishedAt = new Date().toISOString()
    const outputDir = options.outputDir
      ? resolve(options.outputDir)
      : join(evalDir, 'results', data.finishedAt.replace(/[:.]/g, '-'))
    const report = await savePluginEvalReport317(data, { ...options, outputDir })
    if (options.json === undefined) {
      process.stdout.write(
        'plugin eval: ' + cases.length + ' cases, score=' + (data.score ?? 'n/a') +
        ', cost=$' + data.costUsd.toFixed(4) + '\nReport: ' + report.reportFile + '\n',
      )
    }
    const threshold = Number(options.threshold ?? 1)
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error('--threshold must be in [0,1]')
    }
    if (data.budgetExceeded) return 2
    const failed = data.cases.flatMap(c =>
      c.runs.filter(run => run.error).map(run =>
        `${c.name} [${run.arm} run ${run.repeat}]: ${run.error}`))
    if (failed.length) {
      process.stderr.write('plugin eval model execution failed:\n' +
        failed.join('\n') + '\n')
    }
    return data.cases.some(c => c.score === null || c.score < threshold) ? 1 : 0
  } finally {
    if (!options.keepTemp) await rm(temp.workspace, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 })
  }
}
