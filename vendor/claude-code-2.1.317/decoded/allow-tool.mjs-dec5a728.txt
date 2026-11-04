


import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { assertRunsDirInsideProject, launcherConfig, readConsent, writeConsent, consentKey, localPortOf, isLocalHost, shown, trustedHome, readStartTie, isTaskOutput, processStartOf, processStartOfLater, RC_FILE, commandLineClean, startFacts, startMatches, writeStart } from './config.mjs';
import { portOwner, startFailure, startFailureWords, discoverDevServer, cdAndStart, frameworkOf, appNameOf, START_CAUSES, INSTALLERS } from './discover.mjs';
import { testBrowserMissing, installTestBrowser, noteInstallProgress, wantsHeaded, TEST_BROWSER_MB, mcpCliPath, toolsInstallInfo, essentialTrafficOnly } from './tools.mjs';
import { keepLivePage, plainWay, notOwnWay } from './live-page.mjs';
import { livePageFile, openLivePage, openByHand, runOpener } from './open-page.mjs';
import { RUN_ID, runFolders, writeInRunFolder, withinProject } from './runs.mjs';
import { makeRunTools } from './run-tools.mjs';

export const ALLOW_TOOL = 'claude_test_allow';
export const UP_TOOL = 'claude_test_app_up';
export const SHOW_TOOL = 'claude_test_show_run';

export const PANE_NOTE_TOOL = 'claude_test_pane_note';


export const START_TOOL = 'claude_test_start_app';

export const RUN_TOOL = 'claude_test_confirm_run';

const ASKED_OUTLINE_FILE = 'outline-asked.json';


export const BROWSER_TOOL = 'claude_test_browser_installed';


export const REMEMBER_TOOL = 'claude_test_remember';

const CHOICE_TOOLS = Object.freeze([START_TOOL, RUN_TOOL, BROWSER_TOOL, REMEMBER_TOOL]);

export const OWN_TOOLS = Object.freeze([ALLOW_TOOL, UP_TOOL, SHOW_TOOL, PANE_NOTE_TOOL, ...CHOICE_TOOLS]);

export const PREVIEW = process.argv.includes('--preview');

export const PANE = process.argv.includes('--pane');


const WAIT_ARG = '--allow-wait-ms=';
const WAIT_MS = Math.min(Math.max(Number((process.argv.find((a) => a.startsWith(WAIT_ARG)) || '').slice(WAIT_ARG.length)) || Infinity, 50), 10 * 60 * 1000);


export const LINE_COLUMNS = 72;

const QUESTION_LINES = 4;

const FOLDER_GOES_ON = 'Continued: ';
const WHO = 'Claude Test: ';

const MOST_QUESTIONS = 8;

const MOST_ASKED = 32;

const TOOL = {
  name: ALLOW_TOOL,
  description: 'Ask the person whether the Claude Test browser may open ONE address this project is waiting for ("ct.mjs status" lists them under needsConsent, with the exact arguments for this tool). Claude Code shows the person a dialog that opens with that address, goes on to the project folder and ends in a box to tick; only Accept with the box ticked records it, for that project on this machine. Call it from the person\'s own conversation with needsConsent.tool.arguments as status printed them; status names the next address waiting after each yes. After a no it does not ask about that address again in this session, and after eight questions that ended without a yes it asks no more in this session. A background run never calls it.',
  inputSchema: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'One entry of needsConsent (its addresses or loadOnlyHosts), spelled as status printed it.' },
      project: { type: 'string', description: 'The project folder, exactly as needsConsent.tool.arguments.project gives it.' },
    },
    required: ['address', 'project'],
    additionalProperties: false,
  },
};

const hostOf = (origin) => origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');

export const columns = (s) => [...s].reduce((n, ch) => n + (ch.codePointAt(0) > 0x7e ? 2 : 1), 0);

function folderShown(projectDir) {
  const home = trustedHome(); const short = home && (projectDir === home || projectDir.startsWith(home + path.sep)) ? '~' + projectDir.slice(home.length) : projectDir;
  return shown(short, 4096) === short ? short : null;
}




function folderLines(folder) {
  if (folder === null || columns('Project: ' + folder) <= LINE_COLUMNS) return folder;
  const chars = [...folder];
  for (let at = chars.length - 1; at > 0; at--) {
    if (chars[at - 1] !== '/' && chars[at - 1] !== path.sep) continue;
    const head = chars.slice(0, at).join(''); const rest = chars.slice(at).join('');
    if (columns('Project: ' + head) > LINE_COLUMNS || /^(?:\s|\p{M}|[\u2800\u3164\u115F\u1160\uFFA0])/u.test(rest)) continue;
    return columns(FOLDER_GOES_ON + rest) <= LINE_COLUMNS ? head + '\n' + FOLDER_GOES_ON + rest : null;
  }
  return null;
}

const WHERE_PAGES_GO = 'Pages it opens reach Anthropic as text and screenshots. Use test data.';


function question(folder, address, isOrigin) {
  return [
    WHO + address,
    isOrigin ? 'Do you want to allow it to open this address?' + (isLocalHost(hostOf(address)) ? '' : ' It is not on this machine.')
      : isWildcard(address) ? 'May pages in its test browser load from and send data to these hosts?'
      : 'May pages in its test browser load from this host and send data to it?',
    'Project: ' + folder,
    isOrigin ? WHERE_PAGES_GO : 'Press Space, then Accept, to allow it for this project on this machine.',
  ].join('\n');
}

const isWildcard = (address) => address.startsWith('*.');


const covers = (address) => 'This covers every host whose name ends in ' + address.slice(1) + '.';
const tickBox = (address, isOrigin) => ({ type: 'object', properties: { allow: { type: 'boolean', title: isOrigin ? 'Space to allow in this project on this machine' : isWildcard(address) ? 'Space to allow these hosts' : 'Space to allow this host', description: !isOrigin && isWildcard(address) && columns(covers(address)) <= LINE_COLUMNS - 6 ? covers(address) : address } }, required: ['allow'] });



function previewQuestion(folder, address, isOrigin) {
  const scope = isWildcard(address) ? 'Accept allows them for this project on this machine.' : SCOPE_LINE;
  const asked = isOrigin ? 'Open ' + address + ' in the test browser?' : 'Let test pages load from and send data to ' + address + '?';
  if (columns(asked) > LINE_COLUMNS) {
    if (isOrigin) return question(folder, address, isOrigin);
    return [WHO + address, isWildcard(address) ? 'Let test pages load from and send data to these hosts?' : 'Let test pages load from and send data to this host?', 'Project: ' + folder, isWildcard(address) && columns(covers(address)) <= LINE_COLUMNS ? covers(address) : scope].join('\n');
  }
  const lines = [asked, ...(isOrigin && !isLocalHost(hostOf(address)) ? ['It is not on this machine.'] : []), 'Project: ' + folder, ...(isOrigin ? [WHERE_PAGES_GO] : []), ...(isWildcard(address) && columns(covers(address)) <= LINE_COLUMNS ? [covers(address)] : [])];
  return (lines.join('\n').split('\n').length < 4 ? [...lines, scope] : lines).join('\n');
}

const SCOPE_LINE = 'Accept allows it for this project on this machine.';

const NO_BOX = 'The dialog of the tool ' + ALLOW_TOOL + ' has no box to tick in this session: it ends in Accept and Decline, and Accept alone allows. Where the run skill\'s words about that dialog mention a box, a tick or Space, leave that out: write "To allow one, choose Accept." in place of "To allow one, press Space to tick the box, then choose Accept.", and "To allow it, choose Accept." in place of "Press Space to tick the box, then choose Accept.". The install questions keep their box.';

const START_IN_DIALOG = 'In this session these questions are dialogs of Claude Code\'s own, asked by this helper in place of AskUserQuestion or words, as the run skill and its onboarding say: start the app, or, where Claude Test starts nothing, ask the person to start it (' + START_TOOL + ', when ' + UP_TOOL + ' answers with startDialog); try a start that stopped again (the same tool with again: true, when the check answers with againDialog); run a first run\'s tests (' + RUN_TOOL + '); install the test browser (' + BROWSER_TOOL + '); add the line that runs these tests before each push (' + REMEMBER_TOOL + ').';

export const PREVIEW_INSTRUCTIONS = PREVIEW ? 'Claude Test: ' + NO_BOX + ' ' + START_IN_DIALOG : null;

const PREVIEW_TOOL = { ...TOOL, description: TOOL.description.replace('goes on to the project folder and ends in a box to tick; only Accept with the box ticked records it', 'goes on to the project folder and ends in Accept and Decline, with no box to tick; only Accept records it') + ' ' + NO_BOX };


const MOST_WAIT_S = 90;
const UP = {
  name: UP_TOOL,
  description: 'Say whether the app under test is listening on this machine right now. The browser helper can see localhost when "ct.mjs status" could not (devServer.sandboxed). It tries only the ports of this machine that Claude Test would try for this project (its base URL\'s, or those its files name and a few usual ones), by address: it only connects, and sends no data at all, and for a port that answers it reads this machine\'s process table to tell whether the program there works in this project\'s folder (at the base URL\'s port, a program that works in another folder is not this app: the answer is up: false with portBusy; start nothing on that port); "up" is about the base URL\'s address when one is set, else about the ports the project\'s own files name. Call it from the person\'s conversation with devServer.check.arguments as status printed them, before a run is started. Right after you started the dev server, pass wait as well: the helper then tries again four times a second until the app answers or that many seconds have passed, and answers once, so one call is all the waiting a start needs. With wait it also stops waiting when the start it follows has stopped by itself, and answers startEnded with its cause in fixed words (causeWords), never its output. Pass output only when the check comes in a later message than the start.',
  inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'The project folder, exactly as devServer.check.arguments.project gives it.' }, wait: { type: 'integer', minimum: 0, maximum: MOST_WAIT_S, description: 'Seconds to keep trying while nothing answers (at most ' + MOST_WAIT_S + '); leave it out to try once.' }, output: { type: 'string', description: 'With wait, only when the check comes in a later message than the background Bash call that started the app: the path after "Output is being written to:" in that call\'s answer, exactly as it was printed. Leave it out when the check is in the same message as that start, right after it.' }, listening: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 65535 }, maxItems: 32, description: 'The ports that were already answering when status ran, exactly as devServer.check.arguments.listening gives them; leave it out when status gave none.' } }, required: ['project'], additionalProperties: false },
};
const SHOW = {
  name: SHOW_TOOL,
  description: 'Open the live page of the run that is about to start in the person\'s default browser, so they can watch it. Call it from the person\'s conversation only, right before the runner is started, with livePageShow.arguments exactly as your own "ct.mjs new-run" printed them, nothing else. The page is a local file this browser helper wrote under the plugin\'s data folder. To open it the helper starts ONE program outside Claude Code\'s command sandbox (open, xdg-open or explorer.exe, from a fixed location) with that file\'s path and nothing else from the call (on a Mac, after the first time, -g before it, so it opens behind their work), at most once a run and eight times a session, and notes in the person\'s prefs.json, the first time, that a page has been opened. It opens nothing in CI, over SSH, with no display, with CLAUDE_TEST_NO_OPEN set, or when the person chose "link" ("ct.mjs prefs live-page link"). The answer says what became of it. A background run never calls this tool.',
  inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'livePageShow.arguments.project, as your own "ct.mjs new-run" printed it.' }, run: { type: 'string', description: 'livePageShow.arguments.run: the runId your own "ct.mjs new-run" printed for the run that is about to start.' } }, required: ['project', 'run'], additionalProperties: false },
};

const PANE_ENUMS = { signin: ['none', 'form', 'google', 'other'], payments: ['none', 'stripe', 'other'], data: ['browser', 'server', 'local', 'hosted'] };
const PANE_STATES = ['down', 'running', 'started', 'failed', 'busy'];
const PANE_LOOKS = ['loads', 'empty', 'nothing'];
const PANE_STOPS = ['agents', 'blocked'];

