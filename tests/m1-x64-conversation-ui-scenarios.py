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
from wcwidth import wcswidth
from pathlib import Path

ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\\\)')
PROMPT = 'UI_REAL_PTY_PROMPT'
STREAM_RESULT = 'UI_STREAM_COMPLETE_OK'
TOOL_RESULT = 'UI_TOOL_COMPLETE_OK'
RETRY_RESULT = 'UI_RETRY_COMPLETE_OK'
THINKING_RESULT = 'UI_THINKING_COMPLETE_OK'
THINKING_CONTENT = 'UI_THINKING_PHASE_VISIBLE'
FIXTURE = 'UI_TOOL_FILE_READ_OK'

def is_main_conversation_request(body):
    """A title request quotes the user prompt but has no Read tool schema."""
    return (
        any(t.get('name') == 'Read' for t in body.get('tools', [])
            if isinstance(t, dict))
        and any(
            msg.get('role') == 'user' and PROMPT in str(msg.get('content', ''))
            for msg in body.get('messages', []) if isinstance(msg, dict)
        )
    )

def screen_rows(screen):
    """Render pyte's terminal buffer with Unicode cluster widths.

    pyte 0.8.2's Screen.display indexes char[0] and crashes when a terminal
    writes an empty continuation cell.  The upstream render algorithm uses
    wcswidth on the whole cluster; preserve that behavior for both binaries.
    """
    rows = []
    for y in range(screen.lines):
        chars = []
        skip_wide_stub = False
        for x in range(screen.columns):
            if skip_wide_stub:
                skip_wide_stub = False
                continue
            data = screen.buffer[y][x].data
            skip_wide_stub = wcswidth(data) == 2
            chars.append(data)
        rows.append(''.join(chars))
    return rows


def active_spinner_glyph(rows):
    """Read the animated glyph from its own row, not the footer separator '·'."""
    for row in rows:
        match = re.match(r'^\s*([·✢✳✶✻✽*])\s+(.+)', row)
        if match and '…' in match.group(2):
            return match.group(1)
    return None


def terminal_anchors(screen, answer_marker, scenario):
    """Capture absolute terminal-cell positions and styling for core transcript rows."""
    rows = screen_rows(screen)
    definitions = {
        'user': lambda row: PROMPT in row and '❯' in row,
        'assistant': lambda row: answer_marker in row and '●' in row,
        'tool': lambda row: 'Read 1 file' in row,
        # Only a completed spinner line is a turn completion: an earlier
        # "Thought for 2s" is a different semantic row.
        'completed': lambda row: bool(re.search(
            r'^\s*[✻✳✢✶✽*·]\s+.*\bfor\s+\d+(?:\.\d+)?s\b', row)),
        'thinking_summary': lambda row: bool(re.search(
            r'(?:Thought for\s+\d+s|思考了\s*\d+\s*秒)', row)),
    }
    result = {}
    for name, predicate in definitions.items():
        if (name == 'tool' and scenario != 'tool') or (
            name == 'thinking_summary' and scenario != 'thinking'
        ):
            continue
        for y, row in enumerate(rows):
            if predicate(row):
                if name == 'user':
                    token = PROMPT
                elif name == 'assistant':
                    token = answer_marker
                elif name == 'tool':
                    token = 'Read 1 file'
                elif name == 'thinking_summary':
                    token = 'Thought for' if 'Thought for' in row else '思考了'
                else:
                    token = 'for '
                x = row.index(token)
                cell = screen.buffer[y][x]
                result[name] = {'row': y, 'column': x,
                                'fg': cell.fg, 'bg': cell.bg, 'bold': cell.bold,
                                'text': row.strip()[:180]}
                break
    return result


