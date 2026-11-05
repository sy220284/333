import {test,expect} from 'bun:test'
import {unrecordedPtyReplay317} from '../src/cli/background/ptyReplay317.ts'

test('317 PTY adoption skips bytes already persisted before restart',()=>{
  expect(unrecordedPtyReplay317(Buffer.from('abc123'),Buffer.from('123456')).toString())
    .toBe('456')
  expect(unrecordedPtyReplay317(Buffer.from('old-replay'),Buffer.from('replay')).length)
    .toBe(0)
  expect(unrecordedPtyReplay317(Buffer.from('different'),Buffer.from('new data')).toString())
    .toBe('new data')
})
test('317 PTY dedup handles large repetitive output in linear time',()=>{
  const replay=Buffer.from('a'.repeat(220_000)+'b')
  const known=Buffer.from('log'+'a'.repeat(220_000))
  expect(unrecordedPtyReplay317(known,replay).toString()).toBe('b')
})
test('317 PTY replay preserves raw UTF-8 and binary bytes',()=>{
  const known=Buffer.from([1,2,3,4,5])
  const replay=Buffer.from([4,5,0,255,254])
  expect(unrecordedPtyReplay317(known,replay).equals(Buffer.from([0,255,254]))).toBe(true)
})
