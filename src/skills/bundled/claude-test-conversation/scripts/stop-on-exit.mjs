#!/usr/bin/env node



import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WATCH = 'CLAUDE_TEST_STOP_ON_EXIT';

const startToken = (t) => (typeof t === 'string' && t.length > 0 && t.length < 64 ? t : null);



function processInfo(pid) {
  if (process.platform === 'linux') {
    try { const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8'); const f = stat.slice(stat.lastIndexOf(')') + 2).split(' '); return { state: f[0], ppid: Number(f[1]), pgid: Number(f[2]), start: f[19] }; } catch (e) { return e && e.code === 'ENOENT' ? null : undefined; }
  }
  const r = spawnSync('/bin/ps', ['-o', 'ppid=,pgid=,stat=,lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, TZ: 'UTC0', LC_ALL: 'C' } });
  if (r.error) return undefined;
  const f = (r.stdout || '').trim().split(/\s+/);
  if (f.length < 3) return r.status === 1 && !(r.stdout || '').trim() ? null : undefined;
  return { ppid: Number(f[0]), pgid: Number(f[1]), state: f[2], start: f.slice(3).join(' ') || undefined };
}

function exists(pid) { try { process.kill(pid, 0); return true; } catch (e) { return !!e && e.code === 'EPERM'; } }
function pause(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function groupLeadersOf(ppid) {
  if (process.platform === 'linux') {
    let names = []; try { names = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)); } catch { return []; }
    const out = []; for (const n of names) { const info = processInfo(Number(n)); if (info && info.ppid === ppid && info.pgid === Number(n)) out.push({ pid: Number(n), start: info.start }); } return out;
  }
  const r = spawnSync('/bin/ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
  return (r.stdout || '').split('\n').map((l) => l.trim().split(/\s+/).map(Number)).filter(([pid, pp, pg]) => pp === ppid && pg === pid).map(([pid]) => ({ pid, start: (processInfo(pid) || {}).start }));
}



async function adoptGroup(shell, shellStart, skip, claudeGroup) {
  if (!Number.isInteger(shell) || shell <= 1 || typeof shellStart !== 'string' || !shellStart) return null;

  const sameShell = () => { const now = processInfo(shell); return !!now && now.start === shellStart; };
  for (let i = 0; i < 100; i++) {
    if (!sameShell()) return null;
    const found = groupLeadersOf(shell).find((p) => p.pid !== skip && p.pid !== claudeGroup && p.pid !== process.pid && typeof p.start === 'string' && p.start.length > 0);
    if (found && sameShell()) return found;
    await pause(100);
  }
  return null;
}



const tieLine = (group) => '[claude-test] This app server will be stopped when Claude Code ends, even if Claude Code can\'t stop it itself (group ' + group + ').\n';
async function tell(group, claude, output) {

  try { fs.writeSync(1, tieLine(group)); } catch {                                             }
  try { const { writeStartTie } = await import('./lib/config.mjs'); writeStartTie(claude, group, output); } catch {                                               }
}





function watch() {
  const late = setTimeout(() => process.exit(0), 5000);
  process.once('message', async (m) => {
    clearTimeout(late);
    try { process.disconnect(); } catch {                    }
    let { group, claude, claudeParent, groupStart, claudeStart } = m && typeof m === 'object' ? m : {};

    if (m && typeof m === 'object' && Number.isInteger(m.adopt)) { const found = await adoptGroup(m.adopt, m.shellStart, m.skip, m.claudeGroup); if (!found) process.exit(0); group = found.pid; groupStart = found.start; tell(group, claude, m.output); }
    if (![group, claude].every((n) => Number.isInteger(n) && n > 1) || !Number.isInteger(claudeParent) || claudeParent < 1 || group === claude || group === process.pid) process.exit(0);
    const firstStart = startToken(groupStart); const claudeWas = startToken(claudeStart);
    if (!firstStart) process.exit(0);

    const sameGroup = () => { const leader = processInfo(group); return !leader || !leader.start || leader.start === firstStart; };
    const tick = setInterval(async () => {
      if (!exists(-group) || !sameGroup()) process.exit(0);
      const now = processInfo(claude);


      if (exists(claude) && (now === undefined || (now && !/^Z/.test(now.state) && (!claudeWas || !now.start || now.start === claudeWas) && (claudeParent === 1 || now.ppid === claudeParent)))) return;
      clearInterval(tick);
      if (!sameGroup()) process.exit(0);
      try { process.kill(-group, 'SIGTERM'); } catch { process.exit(0); }
      for (let i = 0; i < 25 && exists(-group); i++) await pause(200);
      if (exists(-group) && sameGroup()) { try { process.kill(-group, 'SIGKILL'); } catch {                           } }
      process.exit(0);
    }, 2000);
  });
}


function outputPath() {
  try {
    if (process.platform === 'linux') return fs.readlinkSync('/proc/self/fd/1');
    const r = spawnSync('/usr/sbin/lsof', ['-a', '-p', String(process.pid), '-d', '1', '-Fn'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }); const line = (r.stdout || '').split('\n').find((l) => l.startsWith('n/')); return line ? line.slice(1) : null;
  } catch { return null; }
}

async function adopt() {
  const shell = process.ppid; const shellNow = processInfo(shell);
  const claude = shellNow && Number.isInteger(shellNow.ppid) && shellNow.ppid > 1 ? shellNow.ppid : 0;
  const claudeNow = claude ? processInfo(claude) : null;
  if (!claudeNow || /^Z/.test(claudeNow.state) || !Number.isInteger(claudeNow.ppid) || claudeNow.ppid < 1) return;
  if (!shellNow.start) return;

  const watcher = spawn(process.execPath, [fileURLToPath(import.meta.url)], { cwd: process.cwd(), detached: true, stdio: ['ignore', 'inherit', 'ignore', 'ipc'], env: { ...process.env, [WATCH]: 'watch' } });
  await new Promise((resolve) => {
    watcher.once('error', () => resolve(false));
    try { watcher.send({ adopt: shell, shellStart: shellNow.start, skip: process.pid, claudeGroup: claudeNow.pgid, claude, claudeParent: claudeNow.ppid, claudeStart: claudeNow.start ?? null, output: outputPath() }, (e) => resolve(!e)); } catch { resolve(false); }
  });
  try { watcher.disconnect(); } catch {                       }
  watcher.unref();
}

async function tie() {
  try {
    if (process.platform === 'win32' || process.env.CLAUDECODE !== '1') return;
    if (process.env.CLAUDE_JOB_DIR) return;
    const self = processInfo(process.pid);
    const group = self && self.pgid;


    if (group === process.pid) return await adopt();
    if (process.ppid !== group) return;
    const leader = Number.isInteger(group) && group > 1 && group !== process.pid ? processInfo(group) : null;
    if (!leader || !startToken(leader.start)) return;
    const claude = Number.isInteger(leader.ppid) && leader.ppid > 1 && leader.ppid !== group ? leader.ppid : 0;
    const claudeNow = claude ? processInfo(claude) : null;
    if (!claudeNow || /^Z/.test(claudeNow.state) || !Number.isInteger(claudeNow.ppid) || claudeNow.ppid < 1 || claudeNow.pgid === group) return;
    const watcher = spawn(process.execPath, [fileURLToPath(import.meta.url)], { cwd: process.cwd(), detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, [WATCH]: 'watch' } });
    const sent = await new Promise((resolve) => {
      watcher.once('error', () => resolve(false));
      try { watcher.send({ group, claude, claudeParent: claudeNow.ppid, groupStart: leader.start, claudeStart: claudeNow.start ?? null }, (e) => resolve(!e)); } catch { resolve(false); }
    });
    try { watcher.disconnect(); } catch {                       }
    watcher.unref();
    if (!sent) return;
    process.stdout.write(tieLine(group));


    try { const { writeStartTie } = await import('./lib/config.mjs'); writeStartTie(claude, group, outputPath()); } catch {                                               }
  } catch {                                                                      }
}

if (process.env[WATCH] === 'watch' && typeof process.send === 'function') watch();
else await tie();