def compare_core_layout(official, rebuilt, scenario):
    """Structural acceptance: same transcript anchors, relative rows and columns.

    Whole-screen pixel fidelity is separately reported because localization,
    onboarding banners and user-selected themes may legitimately differ.
    """
    a, b = official['terminal_anchors'], rebuilt['terminal_anchors']
    required = (['user', 'assistant', 'completed']
                + (['tool'] if scenario == 'tool' else [])
                + (['thinking_summary'] if scenario == 'thinking' else []))
    missing = [name for name in required if name not in a or name not in b]
    if missing:
        return {'passed': False, 'missing': missing, 'mismatches': []}
    mismatches = []
    for name in required:
        ref = a[name]
        cand = b[name]
        if ref['row'] - a['user']['row'] != cand['row'] - b['user']['row']:
            mismatches.append({'anchor': name, 'kind': 'relative_row',
                               'official': ref['row'] - a['user']['row'],
                               'rebuilt': cand['row'] - b['user']['row']})
        # Localized status labels have different text widths and offsets.
        if name not in ('completed', 'thinking_summary') and ref['column'] != cand['column']:
            mismatches.append({'anchor': name, 'kind': 'column',
                               'official': ref['column'], 'rebuilt': cand['column']})
    return {'passed': not mismatches, 'missing': [], 'mismatches': mismatches}


def normalize_retry_status_frame(sample):
    for frame in sample['frames']:
        for line in frame['screen_rows']:
            if 'Retrying in' in line:
                return re.sub(r'Retrying in \d+s', 'Retrying in <seconds>', line.strip())
    return None


def compare_terminal_frames(official, rebuilt):
    """Time-align recorded terminal snapshots; never label unequal frames as equal."""
    a, b = official['frames'], rebuilt['frames']
    if not a or not b:
        return {'matched': 0, 'equal': 0, 'equal_fraction': 0.0, 'exact': False}
    equal = 0
    for frame in a:
        match = min(b, key=lambda candidate: abs(candidate['ms'] - frame['ms']))
        if frame['screen_rows'] == match['screen_rows']:
            equal += 1
    return {'matched': len(a), 'equal': equal,
            'equal_fraction': round(equal / len(a), 4),
            'exact': len(a) == len(b) and equal == len(a)}


def sse(kind, payload):
    return ('event: ' + kind + '\ndata: ' + json.dumps(payload) + '\n\n').encode()

