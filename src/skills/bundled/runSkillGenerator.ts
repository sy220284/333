import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { registerBundledSkill } from '../bundledSkills.js'
import cli from './run-skill-generator/examples/cli.md'
import electron from './run-skill-generator/examples/electron.md'
import library from './run-skill-generator/examples/library.md'
import playwright from './run-skill-generator/examples/playwright.md'
import server from './run-skill-generator/examples/server.md'
import tui from './run-skill-generator/examples/tui.md'
import skillMd from './run-skill-generator/SKILL.md'
import template from './run-skill-generator/template.md'

const { frontmatter, content: skillBody } = parseFrontmatter(skillMd)

const skillFiles: Record<string, string> = {
  'template.md': template,
  'examples/cli.md': cli,
  'examples/electron.md': electron,
  'examples/library.md': library,
  'examples/playwright.md': playwright,
  'examples/server.md': server,
  'examples/tui.md': tui,
}

/**
 * Source: Claude Code 2.1.317 chunk-qvm187ej.js:181-190.
 * Registered for normal CLI sessions alongside /run in bundled/index.ts.
 * The source markdown and the seven attached references match the official
 * Linux x64 embedded assets byte for byte.
 */
export function registerRunSkillGeneratorSkill(): void {
  registerBundledSkill({
    name: 'run-skill-generator',
    description: typeof frontmatter.description === 'string'
      ? frontmatter.description
      : 'Create a skill that knows how to build and run this project.',
    userInvocable: true,
    disableModelInvocation: true,
    files: skillFiles,
    async getPromptForCommand(args) {
      const parts = [skillBody.trimStart()]
      if (args.trim()) parts.push(`## User Request\n\n${args}`)
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}
