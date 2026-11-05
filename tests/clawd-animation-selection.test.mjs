import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getClickAnimationNames } from '../src/components/LogoV2/clawdAnimationSelection.ts'
import { clickAnimationNames, clawdAnimations, clawdAppearance } from '../src/components/LogoV2/clawdAnimationData.mjs'

test('最终版点击动作按真实帧和终端绘制能力筛选', () => {
  const terminal = getClickAnimationNames(false)
  const apple = getClickAnimationNames(true)
  assert.ok(terminal.length > 0, 'ordinary terminals must have an animation')
  assert.ok(apple.length > 0, 'Apple Terminal must have an animation')
  assert.equal(new Set(terminal).size, terminal.length)
  assert.equal(new Set(apple).size, apple.length)
  assert.deepEqual(terminal,
    clickAnimationNames.filter(name => (clawdAnimations[name][0]?.x ?? 0) === 0))
  for (const name of apple) {
    assert.ok(terminal.includes(name), `Apple-only animation missing from normal terminal: ${name}`)
    const frames = clawdAnimations[name]
    assert.ok(frames.length > 0)
    assert.ok(!frames.some(frame =>
      typeof frame.pose === 'object' && 'facing' in frame.pose),
    `Apple Terminal cannot draw facing animation: ${name}`)
    const pose = typeof frames[0].pose === 'string'
      ? clawdAppearance.poses[frames[0].pose]
      : frames[0].pose
    assert.ok(pose.eyes !== 'open' || frames[0].offset !== 0 || (frames[0].x ?? 0) !== 0)
  }
})
