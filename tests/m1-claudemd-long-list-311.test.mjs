import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldLexMemoryContent } from '../src/utils/memoryLexGate.mjs'

test('very long CLAUDE.md list without include or HTML comment skips expensive lexer', () => {
  const longList = '- ' + 'x'.repeat(1024*1024)
  assert.equal(shouldLexMemoryContent(longList,true),false)
  assert.equal(shouldLexMemoryContent('Account: user@example.test',true),false)
})

test('real @includes and HTML comments preserve the existing lexing path', () => {
  assert.equal(shouldLexMemoryContent('- [details] @./rules.md',true),true)
  assert.equal(shouldLexMemoryContent('@~/shared.md',true),true)
  assert.equal(shouldLexMemoryContent('<!-- comment -->\nplain',false),true)
  assert.equal(shouldLexMemoryContent('plain',false),false)
})

test('CLAUDE.md reader only builds marked tokens when parsing is required', () => {
  const code=readFileSync(new URL('../src/utils/claudemd.ts',import.meta.url),'utf8')
  assert.match(code,/shouldLexMemoryContent\(withoutFrontmatter, includeBasePath !== undefined\)/)
  assert.match(code,/shouldLexMemoryContent\([\s\S]*?new Lexer\(\{ gfm: false \}\)\.lex\(withoutFrontmatter\)/)
  assert.match(code,/hasComment && tokens\s*\? stripHtmlCommentsFromTokens\(tokens\)\.content/)
})
