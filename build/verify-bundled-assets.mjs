import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const records = [
  { path: 'src/skills/bundled/verify/examples/cli.md', anchor: '# Verifying a CLI change\n', hash: '92c3784a19bf09094ffe311f62c84d960fec6c4273c22d2cb5e5a8023f281031' },
  { path: 'src/skills/bundled/verify/examples/server.md', anchor: '# Verifying a server/API change\n', hash: 'cae669e4a86d3d1352e976f457d7330aed96afd5337d61e0d062f38cccf31c1a' },
  { path: 'src/skills/bundled/verify/SKILL.md', anchor: '---\nname: verify\n', hash: '1555c291f4eaf9a496176f3d07c0e86449a6650f91179fa5d3ac1712b63837ac' },
  { path: 'src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt', anchor: 'You are a security monitor for autonomous AI coding agents.', hash: '8e5ddd3085a2cd49566c7eea32afe0df3a373a203ed7c2dd562de02338d3801c' },
  { path: 'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt', anchor: '## Environment\n\n<user_environment_to_replace>', hash: '377ce3cba7577de2666e79f315e91c2f726e390970ace1ea37925abb8242377a' },
  { path: 'src/utils/ultraplan/prompt.txt', anchor: '<system-reminder>\nProduce an exceptionally thorough implementation plan', hash: 'a82214b551bb8ca47aeb61b633720b2bca2e3adc598e0cdd1345fcefb909e5b7' },
];

for(const record of records) {
  const actual = createHash('sha256').update(readFileSync(join(root,record.path))).digest('hex');
  if(actual!==record.hash) throw Error(`Bundled resource checksum mismatch (2.1.310 migration): ${record.path}`);
}
console.log(`Verified ${records.length} committed resource hashes, including 2.1.310 upgraded assets`);
