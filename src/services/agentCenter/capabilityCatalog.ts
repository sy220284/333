/**
 * Unified read-only capability projection over the existing loaders.
 *
 * An installed command or configured server is not proof of a successful
 * runtime invocation. The executor remains SkillTool / MCP / Workflow / Plugin.
 */
import { resolve } from 'node:path'
import { getCommands } from '../../commands.js'
import { getToolsForDefaultPreset } from '../../tools.js'
import { getMcpConfigsByScope, isMcpServerDisabled } from '../mcp/config.js'
import { loadAllPluginsCacheOnly } from '../../utils/plugins/pluginLoader.js'

export type CapabilityKind = 'tool' | 'skill' | 'workflow' | 'plugin' | 'mcp' | 'command'
export type CapabilityStatus = 'available' | 'configured' | 'disabled'
export type CapabilityEntry = {
  id: string
  name: string
  kind: CapabilityKind
  source: string
  scope: string
  description: string
  status: CapabilityStatus
  version?: string
}
export type CapabilityCatalog = { items: CapabilityEntry[]; warnings: string[] }

/** Stable identities prevent plugins and skills with the same display name from colliding. */
export function normalizeCapabilityCatalog(items: CapabilityEntry[]): CapabilityEntry[] {
  const unique = new Map<string, CapabilityEntry>()
  for (const item of items) {
    if (!item.id.trim() || !item.name.trim()) throw new Error('能力目录存在缺失 ID 或名称的条目')
    const previous = unique.get(item.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(item))
      throw new Error('能力目录存在同 ID 的冲突定义：' + item.id)
    unique.set(item.id, item)
  }
  return [...unique.values()].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.source.localeCompare(b.source))
}
export async function listCapabilityCatalog(projectDir: string): Promise<CapabilityCatalog> {
  if (!projectDir.trim()) throw new Error('能力目录需要明确的项目路径')
  const items: CapabilityEntry[] = []
  const warnings: string[] = []
  // A capability overview is observational: no installers, no remote refresh.
  try {
    for (const name of getToolsForDefaultPreset()) {
      items.push({
        id: 'tool:built-in:' + name, name, kind: 'tool',
        source: 'built-in', scope: 'built-in', description: '可由模型调用的原生工具',
        status: 'available',
      })
    }
  } catch (error) {
    warnings.push('内置工具发现失败：' + String(error))
  }
  try {
    const commands = await getCommands(resolve(projectDir))
    for (const command of commands) {
      const source = command.type === 'prompt' ? command.source : 'builtin'
      const kind: CapabilityKind = command.kind === 'workflow'
        ? 'workflow' : command.type === 'prompt' ? 'skill' : 'command'
      items.push({
        id: kind + ':' + source + ':' + command.name,
        name: command.name,
        kind,
        source,
        scope: source === 'builtin' || source === 'bundled' ? 'built-in' : 'project-or-user',
        description: command.description ?? '',
        status: 'available',
        ...(command.version ? { version: command.version } : {}),
      })
    }
  } catch (error) {
    warnings.push('本地技能或命令发现失败：' + String(error))
  }
  try {
    const plugins = await loadAllPluginsCacheOnly()
    for (const plugin of plugins.enabled) {
      items.push({
        id: 'plugin:' + plugin.source + ':' + plugin.name,
        name: plugin.name,
        kind: 'plugin',
        source: plugin.source,
        scope: 'installed',
        description: plugin.manifest.description ?? '',
        status: 'available',
        ...(plugin.manifest.version ? { version: plugin.manifest.version } : {}),
      })
    }
    for (const plugin of plugins.disabled) {
      items.push({
        id: 'plugin:' + plugin.source + ':' + plugin.name,
        name: plugin.name,
        kind: 'plugin',
        source: plugin.source,
        scope: 'installed',
        description: plugin.manifest.description ?? '',
        status: 'disabled',
        ...(plugin.manifest.version ? { version: plugin.manifest.version } : {}),
      })
    }
    if (plugins.errors.length > 0) {
      warnings.push('插件加载存在 ' + plugins.errors.length + ' 项错误，请在插件管理中查看详情')
    }
  } catch (error) {
    warnings.push('本地插件发现失败：' + String(error))
  }
  for (const scope of ['project', 'user', 'local'] as const) {
    try {
      const configuration = getMcpConfigsByScope(scope)
      for (const name of Object.keys(configuration.servers)) {
        const server = configuration.servers[name]
        if (!server) continue
        items.push({
          id: 'mcp:' + scope + ':' + name,
          name,
          kind: 'mcp',
          source: 'mcp-config',
          scope,
          description: '已配置的 MCP 服务（需要连接并完成工具调用才能验证功能）',
          status: isMcpServerDisabled(name) ? 'disabled' : 'configured',
        })
      }
      for (const error of configuration.errors) warnings.push(scope + ' MCP 配置：' + error.message)
    } catch (error) {
      warnings.push(scope + ' MCP 配置读取失败：' + String(error))
    }
  }
  return { items: normalizeCapabilityCatalog(items), warnings }
}
