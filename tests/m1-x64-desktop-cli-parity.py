#!/usr/bin/env python3
"""Compare actual 2.1.310 Desktop CLI guard behavior with a real PTY."""
import argparse
import fcntl
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
import time
from pathlib import Path

ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\\\)')
CASES = [
    ('platform', ['--desktop'], True, "isn't available on this platform"),
    ('prompt', ['--desktop', 'hello'], True, "doesn't take a prompt"),
    ('options', ['--desktop', '--model', 'sonnet'], True, "can't be combined"),
    ('print', ['--desktop', '--print'], True, "can't run non-interactively"),
    ('piped-stdin', ['--desktop'], False, 'piped or redirected input'),
]


def probe(binary, arguments, stdin_tty):
    home = Path(tempfile.mkdtemp(prefix='333-desktop-parity-'))
    project = home / 'project'
    project.mkdir()
    (home / '.claude').mkdir()
    (home / '.claude.json').write_text(json.dumps({
        'hasCompletedOnboarding': True,
        'lastOnboardingVersion': '2.1.310',
        'theme': 'dark',
        'projects': {str(project): {'hasTrustDialogAccepted': True}},
    }), encoding='utf-8')
    forbidden = ('CLAUDE', 'ANTHROPIC', 'TOKEN', 'SECRET', 'PASSWORD', 'API_KEY', 'GITHUB', 'AWS_', 'GOOGLE_')
    env = {key: value for key, value in os.environ.items()
           if not any(word in key.upper() for word in forbidden)}
    env.update({
        'HOME': str(home), 'USERPROFILE': str(home),
        'XDG_CONFIG_HOME': str(home / '.config'),
        'XDG_CACHE_HOME': str(home / '.cache'),
        'TERM': 'xterm-256color', 'DISABLE_TELEMETRY': '1',
        'DISABLE_ERROR_REPORTING': '1', 'DISABLE_AUTOUPDATER': '1',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1',
    })
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 130, 0, 0))
    process = subprocess.Popen([binary, *arguments], cwd=project,
                               stdin=slave if stdin_tty else subprocess.DEVNULL,
                               stdout=slave, stderr=slave, env=env,
                               start_new_session=True)
    os.close(slave)
    output = bytearray()
    timed_out = False
    try:
        started = time.monotonic()
        while time.monotonic() - started < 20 and process.poll() is None:
            if select.select([master], [], [], 0.1)[0]:
                try:
                    output.extend(os.read(master, 65536))
                except OSError:
                    break
        if process.poll() is None:
            timed_out = True
            os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=3)
        text = ANSI.sub('', output.decode('utf-8', errors='replace'))
        return {'exit': process.returncode, 'timeout': timed_out,
                'output': ' '.join(text.split())[-1800:]}
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)
        os.close(master)
        shutil.rmtree(home)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reference', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    results = []
    for label, flags, stdin_tty, needle in CASES:
        reference = probe(args.reference, flags, stdin_tty)
        candidate = probe(args.candidate, flags, stdin_tty)
        reference_ok = reference['exit'] == 1 and not reference['timeout'] and needle in reference['output']
        candidate_ok = candidate['exit'] == 1 and not candidate['timeout'] and needle in candidate['output']
        results.append({'case': label, 'reference': reference, 'candidate': candidate,
                        'needle': needle, 'reference_pass': reference_ok, 'candidate_pass': candidate_ok})
    Path(args.report).write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps([{'case': row['case'],
                       'reference_pass': row['reference_pass'],
                       'candidate_pass': row['candidate_pass'],
                       'reference_output': row['reference']['output'][-320:],
                       'candidate_output': row['candidate']['output'][-320:]} for row in results], ensure_ascii=False))
    if not all(row['reference_pass'] and row['candidate_pass'] for row in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
