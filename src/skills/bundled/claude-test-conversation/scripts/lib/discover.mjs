




import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RC_FILE, reallyInsideDir, insideDir, SECRET_FILE, plainPath, checkoutRootOf, shown, commandLineClean } from './config.mjs';

export function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }


export function projectFileText(dir, f) {
  let p; try { p = path.join(dir, f); if (!fs.lstatSync(p).isFile() || !reallyInsideDir(fs.realpathSync(p), dir)) return null; } catch { return null; }
  let fd; try { fd = fs.openSync(p, fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)); if (!fs.fstatSync(fd).isFile()) return null; const b = Buffer.alloc(65536); const n = fs.readSync(fd, b, 0, b.length, 0); return b.subarray(0, n).toString('utf8'); } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {              } }
}

function projectJson(dir, f) { const text = projectFileText(dir, f); if (text === null) return null; try { return JSON.parse(text); } catch { return null; } }



export function frameworkOf(dir) {
  const pkg = projectJson(dir, 'package.json'); if (!pkg || typeof pkg !== 'object') return null;
  const deps = { ...(pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}), ...(pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}) };
  const has = (name) => Object.hasOwn(deps, name);
  if (has('next')) return 'Next.js';
  if (has('@remix-run/react') || has('@remix-run/dev')) return 'Remix';
  if (has('@sveltejs/kit')) return 'SvelteKit';
  if (has('nuxt')) return 'Nuxt';
  if (has('astro')) return 'Astro';
  if (has('@angular/core')) return 'Angular';
  if (has('gatsby')) return 'Gatsby';
  if (has('react-scripts')) return 'Create React App';
  if (has('vite')) return has('react') ? 'Vite + React' : has('vue') ? 'Vite + Vue' : has('svelte') ? 'Vite + Svelte' : 'Vite';
  if (has('react')) return 'React';
  if (has('vue')) return 'Vue';
  if (has('svelte')) return 'Svelte';
  if (has('express')) return 'Express';
  return null;
}



export function appNameOf(dir) {
  const pkg = projectJson(dir, 'package.json'); const name = pkg && typeof pkg === 'object' ? pkg.name : null;
  const npmName = typeof name === 'string' && name.length <= 214 && /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name) ? name : null;
  const folder = path.basename(path.resolve(dir)); const folderName = folder.length <= 214 && /^[A-Za-z0-9][A-Za-z0-9-._~]*$/.test(folder) ? folder : null;
  const words = (npmName || folderName || '').replace(/^@[^/]*\//, '').replace(/[-._~]+/g, ' ').trim().slice(0, 30).trim();
  const shownName = words.charAt(0).toUpperCase() + words.slice(1);
  return /^[A-Za-z0-9][A-Za-z0-9 ]{0,29}$/.test(shownName) ? shownName : null;
}






