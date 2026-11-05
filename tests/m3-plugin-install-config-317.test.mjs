import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeInstallConfigAssignments as route } from '../src/utils/plugins/pluginInstallConfigRouting.mjs'

test('2.1.317 routes top-level plugin and explicit bundled server configs', () => {
  const actual = route(['key=value=with=equals', 'matrix.token=secret', 'matrix.port=443'],
    { key: {} }, { matrix: { token: {}, port: {} } })
  assert.deepEqual(actual, {
    topLevel: { key: 'value=with=equals' },
    servers: { matrix: { token: 'secret', port: '443' } },
  })
})
test('2.1.317 permits a bare server key only when unambiguous', () => {
  assert.deepEqual(route(['token=abc'], {}, { first: { token: {} }, second: { port: {} } }),
    { topLevel: {}, servers: { first: { token: 'abc' } } })
  assert.throws(() => route(['token=abc'], {}, { first: { token: {} }, second: { token: {} } }), /ambiguous/)
})
test('2.1.317 gives precedence to top-level exact keys', () => {
  assert.deepEqual(route(['token=top', 'chat.token=server'], { token: {} }, { chat: { token: {} } }),
    { topLevel: { token: 'top' }, servers: { chat: { token: 'server' } } })
})
test('2.1.317 checks field names and empty input before writing', () => {
  assert.throws(() => route(['missing=x'], {}, { chat: { token: {} } }), /not declared/)
  assert.throws(() => route(['chat.missing=x'], {}, { chat: { token: {} } }), /not declared/)
  assert.throws(() => route(['token='], {}, { chat: { token: {} } }), /value is empty/)
  assert.throws(() => route(['=x'], {}, {}), /<key=value>/)
})
test('2.1.317 chooses the longest declared server name', () => {
  assert.deepEqual(route(['a.b.token=abc'], {}, { a: { 'b.token': {} }, 'a.b': { token: {} } }),
    { topLevel: {}, servers: { 'a.b': { token: 'abc' } } })
})
