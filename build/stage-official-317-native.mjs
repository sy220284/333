/**
 * Stage hash-pinned official Claude Code 2.1.317 runtime binaries per platform.
 * The extracted JS graph depends on private Bun.ant APIs, which the official
 * native executables contain. No native binary is committed to source control.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const OFFICIAL_317_BUILDS = Object.freeze({
  'linux-x64': Object.freeze({ sha256: 'eb224419e344575faa4a1f39b290b649425a10cd5ee2ef1d003480cd9ae57eb0', file: 'claude' }),
  'darwin-arm64': Object.freeze({ sha256: '09f153b46b5df9e8b3454716d682a91901de020cbca630f61dec1a015b32b5e9', file: 'claude' }),
  'win32-x64': Object.freeze({ sha256: '26b01ec22df2c17ac7f5703aa547d36706e8d58412136ced0344a8ced4d86038', file: 'claude.exe' }),
});
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plat = `${process.platform}-${process.arch}`;
const defaultOutput = (platform) => join(root,'dist','vendor','claude-code-2.1.317','native',platform,OFFICIAL_317_BUILDS[platform].file);

function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function run(command,args,{timeout=180000}={}) {
  const p = spawnSync(command,args,{encoding:'utf8',timeout});
  if (p.error || p.status!==0) throw Error(`${command} failed: ${p.error?.message??p.stderr??p.status}`);
}

export function stageOfficialNative317({ platform=plat, output, source=process.env.CLAUDE_CODE_317_NATIVE_PATH }={}) {
  const build=OFFICIAL_317_BUILDS[platform];
  if (!build) throw Error(`No verified upstream 2.1.317 native ELF/EXE for ${platform}; official native route not enabled`);
  const destination=resolve(output??defaultOutput(platform));
  mkdirSync(dirname(destination),{recursive:true});
  if (existsSync(destination)) {
    const actual=sha256(destination);
    if (actual!==build.sha256) throw Error(`Existing ${platform} native runtime SHA mismatch: ${actual}`);
    if (process.platform!=='win32') chmodSync(destination,0o755);
    return {platform,destination,sha256:build.sha256,reused:true};
  }
  const workspace=mkdtempSync(join(tmpdir(),`claude-317-${platform}-`));
  const temp=join(workspace,build.file);
  try {
    if (source) {
      copyFileSync(resolve(source),temp);
    } else if (platform==='linux-x64') {
      run('curl',['--fail','--location','--silent','--show-error','--retry','3','--connect-timeout','20','--max-time','180',
        'https://downloads.claude.ai/claude-code-releases/2.1.317/linux-x64/claude','--output',temp],{timeout:200000});
    } else {
      const packageName=`claude-code-${platform}`;
      const tgz=join(workspace,'official.tgz');
      const pkg=join(workspace,'package');
      mkdirSync(pkg,{recursive:true});
      const url=`https://registry.npmjs.org/@anthropic-ai/${packageName}/-/${packageName}-2.1.317.tgz`;
      run('curl',['--fail','--location','--silent','--show-error','--retry','3','--connect-timeout','20','--max-time','180',url,'--output',tgz],{timeout:200000});
      run('tar',['-xzf',tgz,'-C',workspace,`package/${build.file}`]);
      copyFileSync(join(pkg,build.file),temp);
    }
    const actual=sha256(temp);
    if (actual!==build.sha256) throw Error(`Official ${platform} 317 binary SHA mismatch: ${actual}`);
    if (process.platform!=='win32') chmodSync(temp,0o755);
    renameSync(temp,destination);
    return {platform,destination,sha256:actual,reused:false};
  } finally { rmSync(workspace,{recursive:true,force:true}); }
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(stageOfficialNative317({output:process.argv[2]})));
}