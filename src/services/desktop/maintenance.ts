/** Shared local-project maintenance without a terminal renderer. */
import { readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getGlobalClaudeFile } from '../../utils/env.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { findGitRoot } from '../../utils/git.js'
import { planPurge, executePurgeItem, type PurgeItem } from '../../utils/purgeProject.ts'

export type LocalPurgePlan = { workspace: string; items: PurgeItem[]; warnings: string[] }

export async function planLocalProjectPurge(workspace: string): Promise<LocalPurgePlan> {
  const project = resolve(workspace)
  const projectKeys = Object.keys(getGlobalConfig().projects ?? {})
  const canonical = await realpath(project)
  const aliases = [findGitRoot(project), findGitRoot(canonical)].filter((s): s is string => !!s)
  const plan = await planPurge(getClaudeConfigHomeDir(), project, { projectKeys, configAliases: aliases })
  return { workspace: project, items: plan.items, warnings: plan.warnings }
}

async function removeProjectConfig(key: string): Promise<void> {
  saveGlobalConfig(current => {
    if (!Object.hasOwn(current.projects ?? {}, key)) return current
    const projects = { ...current.projects }
    delete projects[key]
    return { ...current, projects }
  })
  const data: unknown = JSON.parse(await readFile(getGlobalClaudeFile(), 'utf8'))
  if (data && typeof data === 'object' && 'projects' in data) {
    const projects = (data as { projects?: Record<string, unknown> }).projects
    if (projects && Object.hasOwn(projects, key)) throw new Error(`本地项目配置未成功删除：${key}`)
  }
}

export async function executeLocalProjectPurge(items: PurgeItem[]) {
  const errors: string[] = []
  let deleted = 0
  for (const item of items) {
    try {
      await executePurgeItem(item, { removeProject: removeProjectConfig })
      deleted++
    } catch (error) {
      errors.push(`${item.path}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { deleted, total: items.length, errors }
}
