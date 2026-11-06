#!/usr/bin/env python3
"""Exercise custom spinner tips in a real PTY against both CLI programs."""
import argparse
import fcntl
import http.server
import json
import os
import pty
import pyte
import re
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import threading
import time
from pathlib import Path

ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\\\)')
EXPECTED = 'TeamQA:PROBE_ORGANIZATION_TIP'
FIRST_PROMPT = 'SPINNER_FIRST_MARKER'
SECOND_PROMPT = 'SPINNER_SECOND_MARKER'
ANSWER = 'PROBE_DONE'
TARGET_RELEASE = json.loads((Path(__file__).resolve().parent.parent / 'docs/upgrade/m1-evidence/target-release.json').read_text('utf-8'))['target_version']


def message_has_text(message, role, expected):
    if message.get('role') != role:
        return False
    content = message.get('content')
    if isinstance(content, str):
        return content.strip() == expected
    if isinstance(content, list):
        return any(isinstance(block, dict) and block.get('type') == 'text'
                   and isinstance(block.get('text'), str)
                   and block['text'].strip() == expected for block in content)
    return False


def is_first_turn_request(body):
    messages = body.get('messages', [])
    return (any(message_has_text(m, 'user', FIRST_PROMPT) for m in messages)
            and not any(message_has_text(m, 'assistant', ANSWER) for m in messages)
            and not any(message_has_text(m, 'user', SECOND_PROMPT) for m in messages))


def is_second_turn_request(body):
    stages = [('user', FIRST_PROMPT), ('assistant', ANSWER), ('user', SECOND_PROMPT)]
    stage = 0
    for message in body.get('messages', []):
        role, value = stages[stage]
        if message_has_text(message, role, value):
            stage += 1
            if stage == len(stages):
                return True
    return False


def sse_frame(event, data):
    return ('event: ' + event + '\ndata: ' + json.dumps(data) + '\n\n').encode()