const PANE_COMMAND = /^[A-Za-z0-9@._:/=+ -]{1,60}$/;
const PANE_NOTE = {
  name: PANE_NOTE_TOOL,
  description: 'Tell Claude Test\'s panel what it cannot read from the run folder: the app\'s state, your onboarding guesses, or that a helper did not start. Call it only where the run skill\'s panel rule says so (section 3, step 6, "The panel\'s notes"), with project as status\'s projectDir and only the notes that are due. Every value is a word of a fixed list or a number: the helper writes them to the newest run folder\'s pane.json, for the panel alone, and answers { ok: true }. It asks nothing and starts nothing; besides the run folder it reads only the project\'s package.json and start command. A background run never calls it.',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'status\'s projectDir, exactly as status printed it.' },
      app: { type: 'object', description: 'The app\'s state. state failed takes the up check\'s cause, with its port or install when the check gave one; busy takes portBusy.port; started takes nothing more (the panel names the command only when it is the start this helper answered).', properties: { state: { enum: PANE_STATES }, cause: { enum: START_CAUSES }, port: { type: 'integer', minimum: 1, maximum: 65535 }, install: { enum: INSTALLERS } }, required: ['state'], additionalProperties: false },
      about: { type: 'object', description: 'Your onboarding F2 guesses, all three.', properties: { signin: { enum: PANE_ENUMS.signin }, payments: { enum: PANE_ENUMS.payments }, data: { enum: PANE_ENUMS.data } }, required: ['signin', 'payments', 'data'], additionalProperties: false },
      look: { type: 'object', description: 'The first look\'s first page, as its report counted it.', properties: { kind: { enum: PANE_LOOKS }, errors: { type: 'integer', minimum: 0, maximum: 9999 }, failed: { type: 'integer', minimum: 0, maximum: 9999 } }, required: ['kind'], additionalProperties: false },
      stopped: { enum: PANE_STOPS, description: 'agents: a helper\'s Skill or Agent call came back with an error instead of starting; blocked: the look came back BLOCKED or NEEDS INPUT.' },
    },
    required: ['project'],
    additionalProperties: false,
  },
};

const START_SANDBOXES = ['off', 'may-leave', 'stays-reachable'];
const STAYS_PUT = ['stays-unreachable', 'stays-no-listen', 'stays-no-listen-fixed'];


const MOST_UNANSWERED = 4;


const START_LINES = 6;
const START = {
  name: START_TOOL,
  description: 'Ask the person, in a dialog of Claude Code\'s own, whether their app should be started with the ONE start command "ct.mjs status" printed for it, or with a command the person typed as their answer (typed: true). It only asks: it never starts anything. A command the person typed is never started without this dialog\'s Accept. It asks nothing until the app\'s address is allowed for this project on this machine (the address dialog of ' + ALLOW_TOOL + ' comes first). Call it from the person\'s own conversation only where the run skill says so (section 3, step 2, up: false, when the check answered with startDialog), with project as devServer.check.arguments.project, command and line as devServer.startCommand and devServer.startLine, all exactly as status printed them, and sandbox and background as the words the run skill was loaded with. The helper works the command and its line out again from the project\'s own files, as status does, and asks nothing about any other. The dialog ends in Accept and Decline, and its last lines say what each does; an Accept also lets later runs start this same command, in the same folder of the same project on this machine, with no dialog, while the project files it runs are unchanged; where the helper cannot tell what the command runs, its Accept covers this time only. The answer is "start" (Accept: start it; with remembered: true, the person accepted this very start earlier and no dialog was shown), "declined" (Decline: they start it, or say where it runs), or answer null when neither came (the dialog was closed or timed out). Where Claude Test starts nothing (background none, or sandbox stays-unreachable or stays-no-listen-fixed), the same call asks the person to start it in another terminal with that line instead: Accept is "it\'s running now, check again", and the helper checks again before it answers ("recheck", with that new check\'s fields), Decline is "stop". After four questions that ended without a yes (a Decline counts) it asks no more in this session. A background run never calls it.',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'The project folder, exactly as devServer.check.arguments.project gives it.' },
      command: { type: 'string', description: 'devServer.startCommand, exactly as status printed it.' },
      line: { type: 'string', description: 'devServer.startLine, exactly as status printed it: the line that is started on an Accept.' },
      sandbox: { type: 'string', description: 'The sandbox word the run skill was loaded with (off, may-leave, stays-reachable; or stays-unreachable, stays-no-listen-fixed, where the person starts it).' },
      background: { type: 'string', description: 'The background word the run skill was loaded with (kept; or none, where the person starts it).' },
      again: { type: 'boolean', description: 'true only right after the up check answered startEnded for this project: the dialog then says why it did not start, in the check\'s fixed words, and asks whether to try again.' },
      typed: { type: 'boolean', description: 'true when command is one the person typed as their answer, or a listed choice they picked: line is then that choice\'s line, or devServer.cdPrefix followed by the typed command, exactly. For a typed command the dialog says Claude Test did not find it in the project; nothing typed is ever started without this dialog\'s Accept.' },
    },
    required: ['project', 'command', 'line', 'sandbox', 'background'],
    additionalProperties: false,
  },
};

const packed = (pieces) => pieces.reduce((lines, s) => { const last = lines[lines.length - 1]; if (last !== undefined && columns(last + ' ' + s) <= LINE_COLUMNS) lines[lines.length - 1] = last + ' ' + s; else lines.push(s); return lines; }, []);


const fallbackFile = (source) => { const m = typeof source === 'string' && source.match(/^(Procfile|README\.md|readme\.md|README\.markdown|README|app\.py|main\.py|server\.py|run\.py) /); return m ? m[1] : null; };

const FORGET_START = 'To undo Accept later, tell Claude "forget the app start".';

const TYPED_WORDS = 'Claude Test did not find this command in the project.';



function startQuestion(address, command, source, outside, forget, typed = false, folder = null, remembers = true) {
  const asked = 'Start your app with ' + command + (source ? ' (from ' + source + ')' : '') + '?';
  const head = columns(asked) <= LINE_COLUMNS ? [asked] : columns('Start your app with ' + command + '?') <= LINE_COLUMNS ? ['Start your app with ' + command + '?', 'The command is from ' + source + '.'] : ['Start your app with this command' + (source ? ' from ' + source : '') + '?', 'Command: ' + command];
  const found = packed([...(typed ? [TYPED_WORDS] : []), address ? (typed ? 'Your app' : 'It') + ' isn\'t running at ' + address + '.' : (typed ? 'Your app' : 'It') + ' isn\'t running.', ...(folder ? ['It starts in the folder ' + folder + '.'] : []), outside ? 'It runs outside Claude Code\'s sandbox and stops when the run ends.' : 'It stops when the run ends.']);
  return [...head, ...found, remembers ? 'Accept: start it now and next time, for this project on this machine.' : 'Accept: start it now.', 'Decline: you start it in another terminal.', ...(forget && remembers ? [FORGET_START] : [])].join('\n');
}

const START_HOW = 'as the run skill says under "Starting it": ONE Bash call whose command is the stop-on-exit line followed by exactly the line here (devServer.startLine as status printed it, or for a command the person typed, devServer.cdPrefix and that command). This answer started nothing, and Claude Code\'s own permission check still decides whether that call may run.';



function againQuestion(causeWords, command, { typed = false, folder = null, outside = false } = {}) {
  const asked = 'Start your app again with ' + command + '?';
  const cause = wrapped('It didn\'t start. ' + String(causeWords) + '.', '', '');
  if (cause === null) return null;
  const facts = packed([...(typed ? [TYPED_WORDS] : []), ...(folder ? ['It starts in the folder ' + folder + '.'] : []), ...(outside ? ['It runs outside Claude Code\'s sandbox.'] : [])]);
  return [...(columns(asked) <= LINE_COLUMNS ? [asked] : ['Start your app again with this command?', 'Command: ' + command]), ...cause, ...facts, 'Accept: try again. Decline: you start it in another terminal.'].join('\n');
}
const AGAIN_ANSWERS = {
  accept: { answer: 'start', note: 'They chose Try again (Accept): start it again ' + START_HOW + ' In the same message, right after that Bash call, call the up check with wait, as the run skill says.' },
  decline: { answer: 'declined', note: 'They chose "You start it" (Decline): start nothing. Write ONE line asking them to start the app in another terminal with the line here and to tell you when it\'s running, or where it runs, as the run skill says, and end your turn.' },
};


const ASKS_YOURSELF = ['stays-unreachable', 'stays-no-listen-fixed'];



function yourselfQuestion(address, line, command, again) {
  const cd = line.endsWith(' ' + command) ? line.slice(0, line.length - command.length).trimEnd() : '';
  const shownLine = columns(line) <= LINE_COLUMNS ? [line] : cd.endsWith(' &&') && columns(cd) <= LINE_COLUMNS && columns(command) <= LINE_COLUMNS ? [cd, command] : null;
  if (shownLine === null) return null;
  const seen = again ? 'Nothing answers at ' + (address || 'your app\'s address') + ' yet.' : address ? 'Your app isn\'t running at ' + address + '.' : 'Your app isn\'t running.';
  return [...packed([seen, 'Start it in another terminal:']), ...shownLine, 'Accept: it\'s running now, check again.', 'Decline: stop here.'].join('\n');
}

const YOURSELF_NOT_YET = 'They chose Accept, but the check found nothing there yet. Call ' + START_TOOL + ' once more with the same arguments, in this turn: its dialog opens with "Nothing answers at <address> yet.".';
const YOURSELF_STILL_NOT = 'They chose Accept a second time, and the check still found nothing there. Start nothing and run nothing. Stop with one line: "Nothing answers at <address> yet. Type /claude-test when it\'s running."';
const YOURSELF_NO_ANSWER = 'Start nothing and run nothing. Stop with one line: "Nothing was started. Type /claude-test when your app is running."';
const YOURSELF_ANSWERS = {
  accept: { answer: 'recheck' },
  decline: { answer: 'stop', note: 'They chose Decline: start nothing and run nothing. Stop with one line: "Nothing was started. Type /claude-test when your app is running." and end your turn.' },
};

const START_REMEMBERED = 'The person chose Accept for this very start earlier (the same command, in the same folder of the same project, with the same scripts and the same project files it names, on this machine), so no dialog was shown. Start it now ' + START_HOW;

const START_NO_ANSWER = 'Start nothing and run nothing. Stop with one line: "Nothing was started. Type /claude-test when your app is running."';
const START_ANSWERS = {
  accept: { answer: 'start', note: 'They chose Accept: start it now ' + START_HOW },
  decline: { answer: 'declined', note: 'They chose Decline: start nothing. Write ONE line asking them to start the app themselves or to tell you where it runs, as the run skill says, and end your turn.' },
};


const MOST_OUTLINED = 6;
const OUTLINE_LINE_CHARS = 200;
const OUTLINE_LINES = 16;
const RUN_Q = {
  name: RUN_TOOL,
  description: 'Ask the person, in a dialog of Claude Code\'s own, whether to run the tests of a first run\'s outline (onboarding F3), in place of the AskUserQuestion that ends in "Would you like to run these <n> tests?". Pass project as status\'s projectDir, count as the number of tests, tests as the outline\'s numbered lines, one string each without its number, and notCovered as its "Not covered" lines, at most three. The dialog opens with "Run these <n> tests? Claude wrote this list:", then numbers, wraps and shows the lines as they were passed, with invisible characters taken out and control characters and runs of white space made one space, then "Not covered:" and those lines joined by " \u00b7 ", and ends in "Accept: run them. Decline: say what to change." and those two buttons; it asks nothing when it does not fit whole. The answer is "run" (Accept: their yes, F4), "change" (Decline), or answer null when neither came (the dialog was closed or timed out). It runs nothing; it keeps the tests it asked in the run folder, for the panel. A background run never calls it.',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'The project folder, exactly as status printed projectDir.' },
      count: { type: 'integer', description: 'How many tests the outline proposes: the number of strings in tests.' },
      tests: { type: 'array', items: { type: 'string' }, description: 'The outline\'s numbered lines, in order, each without its number.' },
      notCovered: { type: 'array', items: { type: 'string' }, description: 'The outline\'s "Not covered" lines, at most three; leave it out when there are none.' },
    },
    required: ['project', 'count', 'tests'],
    additionalProperties: false,
  },
};