def stream(model, text=None, tool=None, chunk_pause=0.0, thinking=False):
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
    if thinking:
        prefix += [
            sse('content_block_start', {'type':'content_block_start','index':0,
                'content_block':{'type':'thinking','thinking':'','signature':''}}),
            sse('content_block_delta', {'type':'content_block_delta','index':0,
                'delta':{'type':'thinking_delta','thinking':THINKING_CONTENT}}),
            sse('content_block_delta', {'type':'content_block_delta','index':0,
                'delta':{'type':'signature_delta','signature':'fixture-signature'}}),
            sse('content_block_stop', {'type':'content_block_stop','index':0}),
        ]
    content_idx = 1 if thinking else 0
    if tool:
        prefix += [
            sse('content_block_start', {
                'type': 'content_block_start', 'index': content_idx,
                'content_block': {'type': 'tool_use', 'name': 'Read',
                                  'id': 'toolu_ui_read_001', 'input': {}},
            }),
            sse('content_block_delta', {
                'type': 'content_block_delta', 'index': content_idx,
                'delta': {'type': 'input_json_delta',
                          'partial_json': json.dumps({'file_path': tool})},
            }),
        ]
    else:
        prefix.append(sse('content_block_start', {
            'type': 'content_block_start', 'index': content_idx,
            'content_block': {'type': 'text', 'text': ''},
        }))
        for part in (text[:len(text)//2], text[len(text)//2:]):
            prefix.append(sse('content_block_delta', {
                'type': 'content_block_delta', 'index': content_idx,
                'delta': {'type': 'text_delta', 'text': part},
            }))
    prefix += [
        sse('content_block_stop', {'type':'content_block_stop','index':content_idx}),
        sse('message_delta', {
            'type':'message_delta',
            'delta':{'stop_reason':'tool_use' if tool else 'end_turn', 'stop_sequence':None},
            'usage':{'output_tokens':10},
        }),
        sse('message_stop',{'type':'message_stop'}),
    ]
    return b''.join(prefix)

def probe(binary, scenario, target):
    scene = scenario.split('-')[0]
    columns = 80 if scenario.endswith('-narrow') else 140
    reduced_motion = scenario.endswith('-reduced')
    home = Path(tempfile.mkdtemp(prefix='m1-ui-tty-'))
    project = home / 'project'
    project.mkdir()
    (home / '.claude').mkdir()
    (home / '.claude' / 'settings.json').write_text(json.dumps({
        'permissions': {'allow': ['Read']},
        'prefersReducedMotion': reduced_motion,
    }))
    (home / '.claude.json').write_text(json.dumps({
        'hasCompletedOnboarding': True,
        'lastOnboardingVersion': target,
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
            is_real = is_main_conversation_request(body)
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
                if scene == 'retry' and len(calls) == 1:
                    response = json.dumps({'type':'error','error':{
                        'type':'rate_limit_error','message':'UI_RATE_LIMIT_TEST'}}).encode()
                    self.send_response(429)
                    self.send_header('Content-Type','application/json')
                    self.send_header('Retry-After','2')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response)
                    return
                if scene == 'tool' and len(calls) == 1:
                    answer = stream(model, tool=str(fixture))
                else:
                    text = {'stream':STREAM_RESULT,'tool':TOOL_RESULT,'retry':RETRY_RESULT,'thinking':THINKING_RESULT}[scene]
                    answer = stream(model, text=text, thinking=(scene == 'thinking'))
            if is_real and scene == 'stream':
                time.sleep(2.5)  # exercise the requesting spinner before first byte
            if is_real and scene in ('tool', 'retry') and len(calls) == 2:
                time.sleep(3.5)  # keep the post-tool/retry display visible for screen captures
            self.send_response(200)
            self.send_header('Content-Type','text/event-stream')
            self.send_header('Content-Length',str(len(answer)))
            self.end_headers()
            try:
                if is_real and scene == 'thinking':
                    for event in answer.split(b'\n\n'):
                        if not event:
                            continue
                        self.wfile.write(event + b'\n\n')
                        self.wfile.flush()
                        if b'thinking_delta' in event:
                            time.sleep(2.5)  # verify both renderers' live thinking states
                else:
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
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH',40,columns,0,0))
    proc = subprocess.Popen([str(Path(binary).resolve())], cwd=project,env=env,
                            stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave)
    output = bytearray()
    screen = pyte.Screen(columns, 40)
    terminal = pyte.Stream(screen)
    frames = []
    started = time.monotonic()
    sent = False
    last_capture = 0.0
    expected = {'stream':STREAM_RESULT,'tool':TOOL_RESULT,'retry':RETRY_RESULT,'thinking':THINKING_RESULT}[scene]
    answer_seen_at = None
    try:
        while time.monotonic()-started < 42 and proc.poll() is None:
            ready,_,_ = select.select([master],[],[],0.04)
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
            if sent and now-last_capture>=0.08:
                last_capture=now
                rows=[line.rstrip() for line in screen_rows(screen) if line.strip()]
                visible=' '.join(rows[-7:])
                glyph = active_spinner_glyph(rows)
                frames.append({
                    'ms':round((now-started)*1000),
                    'screen_rows':rows[-10:],
                    'glyph':glyph,
                    'retry_status_visible':bool(re.search(
                        r'Retrying in|retrying|重试|waiting for API response',
                        visible,re.I)),
                })
            text=ANSI.sub('',output.decode('utf-8',errors='replace'))
            if sent and expected in text and request_seen.is_set():
                # Ensure tool-use actually completed the extra request.
                if scene == 'tool' and len(calls) < 2:
                    continue
                if scene == 'retry' and len(calls) < 2:
                    continue
                if answer_seen_at is None:
                    answer_seen_at = time.monotonic()
                if ('completed' not in terminal_anchors(screen, expected, scene)
                        and time.monotonic() - answer_seen_at < 2):
                    continue
                break
        text=ANSI.sub('',output.decode('utf-8',errors='replace'))
        passed=(sent and expected in text and len(calls)>=
                (2 if scene in ('tool','retry') else 1))
        if scene == 'tool':
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
            'final_screen_rows':[line.rstrip() for line in screen_rows(screen) if line.strip()][-12:],
            'terminal_anchors':terminal_anchors(screen, expected, scene),
            'terminal_width':columns,
            'reduced_motion':reduced_motion,
            'full_screen_rows':[line.rstrip() for line in screen_rows(screen)],
            'frames':frames,
            'frame_count':len(frames),
            'thinking_status_seen':any('thinking' in ' '.join(f['screen_rows']).lower() for f in frames),
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
    parser.add_argument('--target',default='2.1.310',help='Actual reference release; historical tests default to 2.1.310')
    parser.add_argument('--strict-animations',action='store_true',help='Check glyph sets after dense capture; keep per-frame mismatch evidence')
    args=parser.parse_args()
    reference_version=subprocess.run([args.reference,'--version'],capture_output=True,text=True,timeout=12)
    if reference_version.returncode != 0 or not reference_version.stdout.strip().startswith(args.target+' '):
        raise RuntimeError(f'Official native executable does not match {args.target}: {reference_version.stdout.strip()}')
    report={
        'version':args.target,
        'official_version':reference_version.stdout.strip(),
        'scope':'REAL_PTY_LOCAL_SSE_STREAM_TOOL_RETRY',
        'official':{},
        'rebuilt':{},
        'comparison':{},
    }
    for scenario in ('stream','tool','retry','thinking','stream-narrow','stream-reduced'):
        a=probe(args.reference,scenario,args.target)
        b=probe(args.candidate,scenario,args.target)
        report['official'][scenario]=a
        report['rebuilt'][scenario]=b
        visual = compare_terminal_frames(a, b)
        layout = compare_core_layout(a, b, scenario.split('-')[0])
        retry_labels = {'official': normalize_retry_status_frame(a),
                        'rebuilt': normalize_retry_status_frame(b)} if scenario == 'retry' else None
        retry_label_match = retry_labels is None or (
            retry_labels['official'] is not None and
            retry_labels['official'] == retry_labels['rebuilt'])
        visual_rows_differ = sum(x != y for x, y in zip(a['full_screen_rows'], b['full_screen_rows']))
        report['comparison'][scenario]={
            'both_reached_expected_end_state':a['passed'] and b['passed'],
            'core_layout':layout,
            'frame_alignment':visual,
            'full_screen_different_rows':visual_rows_differ,
            'retry_labels':retry_labels,
            'retry_label_match':retry_label_match,
            'official_frame_count':a['frame_count'],
            'rebuilt_frame_count':b['frame_count'],
            'glyph_sets_equal':a['frame_glyphs']==b['frame_glyphs'],
            'official_glyph_sequence':[f['glyph'] for f in a['frames'] if f['glyph']],
            'rebuilt_glyph_sequence':[f['glyph'] for f in b['frames'] if f['glyph']],
            'official_retry_status_seen':a['retry_status_screen_seen'],
            'rebuilt_retry_status_seen':b['retry_status_screen_seen'],
            'official_thinking_status_seen':a['thinking_status_seen'],
            'rebuilt_thinking_status_seen':b['thinking_status_seen'],
            'frame_by_frame_pixel_equivalence':'EQUAL' if visual['exact'] else 'DIFFERENT',
        }
    Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',
                                  encoding='utf-8')
    print(json.dumps(report['comparison'], ensure_ascii=False))
    failed = [s for s in report['comparison']
              if not (report['comparison'][s]['both_reached_expected_end_state']
                      and report['comparison'][s]['core_layout']['passed']
                      and report['comparison'][s]['retry_label_match'])]
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
                'retry_labels': report['comparison'][scenario]['retry_labels'],
                'terminal_anchors': sample['terminal_anchors'],
                'core_layout': report['comparison'][scenario]['core_layout'],
            }, ensure_ascii=False))
    if args.strict_animations:
        animation_diffs=[scenario for scenario,item in report['comparison'].items()
                         if not item['glyph_sets_equal']]
        if animation_diffs:
            print(json.dumps({'diagnosis':'animation_glyph_mismatch','scenarios':animation_diffs},ensure_ascii=False))
            failed.extend(animation_diffs)
    if failed:
        raise SystemExit(1)

if __name__=='__main__':
    main()
