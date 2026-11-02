import { startUdsMessaging } from '../../src/utils/udsMessaging.js'
import { getCommandQueue } from '../../src/utils/messageQueueManager.js'
import { runCleanupFunctions } from '../../src/utils/cleanupRegistry.js'
const socket = process.argv[2]
if (!socket) throw new Error('No socket')
await startUdsMessaging(socket)
process.stdout.write('READY\n')
const timer = setInterval(async () => {
  if (getCommandQueue().some(c => c.mode === 'prompt' && c.value === '<cross-session-message from="unknown">\n' + 'cross-process-hello\n</cross-session-message>')) {
    clearInterval(timer)
    process.stdout.write('DELIVERED\n')
    await runCleanupFunctions()
    process.exit(0)
  }
}, 25)
setTimeout(async () => {
  clearInterval(timer)
  process.stderr.write('Expected peer message never entered the queue\n')
  await runCleanupFunctions()
  process.exit(2)
}, 12000).unref()
