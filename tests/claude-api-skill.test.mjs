import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const base=join(root,'src/skills/bundled/claude-api');
const output=readFileSync(join(root,'dist/cli.js'),'utf8');
function walk(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(ent =>
    ent.isDirectory()?walk(join(dir,ent.name)):[join(dir,ent.name)]);
}
test('all 26 original Claude API documents are committed and bundled into the new CLI', () => {
  const files=walk(base);
  assert.equal(files.length,26);
  for(const file of files) {
    const bytes=readFileSync(file);
    assert.ok(bytes.length>500,'Unexpectedly short original document: '+file);
    const first=bytes.toString('utf8').split('\n')[0];
    assert.ok(first.startsWith('# '),'Missing original document title: '+file);
    assert.ok(output.includes(first),'Original Claude API skill file absent from compiled CLI: '+file);
  }
  assert.ok(output.includes('# Building LLM-Powered Applications with Claude'));
  assert.ok(output.includes('# Tool Use Concepts'));
});