function outlineLine(s) {
  if (typeof s !== 'string') return null;
  const text = s.replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}\u115F\u1160\u3164\uFFA0\u2800]/gu, '').replace(/(\p{M}\p{M})\p{M}+/gu, '$1').replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ').trim().replace(/^(?:\d{1,2}[.)]|[-*\u2022])\s+/u, '');
  return text && [...text].length <= OUTLINE_LINE_CHARS ? text : null;
}

function wrapped(text, lead, indent) {
  const out = []; let line = lead; let empty = true;
  for (let word of text.split(' ')) {
    while (word) {
      const room = LINE_COLUMNS - columns(line) - (empty ? 0 : 1);
      if (columns(word) <= room) { line += (empty ? '' : ' ') + word; empty = false; word = ''; continue; }
      if (!empty) { out.push(line); line = indent; empty = true; continue; }
      let piece = ''; for (const ch of word) { if (columns(piece + ch) > room) break; piece += ch; }
      if (!piece) return null;
      line += piece; word = word.slice(piece.length); out.push(line); line = indent;
    }
  }
  if (!empty) out.push(line);
  return out;
}


function outlineQuestion(tests, notCovered) {
  const one = tests.length === 1;
  const lines = [one ? 'Run this test? Claude wrote it:' : 'Run these ' + tests.length + ' tests? Claude wrote this list:'];
  const parts = [...tests.map((t, i) => wrapped(t, (i + 1) + '. ', '   ')), ...(notCovered.length ? [wrapped(notCovered.join(' \u00b7 '), 'Not covered: ', '  ')] : [])];
  if (parts.includes(null)) return null;
  for (const part of parts) lines.push(...part);
  lines.push(one ? 'Accept: run it. Decline: say what to change.' : 'Accept: run them. Decline: say what to change.');
  return lines.length <= OUTLINE_LINES && lines.every((l) => columns(l) <= LINE_COLUMNS) ? lines.join('\n') : null;
}
const RUN_NO_ANSWER = 'Write nothing and run nothing. Stop a dev server you started in this run (TaskStop), then stop with one line: "Nothing ran. Type /claude-test when you want to go on."';
const RUN_ANSWERS = {
  accept: { answer: 'run', note: 'They chose Accept: their yes to this outline, as it was shown. Go on to F4 (onboarding.md).' },
  decline: { answer: 'change', note: 'They chose Decline. Ask in one short line, "What should I change? For example: \'remove 2, add a checkout test\'.", and end your turn; their reply changes the outline, and you ask again with this tool.' },
};


function browserQuestion({ headed, toolsMissing }) {
  const mb = headed ? TEST_BROWSER_MB.full : TEST_BROWSER_MB.shell;
  return [
    ...packed(['Install the test browser (Chromium, about ' + mb + ' MB)', 'from Playwright\'s download servers?']),
    ...(toolsMissing ? ['Claude Test also installs Playwright\'s packages from your npm registry.'] : []),
    'Accept: download and install it now. Decline: don\'t install it.',
  ].join('\n');
}
const BROWSER_Q = {
  name: BROWSER_TOOL,
  description: 'Ask the person, in a dialog of Claude Code\'s own, whether to install the test browser now (onboarding, "Machine", tools.browser.missing), in place of the terminal command. Call it with project as status\'s projectDir, and write nothing before it. It asks only while this machine has no test browser, as status finds, and not while Claude Code is set to essential network traffic only. The dialog asks "Install the test browser (Chromium, about <n> MB) from Playwright\'s download servers?", ends in "Accept: download and install it now. Decline: don\'t install it." and has those two buttons. On Accept the helper installs it itself (the browser tools too, when they are missing) and reports how far it got as the call\'s progress; the call answers when the install has ended. The answer is "installed" (Accept, and the install worked), "install-failed" (Accept, with cause and the one line to say), "stop" (Decline), or answer null when neither came. A background run never calls it.',
  inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'The project folder, exactly as status printed projectDir.' } }, required: ['project'], additionalProperties: false },
};
const BROWSER_NO_ANSWER = 'Stop with one line, "Claude Test can\'t run without the test browser. To install it later, run this in a terminal:", then tools.browser.command from "ct.mjs status" as a code block.';
const BROWSER_ANSWERS = {
  accept: { answer: 'installed', note: 'They chose Accept and the test browser is installed. Run "ct.mjs status" again and go on from SKILL.md §1 IN THIS TURN: nothing has to be typed again. Say nothing about the install.' },
  decline: { answer: 'stop', note: 'They chose Decline. ' + BROWSER_NO_ANSWER },
};

const BROWSER_FAILED_NOTE = 'They chose Accept, but the install did not work. Say the answer\'s line exactly as it is, as your one line, and stop. Do not install or download another way, do not run the command yourself, and do not ask again in this turn.';



const REMEMBER_FILE = 'CLAUDE.local.md';
const REMEMBER_LINE = '- Before pushing changes to this web app, run /claude-test:run and fix or explain any failure.';
const REMEMBER_Q = {
  name: REMEMBER_TOOL,
  description: 'Ask the person, in a dialog of Claude Code\'s own, whether Claude adds the one line that runs these tests before each push (run skill §5, "The offer to remember"), in place of the offer in words. Call it only where the run skill makes that offer, as the closing line of that results message, from the person\'s own conversation, with project as status\'s projectDir. The dialog says "Have Claude run these tests before each push? Claude adds one line to CLAUDE.local.md (just for you)." and "Accept: add it (Claude Code shows the edit). Decline: write nothing." The answer is "add" with file CLAUDE.local.md (Accept: their yes), "not-now" (Decline), or answer null when neither came. It writes nothing: the conversation makes the edit.',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'The project folder, exactly as status printed projectDir.' },
    },
    required: ['project'],
    additionalProperties: false,
  },
};
const REMEMBER_QUESTION = ['Have Claude run these tests before each push?', 'Claude adds one line to CLAUDE.local.md (just for you).', 'Accept: add it (Claude Code shows the edit). Decline: write nothing.'].join('\n');
const REMEMBER_NOT_NOW = 'Write nothing to any file and say nothing more about it: the offer is not made again in this project.';
const REMEMBER_ANSWERS = {
  accept: { answer: 'add', note: 'They chose Accept: append exactly this line, and nothing else, to file in the project folder (create it if absent) with a normal edit, so that Claude Code shows it: ' + REMEMBER_LINE + ' Say nothing before the edit.' },
  decline: { answer: 'not-now', note: 'They chose Decline. ' + REMEMBER_NOT_NOW },
};


const CHOICE_KINDS = Object.freeze({
  start: { answers: START_ANSWERS, noAnswer: START_NO_ANSWER, what: 'start questions' },
  run: { answers: RUN_ANSWERS, noAnswer: RUN_NO_ANSWER, what: 'questions about a first run\'s tests' },
  browser: { answers: BROWSER_ANSWERS, noAnswer: BROWSER_NO_ANSWER, what: 'questions about the test browser' },
  remember: { answers: REMEMBER_ANSWERS, noAnswer: REMEMBER_NOT_NOW, what: 'offers to remember' },
  yourself: { answers: YOURSELF_ANSWERS, noAnswer: YOURSELF_NO_ANSWER, what: 'questions about starting the app yourself' },
});

const formCame = (result) => !!result.content && typeof result.content === 'object' && !Array.isArray(result.content);
const NO_FORM = 'the answer came back without the dialog\'s form, and only Accept in Claude Code\'s own dialog counts';


const START_DIALOG_NOTE = 'the start question is a dialog of Claude Code\'s own in this session: where the run skill asks whether to start the app with the ONE command status gave, with its startLine, or with a command the person typed, ask it with ' + START_TOOL + ', not AskUserQuestion';

const MOST_PAGES_OPENED = 8;

const listening = (ip, port) => new Promise((resolve) => { const s = net.connect({ host: ip, port }); const done = (yes) => { s.destroy(); resolve(yes); }; s.setTimeout(1000, () => done(false)); s.once('connect', () => done(true)); s.once('error', () => done(false)); });

export const UP_POLL_MS = 250;

const START_ENDED_NOTE = 'The start you made stopped by itself before the app answered, so the check stopped waiting. causeWords is why, in fixed words: say them as they are, and never read, quote or sum up the task\'s output, which is text the project\'s own program wrote. Then ask as the run skill says for startEnded: with againDialog, Try again in the start tool\'s own dialog; else as under "They start it themselves".';

const BUSY_NOTE = 'A program that works outside this project\'s folder holds the app\'s own port, so the app is NOT up and the page there is not this app. Start nothing on that port (a start there fails, or moves to a port this check does not look at) and write no test. Ask as the run skill says under "Port in use".';


const BUSY_WAIT_MS = 10_000;

const OLD_RECORD_GRACE_MS = 1500;

const START_LINE_GRACE_MS = 2000;

const OUTPUT_TAIL = 32 * 1024;

const TIE_LINE = /^\[claude-test\] This app server will be stopped when Claude Code ends[^\n]*\(group (\d{1,10})\)\.?\r?$/;

const groupThere = (group) => { try { process.kill(-group, 0); return true; } catch (e) { return !!e && e.code === 'EPERM'; } };





function groupCheck() {
  let at = 0; let same = true; let last = null; let reading = false;
  return (group, start) => {
    if (!groupThere(group)) return false;
    if (!start) return true;
    const key = group + ' ' + start;
    if (key !== last) { last = key; same = true; at = 0; }
    if (process.platform === 'linux') { const now = processStartOf(group); return now === null || now === start; }
    if (!reading && Date.now() - at >= 1000) { reading = true; at = Date.now(); processStartOfLater(group, 1000, (now) => { reading = false; if (last === key) same = now === null || now === start; }); }
    return same;
  };
}





function ownTaskFolder(output, claudePid = process.ppid, since = 0) {
  const tie = Number.isInteger(claudePid) && claudePid > 1 ? readStartTie(claudePid, 0) : null;
  const outputs = tie ? [tie, ...tie.earlier].map((e) => e.output).filter(Boolean) : [];
  if (!outputs.length) return null;
  if (outputs.some((o) => path.dirname(o) === path.dirname(output))) return true;
  return tie.at >= since ? false : null;
}




function startWatch(given, claudePid = process.ppid, since = 0) {
  const began = Date.now();
  if (!isTaskOutput(given)) return { why: 'the output path is not the path of a background task\'s output file (<\u2026>/tasks/<id>.output)' };


  const notOurs = { why: 'the output path is not a background task\'s output file of this Claude Code session' };




  const output = given; const parts = path.dirname(given).split(path.sep).filter(Boolean);
  const noLinkOnTheWay = () => { let at = path.parse(given).root; for (const part of parts) { at = path.join(at, part); try { if (fs.lstatSync(at).isSymbolicLink()) return false; } catch { return false; } } return true; };
  let own = ownTaskFolder(output, claudePid, since);
  if (own === false || (own === true && !noLinkOnTheWay())) return notOurs;


  let fd = null; let refused = false;
  const handle = () => {
    if (fd !== null || refused) return fd;
    if (own !== true) { own = ownTaskFolder(output, claudePid, since); if (own !== true) return null; if (!noLinkOnTheWay()) { refused = true; return null; } }
    let f = null;
    try { f = fs.openSync(output, fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)); const st = fs.fstatSync(f); if (!st.isFile() || st.nlink > 1) { refused = true; fs.closeSync(f); return null; } fd = f; } catch { if (f !== null) { try { fs.closeSync(f); } catch {              } } }
    return fd;
  };
  const read = (start, length) => { const f = handle(); if (f === null || length <= 0) return ''; try { const b = Buffer.alloc(length); const n = fs.readSync(f, b, 0, length, start); return b.subarray(0, n).toString('utf8'); } catch { return ''; } };
  let group = null; const still = groupCheck();
  const readGroup = () => { if (group === null) { const m = read(0, 512).split('\n').map((l) => l.match(TIE_LINE)).find(Boolean); const g = m ? Number(m[1]) : NaN; if (Number.isInteger(g) && g > 1 && g !== process.pid) group = g; } return group; };
  return {
    tied: () => readGroup() !== null || Date.now() - began < START_LINE_GRACE_MS,
    answeredKey: () => (group !== null ? String(group) : null),


    ended() { if (readGroup() === null) return false; const tie = Number.isInteger(claudePid) && claudePid > 1 ? readStartTie(claudePid, 0) : null; const entry = tie ? [tie, ...tie.earlier].find((e) => e.group === group) : null; return !!entry && !still(group, entry.start); },
    text() { const f = handle(); if (f === null) return ''; let size = 0; try { size = fs.fstatSync(f).size; } catch { return ''; } return read(Math.max(0, size - OUTPUT_TAIL), Math.min(size, OUTPUT_TAIL)); },

    done() { if (fd !== null) { try { fs.closeSync(fd); } catch {              } } fd = null; refused = true; },
  };
}



