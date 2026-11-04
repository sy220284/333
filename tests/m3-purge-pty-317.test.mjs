import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'

const script = String.raw`
import os,pty,select,subprocess,tempfile,pathlib,json,time,sys
results=[]
for choice in ['2','3','4','confirm']:
 with tempfile.TemporaryDirectory(prefix='333-purge-pty-') as root:
  root=pathlib.Path(root);home=root/'config';project=root/'work';project.mkdir()
  directory=home/'projects'/''.join(c if c.isascii() and c.isalnum() else '-' for c in str(project));directory.mkdir(parents=True)
  (directory/'11111111-1111-4111-8111-111111111111.jsonl').write_text(json.dumps({'cwd':str(project)})+'\n')
  master,slave=pty.openpty()
  env={**os.environ,'CLAUDE_CONFIG_DIR':str(home),'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1','DISABLE_TELEMETRY':'1','TERM':'xterm-256color'}
  child=subprocess.Popen(['bun',sys.argv[1],'purge',str(project)]+([] if choice=='confirm' else ['-i']),stdin=slave,stdout=slave,stderr=slave,env=env,cwd=str(root),start_new_session=True)
  os.close(slave);output=b'';sent=False;deadline=time.monotonic()+15
  try:
   while time.monotonic()<deadline:
    if select.select([master],[],[],0.1)[0]:
     try: data=os.read(master,65536)
     except OSError: break
     if not data: break
     output+=data
     if not sent and ((choice!='confirm' and b'remaining' in output) or (choice=='confirm' and b'No' in output)):
      os.write(master,b'\r' if choice=='confirm' else choice.encode());sent=True
    if child.poll() is not None: break
   if child.poll() is None:
    try: child.wait(timeout=1)
    except subprocess.TimeoutExpired: child.kill();child.wait();raise RuntimeError('interactive purge did not terminate: '+output.decode(errors='replace'))
   results.append({'choice':choice,'code':child.returncode,'exists':directory.exists(),'output':output.decode(errors='replace')})
  finally:
   os.close(master)
   if child.poll() is None: child.kill();child.wait()
print(json.dumps(results))
`
test('interactive purge supports skip, delete remaining, and abort in a real terminal', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync('python3', ['-c', script, resolve(import.meta.dirname, '../dist/cli.js')], { encoding: 'utf8', timeout: 55_000 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const [skip, remove, abort, confirm] = JSON.parse(result.stdout)
  assert.equal(skip.code, 0, skip.output); assert.equal(skip.exists, true); assert.match(skip.output, /Purged 0\/1/)
  assert.equal(remove.code, 0, remove.output); assert.equal(remove.exists, false); assert.match(remove.output, /Purged 1\/1/)
  assert.equal(confirm.code, 1, confirm.output); assert.equal(confirm.exists, true); assert.match(confirm.output, /Aborted/);
  assert.equal(abort.code, 1, abort.output); assert.equal(abort.exists, true); assert.match(abort.output, /Aborted\. 0/)
})
