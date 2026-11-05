import type { Command, LocalCommandCall } from '../types/command.js'
import { isEnvTruthy } from '../utils/envUtils.js'

const call: LocalCommandCall = async (_, context) => {
  const note = context.getAppState().knowledgeNote
  if (!note) {
    return {
      type: 'text',
      value: 'No knowledge note has been offered in this session.',
    }
  }
  return {
    type: 'text',
    value: `${note.tag}: ${note.learn}\n\n${note.explain}`,
  }
}

const know = {
  type: 'local',
  name: 'know',
  description: 'Show the explanation behind the most recent You should know hint',
  supportsNonInteractive: true,
  isEnabled: () => isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_YOU_SHOULD_KNOW),
  load: () => Promise.resolve({ call }),
} satisfies Command

export default know
