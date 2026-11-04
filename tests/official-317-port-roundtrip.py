#!/usr/bin/env python3
"""317 原生 CLI 与整包 JS 移植版的本地 API/Read 工具真实往返验收。"""
import argparse
from contextlib import contextmanager
import http.server
import json
import os
from pathlib import Path
import socketserver
import subprocess
import tempfile
import threading

CONTENT = 'OFFICIAL317_PORT_TOOL_READ_CONFIRMED\n'

def event(name, item):
    return f'event: {name}\ndata: {json.dumps(item, ensure_ascii=False, separators=(",", ":"))}\n\n'

@contextmanager
def fake_anthropic(fixture):
    calls = []
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            raw = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            req = json.loads(raw)
            calls.append(req)
            n = len(calls)
            msg = {'id': f'msg_317_port_{n}', 'type': 'message', 'role': 'assistant',
                   'model': req.get('model', 'claude-sonnet-5-5'), 'content': [],
                   'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 40, 'output_tokens': 0}}
            body = event('message_start', {'type': 'message_start', 'message': msg})
            if n == 1:
                body += event('content_block_start', {'type': 'content_block_start', 'index': 0,
                    'content_block': {'type': 'tool_use', 'id': 'toolu_port_read', 'name': 'Read', 'input': {}}})
                body += event('content_block_delta', {'type': 'content_block_delta', 'index': 0,
                    'delta': {'type': 'input_json_delta', 'partial_json': json.dumps({'file_path': str(fixture)})}})
                reason = 'tool_use'
            else:
                body += event('content_block_start', {'type': 'content_block_start', 'index': 0,
                    'content_block': {'type': 'text', 'text': ''}})
                body += event('content_block_delta', {'type': 'content_block_delta', 'index': 0,
                    'delta': {'type': 'text_delta', 'text': 'OFFICIAL317_PORT_DONE'}})
                reason = 'end_turn'
            body += event('content_block_stop', {'type': 'content_block_stop', 'index': 0})
            body += event('message_delta', {'type': 'message_delta',
                'delta': {'stop_reason': reason, 'stop_sequence': None}, 'usage': {'output_tokens': 5}})
            body += event('message_stop', {'type': 'message_stop'})
            payload = body.encode('utf8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        def log_message(self, *_):
            return
    class Server(socketserver.TCPServer):
        allow_reuse_address = True
    with Server(('127.0.0.1', 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_address[1], calls
        finally:
            server.shutdown()
            thread.join(timeout=5)


def run(command, name, temp_root):
    work = temp_root / name
    cwd = work / 'workspace'
    cwd.mkdir(parents=True)
    home = work / 'home'
    home.mkdir()
    fixture = cwd / 'fixture.txt'
    fixture.write_text(CONTENT, encoding='utf8')
    with fake_anthropic(fixture) as (port, calls):
        env = {**os.environ, 'HOME': str(home), 'XDG_CONFIG_HOME': str(home / '.config'),
               'XDG_CACHE_HOME': str(home / '.cache'), 'TERM': 'dumb', 'ANTHROPIC_API_KEY': 'fake-local-test-key',
               'ANTHROPIC_BASE_URL': f'http://127.0.0.1:{port}', 'HTTP_PROXY': 'http://127.0.0.1:9',
               'HTTPS_PROXY': 'http://127.0.0.1:9', 'NO_PROXY': '127.0.0.1,localhost',
               'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1'}
        cmd = [*command, '--safe-mode', '--print', '--no-session-persistence',
               '--output-format', 'json', '--tools', 'Read', '--model', 'sonnet',
               'Read the fixture.txt file and report what it contains.']
        proc = subprocess.run(cmd, cwd=cwd, env=env, input='', text=True,
                              capture_output=True, timeout=75)
    if proc.returncode != 0 or len(calls) != 2:
        raise AssertionError(f'{name} exit={proc.returncode}, calls={len(calls)}\n'
                             f'stdout={proc.stdout[-1200:]}\nstderr={proc.stderr[-1800:]}')
    results = []
    for message in calls[1].get('messages', []):
        for block in message.get('content', []) if isinstance(message.get('content'), list) else []:
            if block.get('type') == 'tool_result':
                results.append(block)
    if not results or CONTENT.strip() not in str(results) or not any(not b.get('is_error') for b in results):
        raise AssertionError(f'{name} Read result invalid: {str(results)[:1800]}')
    if 'OFFICIAL317_PORT_DONE' not in proc.stdout:
        raise AssertionError(f'{name} final assistant message missing: {proc.stdout[-1000:]}')
    first = calls[0]
    return {'name': name, 'request_count': len(calls),
            'tool_names': sorted(t['name'] for t in first.get('tools', [])),
            'system_parts': len(first.get('system', [])) if isinstance(first.get('system'), list) else None,
            'response_has_read': True, 'exit': proc.returncode}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--official', type=Path, required=True)
    parser.add_argument('--ported', type=Path, required=True)
    args = parser.parse_args()
    official = args.official.resolve()
    ported = args.ported.resolve()
    if not official.is_file() or not ported.is_file():
        parser.error('Official executable and ported CLI must exist')
    with tempfile.TemporaryDirectory(prefix='333-317-both-') as tmp:
        root = Path(tmp)
        baseline = run([str(official)], 'native', root)
        candidate = run(['bun', str(ported)], 'ported', root)
    if baseline['tool_names'] != candidate['tool_names'] or baseline['system_parts'] != candidate['system_parts']:
        raise AssertionError(json.dumps({'native': baseline, 'ported': candidate}, ensure_ascii=False))
    print(json.dumps({'native': baseline, 'ported': candidate, 'match': True}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()