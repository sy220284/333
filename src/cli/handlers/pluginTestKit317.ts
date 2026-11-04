/**
 * Test collector and assertion vocabulary for plugin test's isolated VM.
 * Mirrors the native 317 test/describe/tier registration surface and returns
 * structured per-case results. Real hook interactions are supplied by the
 * worker's module environment.
 */
import assert from 'node:assert/strict'

/**
 * Comparison across vm.SourceTextModule realms needs structural cloning:
 * Node's assert.deepStrictEqual also compares object prototypes, and an
 * ordinary object created in the isolated VM has a different Object.prototype.
 * Keep numbers (including NaN), undefined, Date, RegExp and circular identity.
 */
function normalizeRealmValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  const tag = Object.prototype.toString.call(value)
  if (tag === '[object Date]') return new Date(Date.prototype.getTime.call(value))
  if (tag === '[object RegExp]') return new RegExp(value.source, value.flags)
  if (tag === '[object ArrayBuffer]') return Uint8Array.from(new Uint8Array(value))
  if (ArrayBuffer.isView(value)) return Uint8Array.from(new Uint8Array(
    value.buffer, value.byteOffset, value.byteLength,
  ))
  if (tag === '[object Map]') {
    const map = new Map()
    seen.set(value, map)
    for (const [key, item] of value) {
      map.set(normalizeRealmValue(key, seen), normalizeRealmValue(item, seen))
    }
    return map
  }
  if (tag === '[object Set]') {
    const set = new Set()
    seen.set(value, set)
    for (const item of value) set.add(normalizeRealmValue(item, seen))
    return set
  }
  if (Array.isArray(value)) {
    const array = new Array(value.length)
    seen.set(value, array)
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue
      array[key] = normalizeRealmValue(value[key], seen)
    }
    return array
  }
  if (tag === '[object Error]') {
    const error = { name: value.name, message: value.message }
    seen.set(value, error)
    if ('cause' in value) error.cause = normalizeRealmValue(value.cause, seen)
    return error
  }
  if (tag === '[object Object]') {
    const plain = {}
    seen.set(value, plain)
    for (const key of Reflect.ownKeys(value)) {
      plain[key] = normalizeRealmValue(value[key], seen)
    }
    return plain
  }
  return value
}

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
      throw new TypeError('test(name, options, body): options is an object')
    }
    const { plugins = [], timeoutMs = 5000, options: values } = options
    if (!Array.isArray(plugins)) {
      throw new TypeError('test(name, { plugins }): an array of plugins')
    }
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('test(name, { timeoutMs }): a positive finite number')
    }
    if (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values))) {
      throw new TypeError('test(name, { options }): an object of plugin userConfig values')
    }
    cases.push({
      title: [...scopes, name].join(' > '), body,
      options: { ...options, plugins, timeoutMs },
    })
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
      toEqual(expected) {
        check(expected, (a, b) =>
          assert.deepStrictEqual(normalizeRealmValue(a), normalizeRealmValue(b)), 'toEqual')
      },
      toStrictEqual(expected) {
        check(expected, (a, b) =>
          assert.deepStrictEqual(normalizeRealmValue(a), normalizeRealmValue(b)), 'toStrictEqual')
      },
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
