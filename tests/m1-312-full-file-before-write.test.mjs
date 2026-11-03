import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8')

test('auto-injected instructions record an incomplete view', () => {
  assert.match(read('src/utils/attachments.ts'), /isPartialView: memoryFile\.contentDiffersFromDisk/)
})
test('Write and Edit reject incomplete file views before executing a replacement', () => {
  for (const name of ['src/tools/FileWriteTool/FileWriteTool.ts','src/tools/FileEditTool/FileEditTool.ts']) {
    const source = read(name)
    const validate = source.slice(source.indexOf('async validateInput('),source.indexOf('async call('))
    assert.match(validate,/readTimestamp\.isPartialView/,name)
    const execution=source.slice(source.indexOf('async call('))
    const guard=execution.indexOf('if (lastRead?.isPartialView)')
    const write=execution.indexOf('writeTextContent(')
    assert.ok(guard>=0 && write>guard,name)
    assert.match(execution.slice(guard,write),/throw new Error\(FILE_UNEXPECTEDLY_MODIFIED_ERROR\)/,name)
  }
})
