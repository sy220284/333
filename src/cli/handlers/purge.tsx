/** Local project state cleanup, following 2.1.317 purgeProjectHandler. */
import React from 'react'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { Select } from '../../components/CustomSelect/select.js'
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js'
import { Box, Text, render } from '../../ink.js'
import { AppStateProvider } from '../../state/AppState.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getGlobalClaudeFile } from '../../utils/env.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { errorMessage, getErrnoCode } from '../../utils/errors.js'
import { findGitRoot } from '../../utils/git.js'
import { executePurgeItem, planPurge, type PurgeItem } from '../../utils/purgeProject.ts'
import { cliError, cliOk } from '../exit.js'

type PurgeOptions = { all?: boolean; yes?: boolean; interactive?: boolean; dryRun?: boolean }
async function choose(title: string, options: { label: string; value: string; description?: string }[], defaultValue?: string): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('An interactive terminal is required. Pass a project path and --dry-run to preview, or --yes to confirm deletion.')
  let selection: string | null = null
  const instance = await render(<AppStateProvider><KeybindingSetup><Box flexDirection="column" gap={1} paddingY={1}>
    <Text bold>{title}</Text>
    <Select options={options} defaultValue={defaultValue} defaultFocusValue={defaultValue} visibleOptionCount={10} onChange={(value: string) => { selection = value; instance.unmount() }} onCancel={() => { instance.unmount() }} />
  </Box></KeybindingSetup></AppStateProvider>, { exitOnCtrlC: false })
  await instance.waitUntilExit()
  return selection
}
function describe(item: PurgeItem): string {
  const label = item.kind === 'config-key' ? `config: projects[${JSON.stringify(item.path)}]`
    : item.kind === 'history-lines' ? `filter: ${item.path}`
    : item.kind === 'history-siblings' ? `siblings: ${item.path}.tmp.* and ${dirname(item.path)}${sep}.<16hex>.tmp`
    : `${item.kind}:    ${item.path}`
  return `${label}\n           ${item.reason}`
}
async function removeProject(key: string): Promise<void> {
  saveGlobalConfig(current => {
    if (!Object.hasOwn(current.projects ?? {}, key)) return current
    const projects = { ...current.projects }
    delete projects[key]
    return { ...current, projects }
  })
  // The configuration writer protects existing credentials against stale
  // reads. Check its durable result before reporting a successful deletion.
  const durable = JSON.parse(await readFile(getGlobalClaudeFile(), 'utf8'))
  if (Object.hasOwn(durable.projects ?? {}, key)) throw new Error(`Failed to remove projects[${JSON.stringify(key)}] from .yaoyaoche.json — is your config directory writable?`)
}
export async function purgeProjectHandler(path: string | undefined, options: PurgeOptions): Promise<void> {
  try {
    if (options.all && path) return cliError('Cannot specify both a path and --all.')
    if (options.all && options.interactive) return cliError('Cannot use -i/--interactive with --all.')
    const projectKeys = Object.keys(getGlobalConfig().projects ?? {})
    let project = path ? resolve(path) : undefined
    if (!options.all && !project) {
      const current = resolve(process.cwd())
      const selected = await choose('Select a project to purge:', [...new Set([current, ...projectKeys])].map(value => ({ label: value, value, ...(value === current ? { description: 'current directory' } : {}) })), current)
      if (selected === null) return cliError('Aborted.')
      project = selected
    }
    const configAliases: string[] = []
    if (project) {
      try {
        const canonical = await realpath(project)
        for (const alias of [findGitRoot(project), findGitRoot(canonical)]) if (alias) configAliases.push(alias)
      } catch (error) { if (getErrnoCode(error) !== 'ENOENT') throw error }
    }
    const home = getClaudeConfigHomeDir()
    const plan = await planPurge(home, project, { all: options.all, projectKeys, configAliases })
    if (!plan.items.length) return cliError(options.all ? `No 摇摇车 project state found under ${home}.` : `No 摇摇车 project state found for ${project} under ${home}.`)
    const subject = options.all ? 'all projects' : project!
    process.stdout.write(`\nPurge plan for ${subject}:\n\n`)
    for (const item of plan.items) process.stdout.write(`  ${describe(item)}\n`)
    if (plan.warnings.length) process.stdout.write('\n')
    for (const warning of plan.warnings) process.stderr.write(`${warning}\n`)
    process.stdout.write('\nPurging deletes data only on this computer, not anything stored by Anthropic.\n')
    if (options.dryRun) return cliOk(`Dry run: ${plan.items.length} item(s) would be deleted.`)
    if (!options.yes && !options.interactive) {
      const answer = await choose(`Delete ${plan.items.length} item(s) for ${subject} from this computer? This can't be undone.`, [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }], 'no')
      if (answer !== 'yes') return cliError('Aborted.')
    }
    let deleted = 0, remaining = !options.interactive
    const errors: string[] = []
    for (const [index, item] of plan.items.entries()) {
      if (!remaining) {
        const answer = await choose(`[${index + 1}/${plan.items.length}] ${describe(item)}`, [{ label: 'Delete', value: 'delete' }, { label: 'Skip', value: 'skip' }, { label: 'Delete this and all remaining', value: 'all' }, { label: 'Abort', value: 'abort' }])
        if (answer === null || answer === 'abort') return cliError(`Aborted. ${deleted} item(s) deleted.`)
        if (answer === 'skip') continue
        if (answer === 'all') remaining = true
      }
      try { await executePurgeItem(item, { removeProject }); deleted++ } catch (error) { errors.push(`${item.path}: ${errorMessage(error)}`) }
    }
    if (errors.length) return cliError(`${errors.length} item(s) failed:\n  ${errors.join('\n  ')}\nWhat could not be deleted is still on disk. Fix the cause and run the command again; --dry-run lists what is left.`)
    return cliOk(options.interactive ? `Purged ${deleted}/${plan.items.length} item(s) for ${subject}.` : options.all ? `Purged ${deleted} item(s) across all projects.` : `Purged ${deleted} item(s) for ${subject}.`)
  } catch (error) {
    return cliError(`Purge stopped before it finished: ${errorMessage(error)}\nSome items may still be on disk. Run the command again; --dry-run lists what is left.`)
  }
}
