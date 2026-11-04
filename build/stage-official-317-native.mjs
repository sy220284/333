/**
 * Download or copy the pinned Claude Code 2.1.317 Linux x64 native runtime.
 * The official ELF contains Anthropic's private Bun runtime bindings used by
 * the extracted modules; normal Bun does not implement those bindings.
 *
 * Never commit this binary to the source repository. Stage it into dist/ at
 * release packaging time, and verify the complete official ELF SHA-256.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_SHA256 = 'eb224419e344575faa4a1f39b290b649425a10cd5ee2ef1d003480cd9ae57eb0';
const OFFICIAL_URL = 'https://downloads.claude.ai/claude-code-releases/2.1.317/linux-x64/claude';
const DEFAULT_OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '..',
  'dist/vendor/claude-code-2.1.317/native/linux-x64/claude');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function stageOfficialNative317({ output = DEFAULT_OUTPUT, source = process.env.CLAUDE_CODE_317_NATIVE_PATH } = {}) {
  const destination = resolve(output);
  mkdirSync(dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if (sha256(destination) === EXPECTED_SHA256) {
      chmodSync(destination, 0o755);
      return { destination, sha256: EXPECTED_SHA256, reused: true };
    }
    throw Error(`An existing file at ${destination} does not match the pinned official SHA-256`);
  }
  const temp = destination + '.download';
  if (existsSync(temp)) throw Error(`Incomplete or unexpected download already exists at ${temp}`);
  try {
    if (source) {
      copyFileSync(resolve(source), temp);
    } else {
      const p = spawnSync('curl', ['--fail', '--location', '--silent', '--show-error',
        '--retry', '3', '--connect-timeout', '20', '--max-time', '180', OFFICIAL_URL,
        '--output', temp], { encoding: 'utf8', timeout: 200000 });
      if (p.error || p.status !== 0) throw Error(`Official runtime acquisition failed: ${p.error?.message ?? p.stderr}`);
    }
    const actual = sha256(temp);
    if (actual !== EXPECTED_SHA256) throw Error(`Official 317 ELF SHA-256 mismatch: ${actual}`);
    chmodSync(temp, 0o755);
    renameSync(temp, destination);
    return { destination, sha256: actual, reused: false };
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = stageOfficialNative317({ output: process.argv[2] ?? DEFAULT_OUTPUT });
  console.log(JSON.stringify(result));
}