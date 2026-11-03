import { afterEach, describe, expect, test } from 'bun:test'
import {
  activateProactive,
  deactivateProactive,
  getProactiveActivationSource,
  isProactiveActive,
  isProactivePaused,
  pauseProactive,
  resumeProactive,
  setContextBlocked,
  subscribeToProactiveChanges,
} from '../src/proactive/index.js'

afterEach(() => deactivateProactive())

describe('proactive REPL state shared by terminal, prompt and agent tools', () => {
  test('starts inactive, activates and disables without retaining earlier blocks', () => {
    deactivateProactive()
    expect(isProactiveActive()).toBe(false)
    expect(isProactivePaused()).toBe(false)
    expect(getProactiveActivationSource()).toBeNull()
    activateProactive('command')
    expect(isProactiveActive()).toBe(true)
    expect(isProactivePaused()).toBe(false)
    expect(getProactiveActivationSource()).toBe('command')
    pauseProactive()
    deactivateProactive()
    activateProactive('command')
    expect(isProactivePaused()).toBe(false)
  })

  test('manual pause remains active until the next input resumes it', () => {
    activateProactive('command')
    pauseProactive()
    expect(isProactiveActive()).toBe(true)
    expect(isProactivePaused()).toBe(true)
    resumeProactive()
    expect(isProactivePaused()).toBe(false)
  })

  test('an API error remains blocked even when the user resumes input', () => {
    activateProactive('command')
    pauseProactive()
    setContextBlocked(true)
    resumeProactive()
    expect(isProactivePaused()).toBe(true)
    setContextBlocked(false)
    expect(isProactivePaused()).toBe(false)
  })

  test('clearing context failure must not override user-requested pause', () => {
    activateProactive('command')
    setContextBlocked(true)
    pauseProactive()
    setContextBlocked(false)
    expect(isProactivePaused()).toBe(true)
    resumeProactive()
    expect(isProactivePaused()).toBe(false)
  })

  test('notifies only on effective transitions, allows independent unsubscribe', () => {
    const first: Array<string> = []
    const second: Array<string> = []
    const offFirst = subscribeToProactiveChanges(() => first.push('first'))
    const offSecond = subscribeToProactiveChanges(() => second.push('second'))
    try {
      deactivateProactive()
      activateProactive('command')
      activateProactive('command')
      pauseProactive()
      pauseProactive()
      offFirst()
      setContextBlocked(true)
      resumeProactive()
      deactivateProactive()
      expect(first).toEqual(['first', 'first'])
      expect(second).toEqual(['second', 'second', 'second', 'second', 'second'])
    } finally {
      offFirst()
      offSecond()
    }
  })

  test('inactive state ignores obsolete pause and context-error signals', () => {
    deactivateProactive()
    pauseProactive()
    setContextBlocked(true)
    resumeProactive()
    activateProactive('command')
    expect(isProactivePaused()).toBe(false)
  })
})
