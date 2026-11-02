#!/usr/bin/env python3
"""Official 2.1.310 vs candidate: actual PTY AX startup test (not full TUI)."""
import argparse
import fcntl
import hashlib
import json
import os
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time
from pathlib import Path

PIN='b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56'
CSI=re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
OSC=re.compile(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)')
SECRETS=('ANTHROPIC','CLAUDE','TOKEN','SECRET','PASSWORD','API_KEY','AWS_','GOOGLE_','OPENAI_','GITHUB_')

def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as src:
        for part in iter(lambda:src.read(1024*1024),b''):
            h.update(part)
    return h.hexdigest()

def probe(executable,mode,timeout):
    with tempfile.TemporaryDirectory(prefix='m1-ax-pty-') as scratch:
        root=Path(scratch)
        (root/'.config').mkdir()
        project=root/'project'
        project.mkdir()
        env={k:v for k,v in os.environ.items() if not any(s in k.upper() for s in SECRETS)}
        env.update({'HOME':str(root),'XDG_CONFIG_HOME':str(root/'.config'),
                    'XDG_CACHE_HOME':str(root/'.cache'),'TERM':'xterm-256color',
                    'NO_COLOR':'1','ANTHROPIC_API_KEY':'sk-offline-fixture-only',
                    'ANTHROPIC_BASE_URL':'http://127.0.0.1:9',
                    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1',
                    'DISABLE_TELEMETRY':'1','DISABLE_ERROR_REPORTING':'1',
                    'NO_PROXY':'localhost,127.0.0.1'})
        cmd=[str(Path(executable).resolve())]
        if mode=='flag': cmd.append('--ax-screen-reader')
        if mode=='env': env['CLAUDE_AX_SCREEN_READER']='1'
        if mode=='settings':
            (root/'.claude').mkdir()
            (root/'.claude'/'settings.json').write_text('{"axScreenReader":true}',encoding='utf8')
        master,slave=pty.openpty()
        fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0))
        proc=subprocess.Popen(cmd,cwd=project,env=env,stdin=slave,stdout=slave,
                              stderr=slave,start_new_session=True)
        os.close(slave)
        buffer=bytearray()
        exited=False
        try:
            until=time.monotonic()+timeout
            while time.monotonic()<until and len(buffer)<200000:
                ready,_,_=select.select([master],[],[],0.2)
                if ready:
                    try: chunk=os.read(master,32768)
                    except OSError: break
                    if not chunk: break
                    buffer.extend(chunk)
                if proc.poll() is not None: exited=True
                if b'supported-countries' in buffer and b'connect' in buffer: break
        finally:
            if proc.poll() is None: os.killpg(proc.pid,signal.SIGKILL)
            proc.wait(timeout=5)
            os.close(master)
        raw=buffer.decode('utf8','replace')
        text=OSC.sub('',CSI.sub('',raw)).replace('\r','').strip()
        return {'mode':mode,'exit':proc.returncode if exited else 'terminated_after_capture',
                'bytes':len(buffer),'cursor_control_sequences':len(CSI.findall(raw)),
                'activation_banner': (f'[Screen Reader Mode: on via {mode}]' in text if mode!='off' else '[Screen Reader Mode: on' in text),
                'flat_welcome':'Welcome to Claude Code' in text,
                'connection_status':'Checking connectivity' in text,
                'offline_failure_visible':'Unable to connect to Anthropic services' in text,
                'text_excerpt':text[:450]}

def validate(label,cases):
    basic,ax,env,settings=cases
    assert all(c['bytes'] for c in cases),(label,cases)
    assert not basic['activation_banner'],(label,'AX enabled without flag',basic)
    assert ax['activation_banner'],(label,'AX banner missing',ax)
    assert ax['flat_welcome'],(label,'Actual flat welcome missing',ax)
    assert ax['connection_status'] or ax['offline_failure_visible'],(label,'Missing connection status or final error',ax)
    assert env['activation_banner'],(label,'AX env banner missing',env)
    assert env['flat_welcome'],(label,'AX env flat welcome missing',env)
    assert env['connection_status'] or env['offline_failure_visible'],(label,'AX env has neither status nor final error',env)
    assert settings['activation_banner'],(label,'AX trusted settings banner missing',settings)
    assert settings['flat_welcome'],(label,'AX settings flat welcome missing',settings)
    assert settings['connection_status'] or settings['offline_failure_visible'],(label,'AX settings has neither status nor final error',settings)
    assert all(c['cursor_control_sequences']<basic['cursor_control_sequences'] for c in (ax,env,settings)),(
        label,'AX terminal cursor/animation suppression missing',cases)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--reference',required=True)
    ap.add_argument('--candidate')
    ap.add_argument('--report',required=True)
    ap.add_argument('--timeout',type=float,default=12)
    a=ap.parse_args()
    assert 3<=a.timeout<=60
    assert sha256(a.reference)==PIN,'Official x64 checksum mismatch'
    report={'schema':1,'feature':'F001','target':'2.1.310',
            'reference_sha256':PIN,'scope':'isolated real PTY startup only',
            'full_interactive_acceptance':'UNVERIFIED','results':{}}
    failures=[]
    binaries=[('official',a.reference)]
    if a.candidate: binaries.append(('candidate',a.candidate))
    for label,executable in binaries:
        cases=[probe(executable,mode,a.timeout) for mode in ('off','flag','env','settings')]
        report['results'][label]=cases
        try: validate(label,cases)
        except AssertionError as e: failures.append(str(e))
    dest=Path(a.report)
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'report':str(dest),'results':report['results'],'failures':failures},
                     ensure_ascii=False,indent=2))
    if failures: raise SystemExit(1)

if __name__=='__main__': main()
