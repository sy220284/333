import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { clawdAnimations, clickAnimationNames, clawdAppearance, clawdIdleSequence } from '../src/components/LogoV2/clawdAnimationData.mjs'

test('新版角色动作和姿态素材完整', () => {
  assert.deepEqual(Object.keys(clawdAnimations), ['jump', 'look', 'celebrate', 'skip', 'spin', 'peekaboo', 'drop', 'waddle', 'peek', 'wink', 'boop', 'tap', 'sneeze', 'turn', 'coin-hop'])
  assert.equal(clickAnimationNames.length, 14)
  assert.equal(clawdAppearance.eyes.wink.length, 3)
  assert.equal(clawdAppearance.facing.back.length, 3)
  assert.equal(clawdAnimations.turn.some(frame => frame.pose.facing === 'back'), true)
  assert.equal(clawdAnimations.wink.some(frame => frame.pose.eyes === 'wink'), true)
  assert.equal(clawdIdleSequence.length, 22)
  assert.equal(clawdIdleSequence[12].pose, 'look-right')
  const targetBytes = JSON.stringify({ clawdAppearance, clawdAnimations, clickAnimationNames })
  assert.equal(createHash('sha256').update(targetBytes).digest('hex'), '5d89e7862351611b6bacbf75bd361f7ffe4b4ab026ef98f148a5698617c52c75')
})
