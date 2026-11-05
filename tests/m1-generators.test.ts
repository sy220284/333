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

test('all rejects an invalid concurrency cap before silently dropping generators', async () => {
  async function* values() { yield 'kept' }
  for (const cap of [0, -1, 0.5, Number.NaN]) {
    await expect(toArray(all([values()], cap))).rejects.toThrow(/positive integer/)
  }
  expect(await toArray(all([values()], Infinity))).toEqual(['kept'])
})

test('all enforces concurrency cap and advances queued generators after a stream ends', async () => {
  const active = {count: 0, peak: 0}
  const started: number[] = []
  async function* task(id: number): AsyncGenerator<string, void> {
    started.push(id)
    active.count++
    active.peak = Math.max(active.peak, active.count)
    try {
      await Promise.resolve()
      yield `task-${id}`
    } finally {
      active.count--
    }
  }
  const values = await toArray(all([task(1), task(2), task(3), task(4)], 2))
  expect(values.sort()).toEqual(['task-1', 'task-2', 'task-3', 'task-4'])
  expect(started).toEqual([1, 2, 3, 4])
  expect(active.peak).toBe(2)
  expect(active.count).toBe(0)
})

test('all propagates a generator failure instead of treating it as completion', async () => {
  async function* broken(): AsyncGenerator<string, void> {
    yield 'before error'
    throw new Error('upstream failed')
  }
  await expect(toArray(all([broken()], 1))).rejects.toThrow('upstream failed')
})
