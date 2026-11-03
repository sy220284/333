#!/usr/bin/env python3
"""Offline side-by-side Linux x64 real-PTY conversation display probe.

Tests stream, tool, and retry using the same local mock model for official and
rebuilt CLIs. Captures timestamped terminal refreshes, reports visual evidence
and explicitly separates behavior equality from unverified pixel equivalence.
"""
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
import pyte
from pathlib import Path

ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\\\)')
PROMPT = 'UI_REAL_PTY_PROMPT'
STREAM_RESULT = 'UI_STREAM_COMPLETE_OK'
TOOL_RESULT = 'UI_TOOL_COMPLETE_OK'
RETRY_RESULT = 'UI_RETRY_COMPLETE_OK'
FIXTURE = 'UI_TOOL_FILE_READ_OK'

def sse(kind, payload):
    return ('event: ' + kind + '\ndata: ' + json.dumps(payload) + '\n\n').encode()

def stream(model, text=None, tool=None, chunk_pause=0.0):
    mid = 'msg_ui_' + ('tool' if tool else 'text')
    prefix = [
        sse('message_start', {
            'type': 'message_start', 'message': {
                'id': mid, 'type': 'message', 'role': 'assistant',
                'model': model, 'content': [], 'stop_reason': None,
                'stop_sequence': None, 'usage': {'input_tokens': 17, 'output_tokens': 0},
            },
        }),
    ]
    if tool:
        prefix += [
            sse('content_block_start', {
                'type': 'content_block_start', 'index': 0,
                'content_block': {'type': 'tool_use', 'name': 'Read',
                                  'id': 'toolu_ui_read_001', 'input': {}},
            }),
            sse('content_block_delta', {
                'type': 'content_block_delta', 'index': 0,
                'delta': {'type': 'input_json_delta',
                          'partial_json': json.dumps({'file_path': tool})},
            }),
        ]
    else:
        prefix.append(sse('content_block_start', {
            'type': 'content_block_start', 'index': 0,
            'content_block': {'type': 'text', 'text': ''},
        }))
        for part in (text[:len(text)//2], text[len(text)//2:]):
            prefix.append(sse('content_block_delta', {
                'type': 'content_block_delta', 'index': 0,
                'delta': {'type': 'text_delta', 'text': part},
            }))
    prefix += [
        sse('content_block_stop', {'type':'content_block_stop','index':0}),
        sse('message_delta', {
            'type':'message_delta',
            'delta':{'stop_reason':'tool_use' if tool else 'end_turn', 'stop_sequence':None},
            'usage':{'output_tokens':10},
        }),
        sse('message_stop',{'type':'message_stop'}),
    ]
    return b''.join(prefix)

def probe(binary, scenario):
    home = Path(tempfile.mkdtemp(prefix='m1-ui-tty-'))
    project = home / 'project'
    project.mkdir()
    (home / '.claude').mkdir()
    (home / '.claude' / 'settings.json').write_text(json.dumps({
        'permissions': {'allow': ['Read']},
    }))
    (home / '.claude.json').write_text(json.dumps({
        'hasCompletedOnboarding': True,
        'lastOnboardingVersion': '2.1.310',
        'theme': 'dark',
        'customApiKeyResponses': {'approved': ['local-only'], 'rejected': []},
        'projects': {str(project): {'hasTrustDialogAccepted': True}},
    }))
    fixture = project / 'ui-read-fixture.txt'
    fixture.write_text(FIXTURE + '\n', encoding='utf-8')
    calls = []
    request_seen = threading.Event()

    class LocalModel(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_HEAD(self):
            self.send_response(200)
            self.end_headers()
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
            content = body.get('messages', [])
            is_real = any(
                msg.get('role') == 'user' and PROMPT in str(msg.get('content', ''))
                for msg in content
            )
            if not is_real:
                # Background model calls (title generation) must not advance fixture state.
                answer = stream(body.get('model', 'claude-sonnet-4-6'), text='UI_TITLE')
            else:
                tool_results = [block for msg in content if msg.get('role') == 'user'
                    for block in (msg.get('content', []) if isinstance(msg.get('content'), list) else [])
                    if isinstance(block, dict) and block.get('type') == 'tool_result']
                calls.append({'model': body.get('model'),
                              'messages': len(content),
                              'tools': [t.get('name') for t in body.get('tools', [])],
                              'read_result_verified': any(FIXTURE in str(b) for b in tool_results),
                              'tool_result_count': len(tool_results),
                              'tool_result_types': [b.get('type') for b in tool_results],
                              'tool_result_samples': [str(b)[:600] for b in tool_results[:2]],
                              'last_user_sample': str(next((m.get('content') for m in reversed(content) if m.get('role') == 'user'), ''))[:300]})
                request_seen.set()
                model = body.get('model', 'claude-sonnet-4-6')
                if scenario == 'retry' and len(calls) == 1:
                    response = json.dumps({'type':'error','error':{
                        'type':'rate_limit_error','message':'UI_RATE_LIMIT_TEST'}}).encode()
                    self.send_response(429)
                    self.send_header('Content-Type','application/json')
                    self.send_header('Retry-After','2')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response)
                    return
                if scenario == 'tool' and len(calls) == 1:
                    answer = stream(model, tool=str(fixture))
                else:
                    text = {'stream':STREAM_RESULT,'tool':TOOL_RESULT,'retry':RETRY_RESULT}[scenario]
                    answer = stream(model, text=text)
            if is_real and scenario == 'stream':
                time.sleep(2.5)  # exercise the requesting spinner before first byte
            if is_real and scenario in ('tool', 'retry') and len(calls) == 2:
                time.sleep(3.5)  # keep the post-tool/retry display visible for screen captures
            self.send_response(200)
            self.send_header('Content-Type','text/event-stream')
            self.send_header('Content-Length',str(len(answer)))
            self.end_headers()
            try:
                self.wfile.write(answer)
                self.wfile.flush()
            except BrokenPipeError:
                pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1',0), LocalModel)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    blocked = ('CLAUDE','ANTHROPIC','TOKEN','PASSWORD','SECRET','API_KEY',
               'GITHUB','AWS_','GOOGLE_','OPENAI_')
    env = {k:v for k,v in os.environ.items()
           if not any(word in k.upper() for word in blocked)}
    env.update({
        'HOME':str(home),'USERPROFILE':str(home),
        'XDG_CONFIG_HOME':str(home),'XDG_CACHE_HOME':str(home),
        'TERM':'xterm-256color','NO_PROXY':'127.0.0.1,localhost',
        'ANTHROPIC_API_KEY':'local-only',
        'ANTHROPIC_BASE_URL':f'http://127.0.0.1:{server.server_port}',
        'DISABLE_AUTOUPDATER':'1','DISABLE_TELEMETRY':'1',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1',
    })
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH',40,140,0,0))
    proc = subprocess.Popen([str(Path(binary).resolve())], cwd=project,env=env,
                            stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave)
    output = bytearray()
    screen = pyte.Screen(140, 40)
    terminal = pyte.Stream(screen)
    frames = []
    started = time.monotonic()
    sent = False
    last_capture = 0.0
    expected = {'stream':STREAM_RESULT,'tool':TOOL_RESULT,'retry':RETRY_RESULT}[scenario]
    try:
        while time.monotonic()-started < 42 and proc.poll() is None:
            ready,_,_ = select.select([master],[],[],0.12)
            if ready:
                try:
                    part = os.read(master,65536)
                    output.extend(part)
                    terminal.feed(part.decode('utf-8',errors='replace'))
                except OSError: break
            now = time.monotonic()
            if not sent and now-started > 4:
                os.write(master,(PROMPT+'\r').encode())
                sent=True
            if sent and now-last_capture>=0.25:
                last_capture=now
                rows=[line.rstrip() for line in screen.display if line.strip()]
                visible=' '.join(rows[-7:])
                glyphs=re.findall(r'[·✢✳✶✻✽]',visible)
                frames.append({
                    'ms':round((now-started)*1000),
                    'screen_rows':rows[-10:],
                    'glyph':glyphs[-1] if glyphs else None,
                    'retry_status_visible':bool(re.search(
                        r'Retrying in|retrying|重试|waiting for API response',
                        visible,re.I)),
                })
            text=ANSI.sub('',output.decode('utf-8',errors='replace'))
            if sent and expected in text and request_seen.is_set():
                # Ensure tool-use actually completed the extra request.
                if scenario == 'tool' and len(calls) < 2:
                    continue
                if scenario == 'retry' and len(calls) < 2:
                    continue
                break
        text=ANSI.sub('',output.decode('utf-8',errors='replace'))
        passed=(sent and expected in text and len(calls)>=
                (2 if scenario in ('tool','retry') else 1))
        if scenario == 'tool':
            passed = passed and any(c['read_result_verified'] for c in calls)
        return {
            'scenario':scenario,'passed':passed,'request_count':len(calls),
            'elapsed_seconds':round(time.monotonic()-started,2),
            'marker_present':expected in text,
            'retry_visible':bool(re.search(r'Retrying|retry|重试|rate limit',text,re.I)),
            'tool_fixture_seen':FIXTURE in text,
            'tool_read_verified':any(c['read_result_verified'] for c in calls),
            'model_request_trace': calls,
            'retry_status_screen_seen':any(f['retry_status_visible'] for f in frames),
            'final_screen_rows':[line.rstrip() for line in screen.display if line.strip()][-12:],
            'frames':frames,
            'frame_count':len(frames),
            'frame_glyphs':sorted({f['glyph'] for f in frames if f['glyph']}),
            'terminal_tail':text[-800:] if not passed else '',
        }
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid,signal.SIGTERM)
            try: proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid,signal.SIGKILL)
        os.close(master)
        server.shutdown()
        server.server_close()
        shutil.rmtree(home)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--reference',required=True)
    parser.add_argument('--candidate',required=True)
    parser.add_argument('--report',required=True)
    args=parser.parse_args()
    report={
        'version':'2.1.310',
        'scope':'REAL_PTY_LOCAL_SSE_STREAM_TOOL_RETRY',
        'official':{},
        'rebuilt':{},
        'comparison':{},
    }
    for scenario in ('stream','tool','retry'):
        a=probe(args.reference,scenario)
        b=probe(args.candidate,scenario)
        report['official'][scenario]=a
        report['rebuilt'][scenario]=b
        report['comparison'][scenario]={
            'both_reached_expected_end_state':a['passed'] and b['passed'],
            'official_frame_count':a['frame_count'],
            'rebuilt_frame_count':b['frame_count'],
            'glyph_sets_equal':a['frame_glyphs']==b['frame_glyphs'],
            'official_retry_status_seen':a['retry_status_screen_seen'],
            'rebuilt_retry_status_seen':b['retry_status_screen_seen'],
            'frame_by_frame_pixel_equivalence':'NOT_VERIFIED',
        }
    Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',
                                  encoding='utf-8')
    print(json.dumps({s:report['comparison'][s] for s in ('stream','tool','retry')}))
    failed = [s for s in ('stream','tool','retry')
              if not report['comparison'][s]['both_reached_expected_end_state']]
    for scenario in failed:
        for side in ('official', 'rebuilt'):
            sample = report[side][scenario]
            print(json.dumps({
                'diagnosis': 'real_pty_end_state_failure',
                'scenario': scenario,
                'implementation': side,
                'passed': sample['passed'],
                'request_count': sample['request_count'],
                'marker_present': sample['marker_present'],
                'tool_fixture_seen': sample['tool_fixture_seen'],
                'tool_read_verified': sample['tool_read_verified'],
                'model_request_trace': sample['model_request_trace'],
                'last_screen_rows': sample['final_screen_rows'],
                'terminal_tail': sample['terminal_tail'],
            }, ensure_ascii=False))
    if failed:
        raise SystemExit(1)

if __name__=='__main__':
    main()
