/** CLI native installer. Kept independent of the retired Ink UI. */
import { cwd } from 'node:process'

export async function installHandler(target: string | undefined, options: {force?:boolean}): Promise<void> {
  const { setup } = await import('../../setup.js')
  await setup(cwd(), 'default', false, false, undefined, false)
  const { install } = await import('../../commands/install.js')
  await new Promise<void>(resolve => {
    const args: string[] = []
    if (target) args.push(target)
    if (options.force) args.push('--force')
    void install.call(result => {
      resolve()
      process.exit(result.includes('failed') ? 1 : 0)
    }, {}, args)
  })
}
