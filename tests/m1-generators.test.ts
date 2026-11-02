import { test, expect } from 'bun:test'
import { all, lastX, returnValue, toArray } from '../src/utils/generators.js'

test('returnValue preserves the async generator completion payload', async () => {
  async function* generator(): AsyncGenerator<string, {status:string,count:number}> {
    yield 'step 1'
    yield 'step 2'
    return {status:'done',count:2}
  }
  expect(await returnValue(generator())).toEqual({status:'done',count:2})
})

test('returnValue distinguishes an intentionally undefined final return', async () => {
  async function* generator(): AsyncGenerator<number, undefined> {
    yield 1
    return undefined
  }
  expect(await returnValue(generator())).toBeUndefined()
})

test('lastX returns the last yielded value and rejects an empty stream', async () => {
  async function* values() {yield 0;yield 3;yield 1}
  async function* empty(): AsyncGenerator<number> {}
  expect(await lastX(values())).toBe(1)
  expect(lastX(empty())).rejects.toThrow('No items in generator')
})

test('all combines actual yielded values from concurrent streams', async () => {
  async function* first() {yield 'a1';yield 'a2'}
  async function* second() {yield 'b1';yield 'b2'}
  const items=await toArray(all([first(),second()],2))
  expect(items.length).toBe(4)
  expect(items.sort()).toEqual(['a1','a2','b1','b2'])
})
