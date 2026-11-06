import { existsSync, mkdirSync, cpSync, copyFileSync, chmodSync, readdirSync, readFileSync, statSync, lstatSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyOfficialEmbeddedAssets317 } from './verify-official-embedded-assets.mjs';
import { packageOfficialEmbeddedAssets317 } from './package-official-317-assets.mjs';
verifyOfficialEmbeddedAssets317();
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw Error('Invalid release version in package.json');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'cli.js')) || !existsSync(join(dist, 'desktopHost.js')))
  throw Error('First build CLI and desktop host from src/ with bun build/rebuild.mjs');
const nativeName = process.platform === 'win32' ? 'yaoyaoche.exe' : 'yaoyaoche';
const executable = join(dist, nativeName);
if (!existsSync(executable) || !statSync(executable).isFile() || !statSync(executable).size)
  throw Error('Missing native executable: run node build/compile-standalone.mjs before packaging');
const desktopNativeName = process.platform === 'win32' ? 'yaoyaoche-desktop.exe' : 'yaoyaoche-desktop';
const desktopExecutable = join(dist, desktopNativeName);
if (!existsSync(desktopExecutable) || !statSync(desktopExecutable).isFile() || !statSync(desktopExecutable).size)
  throw Error('Missing native desktop host executable: run node build/compile-standalone.mjs before packaging');
if (!existsSync(join(root, 'build/public-dependencies.lock.json'))) throw Error('Missing the verified public dependency lockfile');
mkdirSync(dist,{recursive:true});
// A release is a closed set of files: reject stale executables, old chunks and
// unrelated build outputs before changing the previous package.
const expectedRoot = new Set([
  'cli.js', 'cli.js.map', 'desktopHost.js', 'desktopHost.js.map', nativeName, desktopNativeName, 'vendor', 'SOURCE_NOTICES.md',
  'package.json', 'launcher.cjs', 'README.md', 'integrity.json', 'official-317',
]);
for (const entry of readdirSync(dist, { withFileTypes: true })) {
  if (!expectedRoot.has(entry.name))
    throw Error('Unregistered stale release artifact: ' + entry.name);
  if (entry.isSymbolicLink())
    throw Error('Release root contains a symbolic link: ' + entry.name);
}

// Package native resources as one verified transaction. Never expose a half-
// copied vendor directory, and restore the previous release if activation fails.
// Stage/backup are siblings of dist, so they cannot leak into integrity.json.
const vendorSource = join(root, 'vendor');
if (!existsSync(vendorSource) || !lstatSync(vendorSource).isDirectory())
  throw Error('Missing or invalid vendor platform resources');
const vendorOutput = join(dist, 'vendor');
const vendorStage = join(root, '.vendor-stage-' + process.pid);
const vendorBackup = join(root, '.vendor-backup-' + process.pid);
if (existsSync(vendorStage) || existsSync(vendorBackup))
  throw Error('Vendor packaging staging path already exists');
