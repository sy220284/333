import { existsSync, mkdirSync, cpSync, copyFileSync, chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'cli.js'))) throw Error('First build the CLI from src/ with bun build/rebuild.mjs');
if (!existsSync(join(root, 'build/public-dependencies.lock.json'))) throw Error('Missing the verified public dependency lockfile');
mkdirSync(dist,{recursive:true});
cpSync(join(root,'vendor'),join(dist,'vendor'),{recursive:true,force:true});
copyFileSync(join(root,'LICENSE.md'),join(dist,'LICENSE.md'));
const pkg = {
  name: 'claude-code-2.1.88-source-rebuild',
  version: '2.1.88-rebuild.1',
  private: true,
  description: 'Independent reconstruction from Claude Code 2.1.88 extracted sources',
  type: 'module',
  bin: { claude: './launcher.cjs' },
  engines: { node: '>=18', bun: '>=1.4.4' }
};
writeFileSync(join(dist,'package.json'), JSON.stringify(pkg,null,2)+'\n');
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
writeFileSync(join(dist,'README.md'), `# Claude Code 2.1.88 — Independently Rebuilt CLI

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
\`);
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
writeFileSync(join(dist,'integrity.json'),JSON.stringify({version:'2.1.88',source:'src/entrypoints/cli.tsx',files},null,2)+'\n');
console.log('Packaged independent CLI with '+files.length+' verified assets');
