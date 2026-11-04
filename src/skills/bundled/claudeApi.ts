import { readdir } from 'node:fs/promises'
import { getCwd } from '../../utils/cwd.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { registerBundledSkill } from '../bundledSkills.js'
import { buildClaudeApiPrompt, claudeApiSubcommand, processClaudeApiContent } from './claudeApiPrompt.ts'

type DetectedLanguage = 'python' | 'typescript' | 'java' | 'go' | 'ruby' | 'csharp' | 'php' | 'curl'

const LANGUAGE_INDICATORS: Record<DetectedLanguage, string[]> = {
  python: ['.py', 'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
  typescript: ['.ts', '.tsx', 'tsconfig.json', 'package.json'],
  java: ['.java', 'pom.xml', 'build.gradle'],
  go: ['.go', 'go.mod'],
  ruby: ['.rb', 'Gemfile'],
  csharp: ['.cs', '.csproj'],
  php: ['.php', 'composer.json'],
  curl: [],
}

async function detectLanguage(): Promise<DetectedLanguage | null> {
  let entries: string[]
  try {
    entries = await readdir(getCwd())
  } catch {
    return null
  }
  for (const [language, indicators] of Object.entries(LANGUAGE_INDICATORS) as [DetectedLanguage, string[]][]) {
    if (indicators.some(indicator => indicator.startsWith('.')
      ? entries.some(entry => entry.endsWith(indicator))
      : entries.includes(indicator))) return language
  }
  return null
}

export function registerClaudeApiSkill(): void {
  registerBundledSkill({
    name: 'claude-api',
    description: [
      'Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration.',
      'TRIGGER — read BEFORE opening the target file; don\'t skip because it "looks like a one-liner" — whenever: the prompt names Claude/Anthropic in any form (Claude, Anthropic, Fable, Opus, Sonnet, Haiku, `anthropic`, `@anthropic-ai`, `claude-*`, `us.anthropic.*`, `[1m]`); the user asks about an LLM (pricing/model choice/limits/caching) — never answer from memory; OR the task is LLM-shaped with provider unstated (agent/MCP/tool-definition/multi-agent/RAG/LLM-judge/computer-use; generate/summarize/extract/classify/rewrite/converse over NL; debugging refusals/cutoffs/streaming/tool-calls/tokens).',
      "SKIP only when another provider is being worked on (overrides all triggers): OpenAI/GPT/Gemini/Llama/Mistral/Cohere/Ollama named in the query; OR `grep -rE 'openai|langchain_openai|google.generativeai|genai|mistralai|cohere|ollama'` over the project hits (run this grep FIRST if no provider named — don't Read the file).",
    ].join('\n'),
    allowedTools: ['WebFetch(domain:platform.claude.com)'],
    userInvocable: true,
    isEnabled: () => !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_CLAUDE_API_SKILL),
    files: async () => {
      const content = await import('./claudeApiContent.js')
      // The 2.1.317 reference package extracts all 106 file resources,
      // including the Managed Agents security guide. Command execution
      // protection is enforced separately at the command/PreToolUse boundary.
      return Object.fromEntries(Object.entries(content.SKILL_FILES)
        .map(([path, value]) => [path, path.endsWith('.md') ? processClaudeApiContent(value, content) : value]))
    },
    async getPromptForCommand(args, _context, extractedDir) {
      if (claudeApiSubcommand(args) === 'managed-agents-secure') {
        return [{ type: 'text', text: 'The `managed-agents-secure` command is unavailable in this session: Claude Code’s check on its `ant` commands does not run here. Say so in one sentence and stop: do not run `ant` commands or check the deployment by hand.' }]
      }
      const [content, language] = await Promise.all([import('./claudeApiContent.js'), detectLanguage()])
      return [{ type: 'text', text: buildClaudeApiPrompt(language, args, content, typeof extractedDir === 'string', false, null) }]
    },
  })
}
