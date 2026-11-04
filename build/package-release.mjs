import { existsSync, mkdirSync, cpSync, copyFileSync, chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw Error('Invalid release version in package.json');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'cli.js'))) throw Error('First build the CLI from src/ with bun build/rebuild.mjs');
if (!existsSync(join(root, 'build/public-dependencies.lock.json'))) throw Error('Missing the verified public dependency lockfile');
const upstreamRoot = join(root, 'vendor/claude-code-2.1.317');
const upstreamManifestPath = join(upstreamRoot, 'manifest.json');
if (!existsSync(upstreamManifestPath)) throw Error('Missing extracted official 2.1.317 module graph; run the full importer');
const upstream = JSON.parse(readFileSync(upstreamManifestPath, 'utf8'));
if (upstream.version !== releaseVersion || upstream.platform !== 'linux-x64' || upstream.module_count !== 2924 ||
    upstream.binary_sha256 !== 'eb224419e344575faa4a1f39b290b649425a10cd5ee2ef1d003480cd9ae57eb0' ||
    !Array.isArray(upstream.files) || upstream.files.length !== 2924 ||
    !existsSync(join(upstreamRoot, 'modules/cli.mjs'))) {
  throw Error('Official release module graph or provenance mismatch');
}
mkdirSync(dist,{recursive:true});
cpSync(join(root,'vendor'),join(dist,'vendor'),{recursive:true,force:true});
copyFileSync(join(root,'LICENSE.md'),join(dist,'LICENSE.md'));
const pkg = {
  name: `claude-code-${releaseVersion}-source-rebuild`,
  version: `${releaseVersion}-rebuild.1`,
  private: true,
  description: `Independent reconstruction targeting Claude Code ${releaseVersion} from extracted sources`,
  type: 'module',
  bin: { claude: './launcher.cjs' },
  engines: { node: '>=18', bun: '>=1.4.4' }
};
writeFileSync(join(dist,'package.json'), `${JSON.stringify(pkg,null,2)}\n`);
const launcher = `#!/usr/bin/env node
'use strict';
// 333 distribution entrypoint: run the official 2.1.317 extracted module graph on
// the platform verified against its original ELF. Explicit rebuild mode retains
// the independent source reconstruction for development and other platforms.
const {spawnSync} = require('node:child_process');
const {join} = require('node:path');
const {existsSync} = require('node:fs');
const mode = process.env.CLAUDE_CODE_333_RUNTIME || 'auto';
if (!['auto','official-317','rebuilt'].includes(mode)) {
  console.error('Unknown CLAUDE_CODE_333_RUNTIME: ' + mode);
  process.exit(2);
}
const originalPort = join(__dirname,'vendor','claude-code-2.1.317','modules','cli.mjs');
const rebuilt = join(__dirname,'cli.js');
const useOfficial = mode === 'official-317' || (mode === 'auto' && process.platform === 'linux' && process.arch === 'x64');
const source = useOfficial ? originalPort : rebuilt;
if (!existsSync(source)) {
  console.error('Required runtime missing: ' + source);
  process.exit(2);
}
const result = spawnSync('bun', [source, ...process.argv.slice(2)], {stdio:'inherit', env:process.env, windowsHide:true});
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else if (result.signal) { process.kill(process.pid,result.signal); }
else { process.exitCode = result.status ?? 1; }
`;
writeFileSync(join(dist,'launcher.cjs'),launcher);
if(process.platform!=='win32')chmodSync(join(dist,'launcher.cjs'),0o755);
writeFileSync(join(dist,'README.md'), `# Claude Code ${releaseVersion} — 333 Full Module Port

The official Linux x64 2.1.317 ELF has been fully unpacked into
\`vendor/claude-code-2.1.317/\`. All 2,924 modules are preserved alongside
path-rewritten importable JavaScript files and decoded resources.

The installed \`launcher.cjs\` runs the extracted official 2.1.317 JS graph
on Linux x64 (the platform tested against the original program). Other
platforms use the separately rebuilt \`cli.js\` until their ports are
verified. The independent rebuilt version can be selected explicitly with
\`CLAUDE_CODE_333_RUNTIME=rebuilt\`; testing a port on another platform can
use \`CLAUDE_CODE_333_RUNTIME=official-317\`.

Requires Bun >= 1.4.4.

\`\`\`sh
node launcher.cjs --version
node launcher.cjs --help
CLAUDE_CODE_333_RUNTIME=rebuilt node launcher.cjs --help
\`\`\`

The original upstream code and resources retain their own license conditions.
This package preserves the original project's proprietary license notice.
`);
const files=[];
function walk(dir) {
 for(const entry of readdirSync(dir,{withFileTypes:true})){
   const p=join(dir,entry.name);
   if(entry.isDirectory())walk(p);
   else if(entry.isFile()){
     const rel=relative(dist,p).replaceAll('\\','/');
     if(rel==='integrity.json')continue;
     files.push({path:rel,bytes:statSync(p).size,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')});
   }
 }
}
walk(dist);
files.sort((a,b)=>a.path.localeCompare(b.path));
writeFileSync(join(dist,'integrity.json'),`${JSON.stringify({version:releaseVersion,source:'official-317-linux-x64-or-src/entrypoints/cli.tsx',official_source:'vendor/claude-code-2.1.317/modules/cli.mjs',files},null,2)}\n`);
console.log(`Packaged independent CLI with ${files.length} verified assets`);