function tieWatch(since, claudePid = process.ppid, answered = new Set()) {
  let tie = null; const still = groupCheck();

  const found = () => { if (Number.isInteger(claudePid) && claudePid > 1) { const t = readStartTie(claudePid, since); if (t && t.group !== process.pid && !answered.has(String(t.group))) tie = t; } return tie; };
  return {
    tied: () => found() !== null,
    ended() { const t = found(); if (t === null) return false; if (t.at < since && Date.now() - since < OLD_RECORD_GRACE_MS) return false; return !still(t.group, t.start); },
    text() { const t = found(); if (!t || !t.output) return ''; const w = startWatch(t.output, claudePid); if (w.why) return ''; try { return w.text(); } finally { w.done(); } },
    answeredKey: () => (tie ? String(tie.group) : null),
  };
}

const MOST_PORTS = 12;


const MOST_PLACES_EVER = 72;

const ipsFor = (host) => (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ? [host] : host === '::1' ? ['::1'] : ['127.0.0.1', '::1']);



function ownPorts(cfg) {
  const ports = new Map(); const left = new Set();
  const usualOnly = new Set((cfg.candidates || []).filter((c) => !c.own).map((c) => c.port));
  const rcNamed = new Set([].concat(cfg.rc && cfg.rc.allowedOrigins ? cfg.rc.allowedOrigins : []).map(localPortOf));
  for (const o of cfg.wantedOrigins || []) {
    let u; try { u = new URL(/^https?:\/\//.test(o) ? o : 'http://' + o); } catch { continue; }
    const host = u.hostname.replace(/^\[|\]$/g, ''); if (!isLocalHost(host)) continue;
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80); const named = !usualOnly.has(port) || rcNamed.has(port);
    if (ports.has(port)) { const p = ports.get(port); for (const ip of ipsFor(host)) p.ips.add(ip); p.named = p.named || named; continue; }
    if (ports.size >= MOST_PORTS) { left.add(port); continue; }
    ports.set(port, { address: u.protocol + '//' + (/^127\./.test(host) && host !== '127.0.0.1' ? host : 'localhost') + (u.port ? ':' + u.port : ''), ips: new Set(ipsFor(host)), named });
  }
  return { ports, more: left.size };
}



function paneNoteIn(runDir) {
  let fd = null;
  try {
    if (!fs.lstatSync(path.join(runDir, 'pane.json')).isFile()) return null;
    fd = fs.openSync(path.join(runDir, 'pane.json'), fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK));
    const st = fs.fstatSync(fd); if (!st.isFile() || st.size > 16 * 1024) return null;
    const bytes = Buffer.alloc(st.size); fs.readSync(fd, bytes, 0, st.size, 0);
    const j = JSON.parse(bytes.toString('utf8')); if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    return Object.fromEntries(['app', 'about', 'name', 'look', 'more', 'stopped', 'from', 'fix'].filter((k) => Object.hasOwn(j, k)).map((k) => [k, j[k]]));
  } catch { return null; } finally { if (fd !== null) { try { fs.closeSync(fd); } catch {              } } }
}