function vendorInventory(dir, prefix = '') {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...vendorInventory(path, name + '/'));
    else if (entry.isFile()) {
      const data = readFileSync(path);
      files.push({ path: name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    } else throw Error(`Vendor resource must be a regular file: ${path}`);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
// Each compiled executable is platform-specific. Carry only its own native
// addons and ripgrep executable; packaging every architecture previously
// shipped stale audio binaries that were never checked against the official
// release on the compiling host.
const hostDir = process.arch + '-' + process.platform;
const architectureDirs = new Set([
  'x64-linux', 'arm64-linux', 'x64-darwin', 'arm64-darwin',
  'x64-win32', 'arm64-win32',
]);
function nativeResourceForHost(relativeName) {
  const pieces = relativeName.replaceAll('\\', '/').split('/');
  return pieces.length < 2 || !architectureDirs.has(pieces[1]) || pieces[1] === hostDir;
}
const sourceInventory = vendorInventory(vendorSource);
const selectedInventory = sourceInventory.filter(file => nativeResourceForHost(file.path));
const requiredResources = [
  'audio-capture/' + hostDir + '/audio-capture.node',
  'ripgrep/' + hostDir + '/' + (process.platform === 'win32' ? 'rg.exe' : 'rg'),
];
for (const required of requiredResources) {
  if (!selectedInventory.some(file => file.path === required))
    throw Error('Missing platform vendor resource: ' + required);
}

let movedPrevious = false;
try {
  cpSync(vendorSource, vendorStage, {
    recursive: true, force: false, errorOnExist: true,
    filter: file => nativeResourceForHost(relative(vendorSource, file)),
  });
  const stagedInventory = vendorInventory(vendorStage);
  if (JSON.stringify(stagedInventory) !== JSON.stringify(selectedInventory))
    throw Error('Staged platform-specific vendor files do not match source SHA-256 inventory');
  if (existsSync(vendorOutput)) {
    renameSync(vendorOutput, vendorBackup);
    movedPrevious = true;
  }
  try {
    renameSync(vendorStage, vendorOutput);
  } catch (error) {
    if (movedPrevious) {
      renameSync(vendorBackup, vendorOutput);
      movedPrevious = false;
    }
    throw error;
  }
  if (movedPrevious) {
    rmSync(vendorBackup, { recursive: true, force: true });
    movedPrevious = false;
  }
} finally {
  if (existsSync(vendorStage)) rmSync(vendorStage, { recursive: true, force: true });
  // If a rollback itself failed, leave its evidence and previous bytes intact.
  if (movedPrevious && !existsSync(vendorOutput) && existsSync(vendorBackup))
    renameSync(vendorBackup, vendorOutput);
}
packageOfficialEmbeddedAssets317(root, dist);
copyFileSync(join(root,'SOURCE_NOTICES.md'),join(dist,'SOURCE_NOTICES.md'));
const pkg = {
  name: `yaoyaoche-agent-cli-${releaseVersion}-source-rebuild`,
  version: `${releaseVersion}-rebuild.1`,
  private: true,
  description: `摇摇车 independent remote-model coding agent, compatible with release ${releaseVersion}`,
  type: 'module',
  bin: { yaoyaoche: './launcher.cjs', 'yaoyaoche-desktop': './' + desktopNativeName },
  engines: { node: '>=18' }
};
writeFileSync(join(dist,'package.json'), `${JSON.stringify(pkg,null,2)}\n`);
// The launcher is maintained as executable source so lifecycle tests exercise
// the exact artifact that ships (including SIGINT/SIGTERM propagation).
copyFileSync(join(root, 'build/release-launcher.cjs'), join(dist, 'launcher.cjs'));
if(process.platform!=='win32')chmodSync(join(dist,'launcher.cjs'),0o755);
writeFileSync(join(dist,'README.md'), `# 摇摇车 ${releaseVersion} — Independently Rebuilt CLI

This directory contains a CLI compiled from the extracted \`src/\` code using Bun.
The original \`cli.js\` in the repository root is NOT packaged or used as a fallback.

The packaged native executable embeds its own runtime. No global Bun installation
is required. On Linux/macOS use:
\`\`\`sh
./yaoyaoche --version
./yaoyaoche --help
\`\`\`
On Windows run \`yaoyaoche.exe --version\`. With Node, the portable
\`launcher.cjs\` forwards signals to the local compiled executable.

The independently compiled desktop bridge starts with \`./yaoyaoche-desktop\`
(or \`yaoyaoche-desktop.exe\` on Windows). It exchanges newline-delimited
JSON through stdin/stdout. To check the local protocol without logging in:
\`printf '{"id":"hello","method":"hello"}\\n' | ./yaoyaoche-desktop\`.
The bridge uses the same SDK session and permission callbacks as the CLI.

The \`official-317/\` directory contains 101 SHA-verified original embedded resources,\nwith their relative skill-script paths preserved and a pinned manifest.\nThe \`vendor/\` directory contains the platform-specific native resources and
is included in the integrity manifest.
Third-party source origins and rights notices are recorded in SOURCE_NOTICES.md.
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
   } else throw Error('Distribution contains a non-regular file: ' + rel);
 }
}
walk(dist);
files.sort((a,b)=>a.path.localeCompare(b.path));
writeFileSync(join(dist,'integrity.json'),`${JSON.stringify({version:releaseVersion,source:'src/entrypoints/cli.tsx',files},null,2)}\n`);
console.log(`Packaged independent CLI with ${files.length} verified assets`);
