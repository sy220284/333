import { describe, expect, test } from 'bun:test'
import { getCliHighlightPromise, getLanguageName } from '../src/utils/cliHighlight.js'

describe('2.1.310 syntax highlighting import contract', () => {
  test('loads the real cli-highlight and highlight.js modules', async () => {
    const api = await getCliHighlightPromise()
    expect(api).not.toBeNull()
    expect(typeof api?.highlight).toBe('function')
    expect(typeof api?.supportsLanguage).toBe('function')
  })
  test('resolves TypeScript by its runtime grammar and rejects unknown suffixes', async () => {
    expect(await getLanguageName('src/main.ts')).toBe('TypeScript')
    expect(await getLanguageName('src/not-a-language.invalidextension')).toBe('unknown')
  })
})
