import { expect, test } from 'bun:test'
import {
  MIN_DESKTOP_VERSION,
  buildDesktopDeepLink,
  buildDesktopNewSessionLink,
} from '../src/utils/desktopDeepLink.js'

test('2.1.310 requires the installed Desktop version used by its runtime', () => {
  expect(MIN_DESKTOP_VERSION).toBe('1.1.9669')
})

test('Desktop resume link transfers the session ID without the removed cwd field', () => {
  const url = new URL(buildDesktopDeepLink('123e4567-e89b-42d3-a456-426614174000'))
  expect(['claude:', 'claude-dev:']).toContain(url.protocol)
  expect(url.host).toBe('resume')
  expect(url.searchParams.get('session')).toBe('123e4567-e89b-42d3-a456-426614174000')
  expect(url.searchParams.has('cwd')).toBe(false)
})

test('Desktop new session link encodes folder paths exactly once', () => {
  const folder = '/tmp/project 中文/#review & docs'
  const url = new URL(buildDesktopNewSessionLink(folder))
  expect(['claude:', 'claude-dev:']).toContain(url.protocol)
  expect(url.host).toBe('code')
  expect(url.pathname).toBe('/new')
  expect(url.searchParams.get('folder')).toBe(folder)
})