def probe(executable, mode):
    home = Path(tempfile.mkdtemp(prefix='333-spinner-parity-'))
    project = home / 'project'
    project.mkdir()
    (home / '.claude').mkdir()
    tip = {'id': 'tip1', 'text': 'PROBE_ORGANIZATION_TIP'}
    override = {'excludeDefault': True, 'label': 'Team QA'}
    if mode == 'file':
        tip_file = home / 'tips.json'
        tip_file.write_text(json.dumps({'tips': [tip]}), encoding='utf-8')
        override['tipsFile'] = str(tip_file)
    else:
        override['tips'] = [tip]
    (home / '.claude' / 'settings.json').write_text(
        json.dumps({'spinnerTipsOverride': override}), encoding='utf-8'
    )
    (home / '.claude.json').write_text(json.dumps({
        'hasCompletedOnboarding': True,
        'lastOnboardingVersion': TARGET_RELEASE,
        'theme': 'dark',
        'customApiKeyResponses': {'approved': ['local-only'], 'rejected': []},
        'projects': {str(project): {'hasTrustDialogAccepted': True}},
    }), encoding='utf-8')
    calls = []
    first_response_finished = threading.Event()
    second_turn_requested = threading.Event()
    first_finished_at = [None]

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.send_response(200)
            self.end_headers()

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))))
            calls.append(body)
            if is_second_turn_request(body):
                second_turn_requested.set()
            if len(calls) > 1:
                time.sleep(8)
            model = body.get('model', 'claude-sonnet-4-6')
            frames = b''.join([
                sse_frame('message_start', {'type': 'message_start', 'message': {'id': 'msg_probe', 'type': 'message', 'role': 'assistant', 'model': model, 'content': [], 'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 10, 'output_tokens': 2}}}),
                sse_frame('content_block_start', {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}}),
                sse_frame('content_block_delta', {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': 'PROBE_DONE'}}),
                sse_frame('content_block_stop', {'type': 'content_block_stop', 'index': 0}),
                sse_frame('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn', 'stop_sequence': None}, 'usage': {'output_tokens': 2}}),
                sse_frame('message_stop', {'type': 'message_stop'}),
            ])
            try:
                self.send_response(200)
                self.send_header('content-type', 'text/event-stream')
                self.send_header('content-length', str(len(frames)))
                self.end_headers()
                self.wfile.write(frames)
                self.wfile.flush()
                if is_first_turn_request(body):
                    first_finished_at[0] = time.monotonic()
                    first_response_finished.set()
            except BrokenPipeError:
                pass

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    blocked = ('CLAUDE', 'ANTHROPIC', 'TOKEN', 'SECRET', 'PASSWORD', 'API_KEY', 'GITHUB', 'AWS_', 'GOOGLE_')
    env = {key: value for key, value in os.environ.items() if not any(word in key.upper() for word in blocked)}
    env.update({
        'HOME': str(home), 'USERPROFILE': str(home), 'XDG_CONFIG_HOME': str(home),
        'XDG_CACHE_HOME': str(home), 'TERM': 'xterm-256color',
        'ANTHROPIC_API_KEY': 'local-only',
        'ANTHROPIC_BASE_URL': 'http://127.0.0.1:' + str(server.server_port),
        'NO_PROXY': '127.0.0.1,localhost', 'DISABLE_TELEMETRY': '1',
        'DISABLE_ERROR_REPORTING': '1', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1',
    })
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 130, 0, 0))
    process = subprocess.Popen([str(Path(executable).resolve())], cwd=project, env=env,
                               stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    output = bytearray()
    screen = pyte.Screen(130, 40)
    terminal = pyte.ByteStream(screen)
    tip_seen = False
    second_sent_at = None
    first_sent = second_sent = False
    second_output_start = None
    normalized_second = ''
    frame_snapshots = []
    last_capture = 0.0
    start = time.monotonic()
    try:
        while time.monotonic() - start < 35 and process.poll() is None:
            ready, _, _ = select.select([master], [], [], 0.2)
            if ready:
                try:
                    chunk = os.read(master, 65536)
                    output.extend(chunk)
                    terminal.feed(chunk)
                except OSError:
                    break
            elapsed = time.monotonic() - start
            if not first_sent and elapsed > 5:
                os.write(master, (FIRST_PROMPT + '\r').encode())
                first_sent = True
            if (first_sent and not second_sent and first_response_finished.is_set()
                    and time.monotonic() - first_finished_at[0] > 1.5):
                second_output_start = len(output)
                os.write(master, (SECOND_PROMPT + '\r').encode())
                second_sent = True
                second_sent_at = time.monotonic()
            visible_screen = '\n'.join(line.rstrip() for line in screen.display).strip()
            normalized_second = re.sub(r'\s+', '', visible_screen) if second_sent else ''
            tip_seen = tip_seen or (second_turn_requested.is_set() and EXPECTED in normalized_second)
            if second_sent and second_output_start is not None and time.monotonic() - last_capture >= 0.25:
                last_capture = time.monotonic()
                frame_text = visible_screen
                visible = ''.join(c for c in frame_text[-240:] if c.isprintable() or c in '\n\t')
                glyphs = re.findall(r'[·✢✳✶✻✽]', visible)
                frame_snapshots.append({
                    'elapsed_ms': round((last_capture - start) * 1000),
                    'visible_tail': visible[-160:],
                    'last_glyph': glyphs[-1] if glyphs else None,
                    'raw_size_bytes': len(output),
                })
            if tip_seen and second_sent_at is not None and time.monotonic() - second_sent_at >= 12:
                return {'mode': mode, 'passed': True, 'requests': len(calls),
                        'first_response_completed': True, 'second_turn_requested': True,
                        'tip_seen_after_second_prompt': True,
                        'ui_frame_snapshots': frame_snapshots,
                        'ui_frames_captured': len(frame_snapshots)}
        normalized = re.sub(r'\s+', '', ANSI.sub('', output.decode('utf-8', errors='replace')))
        return {'mode': mode, 'passed': False, 'requests': len(calls),
                'first_response_completed': first_response_finished.is_set(),
                'second_prompt_sent': second_sent, 'second_turn_requested': second_turn_requested.is_set(),
                'tip_seen_after_second_prompt': tip_seen,
                'output_tail': normalized[-1000:],
                'ui_frame_snapshots': frame_snapshots,
                'ui_frames_captured': len(frame_snapshots)}
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
        os.close(master)
        server.shutdown()
        server.server_close()
        shutil.rmtree(home)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reference', required=True)
    parser.add_argument('--candidate')
    args = parser.parse_args()
    report = {}
    for name, executable in [('reference', args.reference), ('candidate', args.candidate)]:
        if executable:
            report[name] = [probe(executable, mode) for mode in ('inline', 'file')]
    # Preserve time-stamped terminal frames from both real x64 CLIs for
    # follow-on pixel/TTY inspection. A passed tip probe alone does not prove
    # equal animation timing, so report the comparison separately.
    if 'reference' in report and 'candidate' in report:
        report['frame_comparison'] = {}
        for index, mode in enumerate(('inline', 'file')):
            official = report['reference'][index]
            rebuilt = report['candidate'][index]
            official_glyphs = sorted({f['last_glyph'] for f in official['ui_frame_snapshots'] if f['last_glyph']})
            candidate_glyphs = sorted({f['last_glyph'] for f in rebuilt['ui_frame_snapshots'] if f['last_glyph']})
            report['frame_comparison'][mode] = {
                'reference_frame_count': official['ui_frames_captured'],
                'candidate_frame_count': rebuilt['ui_frames_captured'],
                'reference_glyphs': official_glyphs,
                'candidate_glyphs': candidate_glyphs,
                'glyph_set_equal': official_glyphs == candidate_glyphs,
                'per_frame_visual_equivalence': 'NOT_VERIFIED',
            }
    print(json.dumps(report))
    cases = [case for name, value in report.items() if name in ('reference', 'candidate') for case in value]
    if not all(case['passed'] for case in cases):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
