import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AUTO_REJECT_MESSAGE, DONT_ASK_REJECT_MESSAGE, buildYoloRejectionMessage,
} from '../src/utils/messages.ts'

test('permission refusals prevent equivalent cleanup via different tools or commands', () => {
  const forms = [
    AUTO_REJECT_MESSAGE('Bash'),
    DONT_ASK_REJECT_MESSAGE('Bash'),
    buildYoloRejectionMessage('Action would remove files outside the workspace'),
  ]
  for (const text of forms) {
    assert.match(text, /not just this exact command/)
    assert.match(text, /Do not retry the same action/)
    assert.match(text, /switching tools or languages/)
    assert.match(text, /scripts or tests/)
    assert.match(text, /leave those files untouched/)
    assert.match(text, /continue independent safe tasks/)
    assert.match(text, /request explicit authorization/)
  }
})