export function cdTo(projectDir, cwd) { const dir = path.resolve(projectDir, cwd || '.'); const front = 'cd \'' + dir + '\' && '; return process.platform !== 'win32' && !/['"\\!\u2018-\u201F]/.test(dir) && (dir === projectDir || dir.startsWith(projectDir + path.sep)) && reallyInsideDir(dir, projectDir) && front.length <= 900 && shown(front, 2000) === front && commandLineClean(front) ? front : null; }

export function cdAndStart(projectDir, cwd, command) { const front = cdTo(projectDir, cwd); return front && typeof command === 'string' && command && front.length + command.length <= 900 ? front + command : null; }


export const COMMON_PORTS = [3000, 5173, 8080, 8000, 4200, 4321, 5000, 3001];


const MOST_FD_LINKS = 200000;



const FORWARDERS = new Set(['docker-proxy', 'rootlessport', 'rootlesskit', 'slirp4netns', 'gvproxy', 'vpnkit', 'vpnkit-bridge', 'com.docker.backend', 'com.docker.vpnkit', 'ssh', 'kubectl', 'socat', 'limactl']);


const isForwarder = (program) => typeof program === 'string' && path.isAbsolute(program) && FORWARDERS.has(path.basename(program.replace(/ \(deleted\)$/, '')).replace(/[-.]?\d+(?:\.\d+)*$/, ''));

const MOST_TABLE_BYTES = 4 * 1024 * 1024; const MOST_CMDLINE_BYTES = 1024 * 1024;

const LOOPBACK_HEX = (hex) => /^(?:[0-9A-F]{6}7F|0{8}|0{32}|0{24}01000000|0{16}FFFF0000(?:[0-9A-F]{6}7F|0{8}))$/i.test(hex);










export function portOwner(port, projectDir, look = {}) {
  const platform = look.platform || process.platform;
  const real = look.real || ((p) => fs.realpathSync(p));
  let project; try { project = real(projectDir); } catch { return null; }
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const fold = platform === 'darwin' ? (p) => p.toLowerCase() : (p) => p;
  const within = (p) => typeof p === 'string' && path.isAbsolute(p) && insideDir(fold(p), fold(project));
  const holdsProject = (p) => typeof p === 'string' && path.isAbsolute(p) && p !== path.parse(p).root && insideDir(fold(project), fold(p));
  let checkout = null; try { checkout = 'checkout' in look ? look.checkout : checkoutRootOf(project); } catch {                         }
  const inCheckout = (p) => !!checkout && typeof p === 'string' && path.isAbsolute(p) && insideDir(fold(p), fold(checkout));
  const verdict = (owners) => (!owners.length || owners.includes(null) ? null : owners.every((o) => o === 'this') ? 'this' : owners.every((o) => o === 'other') ? 'other' : null);
  if (platform === 'linux') {

    const read = look.read || ((p) => { const most = p.startsWith('/proc/net/') ? MOST_TABLE_BYTES : MOST_CMDLINE_BYTES; const fd = fs.openSync(p, 'r'); try { const buf = Buffer.allocUnsafe(most + 1); let n = 0; let r; while (n <= most && (r = fs.readSync(fd, buf, n, most + 1 - n, null)) > 0) n += r; if (n > most) throw Object.assign(new Error(p + ' is longer than ' + most + ' bytes'), { code: 'TOO_BIG' }); return buf.toString('utf8', 0, n); } finally { fs.closeSync(fd); } });
    const list = look.list || ((p, most = Infinity) => { const dir = fs.opendirSync(p); try { const names = []; for (let e = dir.readSync(); e && names.length < most; e = dir.readSync()) names.push(e.name); return names; } finally { dir.closeSync(); } });
    const mostLinks = look.mostLinks || MOST_FD_LINKS;
    const link = look.link || ((p) => fs.readlinkSync(p));
    const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
    const inodes = new Set();
    for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
      let text; try { text = read(table); } catch (e) { if (e && e.code === 'TOO_BIG') return null; continue; }
      for (const row of text.split('\n').slice(1)) {
        const cols = row.trim().split(/\s+/); if (cols.length < 10) continue;
        const [address, hex] = cols[1].split(':');
        if (cols[3] === '0A' && hex && hex.toUpperCase() === hexPort && LOOPBACK_HEX(address) && /^[1-9]\d*$/.test(cols[9])) inodes.add(cols[9]);
      }
    }
    if (!inodes.size) return null;
    const holders = new Map(); let links = 0;
    let pids; try { pids = list('/proc').filter((d) => /^\d+$/.test(d)); } catch { return null; }
    for (const pid of pids) {
      let fds; try { fds = list('/proc/' + pid + '/fd', mostLinks - links + 1); } catch { continue; }
      for (const fd of fds) {
        if (++links > mostLinks) return null;
        let to; try { to = link('/proc/' + pid + '/fd/' + fd); } catch { continue; }
        const m = /^socket:\[(\d+)\]$/.exec(to); if (!m || !inodes.has(m[1])) continue;
        if (!holders.has(m[1])) holders.set(m[1], new Set()); holders.get(m[1]).add(pid);
      }
    }
    if ([...inodes].some((i) => !holders.has(i))) return null;
    const mntOf = (p) => { try { return link(p); } catch { return null; } };
    const rootOf = look.rootId || ((p) => { const s = fs.statSync(p); return s.dev + ':' + s.ino; });

    let myMnt; let myRoot;
    const ownMnt = () => (myMnt === undefined ? (myMnt = mntOf('/proc/self/ns/mnt')) : myMnt);
    const ownRoot = () => { if (myRoot === undefined) { try { myRoot = rootOf('/'); } catch { myRoot = null; } } return myRoot; };
    const ownerOf = (pid) => {
      let cwd; try { cwd = link('/proc/' + pid + '/cwd'); } catch { return null; }



      let contained = false;
      const theirMnt = mntOf('/proc/' + pid + '/ns/mnt');
      if (theirMnt && ownMnt() && theirMnt !== ownMnt() && ownRoot()) { let theirRoot = null; try { theirRoot = rootOf('/proc/' + pid + '/root'); } catch {                   } contained = !!theirRoot && theirRoot !== ownRoot(); }
      const ours = contained ? null : 'this';
      if (within(cwd)) return ours;
      let argv = []; try { argv = read('/proc/' + pid + '/cmdline').split('\0').filter(Boolean).slice(0, 64); } catch (e) { if (e && e.code === 'TOO_BIG') return null;                                            }
      for (const arg of argv) {
        if (arg.startsWith('-') || !arg.includes('/')) continue;
        let p; try { p = real(path.resolve(cwd, arg)); } catch { continue; }
        if (within(p)) return ours;
      }
      if (contained) { let here = true; try { real(cwd); } catch { here = false; } if (!here) return null; }
      let program = null; try { program = link('/proc/' + pid + '/exe'); } catch {                                                 }
      return isForwarder(program) || holdsProject(cwd) || inCheckout(cwd) ? null : 'other';
    };
    return verdict([...new Set([...holders.values()].flatMap((s) => [...s]))].map(ownerOf));
  }
  if (platform === 'darwin') {
    const run = look.run || ((cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }));
    let out; try { out = run('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-Fpn']); } catch { return null; }
    const pids = [...new Set(String(out).split('\n').filter((l) => /^p\d+$/.test(l)).map((l) => l.slice(1)))];
    return verdict(pids.map((pid) => {
      let cwdOut; try { cwdOut = run('/usr/sbin/lsof', ['-a', '-p', pid, '-d', 'cwd,txt', '-Ffn']); } catch { return null; }

      const files = []; let kind = null;
      for (const l of String(cwdOut).split('\n')) { if (l.startsWith('f')) kind = l.slice(1); else if (l.startsWith('n') && kind !== null) { files.push([kind, l.slice(1)]); kind = null; } }
      const found = files.find(([k, n]) => k === 'cwd' && n.startsWith('/'));
      if (!found) return null;
      let cwd; try { cwd = real(found[1]); } catch { cwd = found[1]; }


      const program = (files.find(([k]) => k === 'txt') || [])[1] || null;

      if (!program || !program.startsWith('/') || / \(\/dev\/[^)]*\)$/.test(program)) return null;
      return within(cwd) || isForwarder(program) || holdsProject(cwd) || inCheckout(cwd) ? null : 'other';
    }));
  }
  return null;
}





