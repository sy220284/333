import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'src/skills/bundled/claude-api/';
const expectedCLI = '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f';
const expectedDigest = '409b66a5afe0aa9f409b523a74d852368bfe621ed4c6890cd9e349bae4de86ef';
const expectedPaths = [
  'SKILL.md', 'csharp/claude-api.md', 'curl/examples.md', 'go/claude-api.md',
  'java/claude-api.md', 'php/claude-api.md', 'python/agent-sdk/README.md',
  'python/agent-sdk/patterns.md', 'python/claude-api/README.md',
  'python/claude-api/batches.md', 'python/claude-api/files-api.md',
  'python/claude-api/streaming.md', 'python/claude-api/tool-use.md',
  'ruby/claude-api.md', 'shared/error-codes.md', 'shared/live-sources.md',
  'shared/models.md', 'shared/prompt-caching.md', 'shared/tool-use-concepts.md',
  'typescript/agent-sdk/README.md', 'typescript/agent-sdk/patterns.md',
  'typescript/claude-api/README.md', 'typescript/claude-api/batches.md',
  'typescript/claude-api/files-api.md', 'typescript/claude-api/streaming.md',
  'typescript/claude-api/tool-use.md',
];
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function verify(files) {
  if (files.size !== expectedPaths.length || expectedPaths.some(p => !files.has(p))) {
    throw Error('Unexpected Claude API skill manifest');
  }
  const h = createHash('sha256');
  for (const p of [...files.keys()].sort()) {
    h.update(base + p).update('\0').update(files.get(p)).update('\0');
  }
  const digest = h.digest('hex');
  if (digest !== expectedDigest) throw Error('2.1.88 skill content mismatch: ' + digest);
}
function parseLiteral(js, symbol) {
  const rx = new RegExp('(?:\\bvar\\s+|[,;])' + symbol.replaceAll('$', '\\$') + '=([\\x60\\x22])', 'g');
  const hits = [...js.matchAll(rx)];
  if (hits.length !== 1) throw Error('Ambiguous 2.1.88 binding: ' + symbol);
  const start = hits[0].index + hits[0][0].length - 1, delim = js[start];
  let text = '';
  for (let i = start + 1; i < js.length; i++) {
    const ch = js[i];
    if (ch === delim) return text;
    if (ch === '\\') {
      const next = js[++i];
      if (next === String.fromCharCode(96) || next === '\\' || next === '$' || next === '"') text += next;
      else if (next === 'n') text += '\n';
      else if (next === 'r') text += '\r';
      else if (next === 't') text += '\t';
      else throw Error('Unexpected original escape in ' + symbol + ': ' + next);
    } else {
      if (delim === String.fromCharCode(96) && ch === '$' && js[i + 1] === '{') {
        throw Error('Unexpected interpolated document: ' + symbol);
      }
      text += ch;
    }
  }
  throw Error('Unterminated original document: ' + symbol);
}
function fromOriginal() {
  const bytes = readFileSync(join(root, 'cli.js'));
  if (sha256(bytes) !== expectedCLI) throw Error('Wrong original 2.1.88 executable');
  const js = bytes.toString('utf8');
  const prefix = 'crY={"csharp/claude-api.md"';
  const start = js.indexOf(prefix);
  if (start < 0 || js.indexOf(prefix, start + 1) >= 0) throw Error('Unexpected skill manifest');
  const end = js.indexOf('}', start);
  if (end < 0) throw Error('Malformed original skill manifest');
  const names = new Map([...js.slice(start, end).matchAll(/"([^"]+\.md)":([\w$]+)/g)].map(m => [m[1], m[2]]));
  const match = /drY=([\w$]+)/.exec(js.slice(start - 80, start));
  if (!match) throw Error('Missing root skill prompt symbol');
  names.set('SKILL.md', match[1]);
  const files = new Map([...names].map(([p, symbol]) => [p, parseLiteral(js, symbol)]));
  verify(files);
  return files;
}
const checkOnly = process.argv.includes('--verify');
const present = expectedPaths.every(p => existsSync(join(root, base, p)));
if (checkOnly || present) {
  if (!present) throw Error('Missing committed Claude API skill resources');
  verify(new Map(expectedPaths.map(p => [p, readFileSync(join(root, base, p), 'utf8')])));
  console.log('Verified 26 committed Claude API documents without reading cli.js');
} else {
  const files = fromOriginal();
  for (const [p, text] of files) {
    const filename = join(root, base, p);
    if (existsSync(filename) && readFileSync(filename, 'utf8') !== text) throw Error('Conflicting file: ' + p);
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, text, 'utf8');
  }
  console.log('Restored 26 complete Claude API skill documents (247232 bytes) from the 2.1.88 executable');
}