export function makeAllowTool({ send, settings = launcherConfig, opening = {}, running = {}, owner = portOwner, tieParent = process.ppid, preview = PREVIEW, pane = PANE, browserMissing = testBrowserMissing, install = installTestBrowser }) {
  const helperBegan = Date.now();
  const runTools = makeRunTools({ send, settings, ...running });


  const idPrefix = ALLOW_TOOL + ':' + crypto.randomBytes(8).toString('hex') + ':';
  let seq = 0;
  let clientAsks = false;
  let built = false;
  let rebuildsLater = null;
  const yeses = new Map();
  let open = null;
  let asked = 0;
  let withoutYes = 0;
  const tried = new Set();
  const answeredTies = new Set();
  const declined = new Set();
  const unanswered = { start: 0, run: 0, browser: 0, remember: 0, yourself: 0 };
  let installDeclined = false;
  const failedStarts = new Map();
  const busyPorts = new Map();
  const notYet = new Set();
  const lastStarts = new Map();
  let installing = null;
  let installed = null;

  const answer = (id, text, isError = false) => send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) } });


  function close(why, answerCall) {
    const o = open; open = null; clearTimeout(o.timer);
    if (o.kind) unanswered[o.kind]++; else withoutYes++;
    if (o.kind === 'yourself') notYet.delete(o.extra.projectDir);
    send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: o.askId, reason: why } });
    if (answerCall && o.kind) answer(o.callId, noAnswer(o.kind, why));
    else if (answerCall) answer(o.callId, 'Nothing was recorded: ' + why + '. Start no run. The person can type /claude-test again when they want to answer.', true);
  }

  const noAnswer = (kind, why) => JSON.stringify({ answer: null, why, note: 'No answer of theirs came. ' + CHOICE_KINDS[kind].noAnswer });


  function pick(served, project) {
    const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
    return served.find((c) => project === c.projectDir || project === real(c.projectDir)) || null;
  }


  async function up(msg) {
    const id = msg.id; const args = msg.params.arguments;
    if (!args || typeof args !== 'object' || typeof args.project !== 'string' || !args.project || args.project.length > 4096) return answer(id, 'Pass { project: "<folder>" } exactly as "ct.mjs status" prints it under devServer.check.arguments.', true);
    let served; try { served = settings().served; } catch (e) { return answer(id, 'Could not read the Claude Test settings here: ' + shown(e && e.message ? e.message : e, 300), true); }
    const cfg = pick(served, args.project);
    if (!cfg) return answer(id, 'Nothing was checked: this browser helper does not serve ' + shown(args.project, 300) + '. It serves ' + served.map((c) => shown(c.projectDir, 300)).join(', ') + '.', true);
    keepLivePage([cfg], { unpaced: true });
    notYet.delete(cfg.projectDir);
    const found = await upLook(cfg, args);
    if (found.error) return answer(id, found.error, true);
    answer(id, JSON.stringify(found.json));
  }

  async function upLook(cfg, args) {

    let base = null; try { base = cfg.baseOrigin ? new URL(/^https?:\/\//.test(cfg.baseOrigin) ? cfg.baseOrigin : 'http://' + cfg.baseOrigin) : null; } catch {                            }
    if (base && !isLocalHost(base.hostname.replace(/^\[|\]$/g, ''))) return { json: { up: null, elsewhere: true, note: 'the app\'s base URL, ' + shown(cfg.baseOrigin, 120) + ', is not one of this machine\'s own addresses, so it was not checked: no name is looked up from here' } };
    const basePort = base ? Number(base.port) || (base.protocol === 'https:' ? 443 : 80) : null;

    const { ports, more } = ownPorts(cfg);
    if (!ports.size) return { json: { up: null, elsewhere: true, note: 'this project names no address on this machine, so there is nothing to check from here' } };
    const fresh = [...ports].flatMap(([port, p]) => [...p.ips].map((ip) => ip + ' ' + port)).filter((place) => !tried.has(place));
    if (tried.size + fresh.length > MOST_PLACES_EVER) return { error: 'Nothing was checked: this helper has tried ' + tried.size + ' different addresses and ports of this machine in this session and tries ' + MOST_PLACES_EVER + ' at most. A new Claude Code session looks afresh; ask the person whether their dev server is running.' };
    for (const place of fresh) tried.add(place);
    const waitIn = typeof args.wait === 'string' && /^\s*\d+\s*$/.test(args.wait) ? Number(args.wait) : args.wait;
    const waitS = Number.isInteger(waitIn) && waitIn > 0 ? Math.min(waitIn, MOST_WAIT_S) : 0;
    const began = Date.now(); const until = began + waitS * 1000;

    const watch = waitS > 0 && process.platform !== 'win32' ? (args.output !== undefined ? startWatch(args.output, typeof tieParent === 'function' ? tieParent() : tieParent, helperBegan) : tieWatch(began, typeof tieParent === 'function' ? tieParent() : tieParent, answeredTies)) : null;
    if (watch && watch.why) return { error: 'Nothing was checked: ' + watch.why + '. Call again without output; pass output only exactly as your background Bash call printed it after "Output is being written to:".' };
    const tryAll = async () => { const found = []; for (const [port, p] of ports) found.push({ address: p.address, port, named: p.named, listening: (await Promise.all([...p.ips].map((ip) => listening(ip, port)))).some(Boolean) }); return found; };
    const isMine = (c) => (basePort === null ? c.named : c.port === basePort);
    const ownerOf = (c) => { let o = null; try { o = owner(c.port, cfg.projectDir); } catch {                   } return o; };



    const held = new Map();
    const holderOf = (c) => { if (!c.listening) { held.delete(c.port); return null; } if (!held.has(c.port)) held.set(c.port, ownerOf(c)); return held.get(c.port); };
    const appUp = (c) => isMine(c) && c.listening && holderOf(c) !== 'other';
    const busyNow = (list) => (basePort === null ? [] : list.filter((c) => isMine(c) && c.listening && holderOf(c) === 'other'));

    const before = new Set((Array.isArray(args.listening) ? args.listening : []).filter((p) => Number.isInteger(p) && p > 0 && p < 65536).slice(0, 32));
    const look = async () => { const found = await tryAll(); for (const c of found) if (!c.listening) { held.delete(c.port); before.delete(c.port); } return found; };
    let checked = await look(); let ended = false;



    const usual = waitS > 0 && basePort === null && !checked.some(isMine);
    const settled = () => {
      if (checked.some(appUp)) return true;
      if (busyNow(checked).length && (!(watch && watch.tied()) || Date.now() - began >= BUSY_WAIT_MS)) return true;
      if (!usual) return false;
      return checked.some((c) => c.listening && !before.has(c.port) && holderOf(c) !== 'other');
    };

    while (waitS > 0 && !settled() && Date.now() < until) {
      await new Promise((r) => setTimeout(r, UP_POLL_MS)); checked = await look();


      if (watch && !settled() && watch.ended()) { checked = await look(); if (!settled() && startFailure(watch.text(), cfg.projectDir).cause !== 'other') { ended = true; break; } }
    }
    const endedText = ended ? watch.text() : null;
    if (watch && typeof watch.done === 'function') watch.done();
    if (ended) {
      const key = watch.answeredKey(); if (key) answeredTies.add(key);
      const failure = startFailure(endedText, cfg.projectDir); failedStarts.set(cfg.projectDir, failure);
      return { json: { up: false, startEnded: true, cause: failure.cause, ...(failure.port ? { port: failure.port } : {}), ...(failure.install ? { install: failure.install } : {}), causeWords: startFailureWords(failure), checked: checked.filter(isMine).map((c) => ({ address: c.address, listening: c.listening })), ...(preview && clientAsks && lastStarts.has(cfg.projectDir) ? { againDialog: { name: START_TOOL, note: 'call it with the start question\'s own arguments and again: true' } } : {}), note: START_ENDED_NOTE } };
    }
    busyPorts.delete(cfg.projectDir);
    const mine = checked.filter(isMine);
    const answering = mine.filter(appUp).map((c) => c.address);
    if (answering.length) failedStarts.delete(cfg.projectDir);
    const taken = answering.length ? [] : busyNow(checked);
    if (taken.length) {
      const at = taken[0]; busyPorts.set(cfg.projectDir, { port: at.port });
      return { json: { up: false, portBusy: { address: at.address, port: at.port, words: 'Port ' + at.port + ' is in use by another program' }, checked: checked.map((c) => ({ address: c.address, listening: c.listening })), note: BUSY_NOTE } };
    }

    const unknownOwner = answering.length > 0 && mine.some((c) => c.listening && holderOf(c) === null);
    let others = checked.filter((c) => c.listening && !mine.includes(c));


    let otherPrograms = basePort === null ? mine.filter((c) => c.listening && holderOf(c) === 'other').map((c) => c.address) : []; let startedHere = [];
    if (basePort === null && !answering.length && others.length) {
      const whose = new Map(others.map((c) => [c, holderOf(c)]));
      otherPrograms = [...otherPrograms, ...others.filter((c) => whose.get(c) === 'other').map((c) => c.address)];
      startedHere = others.filter((c) => whose.get(c) === 'this').map((c) => c.address);
      others = others.filter((c) => whose.get(c) !== 'other').sort((a, b) => (whose.get(b) === 'this') - (whose.get(a) === 'this'));
    }
    const alsoListening = others.map((c) => c.address);
    const rest = { checked: checked.map((c) => ({ address: c.address, listening: c.listening })), ...(otherPrograms.length ? { otherPrograms } : {}), ...(more ? { notChecked: more + ' more ports the project names: one call tries ' + MOST_PORTS } : {}) };
    if (basePort === null && !answering.length && alsoListening.length) {
      const unsure = alsoListening.filter((a) => !startedHere.includes(a));


      const newlyAnswering = waitS > 0 ? others.filter((c) => !before.has(c.port)).map((c) => c.address) : [];
      const onlyBefore = waitS > 0 && !newlyAnswering.length;
      return { json: { up: null, onUsualPorts: alsoListening, ...(startedHere.length ? { startedHere } : {}), ...(newlyAnswering.length ? { newlyAnswering } : {}), ...rest, note: (startedHere.length ? 'a program running from this project\'s folder is listening at ' + startedHere.join(', ') + ', a usual port that this project\'s files do not name: most likely this app. ' : '') + (unsure.length ? 'something is listening at ' + unsure.join(', ') + ', a usual port that this project\'s files do not name, and which program it is could not be told: it may be this app or another program on this machine. ' : '') + (onlyBefore ? 'Each of them was already answering when status ran, so it may not be the server just started. ' : waitS > 0 ? 'Not seen answering before the start: ' + newlyAnswering.join(', ') + '. ' : '') + 'Ask the person; "baseUrl: http://localhost:<port>" in .claude-testrc settles it' + (otherPrograms.length ? '. At ' + otherPrograms.join(', ') + ' another program, working outside this project\'s folder, listens: it is not this app' : '') } };
    }
    const quiet = (mine.length ? mine : checked).filter((c) => !otherPrograms.includes(c.address)).map((c) => c.address);
    if (pane && answering.length) noteAppUp(cfg, answering[0]);
    return { json: { up: answering.length > 0, answering, ...(unknownOwner ? { ownerUnknown: true } : {}), ...(alsoListening.length ? { alsoListening } : {}), ...rest, ...(preview && clientAsks && !answering.length ? { startDialog: { name: START_TOOL, note: START_DIALOG_NOTE }, ...(startRemembered(cfg) ? { startAllowed: true } : {}) } : {}), note: answering.length ? 'something is listening there; the runner\'s first page load still decides that it is this app' + (unknownOwner ? ' (which program listens could not be told: the look\'s first page shows whether it is this app, as the run skill says for up: true with ownerUnknown)' : '') : (quiet.length ? 'nothing is listening at ' + quiet.join(', ') + ' on this machine, so the dev server is not running there.' : 'no program of this project is listening at the ports checked on this machine, so the dev server is not running there.') + (alsoListening.length ? ' Also listening, but not ' + (basePort === null ? 'an address the project names' : 'the app\'s address') + ': ' + alsoListening.join(', ') + '.' : '') + (otherPrograms.length ? ' Something listens at ' + otherPrograms.join(', ') + ', but its program works outside this project\'s folder: it is taken for another program, not this app.' : '') + ' If the app runs on another port, the baseUrl line in .claude-testrc must name it.' } };  }




  const startedFor = new Set(); let openerStarts = 0; const showing = new Set(); const cancelled = new Set();
  async function show(msg) {
    const id = msg.id; const args = msg.params.arguments;
    if (!args || typeof args !== 'object' || typeof args.project !== 'string' || !args.project || args.project.length > 4096 || typeof args.run !== 'string' || args.run.length > 32 || !RUN_ID.test(args.run)) return answer(id, 'Nothing was opened: pass livePageShow.arguments exactly as your own "ct.mjs new-run" printed them, { project: "<folder>", run: "<runId>" }.', true);
    let served; try { served = settings().served; } catch (e) { return answer(id, 'Nothing was opened: could not read the Claude Test settings here: ' + shown(e && e.message ? e.message : e, 300), true); }
    const cfg = pick(served, args.project);
    if (!cfg) return answer(id, 'Nothing was opened: this browser helper does not serve ' + shown(args.project, 300) + '. It serves ' + served.map((c) => shown(c.projectDir, 300)).join(', ') + '.', true);
    const key = cfg.projectDir + '\n' + args.run; const file = livePageFile(cfg, args.run); const byHand = openByHand(file, opening.platform);
    const say = (o) => answer(id, JSON.stringify({ ...o, ...(o.opened !== true && !o.linkOnly && !o.noPage && byHand ? { byHand } : {}) }));
    keepLivePage([cfg], { unpaced: true });
    const noPage = (why) => { const notOwn = notOwnWay(path.dirname(file)); return say({ opened: false, noPage: true, why: notOwn ? 'Claude Test opens no page while a folder it keeps its pages in is not yours alone or cannot be read: ' + shown(notOwn, 300) + '. Move or remove that folder and run again; Claude Test makes its folders for you alone' : why }); };
    const uid = 'uid' in opening ? opening.uid : typeof process.getuid === 'function' ? process.getuid() : null;
    const notMine = (f, d) => { const what = uid === null ? null : d.uid !== uid ? ['wrote', 'is owned by another user (uid ' + d.uid + ')'] : (d.mode & 0o022) !== 0 ? ['can change', 'is writable by group or other users (mode ' + (d.mode & 0o777).toString(8) + ')'] : null; return what && 'Claude Test opens no page that another account ' + what[0] + ': ' + shown(f, 300) + ' ' + what[1] + '. Move or remove the folder it is in and run again; Claude Test makes its folders for you alone'; };
    try {
      const d = fs.lstatSync(file); if (!plainWay(path.dirname(file)) || !d.isFile() || d.nlink > 1) return noPage('the page is not an ordinary file, or a folder on the way to it is a link');
      const pageNotMine = notMine(file, d); if (pageNotMine) return noPage(pageNotMine);
      const dataFile = path.join(path.dirname(file), 'live-data.js'); let dd = null; try { dd = fs.lstatSync(dataFile); } catch (e) { if (!e || e.code !== 'ENOENT') return noPage('Claude Test opens no page whose data file could not be read: ' + shown(dataFile, 300) + ' (' + shown(e && e.code ? e.code : 'no code', 40) + '). Move or remove the folder it is in and run again; Claude Test makes its folders for you alone');                                                                         }
      if (dd && (!dd.isFile() || dd.nlink > 1)) return noPage('Claude Test opens no page whose data file is a link or has a second name: ' + shown(dataFile, 300) + '. Move or remove the folder it is in and run again; Claude Test makes its folders for you alone');
      const dataNotMine = dd && notMine(dataFile, dd); if (dataNotMine) return noPage(dataNotMine);
    } catch { return noPage('the browser helper has not written a page for this run (is the run folder there?)'); }
    if (startedFor.has(key)) return say({ opened: false, why: 'this helper has already been asked for this run\'s page' });
    if (openerStarts >= MOST_PAGES_OPENED) return say({ opened: false, tooMany: true, why: 'this helper has opened ' + MOST_PAGES_OPENED + ' pages in this session and opens no more' });
    startedFor.add(key); openerStarts++; showing.add(id);
    let started = false; let r;
    await new Promise((turn) => setImmediate(turn));
    try { r = await openLivePage(cfg, args.run, { ...opening, file, start: (how, o) => { if (cancelled.has(id)) return Promise.resolve({ opened: false, why: 'it could not be started (the call was cancelled first)' }); started = true; return (opening.start || runOpener)(how, o); } }); }
    catch (e) { if (!started) { startedFor.delete(key); openerStarts--; } throw e; }
    finally { showing.delete(id); cancelled.delete(id); }
    if (started && r.opened === false && /could not be started/.test(r.why || '')) started = false;
    if (!started) { startedFor.delete(key); openerStarts--; }
    say({ opened: r.opened, ...(r.firstOpen && r.opened !== false ? { firstOpen: true } : {}), ...(r.meant === false ? { linkOnly: true } : {}), ...(r.opened === null ? { notKnown: true } : {}), ...(r.why ? { why: shown(r.why, 200) } : {}) });
  }

  const ASK_IN_WORDS = ' Ask as the run skill says where this dialog is not offered.';

  const notNow = () => (!preview ? 'Nothing was asked: in this session this question is not a dialog of Claude Code\'s own.' + ASK_IN_WORDS
    : !clientAsks ? 'Nothing was asked: this client did not say it can show the person a question (MCP elicitation).' + ASK_IN_WORDS
    : open ? 'A question is already on the person\'s screen. Wait for their answer; do not ask again.' : null);

  function servedOf(project) {
    let served; try { served = settings().served; } catch (e) { return { why: 'Nothing was asked: could not read the Claude Test settings here: ' + shown(e && e.message ? e.message : e, 300) }; }
    const cfg = pick(served, project);
    return cfg ? { cfg } : { why: 'Nothing was asked: this browser helper does not serve ' + shown(project, 300) + '. It serves ' + served.map((c) => shown(c.projectDir, 300)).join(', ') + '.' };
  }

  const shaped = (args, keys) => !!args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).every((k) => keys.includes(k)) && typeof args.project === 'string' && !!args.project && args.project.length <= 4096;


  function askChoice(id, kind, message, extra = {}) {
    const k = CHOICE_KINDS[kind];
    if (unanswered[kind] >= MOST_UNANSWERED) return answer(id, 'Nothing was asked: ' + unanswered[kind] + ' ' + k.what + ' ended without a yes in this session, so this helper asks no more of them. ' + k.noAnswer, true);
    if (asked >= MOST_ASKED) return answer(id, 'Nothing was asked: the person has been asked ' + asked + ' questions in this session, the most this helper asks. ' + k.noAnswer, true);
    asked++;
    const askId = idPrefix + (++seq);
    const timer = setTimeout(() => { if (open && open.askId === askId) close('the person did not answer in time', true); }, WAIT_MS); timer.unref();
    send({ jsonrpc: '2.0', id: askId, method: 'elicitation/create', params: { message, requestedSchema: extra.form || { type: 'object', properties: {} } } });
    open = { kind, askId, callId: id, extra, timer };
    if (extra.onAsked) extra.onAsked();
  }

  function appAddress(cfg) {
    if (cfg.baseOrigin) { let u; try { u = new URL(/^https?:\/\//.test(cfg.baseOrigin) ? cfg.baseOrigin : 'http://' + cfg.baseOrigin); } catch { return { far: false, address: null }; } return isLocalHost(u.hostname.replace(/^\[|\]$/g, '')) ? { far: false, address: u.origin } : { far: true, address: null }; }
    const named = [...ownPorts(cfg).ports.values()].find((p) => p.named);
    return { far: false, address: named ? named.address : null };
  }



  function startRemembered(cfg) {
    try {
      const where = appAddress(cfg); if (where.far || startNotAllowed(cfg, where.address) || busyPorts.get(cfg.projectDir)) return false;
      const dev = discoverDevServer(cfg); const command = dev.startCommand; const line = command ? cdAndStart(cfg.projectDir, dev.startCommandCwd, command) : null;
      if (!command || !line) return false;
      const source = dev.startCommandSource === RC_FILE ? RC_FILE : fallbackFile(dev.startCommandSource);
      return [false, true].some((outside) => startMatches(cfg.projectDir, startFacts(cfg.projectDir, dev.startCommandCwd, command, line, source, outside)));
    } catch { return false; }
  }

  function choiceBegin(msg) {
    const fail = (text) => answer(msg.id, text, true);
    const later = notNow(); if (later) return fail(later);
    const begin = { [START_TOOL]: startBegin, [RUN_TOOL]: runBegin, [BROWSER_TOOL]: browserBegin, [REMEMBER_TOOL]: rememberBegin }[msg.params.name];
    begin(msg.id, msg.params.arguments, fail, msg.params._meta);
  }



  function startNotAllowed(cfg, address) {
    let rec; try { rec = readConsent(cfg.projectDir); } catch (e) { return 'Nothing was asked, and nothing may be started: the record of allowed addresses could not be read: ' + shown(e && e.message ? e.message : e, 300); }
    if (rec.refused) return 'Nothing was asked, and nothing may be started: ' + shown(rec.refused, 600);
    if (address !== null ? rec.origins.has(consentKey(address)) : rec.origins.size > 0) return null;
    return 'Nothing was asked, and nothing may be started: ' + (address !== null ? shown(address, 120) + ' is' : 'no address of this project is') + ' not allowed for this project on this machine. The start comes only after the person\'s Accept in the address dialog (' + ALLOW_TOOL + '). When the allow call before this one recorded nothing, go by its answer; otherwise run "ct.mjs status" and ask about what waits under needsConsent first.';
  }


  function startBegin(id, args, fail) {
    if (!shaped(args, [...START.inputSchema.required, 'again', 'typed']) || (args.again !== undefined && typeof args.again !== 'boolean') || (args.typed !== undefined && typeof args.typed !== 'boolean') || typeof args.command !== 'string' || !args.command || args.command.length > 400 || typeof args.line !== 'string' || !args.line || args.line.length > 1000 || typeof args.sandbox !== 'string') return fail('Nothing was asked. Pass { project: devServer.check.arguments.project, command: devServer.startCommand, line: devServer.startLine, sandbox: "<the run skill\'s sandbox word>", background: "<the run skill\'s background word>" }, each exactly as "ct.mjs status" printed it.');
    if (!START_SANDBOXES.includes(args.sandbox) && !STAYS_PUT.includes(args.sandbox)) return fail('Nothing was asked: sandbox must be the word the run skill was loaded with, one of ' + [...START_SANDBOXES, ...STAYS_PUT].join(', ') + '.');
    if (args.background !== 'kept' && args.background !== 'none') return fail('Nothing was asked: background must be the word the run skill was loaded with, kept or none.');

    const yourself = args.background === 'none' || STAYS_PUT.includes(args.sandbox);
    if (yourself && !ASKS_YOURSELF.includes(args.sandbox) && STAYS_PUT.includes(args.sandbox)) return fail('Nothing was asked: with sandbox ' + args.sandbox + ' Claude Test starts nothing in this session, and the run skill\'s question for it names a setting, which this dialog cannot show. Ask as the run skill says under "They start it themselves".');
    if (yourself && args.again) return fail('Nothing was asked: Claude Test starts nothing in this session, so there is no start to try again.');
    const found = servedOf(args.project); if (found.why) return fail(found.why);
    const cfg = found.cfg; const where = appAddress(cfg);
    if (where.far) return fail('Nothing was asked: the app\'s base URL is not on this machine, so there is nothing to start here.');
    const notAllowed = startNotAllowed(cfg, where.address); if (notAllowed) return fail(notAllowed);
    const busy = busyPorts.get(cfg.projectDir); if (busy) return fail('Nothing was asked, and nothing may be started: the latest up check found port ' + busy.port + ' held by a program that works outside this project\'s folder, and a start there fails or moves to a port the check does not look at. Ask as the run skill says under "Port in use".');
    let dev; try { dev = discoverDevServer(cfg); } catch (e) { return fail('Nothing was asked: the project\'s files could not be read: ' + shown(e && e.message ? e.message : e, 300)); }


    const ownLine = dev.startCommand ? cdAndStart(cfg.projectDir, dev.startCommandCwd, dev.startCommand) : null;
    const asTyped = args.typed === true && !(args.command === dev.startCommand && args.line === ownLine);
    const picked = asTyped ? (Array.isArray(dev.startCommandCandidates) ? dev.startCommandCandidates : []).map((c) => (c && typeof c.command === 'string' && c.command === args.command ? { cwd: c.cwd || null, from: c.from, line: cdAndStart(cfg.projectDir, c.cwd || null, c.command) } : null)).find((x) => x && x.line && x.line === args.line) || null : null;
    const typed = asTyped && !picked;
    const command = asTyped ? args.command : dev.startCommand; const line = picked ? picked.line : typed ? cdAndStart(cfg.projectDir, null, command) : ownLine;
    const cwd = picked ? picked.cwd : typed ? null : dev.startCommandCwd;
    if (typed && (!line || /[\r\n]/.test(command))) return fail('Nothing was asked: that command cannot be started from the project folder here (status prints no cdPrefix for it, or the command is not one line). They start it themselves, as the run skill says.');
    if (typed && args.line !== line) return fail('Nothing was asked, and nothing may be started from it: with typed, line must be devServer.cdPrefix followed by the command, exactly. Run status again and pass them so.');
    if (!command || !line) return fail('Nothing was asked: "ct.mjs status" prints no single start command with a line for this project now. Run status again and go by what it prints. A command the person typed goes with typed: true.');
    if (!asTyped && (args.command !== command || args.line !== line)) return fail('Nothing was asked, and nothing may be started from it: that is not the start command and line that "ct.mjs status" prints for this project now, from its files. Run status again and pass devServer.startCommand and devServer.startLine exactly as it prints them. A command the person typed goes with typed: true.');

    if (shown(command, 4096) !== command || !commandLineClean(command) || (where.address !== null && shown(where.address, 4096) !== where.address)) return fail('Nothing was asked: the command or the app\'s address cannot be shown whole in Claude Code\'s dialog.' + ASK_IN_WORDS);
    const fits = (m) => { const lines = m.split('\n'); return lines.length <= START_LINES && lines.every((l) => columns(l) <= LINE_COLUMNS); };
    if (yourself && typed) return fail('Nothing was asked: Claude Test starts nothing in this session, and a command the person typed is theirs to start. Ask as the run skill says under "They start it themselves".');
    if (yourself) {
      if (shown(line, 4096) !== line) return fail('Nothing was asked: the line cannot be shown whole in Claude Code\'s dialog.' + ASK_IN_WORDS);
      const message = yourselfQuestion(where.address, line, command, notYet.has(cfg.projectDir));
      if (message === null || !fits(message)) return fail('Nothing was asked: the question is too long to show whole in Claude Code\'s dialog, in ' + START_LINES + ' lines of ' + LINE_COLUMNS + ' columns.' + ASK_IN_WORDS);
      return askChoice(id, 'yourself', message, {
        projectDir: cfg.projectDir,
        async onAccept() {
          const twice = notYet.has(cfg.projectDir); const now = servedOf(args.project); const again = await upLook(now.cfg || cfg, { project: args.project });
          if (again.error) return { up: null, note: again.error };
          const j = again.json; if (j.up !== false || j.portBusy || j.startEnded) { notYet.delete(cfg.projectDir); return j; }
          notYet.add(cfg.projectDir);
          return { ...j, line, note: twice ? YOURSELF_STILL_NOT : YOURSELF_NOT_YET };
        },
      });
    }
    const outside = args.sandbox === 'may-leave';

    const source = picked ? fallbackFile(picked.from) : asTyped ? null : dev.startCommandSource === RC_FILE ? RC_FILE : fallbackFile(dev.startCommandSource);
    const facts = startFacts(cfg.projectDir, cwd, command, line, source, outside);

    const folder = cwd ? path.relative(cfg.projectDir, path.resolve(cfg.projectDir, cwd)) : '';
    if (folder && (shown(folder, 4096) !== folder || !commandLineClean(folder))) return fail('Nothing was asked: the folder the app starts in cannot be shown whole in Claude Code\'s dialog.' + ASK_IN_WORDS);
    if (args.again) {
      const failure = failedStarts.get(cfg.projectDir);
      if (!failure) return fail('Nothing was asked: no start of this project was seen to stop by itself in this session. Pass again only right after the up check answered startEnded.');
      if (lastStarts.get(cfg.projectDir) !== line) return fail('Nothing was asked: again: true is only for the start this tool last answered "start" for in this project, with this command and line. Call it without again to ask the start question.');
      const message = againQuestion(startFailureWords(failure), command, { typed, folder: folder || null, outside });
      if (message === null || !fits(message)) return fail('Nothing was asked: the Try again question does not fit whole in the ' + START_LINES + ' lines of ' + LINE_COLUMNS + ' columns it may take.' + ASK_IN_WORDS);
      return askChoice(id, 'start', message, { line, again: true, projectDir: cfg.projectDir });
    }


    if (!failedStarts.has(cfg.projectDir) && startMatches(cfg.projectDir, facts)) { lastStarts.set(cfg.projectDir, line); return answer(id, JSON.stringify({ answer: 'start', remembered: true, line, note: START_REMEMBERED })); }
    const withForget = startQuestion(where.address, command, source, outside, true, typed, folder || null, typeof (facts && facts.runs) === 'string');
    const message = fits(withForget) ? withForget : startQuestion(where.address, command, source, outside, false, typed, folder || null, typeof (facts && facts.runs) === 'string');
    if (!fits(message)) return fail('Nothing was asked: the start question does not fit whole in the ' + START_LINES + ' lines of ' + LINE_COLUMNS + ' columns it may take.' + ASK_IN_WORDS);
    askChoice(id, 'start', message, { line, facts, projectDir: cfg.projectDir });
  }

  function newestRun(cfg) { try { const ids = runFolders(cfg); return ids[ids.length - 1] || null; } catch { return null; } }



  function noteAppUp(cfg, address) {
    try {
      const id = newestRun(cfg); if (!id) return; const dir = path.join(cfg.runsDir, id);
      if (fs.existsSync(path.join(dir, 'results.json'))) return;
      const was = paneNoteIn(dir); const state = was && was.app && typeof was.app === 'object' ? was.app.state : undefined;
      if (!['down', 'failed', 'busy'].includes(state)) return;
      let port = NaN; try { port = Number(new URL(address).port); } catch {            }
      writeInRunFolder(dir, 'pane.json', JSON.stringify({ ...was, app: { state: 'running', ...(Number.isInteger(port) && port >= 1 && port <= 65535 ? { port } : {}) } }) + '\n', 0o644, withinProject(cfg.projectDir));
    } catch {                                    }
  }


  function paneNote(msg) {
    const id = msg.id; const args = msg.params.arguments;
    const refuse = (why) => answer(id, 'Nothing was noted: ' + why + '. Go on without it, and say nothing of it.', true);
    if (!pane) return refuse('the panel is not on in this session');
    if (!shaped(args, ['project', 'app', 'about', 'look', 'stopped'])) return refuse('pass { project: status\'s projectDir } and only app, about, look or stopped');
    const found = servedOf(args.project); if (found.why) return answer(id, 'Nothing was noted: this browser helper cannot serve that project here. Go on without it, and say nothing of it.', true);
    const cfg = found.cfg; const note = {};
    const wordOf = (list, v) => (typeof v === 'string' && list.includes(v) ? v : null);
    const countOf = (v, most) => (Number.isInteger(v) && v >= 0 && v <= most ? v : null);
    let port = NaN; try { port = Number(new URL(cfg.baseUrl).port); } catch {                             }
    const ownPort = Number.isInteger(port) && port >= 1 && port <= 65535 ? { port } : {};
    if (args.app !== undefined) {
      const a = args.app; if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some((k) => !['state', 'cause', 'port', 'install'].includes(k))) return refuse('app takes state, cause, port and install only');
      const state = wordOf(PANE_STATES, a.state); if (state === null) return refuse('app.state is one of ' + PANE_STATES.join(', '));
      const cause = a.cause === undefined ? null : wordOf(START_CAUSES, a.cause); const hasPort = a.port !== undefined; const appPort = hasPort ? countOf(a.port, 65535) : null;
      const install = a.install === undefined ? null : wordOf(INSTALLERS, a.install);
      if ((a.cause !== undefined && cause === null) || (hasPort && (appPort === null || appPort < 1)) || (a.install !== undefined && install === null)) return refuse('app.cause, app.port or app.install is not one of its words or a port');
      if (state === 'failed') {
        if (cause === null || (hasPort && cause !== 'port') || (install !== null && cause !== 'packages')) return refuse('a failed start takes the up check\'s cause, with port only for port and install only for packages');
        note.app = { state, cause, ...(hasPort ? { port: appPort } : {}), ...(install !== null ? { install } : {}) };
      } else if (state === 'busy') {
        if (!hasPort || cause !== null || install !== null) return refuse('a busy port takes portBusy.port and nothing else');
        note.app = { state, port: appPort };
      } else {
        if (hasPort || cause !== null || install !== null) return refuse('app.state ' + state + ' takes nothing more');
        let command = null;

        if (state === 'started') { try { const dev = discoverDevServer(cfg); const c = dev.startCommand; if (typeof c === 'string' && PANE_COMMAND.test(c) && lastStarts.get(cfg.projectDir) === cdAndStart(cfg.projectDir, dev.startCommandCwd, c)) command = c; } catch {                  } }
        note.app = { state, ...(command !== null ? { command } : {}), ...(state === 'down' ? {} : ownPort) };
      }
    }
    if (args.about !== undefined) {
      const a = args.about; if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).length !== 3) return refuse('about takes signin, payments and data, all three');
      const about = {}; for (const k of Object.keys(PANE_ENUMS)) { const v = wordOf(PANE_ENUMS[k], a[k]); if (v === null) return refuse('about.' + k + ' is one of ' + PANE_ENUMS[k].join(', ')); about[k] = v; }
      const framework = frameworkOf(cfg.projectDir); const name = appNameOf(cfg.projectDir);
      note.about = { ...(framework ? { framework } : {}), ...about }; if (name) note.name = name;
    }
    if (args.look !== undefined) {
      const l = args.look; if (!l || typeof l !== 'object' || Array.isArray(l) || Object.keys(l).some((k) => !['kind', 'errors', 'failed'].includes(k))) return refuse('look takes kind, errors and failed only');
      const kind = wordOf(PANE_LOOKS, l.kind); if (kind === null) return refuse('look.kind is one of ' + PANE_LOOKS.join(', '));
      const look = { kind };
      for (const k of ['errors', 'failed']) { if (l[k] === undefined) continue; const n = countOf(l[k], 9999); if (n === null) return refuse('look.' + k + ' is a count'); look[k] = n; }
      note.look = look;
    }
    if (args.stopped !== undefined) { const s = wordOf(PANE_STOPS, args.stopped); if (s === null) return refuse('stopped is one of ' + PANE_STOPS.join(', ')); note.stopped = s; }
    if (!Object.keys(note).length) return refuse('there was nothing to note');
    const run = newestRun(cfg); if (!run) return refuse('there is no run folder yet');
    const dir = path.join(cfg.runsDir, run);
    if (fs.existsSync(path.join(dir, 'results.json'))) return refuse('the newest run folder holds a finished run');
    const was = paneNoteIn(dir) || {};
    if (Object.keys(note).some((k) => k !== 'stopped')) delete was.stopped;
    let why = null;
    if (!writeInRunFolder(dir, 'pane.json', JSON.stringify({ ...was, ...note }) + '\n', 0o644, withinProject(cfg.projectDir), (w) => { why = w; })) return refuse('the note could not be written' + (why ? ' (' + shown(why, 200) + ')' : ''));
    answer(id, JSON.stringify({ ok: true }));
  }



  function runBegin(id, args, fail) {
    if (!shaped(args, ['project', 'count', 'tests', 'notCovered']) || !Number.isInteger(args.count) || !Array.isArray(args.tests) || (args.notCovered !== undefined && !Array.isArray(args.notCovered))) return fail('Nothing was asked. Pass { project: status\'s projectDir, count: <n>, tests: ["<the outline\'s first line, without its number>", \u2026], notCovered: ["<a Not covered line>", \u2026] }.');
    const left = args.notCovered || [];
    if (args.count < 1 || args.count > MOST_OUTLINED || args.tests.length !== args.count) return fail('Nothing was asked: count must be the number of tests, 1 to ' + MOST_OUTLINED + ', with one string for each in tests.');
    if (left.length > 3) return fail('Nothing was asked: an outline names at most three things under "Not covered".');
    const tests = args.tests.map(outlineLine); const notCovered = left.map(outlineLine);
    if ([...tests, ...notCovered].includes(null)) return fail('Nothing was asked: each line must be text of at most ' + OUTLINE_LINE_CHARS + ' characters, not empty once control and invisible characters are taken out.');
    const found = servedOf(args.project); if (found.why) return fail(found.why);
    const message = outlineQuestion(tests, notCovered);
    if (message === null) return fail('Nothing was asked: the outline does not fit whole in the ' + OUTLINE_LINES + ' lines of ' + LINE_COLUMNS + ' columns it may take. Shorten its lines, or ask with AskUserQuestion, in the onboarding\'s words.');


    askChoice(id, 'run', message, {
      onAsked() {
        try { assertRunsDirInsideProject(found.cfg); const run = newestRun(found.cfg); const dir = run ? path.join(found.cfg.runsDir, run) : null; if (dir && !fs.existsSync(path.join(dir, 'results.json'))) writeInRunFolder(dir, ASKED_OUTLINE_FILE, JSON.stringify({ tests }) + '\n', 0o644, withinProject(found.cfg.projectDir)); } catch {                                                                                                                                     }
      },
    });
  }


  function browserBegin(id, args, fail, meta) {
    if (!shaped(args, ['project'])) return fail('Nothing was asked. Pass { project: status\'s projectDir }.');
    const found = servedOf(args.project); if (found.why) return fail(found.why);
    let missing; try { missing = browserMissing(found.cfg); } catch (e) { return fail('Nothing was asked: could not look for the test browser here: ' + shown(e && e.message ? e.message : e, 300)); }
    if (!missing) return fail('Nothing was asked: this machine is not missing its test browser now. Run "ct.mjs status" again and go by what it prints.');
    if (installing) return fail('Nothing was asked: the test browser is being installed now, after the person\'s Accept. Wait for that call\'s answer.');
    if (installDeclined) return fail('Nothing was asked: the person declined the install in this session, and that stands. ' + BROWSER_NO_ANSWER);
    if (essentialTrafficOnly()) return fail('Nothing was asked: Claude Code is set to essential network traffic only (CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC), so Claude Test does not download the test browser itself.');
    const headed = wantsHeaded();
    let toolsMissing = true; try { toolsMissing = !(mcpCliPath({ report: true }) && toolsInstallInfo()); } catch {                                              }
    const token = meta && typeof meta === 'object' && (typeof meta.progressToken === 'string' || typeof meta.progressToken === 'number') ? meta.progressToken : null;
    askChoice(id, 'browser', browserQuestion({ headed, toolsMissing }), {
      async onAccept() {
        const job = installing;
        let sent = -1;

        let noted = -1; let notedAt = 0;
        const note = (percent) => { const at = Date.now(); if (percent === noted && at - notedAt < 5000) return; noted = percent; notedAt = at; noteInstallProgress('installing', percent); };
        const tell = (percent) => {
          note(percent);
          const now = percent === null ? 0 : percent; if (token === null || now <= sent) return; sent = now;
          send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: now, total: 100, message: 'Installing the test browser\u2026' + (percent === null ? '' : ' ' + percent + '%') } });
        };
        const beat = setInterval(() => note(noted === -1 ? null : noted), 5000); beat.unref();
        let r; try { r = await install({ headed, onProgress: tell, signal: job.controller.signal }); } catch { r = { ok: false, cause: 'other', line: 'Claude Test couldn\'t install the test browser. Type /claude-test again to try once more.' }; } finally { clearInterval(beat); installing = null; }
        if (job.controller.signal.aborted) { noteInstallProgress('failed'); return { answer: 'install-failed', cause: 'other', line: 'The test browser install was stopped before it finished. Type /claude-test to start it again.', note: BROWSER_FAILED_NOTE }; }
        if (!r || r.ok !== true) { noteInstallProgress('failed'); return { answer: 'install-failed', cause: r && r.cause ? r.cause : 'other', line: r && r.line ? r.line : 'Claude Test couldn\'t install the test browser. Type /claude-test again to try once more.', note: BROWSER_FAILED_NOTE }; }
        if (installed) { let loaded = null; try { loaded = await installed(); } catch {                                                     } if (loaded instanceof Error) { noteInstallProgress('failed'); return { answer: 'install-failed', cause: 'other', line: 'The test browser was installed, but Claude Test couldn\'t load it. Type /claude-test again to try once more.', note: BROWSER_FAILED_NOTE }; } }
        noteInstallProgress('done', 100);
        return {};
      },
    });
  }

  function rememberBegin(id, args, fail) {
    if (!shaped(args, ['project'])) return fail('Nothing was asked. Pass { project: status\'s projectDir }. Make the offer in words, as the run skill says under "The offer to remember".');
    const found = servedOf(args.project); if (found.why) return fail(found.why);
    askChoice(id, 'remember', REMEMBER_QUESTION);
  }


  function settleChoice(o, msg) {
    const k = CHOICE_KINDS[o.kind];
    const said = !('error' in msg) && msg.result && typeof msg.result === 'object' && !Array.isArray(msg.result) ? msg.result.action : undefined;
    if (said !== 'accept' && o.kind === 'yourself') notYet.delete(o.extra.projectDir);
    if (said === 'decline') { if (o.kind === 'browser') installDeclined = true; else if (o.kind !== 'run') unanswered[o.kind]++; }
    if (said !== 'accept' && said !== 'decline') { unanswered[o.kind]++; return answer(o.callId, noAnswer(o.kind, said === 'cancel' ? 'the question was closed without an answer' : 'the question could not be put to the person')); }
    if (said === 'accept' && !formCame(msg.result)) { unanswered[o.kind]++; return answer(o.callId, noAnswer(o.kind, NO_FORM)); }
    const got = (o.extra.again ? AGAIN_ANSWERS : k.answers)[said];
    if (o.kind === 'start' && said === 'accept') lastStarts.set(o.extra.projectDir, o.extra.line);
    let kept = {}; if (o.kind === 'start' && said === 'accept' && !o.extra.again) { let why; try { why = writeStart(o.extra.projectDir, o.extra.facts); } catch (e) { why = String(e && e.message ? e.message : e); } kept = why ? { saved: false, notSaved: shown(why, 300) } : { saved: true }; }
    const told = { answer: got.answer, chose: said === 'accept' ? 'Accept' : 'Decline', ...(o.kind === 'remember' && said === 'accept' ? { file: REMEMBER_FILE } : {}), ...(o.kind === 'start' && (said === 'accept' || o.extra.again) ? { line: o.extra.line, ...kept } : {}), note: got.note };
    const rechecks = o.kind === 'yourself';
    if (o.kind === 'browser' && said === 'accept') installing = { callId: o.callId, controller: new AbortController() };
    if (said === 'accept' && o.extra.onAccept) return Promise.resolve(msg.result.content).then(o.extra.onAccept).catch(() => (rechecks ? { up: null, note: 'the check could not be made again: call the up check again' } : { answer: 'install-failed', cause: 'other', line: 'Claude Test couldn\'t install the test browser. Type /claude-test again to try once more.', note: BROWSER_FAILED_NOTE })).then((more) => answer(o.callId, JSON.stringify(rechecks ? { answer: told.answer, chose: told.chose, ...more, rechecked: true } : { ...told, ...more })));
    answer(o.callId, JSON.stringify(told));
  }

  function begin(msg) {
    const id = msg.id; const args = msg.params.arguments;
    const fail = (text) => answer(id, text, true);
    if (!clientAsks) return fail('Nothing was recorded: this client did not say it can show the person a question (MCP elicitation), and only their answer in such a dialog allows an address. Use Claude Test from a Claude Code terminal session.');
    if (open) return fail('A question is already on the person\'s screen. Wait for their answer; do not ask again.');
    if (!args || typeof args !== 'object' || typeof args.address !== 'string' || !args.address.trim() || args.address.length > 300 || typeof args.project !== 'string' || !args.project || args.project.length > 4096) return fail('Pass { address: "<one address>", project: "<folder>" } exactly as "ct.mjs status" prints them under needsConsent.tool.arguments.');
    let served; try { served = settings().served; } catch (e) { return fail('Could not read the Claude Test settings here: ' + shown(e && e.message ? e.message : e, 300)); }
    const cfg = pick(served, args.project);
    if (!cfg) return fail('Nothing was asked: this browser helper does not serve ' + shown(args.project, 300) + '. It serves ' + served.map((c) => shown(c.projectDir, 300)).join(', ') + '. Pass needsConsent.tool.arguments as "ct.mjs status" printed them there.');
    const rec = readConsent(cfg.projectDir);
    if (rec.refused) return fail('Nothing was asked: ' + shown(rec.refused, 600));
    const k = consentKey(args.address); const h = args.address.trim().toLowerCase();
    const isOrigin = cfg.pendingOrigins.includes(k);
    if (!isOrigin && !cfg.pendingHosts.some((p) => p.toLowerCase() === h)) {
      if (rec.origins.has(k) || rec.hosts.has(h)) return answer(id, JSON.stringify({ ok: true, alreadyAllowed: [shown(args.address, 120)], file: rec.file, note: 'nothing to ask: already allowed for this project on this machine' }));
      return fail('Nothing was asked and nothing was changed: this project is not waiting for ' + shown(args.address, 120) + ' ("ct.mjs status" lists what it is waiting for, under needsConsent).');
    }
    const address = isOrigin ? k : h; const plainFolder = folderShown(cfg.projectDir); const folder = PREVIEW ? folderLines(plainFolder) : plainFolder;

    if (shown(address, 4096) !== address || columns(WHO + address) > LINE_COLUMNS) return fail('Nothing was asked: ' + shown(address, 120) + ' cannot be shown whole in the question (it takes more than ' + (LINE_COLUMNS - WHO.length) + ' columns), so it cannot be allowed. Tell the person.');
    if (!PREVIEW && (folder === null || columns('Project: ' + folder) > LINE_COLUMNS)) return fail('Nothing was asked: the project folder\'s path cannot be shown whole in the question (it takes more than ' + (LINE_COLUMNS - 9) + ' columns, or holds a character that cannot be shown or a run of spaces), so nothing can be allowed for it. Tell the person; the project would have to sit at a shorter or plainer path.');
    if (plainFolder === null) return fail('Nothing was asked: the project folder\'s path cannot be shown whole in the question: it holds a character that cannot be shown, or a run of spaces. So nothing can be allowed for it. Tell the person; the project would have to sit at a plainer path.');
    if (folder === null) return fail('Nothing was asked: the project folder\'s path cannot be shown whole in the question, even on two lines: it is too long. So nothing can be allowed for it. Tell the person; the project would have to sit at a shorter path.');
    const message = PREVIEW ? previewQuestion(folder, address, isOrigin) : question(folder, address, isOrigin); const lines = message.split('\n');
    if (PREVIEW && (lines.length > QUESTION_LINES || lines.some((line) => columns(line) > LINE_COLUMNS) || !('\n' + message + '\n').includes('\n' + 'Project: ' + folder + '\n'))) return fail('Nothing was asked: ' + address + ' and the project folder\'s path together cannot be shown whole in the question. Claude Code shows at most ' + QUESTION_LINES + ' lines of it, and the question for this address has no spare line for a path on two lines. So ' + address + ' cannot be allowed for this project. Tell the person; the project would have to sit at a path of at most ' + (LINE_COLUMNS - 'Project: '.length) + ' characters (a letter outside plain ASCII counts as two), with ~ for the home folder, which fits on one line.');
    if (declined.has(cfg.projectDir + '\n' + address)) return fail('Nothing was asked: the person already said no to ' + address + ' in this session, and that no stands. Do not ask again. If they change their mind, a new Claude Code session asks afresh.');
    if (withoutYes >= MOST_QUESTIONS) return fail('Nothing was asked: ' + withoutYes + ' questions in this session ended without a yes, so this helper asks no more in this session. What still waits can be asked about in a new Claude Code session.');
    if (asked >= MOST_ASKED) return fail('Nothing was asked: the person has been asked ' + asked + ' questions in this session, the most this helper asks. What still waits can be asked about in a new Claude Code session.');
    asked++;
    const askId = idPrefix + (++seq);
    const timer = setTimeout(() => { if (open && open.askId === askId) close('the person did not answer in time', true); }, WAIT_MS); timer.unref();
    send({ jsonrpc: '2.0', id: askId, method: 'elicitation/create', params: PREVIEW ? { message, requestedSchema: { type: 'object', properties: {} } } : { message, requestedSchema: tickBox(address, isOrigin) } });
    open = { askId, callId: id, projectDir: cfg.projectDir, address, isOrigin, file: rec.file, timer };
  }


  function settle(msg) {
    const o = open; open = null; clearTimeout(o.timer);
    if (o.kind) return settleChoice(o, msg);
    const said = !('error' in msg) && msg.result && typeof msg.result === 'object' && !Array.isArray(msg.result) ? msg.result.action : undefined;
    if (said === 'decline') declined.add(o.projectDir + '\n' + o.address);
    if (said !== 'accept') { withoutYes++; return answer(o.callId, 'Nothing was recorded: ' + (said === 'decline' ? 'the person declined. That is their no' : said === 'cancel' ? 'the question was closed without an answer' : 'the question could not be put to the person') + '. Start no run, and record nothing any other way.', true); }
    const filled = msg.result.content;
    if (PREVIEW && (!filled || typeof filled !== 'object' || Array.isArray(filled))) { withoutYes++; return answer(o.callId, 'Nothing was recorded: the answer came back without the dialog\'s form, and only Accept in Claude Code\'s own dialog is a yes. Start no run, and record nothing any other way.', true); }
    if (!PREVIEW && (!filled || typeof filled !== 'object' || Array.isArray(filled) || filled.allow !== true)) { withoutYes++; return answer(o.callId, 'Nothing was recorded: the answer came back without the box ticked, and only a ticked box is a yes. Start no run, and record nothing any other way.', true); }
    let why; try { why = writeConsent(o.projectDir, o.isOrigin ? { origins: [o.address] } : { hosts: [o.address] }); } catch (e) { why = String(e && e.message ? e.message : e); }
    if (why) { withoutYes++; return answer(o.callId, 'The person accepted, but the record could not be written: ' + shown(why, 600), true); }
    if (o.isOrigin) { if (!yeses.has(o.projectDir)) yeses.set(o.projectDir, new Set()); yeses.get(o.projectDir).add(o.address); }
    const restart = 'this session\'s test browser started before this yes: restart Claude Code once for it to open ' + o.address;
    const recorded = (when) => answer(o.callId, JSON.stringify({ ok: true, allowed: [o.address], file: o.file, note: 'for this project on this machine only; ' + when + '. Run "ct.mjs status" again: it names the next address waiting, if any' }));
    const cannot = o.isOrigin && built && preview && rebuildsLater ? rebuildsLater() : null;
    if (o.isOrigin && built && preview && rebuildsLater && !cannot) {
      recorded('the test browser takes it at its next browser_navigate or browser_close outside a run (the next run\'s first page load counts), with no restart of Claude Code');
      return;
    }
    recorded(!o.isOrigin ? 'a load-only host applies from the next run' : built ? restart + (cannot ? ' (' + cannot + ')' : '') : 'the test browser starts with it at its next use in this session');
  }

  function take(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return false;
    if (msg.method === 'initialize') { const caps = msg.params && typeof msg.params === 'object' ? msg.params.capabilities : null; clientAsks = !!(caps && typeof caps === 'object' && caps.elicitation && typeof caps.elicitation === 'object'); return false; }
    if (msg.method === 'tools/call' && msg.id !== undefined && msg.params && typeof msg.params === 'object' && msg.params.name === ALLOW_TOOL) { try { begin(msg); } catch (e) { answer(msg.id, 'Nothing was recorded: ' + shown(e && e.message ? e.message : e, 300), true); } return true; }
    if (msg.method === 'tools/call' && msg.id !== undefined && msg.params && typeof msg.params === 'object' && msg.params.name === UP_TOOL) { up(msg).catch((e) => answer(msg.id, 'Nothing was checked: ' + shown(e && e.message ? e.message : e, 300), true)); return true; }
    if (msg.method === 'tools/call' && msg.id !== undefined && msg.params && typeof msg.params === 'object' && msg.params.name === SHOW_TOOL) { show(msg).catch((e) => answer(msg.id, 'Nothing was opened: ' + shown(e && e.message ? e.message : e, 300), true)); return true; }
    if (msg.method === 'tools/call' && msg.id !== undefined && msg.params && typeof msg.params === 'object' && msg.params.name === PANE_NOTE_TOOL) { try { paneNote(msg); } catch (e) { answer(msg.id, 'Nothing was noted: ' + shown(e && e.message ? e.message : e, 300), true); } return true; }
    if (msg.method === 'tools/call' && msg.id !== undefined && msg.params && typeof msg.params === 'object' && CHOICE_TOOLS.includes(msg.params.name)) { try { choiceBegin(msg); } catch (e) { answer(msg.id, 'Nothing was asked: ' + shown(e && e.message ? e.message : e, 300), true); } return true; }
    if (runTools.take(msg)) return true;
    if (msg.method === 'notifications/cancelled' && msg.params && showing.has(msg.params.requestId)) { cancelled.add(msg.params.requestId); return true; }
    if (msg.method === 'notifications/cancelled' && installing && msg.params && msg.params.requestId === installing.callId) { installing.controller.abort(); return true; }
    if (msg.method === 'notifications/cancelled' && open && msg.params && msg.params.requestId === open.callId) { close('the call was cancelled', false); return true; }
    if (typeof msg.method !== 'string' && typeof msg.id === 'string' && msg.id.startsWith(idPrefix)) { if (open && msg.id === open.askId) settle(msg); return true; }
    return false;
  }
  function takeLine(line) {
    if (!open && !showing.size && !installing && !OWN_TOOLS.some((name) => line.includes(name)) && !runTools.names.some((name) => line.includes(name)) && !line.includes('"initialize"')) return false;
    let msg; try { msg = JSON.parse(line); } catch { return false; }
    return take(msg);
  }
  return { tools: [PREVIEW ? PREVIEW_TOOL : TOOL, UP, SHOW, ...(pane ? [PANE_NOTE] : []), ...(preview ? [START, RUN_Q, BROWSER_Q, REMEMBER_Q] : []), ...runTools.tools], take, takeLine, fenceBuilt() { built = true; }, fenceRebuilds(check) { rebuildsLater = typeof check === 'function' ? check : () => null; }, recordedHere: (projectDir) => new Set(yeses.get(projectDir) || []), afterInstall(fn) { installed = fn; }, isInstalling() { return installing !== null; }, scrubWith(scrub, stateOf) { runTools.scrubWith(scrub, stateOf); }, runValueWith(stateOf, forget) { runTools.runValueWith(stateOf, forget); }, runValues: () => runTools.runValues() };
}
