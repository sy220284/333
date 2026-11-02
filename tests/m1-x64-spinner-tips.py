#!/usr/bin/env python3
"""Exercise custom spinner tips in a real PTY against both CLI programs."""
import argparse
import fcntl
import http.server
import json
import os
import pty
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
        'lastOnboardingVersion': '2.1.310',
        'theme': 'dark',
        'customApiKeyResponses': {'approved': ['local-only'], 'rejected': []},
        'projects': {str(project): {'hasTrustDialogAccepted': True}},
    }), encoding='utf-8')
    calls = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.send_response(200)
            self.end_headers()

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))))
            calls.append(body)
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
    first_sent = second_sent = False
    start = time.monotonic()
    try:
        while time.monotonic() - start < 35 and process.poll() is None:
            ready, _, _ = select.select([master], [], [], 0.2)
            if ready:
                try:
                    output.extend(os.read(master, 65536))
                except OSError:
                    break
            elapsed = time.monotonic() - start
            if not first_sent and elapsed > 5:
                os.write(master, b'hello\r')
                first_sent = True
            if first_sent and not second_sent and b'PROBE_DONE' in output and elapsed > 7:
                os.write(master, b'another question\r')
                second_sent = True
            normalized = re.sub(r'\s+', '', ANSI.sub('', output.decode('utf-8', errors='replace')))
            if second_sent and len(calls) >= 2 and EXPECTED in normalized:
                return {'mode': mode, 'passed': True, 'requests': len(calls)}
        normalized = re.sub(r'\s+', '', ANSI.sub('', output.decode('utf-8', errors='replace')))
        return {'mode': mode, 'passed': False, 'requests': len(calls), 'output_tail': normalized[-1000:]}
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
    print(json.dumps(report))
    if not all(case['passed'] for cases in report.values() for case in cases):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
