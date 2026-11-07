import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'

const python = [
  'import os,pty,select,subprocess,tempfile,pathlib,json,time,sys',
  'with tempfile.TemporaryDirectory(prefix="yaoyaoche-purge-pty-") as tmp:',
  '  root=pathlib.Path(tmp)',
  '  home=root/"config";project=root/"work";project.mkdir()',
  '  directory=home/"projects"/"".join(c if c.isascii() and c.isalnum() else "-" for c in str(project))',
  '  directory.mkdir(parents=True)',
  '  (directory/"11111111-1111-4111-8111-111111111111.jsonl").write_text(json.dumps({"cwd":str(project)})+"\\n")',
  '  master,slave=pty.openpty()',
  '  env={**os.environ,"YAOYAOCHE_CONFIG_DIR":str(home),"DISABLE_TELEMETRY":"1","CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC":"1","TERM":"xterm-256color"}',
  '  child=subprocess.Popen(["bun",sys.argv[1],"purge",str(project),"-i"],stdin=slave,stdout=slave,stderr=slave,env=env,cwd=str(root),start_new_session=True)',
  '  os.close(slave);output=b"";deadline=time.monotonic()+15',
  '  while time.monotonic()<deadline:',
  '    if select.select([master],[],[],0.1)[0]:',
  '      try:output+=os.read(master,65536)',
  '      except OSError:break',
  '    if child.poll() is not None:break',
  '  if child.poll() is None:child.kill()',
  '  child.wait();os.close(master)',
  '  print(json.dumps({"status":child.returncode,"exists":directory.exists(),"output":output.decode(errors="replace")}))',
].join('\n')

test('真实终端中 purge -i 立即退出且不加载旧 Ink 选择器', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync('python3', ['-c', python, resolve(import.meta.dirname, '../dist/cli.js')], {
    encoding: 'utf8', timeout: 30000,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const state = JSON.parse(result.stdout)
  assert.equal(state.status, 1)
  assert.equal(state.exists, true)
  assert.match(state.output, /旧终端选择界面已移除/)
})
