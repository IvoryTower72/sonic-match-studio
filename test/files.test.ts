import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MediaGate, isInside } from '../src/main/access.ts'
import { scanLibrary } from '../src/main/library.ts'
import { mediaUrlFor, pathFromMediaUrl, serveMedia } from '../src/main/media.ts'
import { createSet, listSets, overwriteSet, readSet } from '../src/main/sets.ts'
import { sampleTrack } from './sample.ts'

test('paths inside a folder are allowed and paths outside are not', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-access-'))
  const nested = path.join(root, 'crate', 'track.mp3')
  fs.mkdirSync(path.dirname(nested), { recursive: true })
  fs.writeFileSync(nested, 'audio')
  const outside = path.join(os.tmpdir(), `sms-outside-${process.pid}.mp3`)
  fs.writeFileSync(outside, 'keep')
  assert.equal(isInside(root, nested), true)
  assert.equal(isInside(root, outside), false)
  const gate = new MediaGate()
  gate.setRoot(root)
  assert.equal(gate.resolve(nested), fs.realpathSync(nested))
  assert.equal(gate.resolve(outside), null)
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outside, { force: true })
})

test('save overwrites one file and save as leaves the original bytes alone', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-sets-'))
  const audio = path.join(directory, 'song.mp3')
  fs.writeFileSync(audio, 'not really audio')
  const before = hash(audio)
  const draft = {
    name: 'Friday',
    targetSeconds: 7200,
    tracks: [sampleTrack({ path: audio, title: 'Otam', durationSeconds: 10 })],
  }
  const first = createSet(directory, draft)
  const firstPath = path.join(directory, `${first.fileId}.json`)
  const original = fs.readFileSync(firstPath)
  const second = createSet(directory, { ...draft, name: 'Friday copy', tracks: [] })
  assert.notEqual(first.fileId, second.fileId)
  assert.deepEqual(fs.readFileSync(firstPath), original)
  const overwritten = overwriteSet(directory, { ...first, name: 'Friday night', tracks: first.tracks })
  assert.equal(overwritten.fileId, first.fileId)
  assert.equal(readSet(directory, first.fileId).name, 'Friday night')
  assert.equal(readSet(directory, second.fileId).name, 'Friday copy')
  assert.equal(hash(audio), before)
  assert.deepEqual(
    listSets(directory).map((set) => set.fileId).sort(),
    [first.fileId, second.fileId].sort(),
  )
  fs.writeFileSync(path.join(directory, 'notes.txt'), 'ignore')
  fs.writeFileSync(path.join(directory, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json'), '{')
  assert.equal(listSets(directory).length, 2)
  assert.throws(() => overwriteSet(directory, { ...first, fileId: '../secret' }))
  assert.equal(fs.existsSync(path.resolve(directory, '..', 'secret.json')), false)
  fs.rmSync(directory, { recursive: true, force: true })
})

test('media urls round-trip and ranges are read without writing the file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-media-'))
  const filePath = path.join(directory, 'Café track.mp3')
  const bytes = Buffer.from('0123456789abcdef-preview-bytes')
  fs.writeFileSync(filePath, bytes)
  const before = hash(filePath)
  const outside = path.join(os.tmpdir(), `sms-secret-${process.pid}.mp3`)
  fs.writeFileSync(outside, 'secret')
  const outsideHash = hash(outside)

  const url = mediaUrlFor(filePath)
  assert.equal(pathFromMediaUrl(url), filePath)
  assert.equal(pathFromMediaUrl(mediaUrlFor('C:\\Music\\5A - 127 - Otam.mp3')), 'C:\\Music\\5A - 127 - Otam.mp3')

  const gate = new MediaGate()
  gate.setRoot(directory)
  const partial = await serveMedia(new Request(url, { headers: { Range: 'bytes=0-3' } }), gate)
  assert.equal(partial.status, 206)
  assert.equal(partial.headers.get('content-range'), `bytes 0-3/${bytes.length}`)
  assert.equal(partial.headers.get('content-length'), '4')
  assert.equal(Buffer.from(await partial.arrayBuffer()).toString(), '0123')
  const openEnded = await serveMedia(new Request(url, { headers: { Range: 'bytes=0-' } }), gate)
  assert.equal(openEnded.status, 206)
  assert.equal(openEnded.headers.get('content-length'), String(bytes.length))
  assert.equal(Buffer.from(await openEnded.arrayBuffer()).compare(bytes), 0)
  const whole = await serveMedia(new Request(url), gate)
  assert.equal(whole.status, 200)
  assert.equal(whole.headers.get('content-length'), String(bytes.length))
  assert.equal(Buffer.from(await whole.arrayBuffer()).compare(bytes), 0)
  const bulkyPath = path.join(directory, 'bulky.mp3')
  const bulky = Buffer.alloc(256 * 1024, 7)
  fs.writeFileSync(bulkyPath, bulky)
  const bulkyBefore = hash(bulkyPath)
  const bulkyUrl = mediaUrlFor(bulkyPath)
  const bulkyRange = await serveMedia(new Request(bulkyUrl, { headers: { Range: 'bytes=1000-5000' } }), gate)
  assert.equal(bulkyRange.status, 206)
  assert.equal(Buffer.from(await bulkyRange.arrayBuffer()).compare(bulky.subarray(1000, 5001)), 0)
  assert.equal(hash(bulkyPath), bulkyBefore)
  const denied = await serveMedia(new Request(mediaUrlFor(outside)), gate)
  assert.equal(denied.status, 404)
  const posted = await serveMedia(new Request(url, { method: 'POST' }), gate)
  assert.equal(posted.status, 405)
  assert.equal(hash(filePath), before)
  assert.equal(hash(outside), outsideHash)
  fs.rmSync(directory, { recursive: true, force: true })
  fs.rmSync(outside, { force: true })
})

test('a folder scan keeps audio inside the folder and skips a link that points out', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-scan-'))
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-linked-'))
  const outside = path.join(outsideDir, 'secret.mp3')
  fs.writeFileSync(outside, 'do not import')
  const outsideHash = hash(outside)
  fs.writeFileSync(path.join(root, 'notes.txt'), 'playlist notes')
  fs.writeFileSync(path.join(root, 'broken.mp3'), 'not an mp3')
  fs.symlinkSync(outside, path.join(root, 'linked.mp3'))
  const snapshot = await scanLibrary(root)
  assert.deepEqual(snapshot.tracks.map((track) => track.filename), ['broken.mp3'])
  assert.equal(snapshot.tracks.some((track) => track.filename === 'linked.mp3'), false)
  assert.equal(snapshot.skippedCount >= 1, true)
  assert.equal(hash(outside), outsideHash)
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outsideDir, { recursive: true, force: true })
})

function hash(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}
