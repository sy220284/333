/**
 * Test collector and assertion vocabulary for plugin test's isolated VM.
 * Mirrors the native 317 test/describe/tier registration surface and returns
 * structured per-case results. Real hook interactions are supplied by the
 * worker's module environment.
 */
import assert from 'node:assert/strict'

export function createPluginTestKit317() {
  const cases = []
  let collecting = true
  let tierValue = 'user'
  let tierAssigned = false
  const scopes = []
  const report = (name, body, options = {}) => {
    if (!collecting) throw new TypeError('test() is called while the file loads, not inside a test')
    if (typeof name !== 'string' || typeof body !== 'function') {
      throw new TypeError('test(name, body) or test(name, options, body): a string, then a function')
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('test options must be an object')
    }
    cases.push({ title: [...scopes, name].join(' › '), body, options })
  }
  const test = (name, ...rest) => {
    const [options, body] = rest.length === 1 ? [{}, rest[0]] : rest
    report(name, body, options)
  }
  const describe = (name, body) => {
    if (typeof name !== 'string' || typeof body !== 'function') {
      throw new TypeError('describe(name, body) takes a string and a function')
    }
    if (!collecting) throw new TypeError('describe() is called while the file loads')
    scopes.push(name)
    try { body() } finally { scopes.pop() }
  }
  const tier = value => {
    if (tierAssigned) throw new TypeError('tier() is called once, for the whole file')
    if (!['user', 'prepend', 'append', 'builtin'].includes(value)) {
      throw new TypeError('tier must be user, prepend, append, or builtin')
    }
    tierAssigned = true
    tierValue = value
  }
  const matches = (actual, expected, inverted, compare, name) => {
    let failed
    try { compare(actual, expected) } catch (error) { failed = error }
    if (inverted ? !failed : !!failed) {
      const cause = failed?.message ?? 'both values matched'
      throw new assert.AssertionError({
        message: `expect().${inverted ? 'not.' : ''}${name} failed: ${cause}`,
        actual, expected,
      })
    }
  }
  function makeExpect(actual, inverted = false) {
    const check = (expected, comparison, name) =>
      matches(actual, expected, inverted, comparison, name)
    return {
      get not() { return makeExpect(actual, !inverted) },
      toBe(expected) { check(expected, assert.strictEqual, 'toBe') },
      toEqual(expected) { check(expected, assert.deepStrictEqual, 'toEqual') },
      toStrictEqual(expected) { check(expected, assert.deepStrictEqual, 'toStrictEqual') },
      toContain(expected) {
        check(expected, (a, b) => assert.ok(
          (typeof a === 'string' || Array.isArray(a)) && a.includes(b),
          'expected the sequence to contain its member',
        ), 'toContain')
      },
      toMatch(expected) {
        check(expected, (a, b) => assert.match(String(a), b instanceof RegExp ? b : new RegExp(b)), 'toMatch')
      },
      toBeTruthy() { check(true, a => assert.ok(a), 'toBeTruthy') },
      toBeFalsy() { check(false, a => assert.ok(!a), 'toBeFalsy') },
      toBeDefined() { check(undefined, a => assert.notStrictEqual(a, undefined), 'toBeDefined') },
      toBeUndefined() { check(undefined, a => assert.strictEqual(a, undefined), 'toBeUndefined') },
      toBeNull() { check(null, a => assert.strictEqual(a, null), 'toBeNull') },
      toHaveLength(expected) { check(expected, (a,b) => assert.strictEqual(a?.length, b), 'toHaveLength') },
      toThrow(expected) {
        check(expected, (a, b) => assert.throws(a, b === undefined ? undefined : b), 'toThrow')
      },
    }
  }
  const expect = actual => makeExpect(actual)
  const mock = {
    fn(implementation = () => undefined) {
      const calls = []
      const stub = (...args) => { calls.push(args); return implementation(...args) }
      stub.mock = { calls }
      return stub
    },
  }
  return {
    namespace: { test, describe, expect, mock, tier },
    get cases() { return cases },
    get tier() { return tierValue },
    finishCollecting() { collecting = false },
  }
}
