import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const source = (path: string) => readFileSync(join(import.meta.dir, '..', path), 'utf8')
describe('旧云会话和远程控制已退出公开 CLI', () => {
  it('主入口无官方创建、传送和远程控制选项', () => {
    const main = source('src/main.tsx')
    for (const line of ["program.option('--cloud", "program.option('--environment", "program.addOption(new Option('--teleport", "program.addOption(new Option('--remote", "program.command('remote-control'"]) expect(main).not.toContain(line)
    expect(main).not.toContain('teleportToRemoteWithErrorHandling(')
    expect(main).toContain('replBridgeEnabled: false')
  })
  it('CLI 不以官方 CCR 身份连接远程控制服务', () => {
    const cli = source('src/entrypoints/cli.tsx')
    expect(cli).not.toContain('await bridgeMain(args.slice(1))')
    expect(cli).not.toContain("cli_bridge_path")
  })
})
