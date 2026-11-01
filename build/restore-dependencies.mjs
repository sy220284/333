import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.rebuild/deps');
const expectedHash = '7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657';
const data = await readFile(join(root, 'cli.js.map'));
const actualHash = createHash('sha256').update(data).digest('hex');
if (actualHash !== expectedHash) throw Error('Unrecognized 2.1.88 source map SHA-256: ' + actualHash);
const map = JSON.parse(data);
if (!Array.isArray(map.sourcesContent) || map.sources.length !== map.sourcesContent.length) throw Error('Invalid source map');
const entries = new Map(), packages = new Set();
for (let i = 0; i < map.sources.length; i++) {
  const src = map.sources[i];
  if (!src.startsWith('../node_modules/')) continue;
  const rel = src.slice(3);
  if (rel.split('/').some(x => !x || x === '.' || x === '..') || rel.includes('\\')) throw Error('Invalid path: ' + src);
  if (typeof map.sourcesContent[i] !== 'string' || entries.has(rel)) throw Error('Invalid dependency source: ' + src);
  entries.set(rel, map.sourcesContent[i]);
  const parts = rel.split('/').slice(1);
  packages.add(parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
}
if (entries.size !== 2850 || packages.size !== 316) throw Error('Snapshot cardinality mismatch');
const results = [];
for (const [rel, content] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
  const file = resolve(output, rel);
  if (!file.startsWith(output + sep)) throw Error('Path traversal blocked: ' + rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  const hash = createHash('sha256').update(content).digest('hex');
  results.push({ path: rel, sha256: hash, bytes: Buffer.byteLength(content) });
}
const report = { sourceMapSha256: expectedHash, files: results.length, packages: packages.size, entries: results };
await writeFile(resolve(root, '.rebuild/dependency-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Recovered and pinned ' + results.length + ' dependency files from ' + packages.size + ' packages');
