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
// Archived private @ant source modules are not published on npm.
// Keep their original source-map bytes immutable, but adapt the restored build
// copies to the current MCP v2 API before TypeScript or Bun consumes them.
function migratePrivateMcp(rel, source) {
  if (!rel.startsWith('node_modules/@ant/claude-for-chrome-mcp/src/') &&
      !rel.startsWith('node_modules/@ant/computer-use-mcp/src/')) return source;
  let code = source
    .replaceAll('@modelcontextprotocol/sdk/server/index.js', '@modelcontextprotocol/server')
    .replaceAll('@modelcontextprotocol/sdk/types.js', '@modelcontextprotocol/server');
  if (rel.endsWith('/mcpServer.ts')) {
    code = code.replace(/import \{\s*CallToolRequestSchema,\s*ListToolsRequestSchema,\s*\} from ["']@modelcontextprotocol\/server["'];?\s*/g, '');
    code = code.replace(/setRequestHandler\(ListToolsRequestSchema/g, "setRequestHandler('tools/list'");
    code = code.replace(/setRequestHandler\(\s*CallToolRequestSchema/g, "setRequestHandler(\n    'tools/call'");
    if (/CallToolRequestSchema|ListToolsRequestSchema|@modelcontextprotocol\/sdk\//.test(code))
      throw new Error('Unmigrated private MCP v2 source: ' + rel);
  }
  return code;
}
const results = [];
for (const [rel, originalContent] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
  const content = migratePrivateMcp(rel, originalContent);
  const file = resolve(output, rel);
  if (!file.startsWith(output + sep)) throw Error('Path traversal blocked: ' + rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  const hash = createHash('sha256').update(content).digest('hex');
  results.push({ path: rel, sha256: hash, bytes: Buffer.byteLength(content) });
}
// The public lodash-es entry file was reduced away by the original bundle. Recreate
// only the exact named exports imported by src/ instead of loading every unused module.
const lodashExports = ['isEqual', 'memoize'];
for (const name of lodashExports) {
  if (!entries.has('node_modules/lodash-es/' + name + '.js')) throw Error('Missing lodash-es export: ' + name);
}
await writeFile(resolve(output, 'node_modules/lodash-es/entrypoint.js'),
  lodashExports.map(name => "export { default as " + name + " } from './" + name + ".js';").join('\n') + '\n');
const report = { sourceMapSha256: expectedHash, files: results.length, packages: packages.size, entries: results };
await writeFile(resolve(root, '.rebuild/dependency-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Recovered and pinned ' + results.length + ' dependency files from ' + packages.size + ' packages');
