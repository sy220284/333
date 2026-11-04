#!/usr/bin/env python3
"""Compare official 317 x64 with independently rebuilt 333 TypeScript CLI via real mock API.

Offline fake API, fresh HOME and workspace per case; authentic tool calls and disk side-effects.
"""
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


def sse(name, payload):
    return f'event: {name}\ndata: {json.dumps(payload, separators=(",", ":"))}\n\n'


def scenario_input(case, cwd, phase):
    if case == 'Read':
        return 'Read', {'file_path': str(cwd / 'fixture.txt')}
    if case == 'Write':
        return 'Write', {'file_path': str(cwd / 'created.txt'), 'content': 'WRITE317_OK\n'}
    if case == 'Bash':
        return 'Bash', {'command': 'printf BASH317_OK > bash-result.txt', 'description': 'Write a safe local fixture', 'timeout': 10000}
    if case == 'Edit':
        if phase == 1:
            return 'Read', {'file_path': str(cwd / 'fixture.txt')}
        return 'Edit', {'file_path': str(cwd / 'fixture.txt'), 'old_string': 'ORIGINAL', 'new_string': 'EDIT317_OK'}
    raise ValueError(case)


@contextmanager
def fake_api(case, cwd):
    calls = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            raw = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            req = json.loads(raw)
            calls.append(req)
            index = len(calls)
            planned = 3 if case == 'Edit' else 2
            message = {'id': f'msg_port_{case.lower()}_{index}', 'type': 'message', 'role': 'assistant',
                       'model': req.get('model', 'claude-sonnet-5-5'), 'content': [],
                       'stop_reason': None, 'stop_sequence': None,
                       'usage': {'input_tokens': 42, 'output_tokens': 0}}
            output = sse('message_start', {'type': 'message_start', 'message': message})
            if index < planned:
                name, args = scenario_input(case, cwd, index)
                output += sse('content_block_start', {'type': 'content_block_start', 'index': 0,
                              'content_block': {'type': 'tool_use', 'id': f'toolu_{case.lower()}_{index}', 'name': name, 'input': {}}})
                output += sse('content_block_delta', {'type': 'content_block_delta', 'index': 0,
                              'delta': {'type': 'input_json_delta', 'partial_json': json.dumps(args)}})
                stop = 'tool_use'
            else:
                output += sse('content_block_start', {'type': 'content_block_start', 'index': 0,
                              'content_block': {'type': 'text', 'text': ''}})
                output += sse('content_block_delta', {'type': 'content_block_delta', 'index': 0,
                              'delta': {'type': 'text_delta', 'text': 'PORT317_CASE_DONE'}})
                stop = 'end_turn'
            output += sse('content_block_stop', {'type': 'content_block_stop', 'index': 0})
            output += sse('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': stop, 'stop_sequence': None}, 'usage': {'output_tokens': 5}})
            output += sse('message_stop', {'type': 'message_stop'})
            b = output.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def log_message(self, *_):
            pass

    class Server(socketserver.TCPServer):
        allow_reuse_address = True

    with Server(('127.0.0.1', 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_address[1], calls
        finally:
            server.shutdown()
            thread.join(timeout=4)


def extract_results(reqs):
    records = {}
    for req in reqs[1:]:
        for message in req.get('messages', []):
            if not isinstance(message.get('content'), list):
                continue
            for block in message['content']:
                if block.get('type') == 'tool_result':
                    records[block['tool_use_id']] = block
    return records


def run(case, command, label, root):
    base = root / f'{case.lower()}-{label}'
    cwd = base / 'workspace'
    cwd.mkdir(parents=True)
    home = base / 'home'
    home.mkdir()
    (cwd / 'fixture.txt').write_text('ORIGINAL\n')
    with fake_api(case, cwd) as (port, calls):
        env = {**os.environ, 'HOME': str(home), 'XDG_CONFIG_HOME': str(home / '.config'),
               'XDG_CACHE_HOME': str(home / '.cache'), 'TERM': 'dumb',
               'ANTHROPIC_API_KEY': 'local-test-key', 'ANTHROPIC_BASE_URL': f'http://127.0.0.1:{port}',
               'HTTP_PROXY': 'http://127.0.0.1:9', 'HTTPS_PROXY': 'http://127.0.0.1:9',
               'NO_PROXY': '127.0.0.1,localhost', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1'}
        cmd = [*command, '--print', '--no-session-persistence', '--output-format', 'json',
               '--tools', 'Read,Edit,Write,Bash', '--permission-mode', 'bypassPermissions',
               '--model', 'sonnet', f'Execute fixture scenario {case} as requested.']
        proc = subprocess.run(cmd, cwd=cwd, env=env, stdin=subprocess.DEVNULL, capture_output=True,
                              text=True, timeout=60)
    expected_calls = 3 if case == 'Edit' else 2
    if proc.returncode or len(calls) != expected_calls or 'PORT317_CASE_DONE' not in proc.stdout:
        raise AssertionError(f'{label} {case}: exit={proc.returncode} requests={len(calls)}\n'
                             f'stdout={proc.stdout[-800:]}\nstderr={proc.stderr[-1000:]}')
    results = extract_results(calls)
    expected_tools = [f'toolu_{case.lower()}_{i}' for i in range(1, expected_calls)]
    for key in expected_tools:
        block = results.get(key)
        if not block or block.get('is_error'):
            raise AssertionError(f'{label} {case} returned error: {results}')
    contents = {
        'created': (cwd / 'created.txt').read_text() if (cwd / 'created.txt').is_file() else None,
        'fixture': (cwd / 'fixture.txt').read_text(),
        'shell': (cwd / 'bash-result.txt').read_text() if (cwd / 'bash-result.txt').is_file() else None,
    }
    assert contents['created'] == ('WRITE317_OK\n' if case == 'Write' else None)
    assert contents['fixture'] == ('EDIT317_OK\n' if case == 'Edit' else 'ORIGINAL\n')
    assert contents['shell'] == ('BASH317_OK' if case == 'Bash' else None)
    return {'case': case, 'label': label, 'calls': len(calls),
            'registered_tools': sorted(t['name'] for t in calls[0].get('tools', [])),
            'system_parts': len(calls[0].get('system', [])) if isinstance(calls[0].get('system'), list) else None,
            'results_ok': len(expected_tools), 'files': contents}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--official', type=Path, required=True)
    ap.add_argument('--ported', type=Path, required=True)
    ap.add_argument('--rebuilt-launcher', action='store_true', help='Invoke installed launcher.cjs through Node rather than direct Bun script')
    args = ap.parse_args()
    base = args.official.resolve()
    ported = args.ported.resolve()
    if not base.is_file() or not ported.is_file():
        ap.error('Both official executable and independently rebuilt 333 CLI must exist')
    output = []
    with tempfile.TemporaryDirectory(prefix='333-317-tool-matrix-') as tmp:
        root = Path(tmp)
        for case in ('Read','Write','Edit','Bash'):
            official = run(case, [str(base)], 'native', root)
            current = run(case, ['node', str(ported)] if args.rebuilt_launcher else ['bun', str(ported)], 'ported', root)
            for key in ('calls','registered_tools','system_parts','results_ok','files'):
                if official[key] != current[key]:
                    raise AssertionError(json.dumps({'case': case, 'mismatch': key, 'native': official, 'ported': current}, ensure_ascii=False))
            output.append({'case': case, 'roundtrip': True, 'requests': current['calls'],
                           'results': current['results_ok'], 'disk_side_effects_match': True})
    print(json.dumps({'cases': output, 'passed': len(output)}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()