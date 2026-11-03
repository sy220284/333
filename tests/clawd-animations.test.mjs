import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clawdAnimations, clickAnimationNames, clawdAppearance, clawdIdleSequence } from '../src/components/LogoV2/clawdAnimationData.mjs'

function assertValidPose(pose) {
  if (typeof pose === 'string') {
    assert.ok(clawdAppearance.poses[pose], `unknown named pose: ${pose}`)
    return
  }
  assert.ok(pose && typeof pose === 'object', 'animation pose must be named or composed')
  if ('facing' in pose) {
    assert.ok(clawdAppearance.facing[pose.facing]?.length > 0, `unknown facing: ${pose.facing}`)
    return
  }
  assert.ok(clawdAppearance.eyes[pose.eyes]?.length > 0, `unknown eyes: ${pose.eyes}`)
  assert.ok(clawdAppearance.arms[pose.arms], `unknown arms: ${pose.arms}`)
  assert.equal(typeof clawdAppearance.feet[pose.feet], 'string', `unknown feet: ${pose.feet}`)
}

function assertFrames(frames) {
  assert.ok(Array.isArray(frames) && frames.length > 0, 'animation must contain frames')
  for (const frame of frames) {
    assertValidPose(frame.pose)
    assert.ok(Number.isSafeInteger(frame.offset), 'animation offsets may be signed, but must remain integral')
    if (frame.x !== undefined) assert.ok(Number.isSafeInteger(frame.x), 'invalid x shift')
    if (frame.poof !== undefined) assert.ok(['dot', 'wave'].includes(frame.poof), 'invalid poof style')
    if (frame.shadow !== undefined) assert.ok(['wide', 'narrow'].includes(frame.shadow), 'invalid shadow style')
  }
}

test('最终版动画资源结构完整，所有帧与展示元素存在实际引用', () => {
  assert.ok(Object.keys(clawdAnimations).length > 0, 'no defined animations')
  assert.ok(Object.keys(clawdAppearance.poses).length > 0, 'no base poses')
  for (const arms of Object.values(clawdAppearance.arms)) {
    for (const part of ['r1L', 'r1R', 'r2L', 'r2R']) {
      assert.equal(typeof arms[part], 'string', `missing arm glyph ${part}`)
    }
  }
  for (const [name, eyes] of Object.entries(clawdAppearance.eyes)) {
    assert.ok(eyes.length > 0 && eyes.every(x => typeof x.glyphs === 'string'))
    assert.equal(typeof clawdAppearance.appleEyes[name], 'string', `Apple Terminal missing eyes: ${name}`)
  }
  for (const poses of Object.values(clawdAppearance.facing)) {
    assert.ok(poses.length > 0)
    for (const row of poses) {
      assert.equal(typeof row.glyphs, 'string')
      assert.ok(Number.isSafeInteger(row.from) && Number.isSafeInteger(row.to))
      assert.ok(row.from >= 0 && row.to >= row.from && row.to <= row.glyphs.length)
    }
  }
  assert.ok(Array.isArray(clickAnimationNames) && clickAnimationNames.length > 0)
  assert.equal(new Set(clickAnimationNames).size, clickAnimationNames.length)
  for (const [name, frames] of Object.entries(clawdAnimations)) assertFrames(frames)
  for (const name of clickAnimationNames) assert.ok(clawdAnimations[name], `unknown click animation: ${name}`)
  assertFrames(clawdIdleSequence)
  // The target's actual animation glyphs, order and timing are checked by
  // the official 2.1.317 native-vs-rebuilt PTY runner. A 2.1.310 SHA
  // snapshot would reject valid upgrades to the final target resources.
})