export function packageManagerSignals(dir, pkg) {
  const signals = [];

  const fromField = (p, where) => { const m = typeof p?.packageManager === 'string' && p.packageManager.match(/^(npm|yarn|pnpm|bun)@[0-9A-Za-z.+-]{1,40}/); if (m) signals.push({ pm: m[1], from: where + ' packageManager "' + m[0] + '"' }); };
  fromField(pkg, 'package.json');
  const LOCKS = [['pnpm-lock.yaml', 'pnpm'], ['pnpm-workspace.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['.yarnrc.yml', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm']];
  const home = os.homedir();
  let d = dir;
  for (let depth = 0; depth < 8; depth++) {
    const rel = (f) => path.relative(dir, path.join(d, f)) || f;



    if (depth > 0 && d === home) break;
    const isRepoRoot = fs.existsSync(path.join(d, '.git'));
    const ancestorPkg = depth > 0 ? readJson(path.join(d, 'package.json')) : null;
    const isWorkspaceRoot = !!ancestorPkg && (ancestorPkg.workspaces != null || fs.existsSync(path.join(d, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(d, '.yarnrc.yml')));
    if (depth === 0 || (ancestorPkg && (isWorkspaceRoot || isRepoRoot))) {
      for (const [f, pm] of LOCKS) if (fs.existsSync(path.join(d, f))) signals.push({ pm, from: rel(f) });
      if (ancestorPkg) fromField(ancestorPkg, rel('package.json'));
    }
    if (isRepoRoot || (depth > 0 && isWorkspaceRoot)) break;
    const parent = path.dirname(d); if (parent === d) break; d = parent;
  }
  const pms = [...new Set(signals.map((s) => s.pm))];
  return { signals, pms, pm: pms.length === 1 ? pms[0] : null, conflict: pms.length > 1 };
}


const COMMAND_LINE_PORT = /(?:--port[ =]|(?<!\w)PORT=|-p )(\d{2,5})(?!\w)/;



const PREFIXED_PORT = /\w_PORT=(\d{2,5})(?!\w)/;





function commandLinePort(line, readPrefixed) {
  const commands = String(line).split(/&&|\|\||;|(?<![>&])&(?![&>])/).filter((command) => command.trim());
  const last = commands[commands.length - 1] || '';
  const own = last.match(COMMAND_LINE_PORT);
  const exported = own ? null : commands.slice(0, -1).reverse().map((command) => command.match(/^\s*(?:export|set)\s+PORT=(\d{2,5})\s*$/i)).find(Boolean);
  const prefixed = own || exported || !readPrefixed ? null : last.match(PREFIXED_PORT);
  return Number((own || exported || prefixed || [])[1]);
}


const START_SHAPE = /^[A-Za-z0-9][A-Za-z0-9 :_./=@+-]{0,79}$/;


const NOT_A_START = /(?:^|\s|:|\.)(?:install|uninstall|add|remove|rm|i|ci|update|upgrade|get|rebuild|test|build|lint|migrate|init|create|setup|clone|freeze|format|fmt|check|vet|publish|release|deploy|push|upload|yank|clean|drop|reset|delete|destroy|down|stop|flush|wipe)(?:\s|$|:)|^(?:npm|pnpm|yarn|bun)\s(?:.*\s)?up(?:\s|$)|\bpip3?\b|\bvenv\b|^(?:yarn|bundle|pnpm|npm|bun)(?:\s+-\S*(?:\s+[^-\s]\S*)?)*$/;

const PY_MAIN = /^if\s+__name__\s*==\s*['"]__main__['"]\s*:/m;
const PY_SERVES = /\b(?:http\.server|HTTPServer|serve_forever|socketserver|wsgiref|make_server\(|app\.run\(|uvicorn\.run\(|web\.run_app\()/;


const START_WORD = /^(?:start|dev|serve|server|preview|watch|develop|up|web|app)(?:[:_-][A-Za-z0-9_.-]+)?$/;

const PATH_OUT = /^\/|(?:^|\/)\.\.(?:\/|$)/;


const pathWord = (kind, test) => Object.assign(test, { kind });
const relativeWord = (word) => /^(?:\.\/)?[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(word) && !PATH_OUT.test(word);
const fileOf = (extensions) => pathWord('file', (word) => relativeWord(word) && extensions.test(word));
const JS_FILE = fileOf(/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/); const PY_FILE = fileOf(/\.py$/); const RB_FILE = fileOf(/\.rb$/); const GO_FILE = fileOf(/\.go$/);
const MANAGE_PY = pathWord('file', (word) => word === 'manage.py' || word === './manage.py'); const ARTISAN = pathWord('file', (word) => word === 'artisan');
const DIR = pathWord('dir', relativeWord); const GO_PACKAGE = pathWord('dir', (word) => /^\.\/[A-Za-z0-9_]/.test(word) && relativeWord(word));

const APP = /^[A-Za-z_][A-Za-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*$/; const MODULE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const PORT = /^\d{1,5}$/;

const ADDRESS = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?$/;

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|py|rb|go)$/;

const NAME = (word) => START_WORD.test(word) && !SOURCE_FILE.test(word);




const SCRIPT_ARGS = { '--port': 'port', '-p': 'port', '--host': 'host?' };
const START_SHAPES = {

  bun: { shapes: [['run', JS_FILE], [JS_FILE]], flags: SCRIPT_ARGS, where: 'after' },
  node: { shapes: [[JS_FILE]], flags: SCRIPT_ARGS, where: 'after' },
  deno: { shapes: [['task', NAME], ['run', '-A', JS_FILE], ['run', '--allow-all', JS_FILE], ['run', '--allow-net', JS_FILE]], flags: SCRIPT_ARGS, where: 'after' },
  python: { shapes: [[PY_FILE], ['-m', 'http.server'], ['-m', 'http.server', PORT], ['-m', 'flask', 'run'], ['-m', 'uvicorn', APP], [MANAGE_PY, 'runserver'], [MANAGE_PY, 'runserver', (word) => PORT.test(word) || ADDRESS.test(word)]], flags: { ...SCRIPT_ARGS, '--bind': 'host', '--reload': 'same' }, where: 'after' },
  flask: { shapes: [['run'], ['--app', MODULE, 'run']], flags: { '--host': 'host', '-h': 'host', '--port': 'port', '-p': 'port', '--reload': 'same' }, where: 'after' },
  uvicorn: { shapes: [[APP]], flags: { '--host': 'host', '--port': 'port', '--reload': 'same' }, where: 'anywhere' },
  gunicorn: { shapes: [[APP]], flags: { '-b': 'host', '--bind': 'host' }, where: 'anywhere' }, hypercorn: { shapes: [[APP]], flags: { '-b': 'host', '--bind': 'host' }, where: 'anywhere' },
  streamlit: { shapes: [['run', PY_FILE]], flags: {}, where: 'after' },
  rails: { shapes: [['server'], ['s']], flags: { '-p': 'port', '--port': 'port', '-b': 'host', '--binding': 'host' }, where: 'after' },
  'bin/rails': { shapes: [['server'], ['s']], flags: { '-p': 'port', '--port': 'port', '-b': 'host', '--binding': 'host' }, where: 'after' },
  bundle: { shapes: [['exec', 'rails', 'server'], ['exec', 'rails', 's'], ['exec', 'puma'], ['exec', 'puma', '-C', RB_FILE], ['exec', 'jekyll', 'serve']], flags: { '-p': 'port', '--port': 'port', '-b': 'host', '--binding': 'host', '--host': 'host' }, where: 'after' },
  ruby: { shapes: [[RB_FILE]], flags: SCRIPT_ARGS, where: 'after' },
  go: { shapes: [['run', '.'], ['run', GO_PACKAGE], ['run', GO_FILE]], flags: SCRIPT_ARGS, where: 'after' },
  cargo: { shapes: [['run']], flags: { '--release': 'same' }, where: 'after' },
  dotnet: { shapes: [['run'], ['watch'], ['watch', 'run']], flags: {}, where: 'after' },
  make: { shapes: [['run'], [NAME]], flags: {}, where: 'after' }, just: { shapes: [['run'], [NAME]], flags: {}, where: 'after' },
  php: { shapes: [['-S', ADDRESS], ['-S', ADDRESS, '-t', DIR], [ARTISAN, 'serve']], flags: {}, where: 'after' },
  hugo: { shapes: [['server'], ['serve']], flags: { '--port': 'port', '-p': 'port', '--bind': 'host' }, where: 'after' },
  jekyll: { shapes: [['serve'], ['s']], flags: { '--port': 'port', '--host': 'host' }, where: 'after' },
  mix: { shapes: [['phx.server']], flags: {}, where: 'after' },
};
START_SHAPES.python3 = START_SHAPES.python;



const DEV_TOOLS = {
  vite: [[], ['dev'], ['serve'], ['preview']], next: [['dev'], ['start']], nuxt: [['dev']], nuxi: [['dev']], astro: [['dev']], ng: [['serve']],
  'react-scripts': [['start']], expo: [['start']], webpack: [['serve']], gatsby: [['develop']], 'vue-cli-service': [['serve']], 'svelte-kit': [['dev']],
};
const DEV_TOOL_FLAGS = { '--port': 'port', '-p': 'port', '--host': 'host?', '--hostname': 'host', '-H': 'host' };



const NPM_FALLBACK_NAMES = new Set(['start', 'restart']);

const shapeOf = (shapes, words) => shapes.find((shape) => shape.length === words.length && shape.every((part, at) => (typeof part === 'string' ? part === words[at] : typeof part === 'function' ? part(words[at]) : part.test(words[at]))));


function withoutFlags(words, flags, where) {
  const kept = []; let seenFlag = false;
  for (let at = 0; at < words.length; at++) {
    const word = words[at]; const [name, attached] = word.startsWith('-') && word.includes('=') ? [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)] : [word, null];
    const kind = Object.hasOwn(flags, name) ? flags[name] : undefined;
    if (kind === undefined) { if (seenFlag && where === 'after') return null; kept.push(word); continue; }
    seenFlag = true;
    if (kind === 'same') { if (attached !== null) return null; continue; }
    const value = attached ?? (words[at + 1] !== undefined && !words[at + 1].startsWith('-') ? words[++at] : null);
    if (value === null ? kind !== 'host?' : !(kind === 'port' ? PORT : ADDRESS).test(value)) return null;
  }
  return kept;
}



function startShape(command, anyScript = false) {
  if (!START_SHAPE.test(command) || NOT_A_START.test(command)) return null;
  const [program, ...words] = command.split(/\s+/);
  const known = Object.hasOwn(START_SHAPES, program) ? START_SHAPES[program] : null;

  const flags = program === 'bundle' && words[1] === 'jekyll' ? START_SHAPES.jekyll.flags : known && known.flags;
  const rest = known ? withoutFlags(words, flags, known.where) : null;
  const shape = rest && shapeOf(known.shapes, rest);

  const programPath = program === 'bin/rails' ? [{ path: 'bin/rails', kind: 'file' }] : [];
  if (shape) return { paths: [...programPath, ...rest.flatMap((word, at) => (typeof shape[at] === 'function' && shape[at].kind ? [{ path: word, kind: shape[at].kind }] : []))], bins: [] };





  const cut = words.indexOf('--'); const passed = cut === -1 ? [] : withoutFlags(words.slice(cut + 1), SCRIPT_ARGS, 'after');
  const plain = passed && passed.length === 0 ? withoutFlags(cut === -1 ? words : words.slice(0, cut), SCRIPT_ARGS, 'after') : null;
  if (plain && /^(?:npm|pnpm|yarn|bun)$/.test(program)) {
    const [verb, name] = plain.length === 1 && plain[0] === 'start' ? ['run', 'start'] : plain;


    if (plain.length <= 2 && (verb === 'run' || (verb === 'run-script' && /^(?:npm|pnpm)$/.test(program))) && name !== 'env' && (anyScript ? /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/.test(name || '') : NAME(name || ''))) {
      return { paths: [], bins: [], ...(!anyScript || program === 'yarn' || program === 'bun' || NPM_FALLBACK_NAMES.has(name) ? { script: name } : {}) };
    }
  }
  if (!anyScript) return null;
  if (/^(?:make|just)$/.test(program) && words.length === 1 && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(words[0])) return { paths: [], bins: [] };

  const skip = program === 'npx' || program === 'bunx' || (program === 'yarn' && words[0] !== 'dlx') ? 0 : program === 'pnpm' && words[0] === 'exec' ? 1 : -1;
  if (skip === -1) return null;
  const [tool, ...toolWords] = words.slice(skip); const toolRest = tool && withoutFlags(toolWords, DEV_TOOL_FLAGS, 'after');
  if (tool && toolRest && Object.hasOwn(DEV_TOOLS, tool) && shapeOf(DEV_TOOLS[tool], toolRest)) return { paths: [], bins: [tool] };
  return null;
}

function isYarnTool(command) { const [manager, tool] = String(command).trim().split(/\s+/); return manager === 'yarn' && Object.hasOwn(DEV_TOOLS, tool || ''); }




function asRunForm(command, keepTools = false) {
  const match = String(command).match(/^(pnpm|yarn|bun)\s+(?!(?:run|run-script|exec|dlx|x)(?:\s|$))([A-Za-z0-9][A-Za-z0-9:_.-]*)((?:\s.*)?)$/);
  if (!match) return command;
  const [, manager, name, tail] = match;
  if ((keepTools && isYarnTool(command)) || SOURCE_FILE.test(name)) return command;
  return manager + ' run ' + name + tail;
}

function projectFile(dir, relative) { try { const p = path.join(dir, relative); return fs.lstatSync(p).isFile() && reallyInsideDir(fs.realpathSync(p), dir) ? p : null; } catch { return null; } }


function readProjectFile(dir, relative) { const p = projectFile(dir, relative); if (!p) return null; let fd; try { fd = fs.openSync(p, fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)); if (!fs.fstatSync(fd).isFile()) return null; const b = Buffer.alloc(65536); const n = fs.readSync(fd, b, 0, b.length, 0); return b.subarray(0, n).toString('utf8'); } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {              } } }




function startProblem(command, anyScript = false, dir = null, cwd = '.') {
  const shape = startShape(command, anyScript); if (!shape) return 'shape';
  if (!dir) return shape.paths.length || shape.bins.length || shape.script ? 'missing' : null;
  const there = (relative, kind) => { try { const p = path.join(dir, cwd, relative); const real = fs.realpathSync(p); const st = fs.statSync(real); return reallyInsideDir(real, dir) && (kind === 'dir' ? st.isDirectory() : st.isFile()); } catch { return false; } };


  const hasScript = (name) => { let pkg = null; try { pkg = JSON.parse(readProjectFile(dir, path.join(cwd, 'package.json')) ?? 'null'); } catch {                } return !!(pkg && pkg.scripts && typeof pkg.scripts === 'object' && typeof pkg.scripts[name] === 'string' && pkg.scripts[name].trim() !== ''); };
  return shape.paths.every(({ path: p, kind }) => there(p, kind)) && shape.bins.every((tool) => there(path.join('node_modules', '.bin', tool), 'file')) && (!shape.script || hasScript(shape.script)) ? null : 'missing';
}
const isStartLine = (command, anyScript = false, dir = null, cwd = '.') => startProblem(command, anyScript, dir, cwd) === null;



export function fallbackStarts(dir) {

  const out = []; const add = (written, from) => { const command = asRunForm(written); if (isStartLine(command, false, dir) && !out.some((c) => c.command === command)) out.push({ command, from }); };
  const proc = readProjectFile(dir, 'Procfile'); const web = proc && proc.match(/^web:[ \t]*(.+?)[ \t]*$/m); if (web) add(web[1], 'Procfile web');
  for (const name of ['README.md', 'readme.md', 'README.markdown', 'README']) {
    const text = readProjectFile(dir, name); if (text === null) continue;
    const lines = text.split(/\r?\n/); let heading = ''; let before = [];
    for (let i = 0; i < lines.length && out.length < 3; i++) {
      const l = lines[i];
      if (/^#{1,6}\s/.test(l)) { heading = l; before = []; continue; }
      const fenced = /^\s{0,3}(```|~~~)/.test(l); const indented = /^( {4}|\t)\S/.test(l) && (i === 0 || !lines[i - 1].trim());
      if (!fenced && !indented) { if (l.trim()) before = [...before, l].slice(-2); continue; }
      const block = [];
      if (fenced) { const fence = l.trim().slice(0, 3); for (i++; i < lines.length && !lines[i].trim().startsWith(fence); i++) block.push(lines[i]); }
      else { for (; i < lines.length && /^( {4}|\t)/.test(lines[i]); i++) block.push(lines[i]); i--; }
      const commands = block.map((x) => x.trim().replace(/^\$\s+/, '')).filter((x) => x && !x.startsWith('#'));
      const context = (heading + ' ' + before.join(' ')).toLowerCase(); before = [];
      if (commands.length !== 1) continue;
      const command = commands[0]; const file = command.split(/\s+/)[1];
      const runsOwnFile = !!file && !file.startsWith('-') && !file.includes('..') && !path.isAbsolute(file) && !!projectFile(dir, file);
      if (/\b(?:run|runs|running|start|starts|serve|serves|launch)\b/.test(context) || runsOwnFile) add(command, name + ' (a code block of one command)');
    }
    break;
  }
  if (out.length) return out;
  for (const f of ['app.py', 'main.py', 'server.py', 'run.py']) { const t = readProjectFile(dir, f); if (t !== null && PY_MAIN.test(t) && PY_SERVES.test(t)) add('python3 ' + f, f + ' (serves when run)'); }
  return out;
}

export function discoverDevServer(cfg, { inSandbox = false } = {}) {
  const found = { startCommand: cfg.startCommandSource === RC_FILE ? cfg.startCommand : null, startCommandSource: cfg.startCommandSource === RC_FILE ? RC_FILE : null, startCommandCwd: null, startCommandNote: null, startCommandCandidates: [], conflicts: [], portHints: [], portHintsSource: null, portHintFrom: {}, recipes: [] };
  const hint = (p, from) => { p = Number(p); if (!Number.isInteger(p) || p < 1024 || p > 65535) return; if (!found.portHints.includes(p)) found.portHints.push(p); if (!found.portHintFrom[p]) found.portHintFrom[p] = from; };
  const explicitScriptPorts = [];
  let nodeGuessFrom = null;
  const dir = cfg.projectDir;

  for (const rel of ['.claude/skills/verify/SKILL.md']) if (fs.existsSync(path.join(dir, rel))) found.recipes.push(rel);
  const skillsDir = path.join(dir, '.claude', 'skills');

  try { for (const d of fs.readdirSync(skillsDir)) if (/^(run|verifier)-/.test(d)) found.recipes.push(path.join('.claude/skills', d, 'SKILL.md')); } catch (e) { if (e.code !== 'ENOENT') found.unreadable = (found.unreadable || []).concat('.claude/skills (' + e.code + (inSandbox ? ', masked by the sandbox' : '') + ')'); }







  const candidates = [];
  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg && pkg.scripts && typeof pkg.scripts === 'object') {
    const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,40}$/;
    const BASES = ['dev', 'start', 'serve', 'preview'];
    const name = BASES.find((s) => pkg.scripts[s]);


    const variantKeys = Object.keys(pkg.scripts).filter((s) => SAFE_KEY.test(s) && !/:(down|stop|clean|kill|reset)$/.test(s) && (name ? s.startsWith(name + ':') : BASES.some((b) => s.startsWith(b + ':')))).slice(0, 4);
    const scriptNames = name ? [name] : variantKeys;
    if (scriptNames.length) {
      const pms = packageManagerSignals(dir, pkg);
      const run = (pm, script) => pm + ' run ' + script;
      const pmList = pms.conflict ? pms.pms : [pms.pm || 'npm'];
      const pmFrom = (pm) => pms.conflict ? ' + ' + pms.signals.filter((s) => s.pm === pm).map((s) => s.from).join(', ') : pms.pm ? ' + ' + pms.signals[0].from : ' (no lockfile or packageManager field found; assuming npm)';
      for (const script of scriptNames) for (const pm of pmList) candidates.push({ command: run(pm, script), from: 'package.json scripts.' + script + pmFrom(pm) });
      if (pms.conflict) found.conflicts.push('package managers disagree: ' + pms.signals.map((s) => s.pm + ' (' + s.from + ')').join(' vs '));
      if (!name && variantKeys.length > 1) found.conflicts.push('package.json has no plain dev/start script, only variants (' + variantKeys.join(', ') + ') and only the user knows which one this machine uses');
      if (name && variantKeys.length && !pms.conflict) {
        for (const v of variantKeys) candidates.push({ command: run(pmList[0], v), from: 'package.json scripts.' + v });
        found.conflicts.push('package.json has several ways to start the app (' + [name, ...variantKeys].join(', ') + '). Ask the user which one they use on this machine — often it is "' + run(pmList[0], name) + '"');
      }
      found.portHintsSource = 'package.json scripts.' + scriptNames[0];
      const text = String(pkg.scripts[scriptNames[0]]);
      const scriptPort = commandLinePort(text, true);
      hint(scriptPort, 'package.json scripts.' + scriptNames[0]); if (found.portHints.includes(scriptPort)) explicitScriptPorts.push(scriptPort);
      if (/vite|svelte-kit|sveltekit|astro dev/.test(text)) hint(/astro/.test(text) ? 4321 : 5173, 'package.json scripts.' + scriptNames[0] + ' (' + (/astro/.test(text) ? 'astro' : 'vite') + ' default port)');
      if (/next|react-scripts|remix/.test(text)) hint(3000, 'package.json scripts.' + scriptNames[0] + ' (framework default port)');
      else if (/node |nodemon|express/.test(text)) nodeGuessFrom = 'package.json scripts.' + scriptNames[0] + ' (usual Node.js port; a guess)';
      if (/ng serve/.test(text)) hint(4200, 'package.json scripts.' + scriptNames[0] + ' (ng default port)');
    }
  }
  const filesRead = new Set();
  for (const [file, tool] of [['Makefile', 'make'], ['makefile', 'make'], ['GNUmakefile', 'make'], ['justfile', 'just'], ['Justfile', 'just']]) {
    let t; try { const st = fs.statSync(path.join(dir, file), { bigint: true }); const sameFile = st.ino ? st.dev + ':' + st.ino : null; if (sameFile && filesRead.has(sameFile)) continue; if (sameFile) filesRead.add(sameFile); t = fs.readFileSync(path.join(dir, file), 'utf8').slice(0, 65536); } catch { continue; }
    const target = ['dev', 'serve', 'start', 'server', 'run', 'up'].find((n) => new RegExp('^' + n + '\\s*:(?!=)', 'm').test(t));
    if (target) candidates.push({ command: tool + ' ' + target, from: file + ' target "' + target + '"' });
  }
  if (fs.existsSync(path.join(dir, 'manage.py'))) { candidates.push({ command: 'python manage.py runserver', from: 'manage.py' }); hint(8000, 'manage.py (Django default port)'); }
  if (fs.existsSync(path.join(dir, 'bin', 'rails'))) { candidates.push({ command: 'bin/rails server', from: 'bin/rails' }); hint(3000, 'bin/rails (Rails default port)'); }


  const rcPort = found.startCommandSource === RC_FILE ? commandLinePort(found.startCommand, false) : NaN;
  hint(rcPort, RC_FILE + ' startCommand');
  const rcLeads = found.portHints.includes(rcPort);




  const launchPort = cfg.launch && Number.isInteger(Number(cfg.launch.port)) && Number(cfg.launch.port) >= 1024 && Number(cfg.launch.port) <= 65535 ? Number(cfg.launch.port) : null;
  if (launchPort) { found.portHints = [launchPort, ...found.portHints.filter((p) => p !== launchPort)]; found.portHintsSource = '.claude/launch.json'; found.portHintFrom[launchPort] = '.claude/launch.json'; }
  if (cfg.launch && cfg.launch.command) {

    const lc = asRunForm(cfg.launch.command.trim(), true);
    const lcPm = (lc.match(/^(npm|yarn|pnpm|bun)\b/) || [])[1] || null;
    const repoPms = pkg ? packageManagerSignals(dir, pkg) : { pm: null, signals: [], conflict: false };
    const cwdRel = cfg.launch.cwd && typeof cfg.launch.cwd === 'string' ? (path.relative(dir, path.resolve(dir, cfg.launch.cwd)) || '.') : null;
    const cwdOk = !cwdRel || (!cwdRel.startsWith('..') && !path.isAbsolute(cwdRel) && fs.existsSync(path.join(dir, cwdRel)) && reallyInsideDir(path.join(dir, cwdRel), dir));
    let lcUse = lc; let lcFrom = '.claude/launch.json';



    if (lcPm && repoPms.pm && lcPm !== repoPms.pm && repoPms.pm !== 'bun' && !repoPms.conflict && !/^(?:pnpm|yarn)\s+(?:dlx|exec)\b/.test(lc)) { lcUse = isYarnTool(lc) ? lc.replace(/^yarn\b/, repoPms.pm) : asRunForm(lc.replace(/^(npm|yarn|pnpm|bun)\b/, repoPms.pm)); lcFrom = '.claude/launch.json (says ' + lcPm + '; the repo uses ' + repoPms.pm + ' per ' + repoPms.signals[0].from + ', so translated)'; found.launchIgnored = '.claude/launch.json runs "' + lcPm + '" but the repo uses ' + repoPms.pm + ' (' + repoPms.signals[0].from + ') — its command is listed translated to ' + repoPms.pm + ', not trusted as written'; }
    if (!cwdOk) found.launchIgnored = '.claude/launch.json names a working directory outside or missing from the project (' + String(cfg.launch.cwd).replace(/[^\x20-\x7e]/g, ' ').slice(0, 60) + ') and is ignored';

    else if (startProblem(lcUse, true, dir, cwdRel || '.')) found.launchIgnored = startProblem(lcUse, true, dir, cwdRel || '.') === 'missing'
      ? '.claude/launch.json names a file, a folder, a package.json script or an installed program (node_modules/.bin) that is not in the project, and is ignored. The start comes from the project\'s other files, or the person is asked for it; installing the project\'s packages makes an installed program count'
      : '.claude/launch.json names a command that is not one of the start commands Claude Test knows (a plain start with a port or a host at most), and is ignored; the start comes from the project\'s other files, or the person is asked for it';
    else if (/^[A-Za-z0-9][A-Za-z0-9 :_./=-]{0,80}$/.test(lcUse)) {
      candidates.push({ command: lcUse, from: lcFrom + (cwdRel && cwdRel !== '.' ? ' (cwd: ' + cwdRel + ')' : ''), cwd: cwdRel && cwdRel !== '.' ? cwdRel : null });


      if (cwdRel && cwdRel !== '.') {
        const sub = readJson(path.join(dir, cwdRel, 'package.json'));
        if (sub && sub.scripts && typeof sub.scripts === 'object') {
          const pm = repoPms.pm || lcPm || 'npm';
          const keys = Object.keys(sub.scripts).filter((s) => /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,40}$/.test(s) && /^(dev|start|serve|preview)(:|$)/.test(s)).slice(0, 5);
          for (const k of keys) { const cmd = pm + ' run ' + k; if (cmd !== lcUse) candidates.push({ command: cmd, from: cwdRel + '/package.json scripts.' + k, cwd: cwdRel }); }
          if (keys.length > 1) found.conflicts.push(cwdRel + '/package.json has several ways to start the app (' + keys.join(', ') + '); .claude/launch.json picks "' + lcUse + '" — ask the user which one they use');
        }
      }
    }
  }
  if (!found.startCommand && !candidates.length) candidates.push(...fallbackStarts(dir));
  if (!found.startCommand) {
    const distinct = [...new Map(candidates.map((c) => [c.command + '\u0000' + (c.cwd || ''), c])).values()];
    if (distinct.length === 1 && !found.conflicts.length) { found.startCommand = distinct[0].command; found.startCommandSource = candidates.filter((c) => c.command === distinct[0].command).map((c) => c.from).join(' = '); found.startCommandCwd = distinct[0].cwd || null; }
    else if (candidates.length) {
      if (candidates.length > 1 && !found.conflicts.length) found.conflicts.push('more than one way to start the app: ' + candidates.map((c) => c.from).join(', '));
      found.startCommandNote = 'unknown — ask: ' + found.conflicts.join('; ') + '. Do not guess or pick a candidate; the user names the command, and "startCommand: <command>" in ' + RC_FILE + ' settles it for later runs.';
      found.startCommandCandidates = candidates;
    }
  }


  const filePorts = []; let filePortsSource = null;
  const scanDirs = ['']; if (found.startCommandCwd) scanDirs.push(found.startCommandCwd); else if (cfg.launch && typeof cfg.launch.cwd === 'string' && !cfg.launch.cwd.includes('..') && !path.isAbsolute(cfg.launch.cwd) && reallyInsideDir(path.join(dir, cfg.launch.cwd), dir)) scanDirs.push(cfg.launch.cwd);
  for (const sub of scanDirs) for (const rel0 of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'next.config.js', 'next.config.mjs', 'astro.config.mjs', 'svelte.config.js', 'angular.json', 'server.js', 'server.ts', 'server.mjs', 'app.js', 'index.js', 'src/server.ts', 'src/server.js', 'src/index.ts', 'src/index.js', '.env', '.env.development', 'Procfile', 'docker-compose.yml']) {
    const rel = path.join(sub, rel0);
    let t; try { t = fs.readFileSync(path.join(dir, rel), 'utf8').slice(0, 65536); } catch { continue; }
    for (const m of t.matchAll(/(?:\bport\b["']?\s*[:=]\s*|\bPORT\b[^\n\w]{0,8}|listen\(\s*)(\d{4,5})\b/g)) { const p = Number(m[1]); if (p >= 1024 && p <= 65535 && !filePorts.includes(p)) { filePorts.push(p); if (!filePortsSource) filePortsSource = rel; if (!found.portHintFrom[p] || / default port\)$/.test(found.portHintFrom[p])) found.portHintFrom[p] = rel; } }
  }
  if (nodeGuessFrom && !found.portHints.length && !filePorts.length) hint(3000, nodeGuessFrom);
  { const first = [...(rcLeads ? [rcPort] : []), ...(launchPort && launchPort !== rcPort ? [launchPort] : [])]; const lead = [...first, ...explicitScriptPorts.filter((p) => !first.includes(p))]; found.portHints = [...lead, ...filePorts.filter((p) => !lead.includes(p)), ...found.portHints.filter((p) => !filePorts.includes(p) && !lead.includes(p))]; if (rcLeads) { found.portHintsSource = RC_FILE + ' startCommand'; found.portHintFrom[rcPort] = RC_FILE + ' startCommand'; } else if (!launchPort && !explicitScriptPorts.length && filePorts.length) found.portHintsSource = filePortsSource || found.portHintsSource; }
  return found;
}








export function candidateList(cfg, dev) {
  if (cfg.baseUrl) return [{ url: cfg.baseUrl, from: RC_FILE, own: true }];
  const ports = [...new Set([...dev.portHints, ...COMMON_PORTS])];
  return ports.map((p) => ({ url: 'http://localhost:' + p + '/', port: p, from: dev.portHintFrom[p] || 'common default port', own: !!dev.portHintFrom[p] }))
    .filter((x, i, arr) => x.own || arr.slice(0, i).filter((y) => !y.own).length < 4)
    .slice(0, 8);
}


export const START_CAUSES = ['port', 'packages', 'command', 'other'];
export const INSTALLERS = ['npm', 'pnpm', 'yarn', 'bun'];
const PORT_TAKEN = [/EADDRINUSE[^\n]{0,80}?:(\d{2,5})(?!\d)/, /address already in use[^\n]{0,80}?:(\d{2,5})(?!\d)/i, /\bport (\d{2,5}) is (?:already )?(?:in use|taken|being used)/i, /EADDRINUSE|address already in use|port is (?:already )?in use/i];
const PACKAGES_MISSING = /Cannot find (?:module|package)\b|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Module not found|could not resolve dependencies|Failed to resolve import/i;
const NOT_FOUND = /command not found|: not found\b|is not recognized as an internal or external command|spawn \S{1,80} ENOENT|(?:^|\n)(?:\S*\/)?(?:sh|bash|zsh|dash)(?:: line \d+)?: [^\n]{0,120}No such file or directory/i;




export function startFailure(text, projectDir) {
  const out = String(text || '');
  for (const re of PORT_TAKEN) { const m = out.match(re); if (m) { const port = Number(m[1]); return { cause: 'port', ...(Number.isInteger(port) && port >= 1 && port <= 65535 ? { port } : {}) }; } }
  const pkg = readJson(path.join(projectDir, 'package.json'));
  let install = 'npm'; try { const pm = packageManagerSignals(projectDir, pkg).pm; if (INSTALLERS.includes(pm)) install = pm; } catch {                }
  const packages = { cause: 'packages', ...(pkg ? { install } : {}) };
  if (PACKAGES_MISSING.test(out)) return packages;
  if (NOT_FOUND.test(out)) return pkg && !fs.existsSync(path.join(projectDir, 'node_modules')) ? packages : { cause: 'command' };
  return { cause: 'other' };
}

export function startFailureWords(f) {
  const cause = f && START_CAUSES.includes(f.cause) ? f.cause : 'other';
  if (cause === 'port') return Number.isInteger(f.port) && f.port >= 1 && f.port <= 65535 ? 'Port ' + f.port + ' is in use by another program' : 'The app\'s port is in use by another program';
  if (cause === 'packages') return INSTALLERS.includes(f.install) ? 'The app\'s dependencies aren\'t installed: run ' + f.install + ' install' : 'The app\'s dependencies aren\'t installed';
  if (cause === 'command') return 'The app\'s start command wasn\'t found';
  return 'It stopped before it answered; its output is in Claude Code\'s background tasks';
}


export const RECENT_COMMITS = 20;
export const RECENT_FILES = 8;
export const RECENT_BULK = 40;
const RECENT_EXT = /\.(tsx|jsx|ts|js|mjs|cjs|vue|svelte|astro|html?|css|scss|sass|less|erb|haml|slim|ejs|hbs|handlebars|njk|liquid|twig|php|py|rb|ex|exs|heex|eex|go|rs|cs|cshtml|razor|java|kt|json|ya?ml)$/i;
const RECENT_DATA_DIR = /(^|\/)(data|fixtures?|seeds?|content|locales?|i18n|messages|mocks?)\//i;
const RECENT_NOT_UI = /(^|\/)(node_modules|vendor|dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit|\.turbo|\.cache|\.claude|\.claude-test|\.github|\.husky|\.vscode|\.idea|\.storybook|__tests__|__mocks__|tests?|e2e|cypress|playwright|scripts|migrations|bin)\/|(^|\/)[^/]*\.(test|spec|stories|story|d)\.[a-z]+$|(^|\/)(\.[^/]*rc|[^/]*\.config)\.[a-z]+$|(^|\/)(tsconfig[^/]*|package|composer|jsconfig|deno|turbo|nx|lerna|vercel|netlify|firebase|app|manifest|renovate|\.[^/]*)\.json$|(^|\/)(pnpm-workspace|docker-compose|\.[^/]*)\.ya?ml$|(^|\/)(manage|setup|conftest|wsgi|asgi)\.py$/i;




const RECENT_SECRET_NAME = /(^|\/)[^/]*(secrets?|credentials?|creds|api[-_]?keys?|keystore|private[-_.]?keys?|service[-_]?account|tokens?|kubeconfig)[^/]*$|(^|\/)keys([-_.][^/]*)?(\/|$)|(^|\/)(api[-_]?keys?|keystores?|service[-_]?accounts?)\//i;



export function userFacingPath(file) {
  if (!plainPath(file)) return false;
  if (!RECENT_EXT.test(file) || RECENT_NOT_UI.test(file) || SECRET_FILE.test(file) || RECENT_SECRET_NAME.test(file)) return false;
  if (/\.(json|ya?ml)$/i.test(file) && !RECENT_DATA_DIR.test(file)) return false;
  return true;
}





export function recentWorkFrom({ log, status, prefix = '', isFile = () => true }) {
  const rel = (f) => (prefix ? (f.startsWith(prefix) ? f.slice(prefix.length) : null) : f);
  const seen = new Map();
  const entry = (f) => { let e = seen.get(f); if (!e) { e = { commits: 0, first: Infinity, uncommitted: false }; seen.set(f, e); } return e; };
  const chunks = String(log || '').split('\x01').slice(1);
  let counted = 0;
  chunks.forEach((chunk, i) => {
    const lines = chunk.split('\n'); const parents = (lines.shift() || '').trim();
    if (!/^[0-9a-f]{7,64}( [0-9a-f]{7,64})*$/.test(parents)) return;
    const files = [...new Set(lines.map((l) => l.trim()).filter(Boolean).map(rel).filter(userFacingPath))];
    if (!files.length || files.length > RECENT_BULK) return;
    counted++;
    for (const f of files) { const e = entry(f); e.commits++; e.first = Math.min(e.first, i); }
  });
  for (const line of String(status || '').split('\n')) {
    if (line.length < 4) continue;
    const f = rel(line.slice(3));
    if (userFacingPath(f)) entry(f).uncommitted = true;
  }
  const files = [...seen.entries()].filter(([f]) => isFile(f))
    .sort(([, a], [, b]) => Number(b.uncommitted) - Number(a.uncommitted) || b.commits - a.commits || a.first - b.first)
    .slice(0, RECENT_FILES)
    .map(([file, e]) => ({ file, commits: e.commits, ...(e.uncommitted ? { uncommitted: true } : {}) }));
  return { files, commitsLooked: chunks.length, commitsCounted: counted };
}
