#!/usr/bin/env node
/** Compare official and rebuilt 2.1.310 --agents inputs under the same isolated settings. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { linkSync, mkdtempSync, mkdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const option = name => {
  const i = process.argv.indexOf(name)
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${name}`)
  return process.argv[i + 1]
}
const official = option('--reference')
const candidate = option('--candidate')
const report = option('--report')
const dir = mkdtempSync(join(tmpdir(), 'm1-agents-config-'))
const env = {
  ...process.env,
  HOME: join(dir, 'home'),
  USERPROFILE: join(dir, 'home'),
  XDG_CONFIG_HOME: join(dir, 'home', '.config'),
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_AUTOUPDATER: '1',
  DISABLE_TELEMETRY: '1',
  NO_COLOR: '1',
}
delete env.ANTHROPIC_API_KEY
delete env.ANTHROPIC_AUTH_TOKEN
delete env.ANTHROPIC_BASE_URL
function run(binary, value) {
  const result = spawnSync(binary, ['--bare', '--print', '--agents', value, 'hello'], {
    env, cwd: dir, input: '', encoding: 'utf8', timeout: 20000, maxBuffer: 1024*1024,
  })
  if (result.error) throw result.error
  return { exitCode: result.status, text: `${result.stdout}\n${result.stderr}`.trim() }
}
try {
  mkdirSync(env.HOME, { recursive: true })
  const file = join(dir, 'agents.json')
  const wrong = join(dir, 'agents-array.json')
  const absent = join(dir, 'missing.json')
  const invalidNested = join(dir, 'agents-invalid-fields.json')
  const hardlinkOriginal = join(dir, 'agents-hardlink-original.json')
  const hardlink = join(dir, 'agents-hardlink.json')
  const oversized = join(dir, 'agents-oversized.json')
  writeFileSync(file, '{"test":{"description":"Test agent","prompt":"Act as test"}}\n')
  writeFileSync(wrong, '["test"]\n')
  writeFileSync(invalidNested, '{"test":{"description":42}}\n')
  writeFileSync(hardlinkOriginal, '{"test":{"description":"Test agent","prompt":"Act as test"}}\n')
  linkSync(hardlinkOriginal, hardlink)
  writeFileSync(oversized, '')
  truncateSync(oversized, 268435457)
  const cases = [
    {id: 'inline', value:'{"test":{"description":"Test agent","prompt":"Act as test"}}', match:/Not logged in/},
    {id: 'file', value:file, match:/Not logged in/},
    {id: 'missing-file', value:absent, match:/Error: --agents file not found:/},
    {id: 'invalid-inline-array', value:'[]', match:/Invalid --agents configuration:.*expected record/s},
    {id: 'invalid-file-array', value:wrong, match:/Invalid --agents configuration:.*expected record/s},
    {id: 'invalid-agent-fields', value:invalidNested, match:/Invalid --agents configuration:.*test.description: .*expected string.*test.prompt: .*expected string/s},
    {id: 'multiple-hard-links', value:hardlink, match:/Error: --agents file has more than one hard link:/},
    {id: 'oversized-agent-file', value:oversized, match:/Error: --agents file is larger than 268435456 bytes:/},
  ]
  const rows = cases.map(({id,value,match}) => {
    const reference = run(official, value)
    const rebuilt = run(candidate, value)
    const referencePass = reference.exitCode === 1 && match.test(reference.text)
    const candidatePass = rebuilt.exitCode === reference.exitCode && match.test(rebuilt.text)
    return {
      id, reference_passed: referencePass, candidate_passed: candidatePass,
      reference_exit_code: reference.exitCode, candidate_exit_code: rebuilt.exitCode,
      reference_output_sample: reference.text.slice(0,180),
      candidate_output_sample: rebuilt.text.slice(0,180),
    }
  })
  const failed = rows.filter(row => !row.reference_passed || !row.candidate_passed)
  writeFileSync(report, `${JSON.stringify({
    version: '2.1.310', scope: 'CLI agents inline/file/error parity',
    reference_sha256: 'b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56',
    cases: rows,
    passed: rows.length - failed.length,
    total: rows.length,
  }, null, 2)}\n`)
  console.log(JSON.stringify({passed: rows.length-failed.length,total:rows.length,failed:failed.map(x=>x.id)}))
  assert.deepEqual(failed.map(x=>x.id), [], '2.1.310 --agents file/inline parity failed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
