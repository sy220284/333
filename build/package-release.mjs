import { existsSync, mkdirSync, cpSync, copyFileSync, chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { stageOfficialNative317, OFFICIAL_317_BUILDS } from './stage-official-317-native.mjs';

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
const releasePlatform = `${process.platform}-${process.arch}`;
if (OFFICIAL_317_BUILDS[releasePlatform]) {
  const staged = stageOfficialNative317({ platform: releasePlatform });
  if (staged.sha256 !== OFFICIAL_317_BUILDS[releasePlatform].sha256) throw Error('317 native runtime does not match the verified platform manifest');
  if (releasePlatform === 'linux-x64' && staged.sha256 !== upstream.binary_sha256) throw Error('317 Linux runtime differs from the exact decompiled ELF');
  console.log('Official 317 native runtime staged:', releasePlatform, staged.sha256);
}
copyFileSync(join(root,'LICENSE.md'),join(dist,'LICENSE.md'));
const pkg = {
  name: `claude-code-${releaseVersion}-source-rebuild`,
  version: `${releaseVersion}-rebuild.1`,
  private: true,
  description: `Claude Code ${releaseVersion}: full official native runtime and independently rebuilt source`,
  type: 'module',
  bin: { claude: './launcher.cjs' },
  engines: { node: '>=18', bun: '>=1.4.4' }
};
writeFileSync(join(dist,'package.json'), `${JSON.stringify(pkg,null,2)}\n`);
const launcher = `#!/usr/bin/env node
'use strict';
// 333 runtime: use the hash-pinned official binary to retain all private Bun
// bindings on Linux x64. Keep the extracted ESM graph for independent testing.
const {spawnSync} = require('node:child_process');
const {join} = require('node:path');
const {existsSync} = require('node:fs');
const mode = process.env.CLAUDE_CODE_333_RUNTIME || 'auto';
if (!['auto','official-native','extracted-js','official-317','rebuilt'].includes(mode)) {
  console.error('Unknown CLAUDE_CODE_333_RUNTIME: ' + mode);
  process.exit(2);
}
const platform = process.platform + '-' + process.arch;
const nativeAvailable = ['linux-x64','darwin-arm64','win32-x64'].includes(platform);
const originalNative = join(__dirname,'vendor','claude-code-2.1.317','native',platform,process.platform==='win32'?'claude.exe':'claude');
const extracted = join(__dirname,'vendor','claude-code-2.1.317','modules','cli.mjs');
const rebuilt = join(__dirname,'cli.js');
const useNative = mode === 'official-native' || (mode === 'auto' && nativeAvailable);
const useExtracted = mode === 'extracted-js' || mode === 'official-317';
const source = useNative ? originalNative : useExtracted ? extracted : rebuilt;
if (!existsSync(source)) {
  console.error('Required runtime missing: ' + source);
  process.exit(2);
}
const command = useNative ? source : 'bun';
const args = useNative ? process.argv.slice(2) : [source, ...process.argv.slice(2)];
const result = spawnSync(command, args, {stdio:'inherit', env:process.env, windowsHide:true});
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else if (result.signal) { process.kill(process.pid,result.signal); }
else { process.exitCode = result.status ?? 1; }
`;
writeFileSync(join(dist,'launcher.cjs'),launcher);
if(process.platform!=='win32')chmodSync(join(dist,'launcher.cjs'),0o755);
writeFileSync(join(dist,'README.md'), `# Claude Code ${releaseVersion} — 333 Full Upstream Runtime

On Linux x64, macOS ARM64, and Windows x64 this release launches SHA-256
pinned **official 2.1.317 native executables**. It contains private Anthropic Bun APIs, such as
\`Bun.ant.CellSegmenter\`, which the public Bun runtime lacks.

The complete 2,924-module source snapshot is in
\`vendor/claude-code-2.1.317/\`: original bytes, path-rewritten JS
and decoded resources, with hashes. The independently rebuilt
\`src/\`-based CLI remains available explicitly.

The \`launcher.cjs\` commands:

\`\`\`sh
node launcher.cjs --version
node launcher.cjs plugin prune --yes
CLAUDE_CODE_333_RUNTIME=rebuilt node launcher.cjs --help
CLAUDE_CODE_333_RUNTIME=extracted-js node launcher.cjs --help
\`\`\`

On architectures not yet independently tested, the rebuilt CLI remains the
explicit platform default. Verified binaries are downloaded only at release
build time, pinned per platform to the SHA-256 validated against official npm
release archives.
The original upstream runtime, decompiled code and resources remain subject
to Anthropic's license terms.
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
writeFileSync(join(dist,'integrity.json'),`${JSON.stringify({version:releaseVersion,source:'official-native-317-on-verified-platforms-or-src/entrypoints/cli.tsx',official_source:'vendor/claude-code-2.1.317/modules/cli.mjs',native_source:OFFICIAL_317_BUILDS[releasePlatform] ? `vendor/claude-code-2.1.317/native/${releasePlatform}/${OFFICIAL_317_BUILDS[releasePlatform].file}` : null,files},null,2)}\n`);
console.log(`Packaged independent CLI with ${files.length} verified assets`);
