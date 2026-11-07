/** Trusted local desktop operations over the native teammate mailbox.
 * Team creation and deletion remain in the SDK tool lifecycle. The desktop
 * sends explicitly authorised messages without spending a model turn, while
 * preserving the mailbox's lifecycle lock and original member protocol.
 */
import { resolve } from 'node:path'
import { TEAM_LEAD_NAME } from '../../utils/swarm/constants.js'
import { readTeamFileAsync, type TeamFile } from '../../utils/swarm/teamHelpers.js'
import { listProjectTeams } from '../../utils/teamDiscovery.js'
import { readMailbox, writeToMailbox } from '../../utils/teammateMailbox.js'

async function requireProjectTeam(projectDir: string, teamName: string): Promise<TeamFile> {
  const teams = await listProjectTeams(projectDir)
  if (!teams.some(team => team.name === teamName))
    throw new Error('团队不属于当前项目或已解散')
  const file = await readTeamFileAsync(teamName)
  const lead = file?.members?.find(member => member.name === TEAM_LEAD_NAME)
  if (!file || !lead || file.name !== teamName ||
      resolve(file.projectDir ?? lead.cwd) !== resolve(projectDir))
    throw new Error('团队名册已变化，请刷新团队列表')
  return file
}

export async function sendProjectTeamMessage(
  projectDir: string,
  request: { teamName: string; to: string; message: string; messageId: string },
): Promise<{ queued: true; teamName: string; recipient: string; messageId: string }> {
  const message = request.message.trim()
  if (!message || message.length > 6000) throw new Error('团队任务内容长度不合法')
  const team = await requireProjectTeam(projectDir, request.teamName)
  if (request.to === TEAM_LEAD_NAME ||
      !team.members.some(member => member.name === request.to))
    throw new Error('请选择当前团队中的有效成员')
  await writeToMailbox(request.to, {
    from: TEAM_LEAD_NAME,
    text: message,
    summary: message.slice(0, 100),
    timestamp: new Date().toISOString(),
    messageId: request.messageId,
  }, team.name, { projectDir })
  // Queued means stored in the inbox. It is not an acknowledgement that
  // the teammate has read or carried out the instruction.
  return { queued: true, teamName: team.name, recipient: request.to, messageId: request.messageId }
}

export async function readProjectTeamInbox(
  projectDir: string, teamName: string, memberName: string,
) {
  const team = await requireProjectTeam(projectDir, teamName)
  if (!team.members.some(member => member.name === memberName))
    throw new Error('无法读取其他团队成员的信箱')
  const messages = await readMailbox(memberName, team.name)
  return { teamName: team.name, memberName, messages: messages.slice(-50) }
}
