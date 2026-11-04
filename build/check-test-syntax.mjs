/**
 * Fail fast on JavaScript test syntax before dependency restoration and
 * lengthy cross-platform source builds. No test code is executed.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

async function collect(root, found) {
  for (const item of await readdir(root, { withFileTypes:true })) {
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name.startsWith('.')) continue
      await collect(join(root, item.name), found)
    } else if (item.isFile() && /\.mjs$/.test(item.name)) {
      found.push(join(root, item.name))
    }
  }
}
const files=[]
await collect(fileURLToPath(new URL('../tests/', import.meta.url)),files)
const bad=[]
for (const file of files.sort()) {
  const result=spawnSync(process.execPath,['--check',file],{
    encoding:'utf8',timeout:10000,
  })
  if (result.status !== 0) {
    bad.push({file,reason:(result.stderr||result.stdout||result.error?.message||'unknown syntax failure').trim()})
  }
}
if (bad.length) {
  for (const item of bad) process.stderr.write(item.file+'\n'+item.reason+'\n')
  process.stderr.write(`JavaScript test syntax errors: ${bad.length}/${files.length}\n`)
  process.exitCode=1
} else {
  process.stdout.write(`JavaScript test syntax OK: ${files.length} files\n`)
}
