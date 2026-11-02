import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applySedSubstitution,
  assertSedPreviewUnchanged,
  parseSedEditCommand,
} from '../src/tools/BashTool/sedEditParser.ts'

// GNU sed is the target for the Linux x64 reference probe. Comparing against
// the executable also catches mistakes in preview logic that unit snapshots miss.
describe('Bash sed preview matches real GNU sed -i', () => {
  const cases = [
    { name: 'first match on every line', expr: 's/a/A/', input: 'aaa\naaa\n' },
    { name: 'global on every line', expr: 's/a/A/g', input: 'aaa\naaa\n' },
    { name: 'literal BRE plus', expr: 's/a+b/X/', input: 'a+b\na+b\n' },
    { name: 'BRE escaped plus', expr: 's/a\\+b/X/', input: 'aab\naaab\n' },
    { name: 'case-insensitive', expr: 's/a/A/I', input: 'aa\nAA\n' },
    { name: 'replacement match ampersand', expr: 's/a/[&]/g', input: 'a a\n' },
    { name: 'replacement literal ampersand', expr: 's/a/\\&/g', input: 'a a\n' },
    { name: 'literal JavaScript replacement token', expr: 's/a/$&/g', input: 'a a\n' },
    { name: 'line anchors and final newline', expr: 's/^/X/', input: 'a\nb\n' },
    { name: 'empty input', expr: 's/^/X/', input: '' },
    { name: 'no trailing newline', expr: 's/a/A/', input: 'aa\naa' },
    { name: 'newline in replacement', expr: 's/a/\\n/g', input: 'a\na\n' },
    { name: 'extended regex', expr: 's/a(b+)/Z/g', input: 'abbb\nab\n', extended: true },
  ] as const

  for (const fixture of cases) {
    test(fixture.name, () => {
      const dir = mkdtempSync(join(tmpdir(), 'm1-sed-preview-'))
      const file = join(dir, 'sample.txt')
      try {
        writeFileSync(file, fixture.input)
        const extended = 'extended' in fixture && fixture.extended
        const inPlaceArgs = process.platform === 'darwin' ? ['-i', ''] : ['-i']
        const command = 'sed ' + (extended ? '-E ' : '') +
          '-i ' + (process.platform === 'darwin' ? "'' " : '') +
          "'" + fixture.expr + "' " + file
        const parsed = parseSedEditCommand(command)
        expect(parsed).not.toBeNull()
        if (!parsed) throw new Error(`sed preview rejected expected expression: ${command}`)
        const candidate = applySedSubstitution(fixture.input, parsed)
        const args = [...(extended ? ['-E'] : []), ...inPlaceArgs, fixture.expr, file]
        const actual = spawnSync('sed', args, { encoding: 'utf8' })
        expect(actual.status).toBe(0)
        expect(candidate).toBe(readFileSync(file, 'utf8'))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  test('the approved edit refuses to overwrite content changed after preview', () => {
    expect(() => assertSedPreviewUnchanged('file.txt', 'before\r\n', 'before\n')).not.toThrow()
    expect(() => assertSedPreviewUnchanged('file.txt', 'later\n', 'before\n')).toThrow(/changed after the sed edit preview/)
  })

  test('dot-prefixed file path remains a file path, not an -i suffix', () => {
    expect(parseSedEditCommand("sed -i 's/a/b/' .env")?.filePath).toBe('.env')
  })

  test('complex or unrepresentable sed commands remain on the Bash execution path', () => {
    const unsupported = [
      "sed -i.bak 's/a/b/' file.txt",
      "sed --in-place=.bak 's/a/b/' file.txt",
      "sed -i 's/a/b/p' file.txt",
      "sed -i 's/a/b/2' file.txt",
      "sed -i 's/a/b/m' file.txt",
      "sed -i 's//b/' file.txt",
      "sed -i 's/a/\\1/' file.txt",
      "sed -i 's/a/b/' file.txt other.txt",
      "sed -i 's/a/b/' file.txt && echo done",
      "sed -i 's/a/b/' file.txt > output.txt",
      "sed -i 's/a/b/' *.txt",
      "sed -i 's/a/b/' file.txt; echo done",
      ...(process.platform === 'darwin'
        ? ["sed -i 's/a/b/' file.txt", "sed --in-place 's/a/b/' file.txt"]
        : ["sed -i '' 's/a/b/' file.txt"]),
    ]
    for (const command of unsupported) {
      expect(parseSedEditCommand(command)).toBeNull()
    }
  })
})
