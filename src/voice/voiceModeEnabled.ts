import { feature } from 'bun:bundle'
import { isVoiceStreamAvailable } from '../services/voiceStreamSTT.js'

/** 语音功能为可选编译能力，且必须配置本地转写引擎。 */
export function isVoiceGrowthBookEnabled(): boolean {
  return feature('VOICE_MODE') ? isVoiceStreamAvailable() : false
}

export function hasVoiceAuth(): boolean {
  return isVoiceStreamAvailable()
}

export function isVoiceModeEnabled(): boolean {
  return isVoiceGrowthBookEnabled() && isVoiceStreamAvailable()
}
