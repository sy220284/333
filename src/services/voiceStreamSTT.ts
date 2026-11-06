/**
 * 本地可选语音转写：使用用户自行安装的 whisper.cpp whisper-cli。
 * 音频只写入短时受权限保护的本地 WAV 文件；不会向任何网络发送音频。
 * 运行前需设置 YAOYAOCHE_WHISPER_CLI 与 YAOYAOCHE_WHISPER_MODEL。
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SAMPLE_RATE = 16_000
const MAX_AUDIO_BYTES = 20 * 1024 * 1024

export const FINALIZE_TIMEOUTS_MS = {
  safety: 120_000,
  noData: 0,
}

export type VoiceStreamCallbacks = {
  onTranscript: (text: string, isFinal: boolean) => void
  onError: (error: string, opts?: { fatal?: boolean }) => void
  onClose: () => void
  onReady: (connection: VoiceStreamConnection) => void
}

export type FinalizeSource =
  | 'post_closestream_endpoint'
  | 'no_data_timeout'
  | 'safety_timeout'
  | 'ws_close'
  | 'ws_already_closed'

export type VoiceStreamConnection = {
  send: (chunk: Buffer) => void
  finalize: () => Promise<FinalizeSource>
  close: () => void
  isConnected: () => boolean
}

type WhisperConfig = { executable: string; model: string }

function getWhisperConfig(): WhisperConfig | null {
  const executable = process.env.YAOYAOCHE_WHISPER_CLI?.trim()
  const model = process.env.YAOYAOCHE_WHISPER_MODEL?.trim()
  if (!executable || !model || !isAbsolute(executable) || !isAbsolute(model)) return null
  if (!existsSync(executable) || !existsSync(model)) return null
  return { executable, model }
}

export function isVoiceStreamAvailable(): boolean {
  return getWhisperConfig() !== null
}

/** 将原始 16 kHz 单声道 16-bit PCM 封装为标准 WAV。 */
export function pcmToWav(pcm: Buffer): Buffer {
  if (pcm.length % 2 !== 0) throw new Error('录音 PCM 长度必须是偶数字节')
  if (pcm.length > MAX_AUDIO_BYTES) throw new Error('录音超过允许的本地处理大小')
  const wav = Buffer.alloc(44 + pcm.length)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(SAMPLE_RATE, 24)
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(pcm.length, 40)
  pcm.copy(wav, 44)
  return wav
}

export async function connectVoiceStream(
  callbacks: VoiceStreamCallbacks,
  options?: { language?: string; keyterms?: string[] },
): Promise<VoiceStreamConnection | null> {
  const configured = getWhisperConfig()
  if (!configured) {
    callbacks.onError('请设置 YAOYAOCHE_WHISPER_CLI 和 YAOYAOCHE_WHISPER_MODEL 的绝对路径', { fatal: true })
    return null
  }

  const chunks: Buffer[] = []
  let bytes = 0
  let closed = false
  let closeEmitted = false
  let running: Promise<FinalizeSource> | null = null
  const cancel = new AbortController()

  function notifyClose(): void {
    closed = true
    chunks.length = 0
    if (!closeEmitted) {
      closeEmitted = true
      callbacks.onClose()
    }
  }

  const connection: VoiceStreamConnection = {
    send(chunk) {
      if (closed || running) throw new Error('语音采集已关闭，不能继续提交音频')
      if (bytes + chunk.length > MAX_AUDIO_BYTES) throw new Error('录音长度超过 20 MiB 上限，请分段转写')
      chunks.push(Buffer.from(chunk))
      bytes += chunk.length
    },
    async finalize() {
      if (running) return running
      if (closed) return 'ws_already_closed'
      running = (async () => {
        let dir: string | undefined
        try {
          if (bytes === 0) return 'no_data_timeout'
          dir = await mkdtemp(join(tmpdir(), 'yaoyaoche-whisper-'))
          const wav = join(dir, 'speech.wav')
          const base = join(dir, 'result')
          await writeFile(wav, pcmToWav(Buffer.concat(chunks)), { mode: 0o600 })
          if (cancel.signal.aborted) return 'ws_already_closed'

          const args = ['-m', configured.model, '-f', wav, '-otxt', '-of', base]
          if (options?.language && /^[a-z]{2,5}$/i.test(options.language)) {
            args.push('-l', options.language.toLowerCase())
          }
          await execFileAsync(configured.executable, args, {
            signal: cancel.signal,
            timeout: FINALIZE_TIMEOUTS_MS.safety,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
          })
          if (cancel.signal.aborted) return 'ws_already_closed'
          const transcript = (await readFile(base + '.txt', 'utf8')).trim()
          if (cancel.signal.aborted) return 'ws_already_closed'
          if (transcript) callbacks.onTranscript(transcript, true)
          return transcript ? 'post_closestream_endpoint' : 'no_data_timeout'
        } catch (error) {
          if (cancel.signal.aborted) return 'ws_already_closed'
          callbacks.onError(error instanceof Error ? error.message : String(error), { fatal: true })
          throw error
        } finally {
          try {
            if (dir) await rm(dir, { recursive: true, force: true })
          } finally {
            notifyClose()
          }
        }
      })()
      return running
    },
    close() {
      if (closed) return
      cancel.abort()
      notifyClose()
    },
    isConnected: () => !closed,
  }
  callbacks.onReady(connection)
  return connection
}
