import { useAppState } from '../state/AppState.js'
import { isVoiceGrowthBookEnabled } from '../voice/voiceModeEnabled.js'

/** 用户本地设置与 Whisper 引擎可用性共同决定语音模式。无需账号鉴权。 */
export function useVoiceEnabled(): boolean {
  const userIntent = useAppState(s => s.settings.voiceEnabled === true)
  return userIntent && isVoiceGrowthBookEnabled()
}
