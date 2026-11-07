/** Non-interactive local data cleanup; the desktop owns confirmation dialogs. */
import { readFile, realpath } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getGlobalClaudeFile } from '../../utils/env.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { errorMessage, getErrnoCode } from '../../utils/errors.js'
import { findGitRoot } from '../../utils/git.js'
import { executePurgeItem, planPurge, type PurgeItem } from '../../utils/purgeProject.ts'
import { cliError, cliOk } from '../exit.js'

type PurgeOptions = { all?: boolean; yes?: boolean; interactive?: boolean; dryRun?: boolean }
function describe(item: PurgeItem): string {
  const label = item.kind === 'config-key' ? 'config: projects[' + JSON.stringify(item.path) + ']'
    : item.kind === 'history-lines' ? 'filter: ' + item.path
    : item.kind === 'history-siblings' ? 'siblings: ' + item.path + '.tmp.* and ' + dirname(item.path) + sep + '.<16hex>.tmp'
    : item.kind + ': ' + item.path
  return label + '\n           ' + item.reason
}
async function removeProject(key: string): Promise<void> {
  saveGlobalConfig(current => {
    if (!Object.hasOwn(current.projects ?? {}, key)) return current
    const projects = { ...current.projects }
    delete projects[key]
    return { ...current, projects }
  })
  const durable = JSON.parse(await readFile(getGlobalClaudeFile(), 'utf8')) as { projects?: Record<string, unknown> }
  if (Object.hasOwn(durable.projects ?? {}, key)) throw new Error('本地项目配置仍存在：' + key)
}

export async function purgeProjectHandler(path: string | undefined, options: PurgeOptions): Promise<void> {
  try {
    if (options.all && path) return cliError('Cannot specify both a path and --all.')
    if (options.all && options.interactive) return cliError('Cannot use -i/--interactive with --all.')
    if (options.interactive) return cliError('旧终端选择界面已移除。请使用桌面「设置 → 本地数据管理」，或运行 --dry-run 后使用 --yes。')
    const projectKeys = Object.keys(getGlobalConfig().projects ?? {})
    const project = options.all ? undefined : resolve(path ?? process.cwd())
    const configAliases: string[] = []
    if (project) {
      try {
        const canonical = await realpath(project)
        for (const alias of [findGitRoot(project), findGitRoot(canonical)]) if (alias) configAliases.push(alias)
      } catch (error) { if (getErrnoCode(error) !== 'ENOENT') throw error }
    }
    const home = getClaudeConfigHomeDir()
    const plan = await planPurge(home, project, { all: options.all, projectKeys, configAliases })
    if (!plan.items.length) return cliError(options.all
      ? 'No 摇摇车 project state found under ' + home + '.'
      : 'No 摇摇车 project state found for ' + project + ' under ' + home + '.')
    const subject = options.all ? 'all projects' : project!
    process.stdout.write('\nPurge plan for ' + subject + ':\n\n')
    for (const item of plan.items) process.stdout.write('  ' + describe(item) + '\n')
    for (const warning of plan.warnings) process.stderr.write(warning + '\n')
    process.stdout.write('\n仅清理本机记录，项目源码和模型凭证将保留。\n')
    if (options.dryRun) return cliOk('Dry run: ' + plan.items.length + ' item(s) would be deleted.')
    if (!options.yes) return cliError('An interactive terminal is no longer supported for purge confirmation. Review --dry-run, then explicitly pass --yes.')
    let deleted = 0
    const errors: string[] = []
    for (const item of plan.items) {
      try { await executePurgeItem(item, { removeProject }); deleted++ }
      catch (error) { errors.push(item.path + ': ' + errorMessage(error)) }
    }
    if (errors.length) return cliError(errors.length + ' item(s) failed:\n  ' + errors.join('\n  ') +
      '\n已删除 ' + deleted + ' 项，其余记录仍在磁盘。请重新运行 --dry-run 检查。')
    return cliOk(options.all ? 'Purged ' + deleted + ' item(s) across all projects.' : 'Purged ' + deleted + ' item(s) for ' + subject + '.')
  } catch (error) {
    return cliError('Purge stopped before completion: ' + errorMessage(error) +
      '\n部分记录可能仍在磁盘，请运行 --dry-run 检查。')
  }
}
