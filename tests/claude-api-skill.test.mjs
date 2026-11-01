import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = join(root, 'src/skills/bundled/claude-api');
const output = readFileSync(join(root, 'dist/cli.js'), 'utf8');
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(ent =>
    ent.isDirectory() ? walk(join(dir, ent.name)) : [join(dir, ent.name)]);
}
test('all 26 original Claude API Markdown documents are recovered and bundled as plain text', () => {
  const files = walk(base).sort();
  assert.equal(files.length, 26);
  const docs = files.map(file => ({ file, text: readFileSync(file, 'utf8') }));
  for (const { file, text } of docs) {
    assert.ok(Buffer.byteLength(text) > 500, 'Unexpectedly short document: ' + file);
    // Bun's minifier may escape Unicode in headings and JavaScript string syntax.
    // Inspect unique unescaped ASCII text from the document body instead.
    const candidates = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length >= 55 && /^[\x20-\x7e]+$/.test(line) && !line.includes(String.fromCharCode(96)))
      .filter(line => !docs.some(other => other.file !== file && other.text.includes(line)));
    assert.ok(candidates.length > 0, 'No distinctive plain-text passages: ' + file);
    const matched = candidates.filter(line => output.includes(line));
    assert.ok(matched.length > 0,
      'Original document has no distinctive text in rebuilt CLI: ' + file
      + ' (checked ' + candidates.length + ' unique passages)');
  }
  assert.ok(output.includes('# Building LLM-Powered Applications with Claude'));
});
