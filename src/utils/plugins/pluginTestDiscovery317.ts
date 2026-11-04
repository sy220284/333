/**
 * Claude Code 2.1.317 plugin-test suite discovery.
 * Recursively scan *.test.ts and *.test.tsx, excluding dot-directories
 * and node_modules. Keep deterministic lexical order and the native
 * 1000-file ceiling before launching any child test environment.
 */
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const MAX_PLUGIN_TEST_FILES_317 = 1000

export async function discoverPluginTests317(root: string, { maxFiles = MAX_PLUGIN_TEST_FILES_317 } = {}) {
  const files = []
  const pending = [resolve(root)]
  while (pending.length > 0) {
    const dir = pending.pop()
    const children = await readdir(dir, { withFileTypes: true })
    for (const child of children) {
      const childPath = join(dir, child.name)
      const ignored = child.name === 'node_modules' || child.name.startsWith('.')
      if (child.isDirectory() && !ignored) pending.push(childPath)
      if (child.isFile() && /\.test\.tsx?$/.test(child.name)) {
        files.push(childPath)
        if (files.length > maxFiles) {
          throw new Error(`more than ${maxFiles} test files under ${root}; name a narrower folder`)
        }
      }
    }
  }
  return files.sort()
}
