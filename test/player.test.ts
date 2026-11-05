import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { FfmpegPlayer } from '../src/main/player.ts'
import { MciController, quoteMciPath } from '../src/main/winmm-player.ts'

const OTAM = '/cursor/stores/self/library/test-set/5A - 127 - Luis M - Otam (original mix).mp3'

test('windows playback commands open the file read-only and seek without a page player', async () => {
  const log: string[] = []
  const send = async (command: string) => {
    log.push(command)
    if (command.endsWith(' length')) return '498939'
    if (command.endsWith(' position')) return '2500'
    if (command.endsWith(' mode')) return 'paused'
    if (command.startsWith('window ') || command.startsWith('setaudio ')) throw new Error('unsupported')
    return ''
  }
  const player = new MciController(send)
  const filePath = 'C:\\Users\\benhu\\OneDrive\\Desktop\\New folder (4)\\Otam (original mix).mp3'
  const opened = await player.load(filePath, 10)
  assert.equal(opened.duration, 498.939)
  assert.equal(opened.playing, false)
  assert.equal(
    log[0],
    'open "C:\\Users\\benhu\\OneDrive\\Desktop\\New folder (4)\\Otam (original mix).mp3" type mpegvideo alias smspreview',
  )
  assert.throws(() => quoteMciPath('bad"name.mp3'))
  assert.equal(log.includes('set smspreview time format milliseconds'), true)
  await player.seek(2)
  assert.equal(log.at(-1), 'seek smspreview to 2000')
  await player.play()
  assert.equal(log.at(-1), 'play smspreview from 2000')
  await player.seek(4.2)
  assert.equal(log.at(-1), 'play smspreview from 4200')
  await player.pause()
  assert.equal(log.some((command) => command === 'stop smspreview'), true)
  assert.equal(log.some((command) => command.startsWith('pause ')), false)
  const held = await player.status()
  assert.equal(held.playing, false)
  assert.equal(held.position, 2.5)
  await player.volume(0.4)
  assert.equal(log.at(-1), 'setaudio smspreview volume to 400')
  const wav = new MciController(send)
  await wav.load('C:\\Music\\room.wav', 3)
  const wavOpen = log.find((command) => command.includes('room.wav'))
  assert.match(wavOpen ?? '', /type waveaudio alias smspreview$/)
  await player.close()
  assert.equal(log.at(-1), 'close smspreview')
})

test('winmm pause holds the position after stop resets the device, and play continues there', async () => {
  let deviceMs = 18000
  let mode = 'playing'
  const log: string[] = []
  const send = async (command: string) => {
    log.push(command)
    if (command.endsWith(' length')) return '498939'
    if (command.endsWith(' mode')) return mode
    if (command.endsWith(' position')) return String(deviceMs)
    if (command.startsWith('stop ')) {
      mode = 'stopped'
      deviceMs = 0
      return ''
    }
    if (command.startsWith('play ') && command.includes(' from ')) {
      mode = 'playing'
      deviceMs = Number(command.split(' from ')[1])
      return ''
    }
    if (command.startsWith('play ')) {
      mode = 'playing'
      return ''
    }
    if (command.startsWith('window ') || command.startsWith('setaudio ')) throw new Error('unsupported')
    return ''
  }
  const player = new MciController(send)
  await player.load('C:\\Music\\Otam.mp3', 498.939)
  await player.play()
  const paused = await player.pause()
  assert.equal(paused.playing, false)
  assert.equal(paused.position, 18)
  assert.equal(deviceMs, 0)
  assert.equal((await player.status()).position, 18)
  assert.equal((await player.status()).playing, false)
  const resumed = await player.play()
  assert.equal(resumed.playing, true)
  assert.equal(resumed.position, 18)
  assert.equal(log.at(-1), 'play smspreview from 18000')
  deviceMs = 0
  const duringSeek = await player.status()
  assert.equal(duringSeek.position, 18)
  assert.equal(duringSeek.playing, true)
})

test('ffmpeg preview reads a real file and the clock moves, then pause holds', async (t) => {
  if (!fs.existsSync(OTAM)) {
    t.skip('test mp3 is not on this machine')
    return
  }
  const before = createHash('sha256').update(fs.readFileSync(OTAM)).digest('hex')
  const player = new FfmpegPlayer()
  try {
    const opened = await player.load(OTAM, 498.938776)
    assert.equal(opened.playing, false)
    assert.equal(opened.position, 0)
    await player.play()
    await delay(1200)
    const playing = await player.status()
    assert.equal(playing.playing, true)
    assert.ok(playing.position > 0.3 && playing.position < 4, `position ${playing.position}`)
    const paused = await player.pause()
    assert.equal(paused.playing, false)
    await delay(400)
    const held = await player.status()
    assert.ok(Math.abs(held.position - paused.position) < 0.05)
    const sought = await player.seek(20)
    assert.equal(sought.playing, false)
    assert.ok(Math.abs(sought.position - 20) < 0.01)
    await player.play()
    await delay(1000)
    const later = await player.status()
    assert.equal(later.playing, true)
    assert.ok(later.position > 20.2 && later.position < 24, `position ${later.position}`)
    await player.volume(0.2)
    const quieter = await player.status()
    assert.equal(quieter.playing, true)
  } finally {
    await player.close()
  }
  assert.equal(createHash('sha256').update(fs.readFileSync(OTAM)).digest('hex'), before)
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
