/** Shared local-project maintenance without a terminal renderer. */
import { lstat, readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getGlobalClaudeFile } from '../../utils/env.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { findGitRoot } from '../../utils/git.js'
import { planPurge, executePurgeItem, type PurgeItem } from '../../utils/purgeProject.ts'
import { getSmartExecutionJournalFile } from './smartExecutionJournal.js'
import { getDesktopProjectStateDirectory } from './taskJournal.js'
import { getProjectBudgetFile } from '../agentCenter/projectBudget.js'

export type LocalPurgePlan = { workspace: string; items: PurgeItem[]; warnings: string[] }

export async function planLocalProjectPurge(workspace: string, smartJournalRoot?: string): Promise<LocalPurgePlan> {
  const project = resolve(workspace)
  const projectKeys = Object.keys(getGlobalConfig().projects ?? {})
  const canonical = await realpath(project)
  const aliases = [findGitRoot(project), findGitRoot(canonical)].filter((s): s is string => !!s)
  const plan = await planPurge(getClaudeConfigHomeDir(), project, { projectKeys, configAliases: aliases })
  const journalFile = getSmartExecutionJournalFile(project, smartJournalRoot)
  for(const [file,description] of [
    [getProjectBudgetFile(project,smartJournalRoot),'当前工作区共享预算、预占额度及历史费用'],
  ]){
    try{
      const info=await lstat(file)
      if(!info.isFile()||info.nlink!==1)throw new Error('共享预算账本必须是普通独立文件')
      plan.items.push({path:file,kind:'file',reason:description})
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  }
  const sessionDirectory=getDesktopProjectStateDirectory(project,smartJournalRoot)
  try {
    const info=await lstat(sessionDirectory)
    if(!info.isDirectory())throw new Error('本地桌面任务与会话设置目录必须为独立目录')
    plan.items.push({path:sessionDirectory,kind:'dir',reason:'当前工作区桌面任务记录、已恢复会话的模型及权限模式'})
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  try {
    const info = await lstat(journalFile)
    if (!info.isFile() || info.nlink !== 1) throw new Error('智能执行记录必须是普通独立文件')
    plan.items.push({ path: journalFile, kind: 'file', reason: '当前工作区的智能执行历史与费用记录' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
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
