import { describe, expect, it } from 'bun:test'
import { pcmToWav, isVoiceStreamAvailable } from '../src/services/voiceStreamSTT.js'
import { readFileSync } from 'node:fs'
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
})
