import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildClaudeApiPrompt, processClaudeApiContent } from '../src/skills/bundled/claudeApiPrompt.mjs'

const content = {
  SKILL_PROMPT: '# Skill\nUse {{MODEL}}.',
  SKILL_MODEL_VARS: { MODEL: 'target-model' },
  SKILL_FILES: {
    'shared/live-sources.md': '| name | url | details |',
    'shared/managed-agents-quickstarts/bug-hunter.md': 'console_key: bug\ndescription: Find defects\norder: 1\nTemplate body',
  },
}

test('substitution removes comments and preserves unknown placeholders', () => {
  assert.equal(processClaudeApiContent('a<!-- hidden -->\n{{MODEL}} {{UNKNOWN}}', content), 'atarget-model {{UNKNOWN}}')
})

test('a named bundled quickstart keeps its template and source classification', () => {
  const prompt = buildClaudeApiPrompt(null, 'managed-agents-onboard bug_hunter', content, true, false)
  assert.match(prompt, /Template body/)
  assert.match(prompt, /Onboarding Source: bundled quickstart/)
  assert.doesNotMatch(prompt, /No project language was auto-detected/)
})

test('a first-party onboarding URL must be the whole request', () => {
  const url = 'https://platform.claude.com/docs/guide'
  assert.match(buildClaudeApiPrompt(null, `managed-agents-onboard ${url}`, content, true, false), /Onboarding Source: first-party/)
  assert.match(buildClaudeApiPrompt(null, `managed-agents-onboard ${url} extra`, content, true, false), /Onboarding Source: third-party/)
  assert.match(buildClaudeApiPrompt(null, 'managed-agents-onboard https://platform.claude.com.evil.test/docs/guide', content, true, false), /Onboarding Source: third-party/)
})
