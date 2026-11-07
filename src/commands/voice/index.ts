import type { Command, LocalCommandCall } from '../../types/command.js'
import { getShortcutDisplay } from '../../keybindings/shortcutFormat.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import { getInitialSettings, updateSettingsForSource } from '../../utils/settings/settings.js'
import { isVoiceModeEnabled } from '../../voice/voiceModeEnabled.js'

/** 本地语音入口：使用用户安装的 Whisper CLI，不要求 Claude.ai 登录。 */
const call: LocalCommandCall = async () => {
  const enabled = getInitialSettings().voiceEnabled === true
  if (!enabled && !isVoiceModeEnabled()) {
    return {
      type: 'text',
      value: '请先安装 whisper.cpp 并设置 YAOYAOCHE_WHISPER_CLI 与 YAOYAOCHE_WHISPER_MODEL 的绝对路径，再运行 /voice。',
    }
  }

  if (!enabled) {
    const { checkRecordingAvailability, checkVoiceDependencies, requestMicrophonePermission } =
      await import('../../services/voice.js')
    const recording = await checkRecordingAvailability()
    if (!recording.available) {
      return { type: 'text', value: recording.reason ?? '当前设备无法录音，请检查麦克风权限。' }
    }
    const dependencies = await checkVoiceDependencies()
    if (!dependencies.available) {
      return {
        type: 'text',
        value: dependencies.installCommand
          ? `缺少录音组件，请先执行：${dependencies.installCommand}`
          : '缺少本地录音组件，请检查 SoX 或系统录音驱动。',
      }
    }
    if (!(await requestMicrophonePermission())) {
      return { type: 'text', value: '麦克风权限未授权，请在系统隐私设置中允许摇摇车使用麦克风。' }
    }
  }

  const result = updateSettingsForSource('userSettings', { voiceEnabled: !enabled })
  if (result.error) {
    return { type: 'text', value: `本地语音设置保存失败：${result.error.message}` }
  }
  settingsChangeDetector.notifyChange('userSettings')
  if (enabled) return { type: 'text', value: '本地语音转写已关闭。' }
  const shortcut = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
  return { type: 'text', value: `本地语音转写已开启。按住 ${shortcut} 录音，松开后由 Whisper 在本机识别。` }
}

const voice = {
  type: 'local',
  name: 'voice',
  description: '启用或关闭本地语音转写（Whisper）',
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default voice
