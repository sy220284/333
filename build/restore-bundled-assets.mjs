import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const records = [
  { path: 'src/skills/bundled/verify/examples/cli.md', anchor: '# Verifying a CLI change\n', hash: '92c3784a19bf09094ffe311f62c84d960fec6c4273c22d2cb5e5a8023f281031' },
  { path: 'src/skills/bundled/verify/examples/server.md', anchor: '# Verifying a server/API change\n', hash: 'cae669e4a86d3d1352e976f457d7330aed96afd5337d61e0d062f38cccf31c1a' },
  { path: 'src/skills/bundled/verify/SKILL.md', anchor: '---\nname: verify\n', hash: 'a9995acc78b27b807aef7b70f03846051450aeba2bd397102c6198b08b5aea0d' },
  { path: 'src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt', anchor: 'You are a security monitor for autonomous AI coding agents.', hash: '8e5ddd3085a2cd49566c7eea32afe0df3a373a203ed7c2dd562de02338d3801c' },
  { path: 'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt', anchor: '## Environment\n\n<user_environment_to_replace>', hash: '18551a278f4d19a65a26c5589ce17c950acf5af3e155e8ac8d6b73685d7f1e4d' },
  { path: 'src/utils/ultraplan/prompt.txt', anchor: '<system-reminder>\nProduce an exceptionally thorough implementation plan', hash: 'a82214b551bb8ca47aeb61b633720b2bca2e3adc598e0cdd1345fcefb909e5b7' },
];
function hash(content) { return createHash('sha256').update(content).digest('hex'); }
function decodeLiteral(source, anchor) {
  const tick = String.fromCharCode(96), slash = String.fromCharCode(92);
  const start = source.indexOf(tick + anchor);
  if (start === -1 || source.indexOf(tick + anchor, start + 1) !== -1) throw Error('Template anchor not unique: ' + anchor);
  let result = '';
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === tick) return result;
    if (c === slash) {
      const next = source[++i];
      if (next === tick || next === slash || next === '$') result += next;
      else if (next === 'n') result += '\n';
      else throw Error('Unexpected escaped template sequence: ' + next);
    } else {
      if (c === '$' && source[i + 1] === '{') throw Error('Unsafe interpolated template');
      result += c;
    }
  }
  throw Error('Unclosed template: ' + anchor);
}
const present = records.every(record => {
  const location = join(root, record.path);
  return existsSync(location) && hash(readFileSync(location)) === record.hash;
});
if (!present) {
  const source = readFileSync(join(root,'cli.js'),'utf8');
  for (const record of records) {
    const content = decodeLiteral(source, record.anchor);
    if (hash(content) !== record.hash) throw Error('Original release content does not match SHA-256: ' + record.path);
    const location = join(root,record.path);
    mkdirSync(dirname(location),{recursive:true});
    if (existsSync(location) && hash(readFileSync(location)) !== record.hash) throw Error('Conflicting existing asset: ' + record.path);
    writeFileSync(location,content);
  }
}
console.log('Verified original 2.1.88 embedded resources: ' + records.length);
