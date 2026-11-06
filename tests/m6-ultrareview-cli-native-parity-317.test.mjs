import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('333 已退役独立 ultrareview CLI，保留 /review 多模式审查', () => {
  const root = resolve(import.meta.dirname, '..')
  const candidate = resolve(root, 'dist/cli.js')
  const result = spawnSync('bun', [candidate, '--help'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 18_000,
    env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.split(/\r?\n/).some(line => line.trimStart().startsWith('ultrareview ')), false)
  const review = readFileSync(resolve(root, 'src/commands/review.ts'), 'utf8')
  assert.match(review, /name:\s*'review'/)
  assert.match(review, /parseReviewRequest\(args\)/)
  assert.match(review, /getPromptForCommand\(args\)/)
  assert.match(review, /extremeReview\(target\)/)
  const main = readFileSync(resolve(root, 'src/main.tsx'), 'utf8')
  assert.doesNotMatch(main, /program\.command\('ultrareview/)
})
