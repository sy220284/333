import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { registerBundledSkill } from '../bundledSkills.js'
import cli from './run-skill-generator/examples/cli.md'
import electron from './run-skill-generator/examples/electron.md'
import library from './run-skill-generator/examples/library.md'
import playwright from './run-skill-generator/examples/playwright.md'
import server from './run-skill-generator/examples/server.md'
import tui from './run-skill-generator/examples/tui.md'
import skillMd from './run-skill-generator/run-unit-SKILL.md'

const { frontmatter, content: skillBody } = parseFrontmatter(skillMd)

/**
 * Original 2.1.317 chunk-k7cgpf7k.js:183–200.
 * The original project-skill lookup returns null (chunk-h8x0dkwr.js),
 * so the native registry provides these six fallback app-running references.
 */
export function registerRunSkill(): void {
  registerBundledSkill({
    name: 'run',
    description: typeof frontmatter.description === 'string'
      ? frontmatter.description
      : 'Launch and drive this project app to verify a real workflow.',
    userInvocable: true,
    files: {
      'examples/cli.md': cli,
      'examples/electron.md': electron,
      'examples/library.md': library,
      'examples/playwright.md': playwright,
      'examples/server.md': server,
      'examples/tui.md': tui,
    },
    async getPromptForCommand(args) {
      const parts = [skillBody.trimStart()]
      if (args) parts.push(`## User Request\n\n${args}`)
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}
