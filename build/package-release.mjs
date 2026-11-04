import { existsSync, mkdirSync, cpSync, copyFileSync, chmodSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw Error('Invalid release version in package.json');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'cli.js'))) throw Error('First build the CLI from src/ with bun build/rebuild.mjs');
if (!existsSync(join(root, 'build/public-dependencies.lock.json'))) throw Error('Missing the verified public dependency lockfile');
mkdirSync(dist,{recursive:true});
// Never merge vendor files into an existing distribution: removed native addons
// must not survive a second build. Validate the source before clearing dist.
const vendorSource = join(root, 'vendor');
if (!existsSync(vendorSource)) throw Error('Missing vendor platform resources');
function checkVendorTree(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) checkVendorTree(path);
    else if (!entry.isFile()) throw Error(`Vendor resource must be a regular file: ${path}`);
  }
}
checkVendorTree(vendorSource);
const vendorOutput = join(dist, 'vendor');
rmSync(vendorOutput, { recursive: true, force: true });
cpSync(vendorSource, vendorOutput, { recursive: true, force: true });
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
const {spawnSync} = require('node:child_process');
const {join} = require('node:path');
const result = spawnSync('bun', [join(__dirname,'cli.js'), ...process.argv.slice(2)], {stdio:'inherit', env:process.env, windowsHide:true});
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else if (result.signal) { process.kill(process.pid,result.signal); }
else { process.exitCode = result.status ?? 1; }
`;
writeFileSync(join(dist,'launcher.cjs'),launcher);
if(process.platform!=='win32')chmodSync(join(dist,'launcher.cjs'),0o755);
writeFileSync(join(dist,'README.md'), `# Claude Code ${releaseVersion} — Independently Rebuilt CLI

This directory contains a CLI compiled from the extracted \`src/\` code using Bun.
The original \`cli.js\` in the repository root is NOT packaged or used as a fallback.

Requires Bun >= 1.4.4. Run:
\`\`\`sh
bun cli.js --version
node launcher.cjs --help
\`\`\`

The \`vendor/\` directory contains platform-specific precompiled files. Install
any platform-specific optional native libraries separately where needed.
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
writeFileSync(join(dist,'integrity.json'),`${JSON.stringify({version:releaseVersion,source:'src/entrypoints/cli.tsx',files},null,2)}\n`);
console.log(`Packaged independent CLI with ${files.length} verified assets`);
