import { describe, expect, it } from 'bun:test'
import { pcmToWav, isVoiceStreamAvailable, connectVoiceStream } from '../src/services/voiceStreamSTT.js'
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('可选本地语音转写', () => {
  it('录音被封装为可供 Whisper 识别的 WAV PCM', () => {
    const wav = pcmToWav(Buffer.from([0, 0, 1, 0]))
    expect(wav.subarray(0, 4).toString()).toBe('RIFF')
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.subarray(44)).toEqual(Buffer.from([0, 0, 1, 0]))
  })
  it('无本地模型时自动保持未启用，无网络路径', () => {
    const a = process.env.YAOYAOCHE_WHISPER_CLI
    const b = process.env.YAOYAOCHE_WHISPER_MODEL
    try {
      delete process.env.YAOYAOCHE_WHISPER_CLI
      delete process.env.YAOYAOCHE_WHISPER_MODEL
      expect(isVoiceStreamAvailable()).toBe(false)
      const src = readFileSync(join(import.meta.dir, '../src/services/voiceStreamSTT.ts'), 'utf8')
      expect(src).not.toContain('WebSocket')
      expect(src).not.toContain('getClaudeAIOAuthTokens')
      expect(src).not.toContain('/api/ws/speech_to_text')
    } finally {
      if (a === undefined) delete process.env.YAOYAOCHE_WHISPER_CLI
      else process.env.YAOYAOCHE_WHISPER_CLI = a
      if (b === undefined) delete process.env.YAOYAOCHE_WHISPER_MODEL
      else process.env.YAOYAOCHE_WHISPER_MODEL = b
    }
  })
  it('拒绝不完整的 PCM 采样', () => {
    expect(() => pcmToWav(Buffer.from([1]))).toThrow('偶数字节')
  })

  it('本地识别成功回写文字且只通知一次关闭', async () => {
    if (process.platform === 'win32') return
    const dir = mkdtempSync(join(tmpdir(), 'yaoyaoche-voice-test-'))
    const cli = join(dir, 'whisper-cli')
    const model = join(dir, 'model.bin')
    const savedCli = process.env.YAOYAOCHE_WHISPER_CLI
    const savedModel = process.env.YAOYAOCHE_WHISPER_MODEL
    try {
      writeFileSync(model, 'test model')
      writeFileSync(cli, '#!/bin/sh\nout=""\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "-of" ]; then shift; out="$1"; fi\n  shift\ndone\nprintf "local transcript" > "$out.txt"\n', { mode: 0o700 })
      chmodSync(cli, 0o700)
      process.env.YAOYAOCHE_WHISPER_CLI = cli
      process.env.YAOYAOCHE_WHISPER_MODEL = model
      const received: string[] = []
      const errors: string[] = []
      let closed = 0
      const connection = await connectVoiceStream({
        onReady: () => {},
        onTranscript: text => received.push(text),
        onError: error => errors.push(error),
        onClose: () => { closed++ },
      })
      expect(connection).not.toBeNull()
      connection!.send(Buffer.from([0, 0, 1, 0]))
      expect(await connection!.finalize()).toBe('post_closestream_endpoint')
      connection!.close()
      expect(received).toEqual(['local transcript'])
      expect(errors).toEqual([])
      expect(closed).toBe(1)
    } finally {
      if (savedCli === undefined) delete process.env.YAOYAOCHE_WHISPER_CLI
      else process.env.YAOYAOCHE_WHISPER_CLI = savedCli
      if (savedModel === undefined) delete process.env.YAOYAOCHE_WHISPER_MODEL
      else process.env.YAOYAOCHE_WHISPER_MODEL = savedModel
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('用户取消后终止本地处理且不再注入文字', async () => {
    if (process.platform === 'win32') return
    const dir = mkdtempSync(join(tmpdir(), 'yaoyaoche-voice-abort-'))
    const cli = join(dir, 'whisper-cli')
    const model = join(dir, 'model.bin')
    const savedCli = process.env.YAOYAOCHE_WHISPER_CLI
    const savedModel = process.env.YAOYAOCHE_WHISPER_MODEL
    try {
      writeFileSync(model, 'test model')
      writeFileSync(cli, '#!/bin/sh\nsleep 2\nprintf "should not return" > "$6.txt"\n', { mode: 0o700 })
      chmodSync(cli, 0o700)
      process.env.YAOYAOCHE_WHISPER_CLI = cli
      process.env.YAOYAOCHE_WHISPER_MODEL = model
      const received: string[] = []
      let closed = 0
      const connection = await connectVoiceStream({
        onReady: () => {},
        onTranscript: text => received.push(text),
        onError: error => { throw new Error('unexpected voice error: ' + error) },
        onClose: () => { closed++ },
      })
      expect(connection).not.toBeNull()
      connection!.send(Buffer.from([0, 0, 1, 0]))
      const processing = connection!.finalize()
      connection!.close()
      expect(await processing).toBe('ws_already_closed')
      expect(received).toEqual([])
      expect(closed).toBe(1)
    } finally {
      if (savedCli === undefined) delete process.env.YAOYAOCHE_WHISPER_CLI
      else process.env.YAOYAOCHE_WHISPER_CLI = savedCli
      if (savedModel === undefined) delete process.env.YAOYAOCHE_WHISPER_MODEL
      else process.env.YAOYAOCHE_WHISPER_MODEL = savedModel
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
