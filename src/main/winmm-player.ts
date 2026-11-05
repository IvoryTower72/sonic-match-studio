import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import type { PreviewStatus } from '../shared/types.js'

const ALIAS = 'smspreview'

const BRIDGE = [
  '$OutputEncoding = [Console]::OutputEncoding = [Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false',
  'Add-Type -TypeDefinition @\'',
  'using System;',
  'using System.Runtime.InteropServices;',
  'using System.Text;',
  'public static class SmsMci {',
  '  [DllImport("winmm.dll", CharSet = CharSet.Unicode, EntryPoint = "mciSendStringW")]',
  '  public static extern int Send(string command, StringBuilder buffer, int bufferSize, IntPtr callback);',
  '  [DllImport("winmm.dll", CharSet = CharSet.Unicode, EntryPoint = "mciGetErrorStringW")]',
  '  public static extern bool ErrorText(int code, StringBuilder buffer, int bufferSize);',
  '}',
  "'@",
  '$sb = New-Object System.Text.StringBuilder 2048',
  '$err = New-Object System.Text.StringBuilder 1024',
  "Write-Output 'ready'",
  'while (($line = [Console]::In.ReadLine()) -ne $null) {',
  "  if ($line -eq 'quit') { break }",
  '  $sb.Length = 0',
  '$code = [SmsMci]::Send($line, $sb, $sb.Capacity, [IntPtr]::Zero)',
  '  if ($code -ne 0) {',
  '    $err.Length = 0',
  '    [void][SmsMci]::ErrorText($code, $err, $err.Capacity)',
  "    Write-Output ('err' + [char]9 + $code + [char]9 + $err.ToString())",
  '  } else {',
  "    Write-Output ('ok' + [char]9 + $sb.ToString())",
  '  }',
  '}',
].join('\n')

export function quoteMciPath(filePath: string): string {
  if (/[\r\n\t"]/.test(filePath)) throw new Error('That file path cannot be played.')
  return `"${filePath}"`
}

function deviceType(filePath: string): 'waveaudio' | 'mpegvideo' {
  const ext = path.win32.extname(filePath).toLowerCase()
  return ext === '.wav' || ext === '.wave' ? 'waveaudio' : 'mpegvideo'
}

interface WinmmBridge {
  send(command: string): Promise<string>
  quit(): Promise<void>
}

/**
 * Windows playback goes through winmm in a helper process, not through Chromium.
 * The page audio element on MusicPC stays at one buffer and never moves the speaker.
 */
export function startWinmmBridge(): Promise<WinmmBridge> {
  const encoded = Buffer.from(BRIDGE, 'utf16le').toString('base64')
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NoLogo', '-NonInteractive', '-EncodedCommand', encoded],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  ) as ChildProcessWithoutNullStreams
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  let stderr = ''
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-2000)
  })

  const waiters: Array<{ resolve: (value: string) => void; reject: (error: Error) => void }> = []
  let buffer = ''
  let ready: (() => void) | null = null
  const readyPromise = new Promise<void>((resolve, reject) => {
    ready = resolve
    child.once('error', reject)
    child.once('exit', (code) => {
      if (ready) reject(new Error(stderr.trim() || `Preview player exited (${code ?? 0}).`))
    })
  })

  const take = (line: string) => {
    const text = line.trim()
    if (!text) return
    if (ready) {
      if (text === 'ready') {
        const done = ready
        ready = null
        done()
      }
      return
    }
    const waiter = waiters.shift()
    if (!waiter) return
    if (text.startsWith('err\t')) {
      const message = text.split('\t').slice(2).join('\t').trim()
      waiter.reject(new Error(message || 'This file could not be played.'))
      return
    }
    waiter.resolve(text.startsWith('ok\t') ? text.slice(3) : text)
  }

  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) take(line)
  })

  child.on('exit', () => {
    const error = new Error(stderr.trim() || 'Preview player stopped.')
    for (const waiter of waiters.splice(0)) waiter.reject(error)
  })

  return readyPromise.then(() => ({
    send(command: string) {
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject })
        child.stdin.write(`${command}\n`)
      })
    },
    quit() {
      return new Promise((resolve) => {
        child.once('exit', () => resolve())
        child.stdin.write('quit\n')
        child.stdin.end()
        setTimeout(() => {
          child.kill()
          resolve()
        }, 800)
      })
    },
  }))
}

function leadingNumber(text: string): number {
  const match = text.match(/-?\d+/)
  return match ? Number(match[0]) : Number.NaN
}

/**
 * MCI command sequence. `send` returns the text winmm wrote back.
 * MP3 is opened as mpegvideo, which rejects `pause` and reports position 0 after `stop`.
 * The held position is what Play resumes from.
 */
export class MciController {
  private opened = false
  private durationMs = 0
  private positionMs = 0
  private playing = false
  private held = false
  private awaitDevice = false

  constructor(
    private readonly send: (command: string) => Promise<string>,
    private readonly parent: () => string | null = () => null,
  ) {}

