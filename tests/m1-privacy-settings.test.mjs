import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchPrivacySettingsFresh } from '../src/commands/privacy-settings/fetchPrivacySettings.mjs'

test('F080: opening privacy settings always invalidates the previous displayed value', async () => {
  let calls = 0
  let cached = { success:true, data: { grove_enabled:true, grove_notice_viewed_at:null } }
  const getSettings = Object.assign(async () => {
    calls++
    return cached
  }, { cache: { clear() {
    cached = { success:true, data:{ grove_enabled:false, grove_notice_viewed_at:null } }
  } } })
  const result = await fetchPrivacySettingsFresh(getSettings, async () => ({
    success:true, data:{ grove_enabled:true, domain_excluded:false }
  }))
  assert.equal(calls, 1)
  assert.deepEqual(result, { success:true,
    settings:{ grove_enabled:false, grove_notice_viewed_at:null },
    config:{ grove_enabled:true, domain_excluded:false }
  })
})

test('F080: remote account or notice-config failure forbids stale privacy dialog', async () => {
  for (const failing of ['settings','config']) {
    let invalidations=0, calls=0
    const settings = Object.assign(async () => {
      calls++
      return failing === 'settings'
        ? { success:false }
        : { success:true, data:{ grove_enabled:true } }
    }, { cache:{ clear() { invalidations++ } } })
    const config = async () => {
      calls++
      return failing === 'config'
        ? { success:false }
        : { success:true, data:{ grove_enabled:true } }
    }
    assert.deepEqual(await fetchPrivacySettingsFresh(settings,config), { success:false })
    assert.equal(calls,2, 'Both settings endpoints must be queried')
    assert.equal(invalidations,1, 'Cached account state must be invalidated')
  }
})

test('F080: two sequential privacy-dialog opens each obtain a fresh server state', async () => {
  let active = true
  let cacheClear = 0
  const getSettings = Object.assign(async () => ({
    success:true, data:{ grove_enabled:active }
  }), { cache:{ clear() { cacheClear++ } } })
  const config = async () => ({ success:true, data:{ grove_enabled:active } })
  const first=await fetchPrivacySettingsFresh(getSettings,config)
  active=false
  const second=await fetchPrivacySettingsFresh(getSettings,config)
  assert.equal(first.settings.grove_enabled,true)
  assert.equal(second.settings.grove_enabled,false)
  assert.equal(cacheClear,2)
})
