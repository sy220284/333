import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { escapeUnsafeJsonWireCharacters } from '../src/cli/jsonWireEscaping.mjs'

const unsafe = [
  [0x7f,'\\u007f'],
  [0x85,'\\u0085'],
  [0x9f,'\\u009f'],
  [0x200b,'\\u200b'],
  [0x2060,'\\u2060'],
  [0x2028,'\\u2028'],
  [0x2029,'\\u2029'],
  [0xfeff,'\\ufeff'],
  [0xe0001,'\\udb40\\udc01'],
]
test('317 json and stream-json escape DEL, C1, Unicode Cf and line terminators', () => {
  const content = 'head|' + unsafe.map(([cp])=>String.fromCodePoint(cp)).join('|') + '|tail'
  const data = { [content]: content, nested: [{content}, 'normal 日本語 emoji 😀'], literal:'\\u200b' }
  const original = JSON.stringify(data)
  const formatted = escapeUnsafeJsonWireCharacters(original)
  assert.deepEqual(JSON.parse(formatted),data)
  for (const [cp,expected] of unsafe) {
    assert.ok(formatted.includes(expected),cp.toString(16)+': missing escape '+expected)
    assert.ok(!formatted.includes(String.fromCodePoint(cp)),cp.toString(16)+': raw control survives')
  }
  assert.ok(formatted.includes('normal 日本語 emoji 😀'),'safe unicode should remain unchanged')
  assert.ok(formatted.includes('\\\\u200b'),'JSON string containing literal escape must not be double-decoded')
  assert.equal(formatted.split('\n').length,1,'NDJSON must occupy a single line')
})
test('ordinary JSON remains byte-identical and reversible', () => {
  const ordinary={hello:'hello',nonAscii:'中文 🔎',nums:[0,1,true,null],escaped:'quote " \\ / \t'}
  assert.equal(escapeUnsafeJsonWireCharacters(JSON.stringify(ordinary)),JSON.stringify(ordinary))
  assert.equal(escapeUnsafeJsonWireCharacters('"\\u007f"'),'"\\u007f"')
})
test('actual JSON, stream-json and SDK outputs use the same leaf serializer', () => {
  const helper=readFileSync(new URL('../src/cli/ndjsonSafeStringify.ts', import.meta.url),'utf8')
  const print=readFileSync(new URL('../src/cli/print.ts',import.meta.url),'utf8')
  const io=readFileSync(new URL('../src/cli/structuredIO.ts',import.meta.url),'utf8')
  assert.match(helper,/escapeUnsafeJsonWireCharacters\(jsonStringify\(value\)\)/)
  assert.match(print,/writeToStdout\(ndjsonSafeStringify\(messages\)/)
  assert.match(print,/writeToStdout\(ndjsonSafeStringify\(lastMessage\)/)
  assert.match(print,/process\.stdout\.write\(ndjsonSafeStringify\(errorResult\)/)
  assert.match(io,/ndjsonSafeStringify\(message\)/)
})

test('API failure result follows the original 2.1.317 structured JSON contract', () => {
  const source = readFileSync(new URL('../src/QueryEngine.ts', import.meta.url), 'utf8')
  const schema = readFileSync(new URL('../src/entrypoints/sdk/coreSchemas.ts', import.meta.url), 'utf8')
  assert.match(source, /result: textResult \|\| `API request failed/)
  assert.match(schema, /\/\/ Official 2\.1\.317 API failures include[\s\S]*?result: z\.string\(\)\.optional\(\)/)
})

test('offline API failure uses the official SDK result envelope with explicit error status', () => {
  const query = readFileSync(new URL('../src/QueryEngine.ts', import.meta.url), 'utf8')
  assert.match(query, /if \(isApiError\) \{[\s\S]*?subtype: 'success',[\s\S]*?is_error: true,[\s\S]*?terminal_reason: promptTooLong \? 'prompt_too_long' : 'api_error'/)
  const probe = readFileSync(new URL('../build/m1-x64-reference-probe.mjs', import.meta.url), 'utf8')
  assert.match(probe, /id:'json_without_login'/)
  assert.match(probe, /id:'stream_without_login'/)
})
