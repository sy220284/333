import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { join } from 'node:path'
import type { ToolUseContext } from '../Tool.js'
import type { Command } from '../types/command.js'
import { getBundledSkillsRoot } from '../utils/permissions/filesystem.js'
import type { HooksSettings } from '../utils/settings/types.js'
import { extractBundleAtomically } from './bundledFiles.mjs'

/**
 * Definition for a bundled skill that ships with the CLI.
 * These are registered programmatically at startup.
 */
export type BundledSkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  isEnabled?: () => boolean
  hooks?: HooksSettings
  context?: 'inline' | 'fork'
  agent?: string
  /**
   * Additional reference files to extract to disk on first invocation.
   * Keys are relative paths (forward slashes, no `..`), values are content.
   * When set, the skill prompt is prefixed with a "Base directory for this
   * skill: <dir>" line so the model can Read/Grep these files on demand —
   * same contract as disk-based skills.
   */
  files?: Record<string, string> | (() => Promise<Record<string, string>>)
  getPromptForCommand: (
    args: string,
    context: ToolUseContext,
    extractedDir?: string,
  ) => Promise<ContentBlockParam[]>
}

// Internal registry for bundled skills
const bundledSkills: Command[] = []

/**
 * Register a bundled skill that will be available to the model.
 * Call this at module initialization or in an init function.
 *
 * Bundled skills are compiled into the CLI binary and available to all users.
 * They follow the same pattern as registerPostSamplingHook() for internal features.
 */
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  const { files } = definition

  let skillRoot: string | undefined
  let getPromptForCommand = definition.getPromptForCommand

  if (files && (typeof files === 'function' || Object.keys(files).length > 0)) {
    skillRoot = getBundledSkillExtractDir(definition.name)
    // Closure-local memoization: extract once per process.
    // Memoize the promise (not the result) so concurrent callers await
    // the same extraction instead of racing into separate writes.
    let extractionPromise: Promise<string> | undefined
    const inner = definition.getPromptForCommand
    getPromptForCommand = async (args, ctx) => {
      extractionPromise ??= (async () => {
        const resolvedFiles = typeof files === 'function' ? await files() : files
        return extractBundledSkillFiles(definition.name, resolvedFiles)
      })()
      let extractedDir: string
      try {
        extractedDir = await extractionPromise
      } catch (error) {
        extractionPromise = undefined
        throw error
      }
      const blocks = await inner(args, ctx, extractedDir)
      return prependBaseDir(blocks, extractedDir)
    }
  }

  const command: Command = {
    type: 'prompt',
    name: definition.name,
    description: definition.description,
    aliases: definition.aliases,
    hasUserSpecifiedDescription: true,
    allowedTools: definition.allowedTools ?? [],
    argumentHint: definition.argumentHint,
    whenToUse: definition.whenToUse,
    model: definition.model,
    disableModelInvocation: definition.disableModelInvocation ?? false,
    userInvocable: definition.userInvocable ?? true,
    contentLength: 0, // Not applicable for bundled skills
    source: 'bundled',
    loadedFrom: 'bundled',
    hooks: definition.hooks,
    skillRoot,
    context: definition.context,
    agent: definition.agent,
    isEnabled: definition.isEnabled,
    isHidden: !(definition.userInvocable ?? true),
    progressMessage: 'running',
    getPromptForCommand,
  }
  bundledSkills.push(command)
}

/**
 * Get all registered bundled skills.
 * Returns a copy to prevent external mutation.
 */
export function getBundledSkills(): Command[] {
  return [...bundledSkills]
}

/**
 * Clear bundled skills registry (for testing).
 */
export function clearBundledSkills(): void {
  bundledSkills.length = 0
}

/**
 * Deterministic extraction directory for a bundled skill's reference files.
 */
export function getBundledSkillExtractDir(skillName: string): string {
  return join(getBundledSkillsRoot(), skillName)
}

/**
 * Extract a bundled skill's reference files to disk so the model can
 * Read/Grep them on demand. Called lazily on first skill invocation.
 *
 * Returns the complete published directory. A failed extraction is an error:
 * the prompt must never silently run without the files it references.
 */
async function extractBundledSkillFiles(
  skillName: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = getBundledSkillExtractDir(skillName)
  await extractBundleAtomically(dir, files)
  return dir
}

function prependBaseDir(
  blocks: ContentBlockParam[],
  baseDir: string,
): ContentBlockParam[] {
  const prefix = `Base directory for this skill: ${baseDir}\n\n`
  const first = blocks[0]
  if (first?.type === 'text') {
    return [
      { type: 'text', text: prefix + first.text },
      ...blocks.slice(1),
    ]
  }
  return [{ type: 'text', text: prefix }, ...blocks]
}
