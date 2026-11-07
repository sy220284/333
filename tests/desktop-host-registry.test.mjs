import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evictCurrentHost } from '../desktop/electron/hostRegistry.mjs'

test('桌面旧后台迟到的 exit/error 事件不会删除新后台连接',()=>{
 const original={name:'old',state:'closing'}
 const replacement={name:'new',state:'connected'}
 const hosts=new Map([['project-a',original],['project-b',replacement]])
 hosts.set('project-a',replacement)
 assert.equal(evictCurrentHost(hosts,'project-a',original),false)
 assert.equal(hosts.get('project-a'),replacement)
 assert.equal(evictCurrentHost(hosts,'project-a',original),false)
 assert.equal(hosts.get('project-b'),replacement)
 assert.equal(evictCurrentHost(hosts,'project-a',replacement),true)
 assert.equal(hosts.has('project-a'),false)
 assert.equal(hosts.get('project-b'),replacement)
})
