import { expect, test } from 'bun:test'
import { supportsComputerUsePlatform } from '../src/utils/computerUse/platformSupport.js'

test('Computer Use only advertises tools on the macOS Swift runtime', () => {
  expect(supportsComputerUsePlatform('darwin')).toBe(true)
  expect(supportsComputerUsePlatform('linux')).toBe(false)
  expect(supportsComputerUsePlatform('win32')).toBe(false)
  expect(supportsComputerUsePlatform('freebsd')).toBe(false)
})