  async load(filePath: string, durationHint: number): Promise<PreviewStatus> {
    await this.release()
    const type = deviceType(filePath)
    const parent = type === 'mpegvideo' ? this.parent() : null
    const parentClause = parent ? ` parent ${parent} style child` : ''
    await this.send(`open ${quoteMciPath(filePath)} type ${type} alias ${ALIAS}${parentClause}`)
    this.opened = true
    if (type === 'mpegvideo') await this.send(`window ${ALIAS} state hide`).catch(() => undefined)
    await this.send(`set ${ALIAS} time format milliseconds`)
    const length = Number(await this.send(`status ${ALIAS} length`))
    this.durationMs = Number.isFinite(length) && length > 0 ? length : Math.round(Math.max(0, durationHint) * 1000)
    this.positionMs = 0
    this.playing = false
    this.held = false
    this.awaitDevice = false
    return this.snapshot()
  }

  async play(): Promise<PreviewStatus> {
    this.requireOpen()
    if (this.durationMs > 0 && this.positionMs >= this.durationMs - 50) this.positionMs = 0
    const from = this.positionMs
    this.held = false
    this.playing = true
    this.awaitDevice = from > 0
    if (from > 0) await this.send(`play ${ALIAS} from ${from}`)
    else await this.send(`play ${ALIAS}`)
    return this.snapshot()
  }

  async pause(): Promise<PreviewStatus> {
    this.requireOpen()
    if (this.held && !this.playing) return this.snapshot()
    this.held = true
    this.playing = false
    this.awaitDevice = false
    try {
      const position = await this.readPosition()
      if (Number.isFinite(position)) this.positionMs = position
    } catch {
      // Keep the last position the card already showed.
    }
    await this.send(`stop ${ALIAS}`)
    return this.snapshot()
  }

  async seek(seconds: number): Promise<PreviewStatus> {
    this.requireOpen()
    const ms = this.clampMs(seconds)
    this.positionMs = ms
    if (this.playing) {
      this.awaitDevice = ms > 0
      await this.send(`play ${ALIAS} from ${ms}`)
    } else {
      this.held = true
      await this.send(`seek ${ALIAS} to ${ms}`)
    }
    return this.snapshot()
  }

  async volume(level: number): Promise<void> {
    if (!this.opened) return
    const amount = Math.round(Math.min(1, Math.max(0, level)) * 1000)
    await this.send(`setaudio ${ALIAS} volume to ${amount}`).catch(() => undefined)
  }

  async status(): Promise<PreviewStatus> {
    if (!this.opened || this.held) return this.snapshot()
    const position = await this.readPosition()
    if (this.held) return this.snapshot()
    const mode = (await this.send(`status ${ALIAS} mode`)).trim().toLowerCase()
    if (this.held) return this.snapshot()
    const deviceBehind = this.awaitDevice && Number.isFinite(position) && position + 250 < this.positionMs
    if (!deviceBehind && Number.isFinite(position)) {
      this.positionMs = position
      this.awaitDevice = false
    }
    if (!this.awaitDevice) this.playing = mode === 'playing'
    return this.snapshot()
  }

  async close(): Promise<void> {
    await this.release()
  }

  private async readPosition(): Promise<number> {
    return leadingNumber(await this.send(`status ${ALIAS} position`))
  }

  private clampMs(seconds: number): number {
    const ms = Math.round(Math.max(0, seconds) * 1000)
    if (this.durationMs <= 0) return ms
    return Math.min(this.durationMs, ms)
  }

  private requireOpen(): void {
    if (!this.opened) throw new Error('Nothing is loaded.')
  }

  private snapshot(): PreviewStatus {
    return {
      position: this.positionMs / 1000,
      duration: this.durationMs / 1000,
      playing: this.playing,
    }
  }

  private async release(): Promise<void> {
    if (!this.opened) return
    this.opened = false
    this.playing = false
    await this.send(`close ${ALIAS}`).catch(() => undefined)
  }
}

export class WinmmPlayer {
  private bridge: WinmmBridge | null = null
  private controller: MciController | null = null
  private level = 0.8

  constructor(private readonly parent: () => string | null = () => null) {}

  async load(filePath: string, durationHint: number): Promise<PreviewStatus> {
    const controller = await this.session()
    const status = await controller.load(filePath, durationHint)
    await controller.volume(this.level)
    return status
  }

  async play(): Promise<PreviewStatus> {
    const controller = await this.session()
    await controller.volume(this.level)
    return controller.play()
  }

  async pause(): Promise<PreviewStatus> {
    if (!this.controller) return { position: 0, duration: 0, playing: false }
    return this.controller.pause()
  }

  async seek(seconds: number): Promise<PreviewStatus> {
    if (!this.controller) return { position: 0, duration: 0, playing: false }
    return this.controller.seek(seconds)
  }

  async volume(level: number): Promise<PreviewStatus> {
    this.level = Math.min(1, Math.max(0, level))
    if (this.controller) await this.controller.volume(this.level)
    return this.controller ? this.controller.status() : { position: 0, duration: 0, playing: false }
  }

  async status(): Promise<PreviewStatus> {
    if (!this.controller) return { position: 0, duration: 0, playing: false }
    return this.controller.status()
  }

  async close(): Promise<void> {
    await this.controller?.close()
    this.controller = null
    const bridge = this.bridge
    this.bridge = null
    await bridge?.quit()
  }

  private async session(): Promise<MciController> {
    if (this.controller && this.bridge) return this.controller
    this.bridge = await startWinmmBridge()
    this.controller = new MciController((command) => this.bridge!.send(command), this.parent)
    return this.controller
  }
}
