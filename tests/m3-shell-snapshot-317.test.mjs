import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getUserSnapshotContent } from '../src/utils/bash/snapshotExtractors.mjs'

test('317 shell snapshot retains multiline aliases and Bash functions', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr7-shell-snapshot-'))
  try {
    const target = join(dir, 'snapshot.sh')
    const shellScript =
      `SNAPSHOT_FILE=${JSON.stringify(target)}\n` +
      'shopt -s expand_aliases\n' +
      'alias multi=$\'printf "line1\\nline2"\'\n' +
      'function sample { printf hello; }\n' +
      getUserSnapshotContent('.bashrc')
    const created = spawnSync('bash', ['-c', shellScript], { encoding: 'utf8', timeout: 6000 })
    assert.equal(created.status, 0, created.stderr)
    const content = readFileSync(target, 'utf8')
    assert.match(content, /alias -- multi=/)
    assert.match(content, /eval.*sample/)
    const loaded = spawnSync('bash', ['-c', `source ${JSON.stringify(target)}; sample; eval multi`], {
      encoding: 'utf8', timeout: 6000,
    })
    assert.equal(loaded.status, 0, loaded.stderr)
    assert.equal(loaded.stdout, 'helloline1\nline2')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
