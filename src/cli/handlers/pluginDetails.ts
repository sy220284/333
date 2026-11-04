import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { LoadedPlugin } from '../../types/plugin.js'
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js'

type Member = { name: string; path: string }
async function list(path?: string) {
  if (!path) return []
  try { return await readdir(path, { withFileTypes: true }) }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
}
async function json(path: string): Promise<Record<string, unknown>> {
  try {
    const data: unknown = JSON.parse(await readFile(path, 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw e }
}
function keys(data: unknown) {
  return data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : []
}
async function files(paths: (string | undefined)[]): Promise<Member[]> {
  const found = new Map<string, Member>()
  for (const path of paths) if (path) for (const entry of await list(path)) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const full = join(path, entry.name)
      found.set(full, { name: basename(entry.name, '.md'), path: full })
    }
  }
  return [...found.values()]
}
async function skills(paths: (string | undefined)[]): Promise<Member[]> {
  const found = new Map<string, Member>()
  for (const path of paths) {
    if (!path) continue
    const direct = join(path, 'SKILL.md')
    const check = await stat(direct).catch(e => {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw e
    })
    if (check?.isFile()) {
      found.set(path, { name: basename(path), path: direct })
      continue
    }
    for (const entry of await list(path)) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const file = join(path, entry.name, 'SKILL.md')
      const info = await stat(file).catch(e => {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw e
      })
      if (info?.isFile()) found.set(file, { name: entry.name, path: file })
    }
  }
  return [...found.values()]
}
async function scan(plugin: LoadedPlugin) {
  const c = await files([plugin.commandsPath, ...plugin.commandsPaths ?? []])
  const a = await files([plugin.agentsPath, ...plugin.agentsPaths ?? []])
  // The root SKILL.md in a skills-dir plugin is its entry point; the
  // native component inventory counts only optional skills/ subcomponents.
  const skillRoots = plugin.source.endsWith('@skills-dir')
    ? [join(plugin.path, 'skills')]
    : [plugin.skillsPath, ...plugin.skillsPaths ?? []]
  const s = await skills(skillRoots)
  const m = await json(join(plugin.path, '.mcp.json'))
  const l = await json(join(plugin.path, '.lsp.json'))
  const h = plugin.hooksConfig
    ? keys(plugin.hooksConfig)
    : typeof plugin.manifest.hooks === 'string'
      ? keys((await json(join(plugin.path, plugin.manifest.hooks))).hooks)
      : keys(plugin.manifest.hooks)
  const mcp = plugin.mcpServers ? keys(plugin.mcpServers)
    : keys(m.mcpServers ?? m).concat(keys(plugin.manifest.mcpServers))
  const lsp = plugin.lspServers ? keys(plugin.lspServers)
    : keys(l).concat(keys(plugin.manifest.lspServers))
  return { commands: c, agents: a, skills: s, hooks: h, mcp: [...new Set(mcp)], lsp: [...new Set(lsp)] }
}
async function cost(m: Member): Promise<{ always: number; invoke: number }> {
  const text = await readFile(m.path, 'utf8')
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  const desc = fm?.[1]?.match(/^\s*description:\s*(.*)/m)?.[1] ?? m.name
  return { always: (m.name + ': ' + desc).length, invoke: (fm ? text.slice(fm[0].length) : text).trim().length }
}
const estimate = (n: number) => Math.round(n / 4)
const display = (n: number) => n < 20 ? '< 20' : '~' + Math.round(n / 10) * 10
export async function pluginDetailsHandler(name: string): Promise<void> {
  const loaded = await loadAllPlugins()
  const plugin = [...loaded.enabled, ...loaded.disabled].find(p =>
    p.source === name || p.name === name || p.source.startsWith(name + '@'))
  if (!plugin) {
    const tick = String.fromCharCode(96)
    process.stdout.write('Plugin "' + name + '" not found. Run ' + tick +
      'claude plugin list' + tick +
      ' to see installed plugins, or pass --plugin-dir <path> to load one from disk.\n')
    process.exit(1)
  }
  const v = await scan(plugin)
  const lines: string[] = [
    (plugin.name + ' ' + (plugin.manifest.version ?? '')).trimEnd(),
  ]
  if (plugin.manifest.description) {
    const descriptions = plugin.manifest.description.split('\n')
    lines.push('  Description: ' + descriptions[0])
    for (const extra of descriptions.slice(1)) lines.push('      ' + extra)
  }
  lines.push('  Source: ' + plugin.source, '', 'Component inventory')
  const entries: Array<[string, string[], string]> = [
    ['Skills', [...v.skills, ...v.commands].map(x => x.name).sort(), ''],
    ['Agents', v.agents.map(x => x.name), ''],
    ['Hooks', v.hooks, '  (harness-only — no model context cost)'],
    ['MCP servers', v.mcp, '  (tool schemas resolved at runtime; not counted)'],
    ['LSP servers', v.lsp, '  (out-of-process tooling; no model context cost)'],
  ]
  for (const [label, names, suffix] of entries)
    lines.push('  ' + label + ' (' + names.length + ')' + (names.length ? '  ' + names.join(', ') + suffix : ''))
  const members = [...v.skills, ...v.agents, ...v.commands]
  const size = await Promise.all(members.map(cost))
  const always = size.reduce((sum, member) => sum + member.always, 0)
  lines.push('', 'Projected token cost',
    '  Always-on:   ~' + estimate(always).toLocaleString() + ' tok   added to every session')
  if (members.length) {
    lines.push('', 'Per-component (rounded)')
    const width = Math.max(9, ...members.map(m => m.name.length))
    lines.push('  ' + 'component'.padEnd(width) + '  ' +
      'always-on'.padStart(9) + '  ' + 'on-invoke'.padStart(9))
    members.forEach((member, i) => {
      const row = size[i]!
      lines.push('  ' + member.name.padEnd(width) + '  ' +
        display(estimate(row.always)).padStart(9) + '  ' +
        display(estimate(row.invoke)).padStart(9))
    })
    lines.push('', '  On-invoke cost is paid each time a skill or agent fires.',
      '  Token counts are estimates and may differ from actual usage.')
  }
  process.stdout.write(lines.join('\n') + '\n')
  process.exit(0)
}
