import { expect, test } from 'bun:test'
import { dirname, join } from 'node:path'
import { getInboxPath } from '../src/utils/teammateMailbox.js'
import { getTeamDir } from '../src/utils/swarm/teamHelpers.js'

test('团队邮箱与团队名册使用同一规范目录，兼容大小写和特殊字符', () => {
  for (const team of ['Engineering', 'Review & Tests', 'Team_ABC']) {
    const inbox = getInboxPath('researcher', team)
    expect(inbox).toBe(join(getTeamDir(team), 'inboxes', 'researcher.json'))
    expect(dirname(dirname(inbox))).toBe(getTeamDir(team))
  }
})

test('中文团队的邮箱始终写入带有身份后缀的正式团队目录', () => {
  const team = '审查组-fd3a40ca'
  expect(getInboxPath('reviewer', team)).toBe(
    join(getTeamDir(team), 'inboxes', 'reviewer.json'),
  )
})
