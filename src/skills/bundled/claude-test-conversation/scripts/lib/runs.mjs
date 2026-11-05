






import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeGit, RUN_ID, gitOff } from './config.mjs';

export { RUN_ID };

export const REPORT_FILE = 'report.html';

export const RUNNER_WORDS = Object.freeze(['server_unreachable', 'restart_needed', 'signin_needed', 'upload_unsupported', 'blank_page', 'assets_blocked']);

export const LOG_MD_BYTES = 4 * 1024 * 1024;
export function runStart(id) { const m = String(id).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) : null; }


export function runIdOrder(a, b) { return a.slice(0, 19).localeCompare(b.slice(0, 19)) || (Number(a.slice(20)) || 1) - (Number(b.slice(20)) || 1); }


export function keepsCreationTime(stat) { return Number(stat.birthtimeMs) > 0 && Number(stat.birthtimeMs) !== Number(stat.ctimeMs); }

export function insideSomeCheckout(dir) { let at = dir; for (let i = 0; i < 40; i++) { if (fs.existsSync(path.join(at, '.git'))) return true; const up = path.dirname(at); if (up === at) break; at = up; } return false; }

export function runFolders(cfg) {
  let dirs = []; try { dirs = fs.readdirSync(cfg.runsDir).filter((d) => RUN_ID.test(d)); } catch {                   }




  let tracked = new Set(); let gitCannotSay = false;
  try { tracked = new Set(safeGit(cfg.projectDir, ['ls-files', '--', path.relative(cfg.projectDir, cfg.runsDir)], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\n').map((f) => f.split('/')[2]).filter(Boolean)); }
  catch { gitCannotSay = insideSomeCheckout(cfg.projectDir); }
  const horizon = Date.now() + 120000;
  dirs = dirs.filter((d) => {
    const s = runStart(d); if (!s || s.getTime() > horizon || tracked.has(d)) return false;
    try { const st = fs.lstatSync(path.join(cfg.runsDir, d)); if (!st.isDirectory()) return false;
      if (gitCannotSay) {

        let madeHere = false; try { const one = fs.lstatSync(path.join(cfg.runsDir, d, 'made-here'), { bigint: true }); const two = fs.lstatSync(path.join(cfg.runsDir, d, 'made-here.again'), { bigint: true }); madeHere = one.isFile() && two.isFile() && one.nlink === 2n && one.ino === two.ino && one.dev === two.dev; } catch { madeHere = false; }
        const hasCreationTime = keepsCreationTime(st);
        if (!madeHere && !hasCreationTime && gitOff()) return false;
        if (!madeHere && hasCreationTime && Math.abs(st.birthtimeMs - s.getTime()) > 10 * 60 * 1000) return false;
      }                                                                                                                                                                              return true; } catch { return false; }
  });
  dirs.sort(runIdOrder);
  return dirs;
}





export function writeInRunFolder(runDir, name, text, mode = 0o644, within = null, tell = null) {
  let told = false; const why = (words) => { if (tell && !told) tell(words); told = true; return false; };
  const place = (at) => {
    try { if (!fs.lstatSync(at(name)).isFile()) return why('something other than a plain file is at that name'); } catch {                      }
    const tmp = at('.' + path.basename(name) + '.' + process.pid + '.' + Math.random().toString(36).slice(2, 10) + '.tmp');
    try {
      const fd = fs.openSync(tmp, 'wx', mode); try { fs.writeSync(fd, text); } finally { fs.closeSync(fd); }
      try { fs.renameSync(tmp, at(name)); }
      catch (e) {

        if (process.platform !== 'win32') throw e;
        let s = null; try { s = fs.lstatSync(at(name)); } catch {                                } if (s && (!s.isFile() || s.nlink > 1)) throw e; fs.writeFileSync(at(name), text, { mode, flag: s ? 'w' : 'wx' }); try { fs.unlinkSync(tmp); } catch {            }
      }
      return true;
    } catch (e) { try { fs.unlinkSync(tmp); } catch {                           } return why('the disk or the folder refused the write (' + ((e && e.code) || (e && e.message) || e) + ')'); }
  };
  try {
    if (within && within.refuse) return why(within.refuse);
    if (within && process.platform !== 'win32') { if (standingIn(runDir, within, () => place((n) => n)) === true) return true; return why('the folder could not be entered, or is no longer the folder that was checked (a folder on the way to it was moved or replaced)'); }
    if (!fs.lstatSync(runDir).isDirectory()) return why('the folder is not a plain folder');
    return place((n) => path.join(runDir, n));
  } catch (e) { return why('the disk or the folder refused the write (' + ((e && e.code) || (e && e.message) || e) + ')'); }
}




export function withinProject(projectDir, lastWords = 'Run /mcp and reconnect the claude-test browser server', anchor = null) {
  const root = fs.realpathSync(projectDir); const s = fs.statSync(root, { bigint: true });
  if (anchor !== null && anchor !== undefined && !(typeof anchor === 'string' && /^[0-9]{1,20}:[0-9]{1,20}$/.test(anchor))) throw new Error('the numbers handed in for the project folder cannot be read');
  if (anchor && (BigInt(anchor.split(':')[0]) !== s.dev || BigInt(anchor.split(':')[1]) !== s.ino)) throw Object.assign(new Error('the project folder was moved or replaced after this run began: it is not the folder this run was first found in'), { code: 'CLAUDE_TEST_FOLDER_MOVED' });
  return { root, from: path.resolve(projectDir), anchors: [{ dev: s.dev, ino: s.ino }], lastWords };
}

export function anchorWords(within) { const a = within.anchors[0]; return a.dev + ':' + a.ino; }







export function standingIn(dir, within, act) {
  let was; let wasId;
  try { was = process.cwd(); const s = fs.statSync('.', { bigint: true }); wasId = [s.dev, s.ino]; } catch { return false; }
  try {
    process.chdir(dir);
    if (!standsIn(path.join(within.root, path.relative(within.from, path.resolve(dir))), within.root, within.anchors)) return false;
    return act();
  } catch { return false; }
  finally {
    let back = false; try { process.chdir(was); const s = fs.statSync('.', { bigint: true }); back = s.dev === wasId[0] && s.ino === wasId[1]; } catch { back = false; }
    if (!back) { process.stderr.write('[claude-test] the folder this process works from was moved or replaced while a file was being written; ending so that nothing runs from another folder. ' + (within.lastWords || '') + '\n'); process.exit(1); }
  }
}




function standsIn(dir, root, anchors) {
  const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
  const lstat = (p) => fs.lstatSync(p, { bigint: true }); const stat = (p) => fs.statSync(p, { bigint: true });
  const rel = path.relative(root, dir); if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const names = rel ? rel.split(path.sep) : [];
  for (let k = names.length; k >= 0; k--) {
    const named = lstat(path.join(root, ...names.slice(0, k))); if (!named.isDirectory()) return false;
    if (!same(named, stat('.' + '/..'.repeat(names.length - k)))) return false;
  }
  let at = '.' + '/..'.repeat(names.length);
  for (let up = 0; up < 64; up++) {
    const here = stat(at); if (anchors.some((w) => same(here, w))) return true;
    if (same(stat(at + '/..'), here)) return false;
    at += '/..';
  }
  return false;
}




export function writingIn(within, shownFrom, dir, write) {
  if (within && within.refuse) throw new Error(within.refuse);
  if (within === null || process.platform === 'win32') return write((name) => path.join(dir, name));
  const done = standingIn(dir, within, () => { try { return { value: write((name) => name) }; } catch (e) { return { error: e }; } });
  if (done === false) throw new Error((path.relative(shownFrom, dir) || 'the project folder') + ' could not be entered, or is no longer the folder that was checked (it, or a folder on the way to it, was moved or replaced)');
  if (done.error) throw done.error;
  return done.value;
}










export function placeStagedFile(staged, dest, { check = null, change = null, within = null, maxBytes = 64 * 1024 * 1024, mode = 0o644 } = {}) {
  let fd = null;
  try {
    try { fd = fs.openSync(staged, fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK));                                                                                                                      }
    catch (e) { return e && e.code === 'ENOENT' ? 'the browser server wrote no file' : 'the file the browser server wrote could not be opened (' + ((e && e.code) || e) + ')'; }
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) return 'what the browser server left under the name it was given is not a file of its own (a folder, or a file with a second name); ask for it again';
    if (st.size > maxBytes) return 'the file is larger than ' + Math.round(maxBytes / (1024 * 1024)) + ' MiB';
    let bytes = Buffer.alloc(st.size); let got = 0;
    while (got < st.size) { const n = fs.readSync(fd, bytes, got, st.size - got, got); if (!n) break; got += n; }
    if (got !== st.size) bytes = bytes.subarray(0, got);
    if (change) bytes = change(bytes);
    let was = null; let wasId = null;
    if (within) { try { was = process.cwd(); const s = fs.statSync('.', { bigint: true }); wasId = [s.dev, s.ino]; } catch { return 'this process has lost its own working folder, so nothing is saved. Reconnect the helper with /mcp'; } }
    const problem = check ? check() : null; if (problem) return problem;
    const dir = path.dirname(dest); const name = path.basename(dest);

    try {
      if (within) { process.chdir(dir); if (!standsIn(dir, within.root, within.anchors)) return 'its folder is no longer the one that was checked: a folder on the way to it was moved or replaced. Reconnect the helper with /mcp, then start a new run'; }
      else if (!fs.lstatSync(dir).isDirectory()) return 'its folder is not a plain folder';
      const at = (n) => (within ? n : path.join(dir, n));
      try { const d = fs.lstatSync(at(name)); if (!d.isFile() || d.nlink > 1) return 'a link, or something other than a plain file, is at that name'; } catch {                      }
      const tmp = at('.' + name + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp');
      try {
        const out = fs.openSync(tmp, 'wx', mode);
        try { let put = 0; while (put < bytes.length) put += fs.writeSync(out, bytes, put, bytes.length - put); } finally { fs.closeSync(out); }
        fs.renameSync(tmp, at(name));
      } catch (e) { try { fs.unlinkSync(tmp); } catch {                  } return 'could not be written into place (' + ((e && e.code) || e) + ')'; }
      return null;
    } finally {
      if (within) {
        let back = false; try { process.chdir(was); const s = fs.statSync('.', { bigint: true }); back = s.dev === wasId[0] && s.ino === wasId[1]; } catch { back = false; }
        if (!back) { process.stderr.write('[claude-test] the folder this process works from was moved or replaced while a file was being saved; ending so that nothing runs from another folder. Reconnect the helper with /mcp\n'); process.exit(1); }
      }
    }
  } catch (e) { return 'could not be saved (' + ((e && e.code) || (e && e.message) || e) + ')'; }
  finally { if (fd !== null) { try { fs.closeSync(fd); } catch {              } } try { fs.unlinkSync(staged); } catch {                     } }
}
