import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectExtensionInstallationPortable,
  isChromeExtensionInstalledPortable,
} from '../src/utils/claudeInChrome/setupPortable.js'

const extensionId = 'fcoeoabgfenejglbffodgkkbkcdhcgfn'
const created: string[] = []
async function root() {
  const dir = await mkdtemp(join(tmpdir(), '333-chrome-'))
  created.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(created.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

test('detects official extension under a nondefault Chrome profile', async () => {
  const dir = await root()
  await mkdir(join(dir, 'Profile 3', 'Extensions', extensionId, '1.0'), { recursive: true })
  const got = await detectExtensionInstallationPortable([{ browser: 'chrome', path: dir }])
  expect(got).toEqual({ isInstalled: true, browser: 'chrome' })
})

test('detects supported alternate browsers and skips nonprofile folders', async () => {
  const dir = await root()
  await mkdir(join(dir, 'System Profile', 'Extensions', extensionId, '1.0'), { recursive: true })
  expect(await isChromeExtensionInstalledPortable([{ browser: 'brave', path: dir }])).toBe(false)
  await mkdir(join(dir, 'Default', 'Extensions', extensionId, '1.0'), { recursive: true })
  expect(await detectExtensionInstallationPortable([{ browser: 'brave', path: dir }])).toEqual({
    isInstalled: true, browser: 'brave',
  })
})

test('missing browsers and extension profiles do not report false installation', async () => {
  const dir = await root()
  const result = await detectExtensionInstallationPortable([
    { browser: 'chrome', path: join(dir, 'missing-chrome') },
    { browser: 'edge', path: join(dir, 'missing-edge') },
  ])
  expect(result).toEqual({ isInstalled: false, browser: null })
})
