import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/utils/teammateMailbox.ts', import.meta.url), 'utf8')
const sender = readFileSync(new URL('../src/tools/SendMessageTool/SendMessageTool.ts', import.meta.url), 'utf8')

test('missing mailbox retains empty-inbox behavior only for ENOENT', () => {
  const body = source.split('export async function readMailbox(')[1].split('export async function readUnreadMessages(')[0]
  assert.match(body, /if \(code === 'ENOENT'\)\s*\{[\s\S]*?return \[\]/)
  assert.match(body, /Failed to read inbox for[\s\S]*?logError\(error\)(?:\s|\/\/[^\n]*)*throw error/)
  assert.equal((body.match(/return \[\]/g) ?? []).length, 1)
})

test('failed mailbox creation, write or lock errors propagate to sender', () => {
  const body = source.split('export async function writeToMailbox(')[1].split('export async function markMessageAsReadByIndex(')[0]
  assert.match(body, /failed to create inbox file[\s\S]*?logError\(error\)(?:\s|\/\/[^\n]*)*throw error/)
  assert.match(body, /Failed to write to inbox for[\s\S]*?logError\(error\)[\s\S]*?throw error\s*\} finally/)
  assert.match(body, /await writeFile\(inboxPath, jsonStringify\(messages, null, 2\), 'utf-8'\)/)
})

test('SendMessage acknowledges delivery only after awaiting mailbox write', () => {
  const body = sender.split('async function handleMessage(')[1].split('async function handleBroadcast(')[0]
  assert.match(body, /await writeToMailbox\(/)
  assert.ok(body.indexOf('await writeToMailbox(') < body.indexOf('success: true'))
})
