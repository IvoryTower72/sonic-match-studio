import { spawn, type ChildProcess } from 'node:child_process'
import type { PreviewStatus } from '../shared/types.js'
import { WinmmPlayer } from './winmm-player.js'

export interface PreviewPlayer {
  load(filePath: string, durationHint: number): Promise<PreviewStatus>
  play(): Promise<PreviewStatus>
  pause(): Promise<PreviewStatus>
  seek(seconds: number): Promise<PreviewStatus>
  volume(level: number): Promise<PreviewStatus>
  status(): Promise<PreviewStatus>
  close(): Promise<void>
}

/**
 * Preview plays outside Chromium. The media element, the custom protocol,
 * the loopback server, and the in-page PCM graph all failed to move Windows.
 * Windows uses winmm. Other systems use ffmpeg's own playback clock.
 */
export function createPreviewPlayer(parent: () => string | null = () => null): PreviewPlayer {
  if (process.platform === 'win32') return new WinmmPlayer(parent)
  return new FfmpegPlayer()
}

export class FfmpegPlayer implements PreviewPlayer {
  private filePath: string | null = null
  private duration = 0
  private origin = 0
  private heard = 0
  private playing = false
  private level = 0.8
  private child: ChildProcess | null = null
  private stderr = ''

  async load(filePath: string, durationHint: number): Promise<PreviewStatus> {
    await this.stopProcess()
    this.filePath = filePath
    this.duration = Number.isFinite(durationHint) && durationHint > 0 ? durationHint : 0
    this.origin = 0
    this.heard = 0
    this.playing = false
    return this.snapshot()
  }

  async play(): Promise<PreviewStatus> {
    if (!this.filePath) throw new Error('Nothing is loaded.')
    if (this.playing) return this.snapshot()
    if (this.duration > 0 && this.origin >= this.duration - 0.05) {
      this.origin = 0
      this.heard = 0
    }
    await this.spawn()
    return this.snapshot()
  }

  async pause(): Promise<PreviewStatus> {
    this.origin = this.current()
    this.heard = 0
    await this.stopProcess()
    return this.snapshot()
  }

  async seek(seconds: number): Promise<PreviewStatus> {
    const wasPlaying = this.playing
    this.origin = this.clamp(seconds)
    this.heard = 0
    await this.stopProcess()
    if (wasPlaying) await this.spawn()
    return this.snapshot()
  }

  async volume(level: number): Promise<PreviewStatus> {
    this.level = Math.min(1, Math.max(0, level))
    if (!this.playing) return this.snapshot()
    this.origin = this.current()
    this.heard = 0
    await this.stopProcess()
    await this.spawn()
    return this.snapshot()
  }

  async status(): Promise<PreviewStatus> {
    return this.snapshot()
  }

  async close(): Promise<void> {
    await this.stopProcess()
    this.filePath = null
    this.origin = 0
    this.heard = 0
  }

  private current(): number {
    return this.clamp(this.origin + this.heard)
  }

  private clamp(seconds: number): number {
    const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
    if (this.duration <= 0) return value
    return Math.min(this.duration, value)
  }

  private snapshot(): PreviewStatus {
    return { position: this.current(), duration: this.duration, playing: this.playing }
  }

  private spawn(): Promise<void> {
    if (!this.filePath) return Promise.reject(new Error('Nothing is loaded.'))
    const filePath = this.filePath
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostdin',
        '-vn',
        '-ss',
        this.origin.toFixed(3),
        '-re',
        '-i',
        filePath,
        '-af',
        `volume=${this.level.toFixed(3)}`,
        '-progress',
        'pipe:1',
        '-nostats',
        '-f',
        'null',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    this.child = child
    this.playing = true
    this.heard = 0
    this.stderr = ''
    const stdout = child.stdout
    const stderr = child.stderr
    if (!stdout || !stderr) throw new Error('Preview playback could not start.')
    stdout.setEncoding('utf8')
    stderr.setEncoding('utf8')
    let pending = ''
    stdout.on('data', (chunk: string) => {
      if (this.child !== child) return
      pending += chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('out_time_us=')) continue
        const micros = Number(line.slice('out_time_us='.length))
        if (Number.isFinite(micros)) this.heard = micros / 1_000_000
      }
    })
    stderr.on('data', (chunk: string) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-2000)
    })
    child.on('exit', () => {
      if (this.child !== child) return
      this.origin = this.current()
      this.heard = 0
      this.child = null
      this.playing = false
    })
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (error) reject(error)
        else resolve()
      }
      const timer = setTimeout(() => finish(), 2000)
      child.once('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        this.playing = false
        this.child = null
        finish(new Error(error.code === 'ENOENT' ? 'ffmpeg is not available, so preview cannot play.' : error.message))
      })
      child.once('exit', (code) => {
        if (settled) return
        clearTimeout(timer)
        finish(new Error(this.stderr.trim() || `This file could not be played (${code ?? 0}).`))
      })
      stdout.once('data', () => {
        clearTimeout(timer)
        finish()
      })
    })
  }

  private stopProcess(): Promise<void> {
    const child = this.child
    this.child = null
    this.playing = false
    if (!child) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 800)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }
}
