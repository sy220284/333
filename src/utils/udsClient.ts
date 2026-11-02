import { connect } from 'node:net'

/** Delivery succeeds only after the recipient acknowledges queue insertion. */
export async function sendToUdsSocket(socketPath: string, message: string): Promise<void> {
  if (!socketPath.startsWith('/') || !message.trim() || Buffer.byteLength(message, 'utf8') > 64 * 1024) {
    throw new Error('Invalid peer address or message size')
  }
  await new Promise<void>((resolve, reject) => {
    const socket = connect(socketPath)
    let receipt = ''
    socket.setTimeout(5000)
    socket.once('connect', () => socket.write(`${JSON.stringify({ message })}\n`))
    socket.on('data', chunk => {
      receipt += chunk.toString('utf8')
      if (receipt.length > 1024) { socket.destroy(new Error('Invalid peer receipt')); return }
      if (receipt.includes('\n')) {
        const line = receipt.slice(0, receipt.indexOf('\n'))
        socket.end()
        if (line === 'OK') resolve()
        else reject(new Error(`Peer rejected message: ${line}`))
      }
    })
    socket.once('error', reject)
    socket.once('timeout', () => socket.destroy(new Error('Peer receipt timed out')))
    socket.once('close', hadError => {
      if (!receipt.includes('\n') && !hadError) reject(new Error('Peer closed before acknowledgement'))
    })
  })
}
