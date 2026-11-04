import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { readTrack } from '../src/main/tags.ts'
import { bpmSourceLabel, keySourceLabel } from '../src/shared/provenance.ts'

const LIBRARY = process.env.SMS_TEST_LIBRARY ?? '/cursor/stores/self/library/test-set'

const EXPECTED = [
  {
    filename: '5A - 127 - Luis M - Otam (original mix).mp3',
    title: 'Otam',
    artist: 'Luis M',
    duration: 498.938776,
    key: '5A',
    bpm: 127,
    comment: '5A - 127',
    sha256: '14464b58edfa8a67250894f3ea685c6b367e921c138e0fa6e9e5b639a66e6d14',
  },
  {
    filename: '7A - 125 - Rebuild (Original mix).mp3',
    title: 'Rebuild (Original mix)',
    artist: '',
    duration: 469.002449,
    key: '7A',
    bpm: 125,
    comment: '7A - 125',
    sha256: 'f2e1f32e4c3e2fae5b7b6210a40338920e4f1b6a4ff01bb240afb65eb19057f5',
  },
  {
    filename: '7A - 127 - Quantum Leap (Original mix).mp3',
    title: 'Quantum Leap (Original mix)',
    artist: '',
    duration: 460.8,
    key: '7A',
    bpm: 127,
    comment: '7A - 127',
    sha256: '1d2c2feb76bed35e4d0bc07522090e274c6248421f25f60a796e9dd47e27d660',
  },
  {
    filename: '9A - 127 - Luis M - Mothership (Original Mix).mp3',
    title: 'Mothership',
    artist: 'Luis M',
    duration: 459.049796,
    key: '9A',
    bpm: 127,
    comment: '9A - 127',
    sha256: 'da6ceb5962fb49ad9533da52ae728093c03563a5a4c49ffdb8e9ac55378fc671',
  },
  {
    filename: '11A - 126 - Premiere Droplex, David Phoenix - Great Distances - Vision Serpent (1).mp3',
    title: 'Great Distances',
    artist: 'Premiere: Droplex, David Phoenix',
    duration: 313.364898,
    key: '11A',
    bpm: 126,
    comment: '11A - 126',
    sha256: 'e1bbaeaa19a57648a18c98e97fbeb29ea93c13586f50065e7193bd703283acf8',
  },
  {
    filename: '11A - 126 - Premiere Droplex, David Phoenix - Great Distances - Vision Serpent.mp3',
    title: 'Great Distances',
    artist: 'Premiere: Droplex, David Phoenix',
    duration: 313.364898,
    key: '11A',
    bpm: 126,
    comment: '11A - 126',
    sha256: 'ed16563cc21b46a65bdff9614dfaaec83e46f921ef742427fbbec04a9cdbe427',
  },
]

test('the six test MP3s keep their bytes and show tag, comment, and filename provenance', async (t) => {
  if (!fs.existsSync(LIBRARY)) {
    t.skip(`test library is not on this machine: ${LIBRARY}`)
    return
  }
  for (const expected of EXPECTED) {
    const filePath = path.join(LIBRARY, expected.filename)
    const before = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
    assert.equal(before, expected.sha256)
    const track = await readTrack(filePath)
    const after = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
    assert.equal(after, before)
    assert.equal(track.filename, expected.filename)
    assert.equal(track.title, expected.title)
    assert.equal(track.artist, expected.artist)
    assert.equal(track.titleSource, 'tag')
    assert.ok(track.durationSeconds != null)
    assert.ok(Math.abs(track.durationSeconds - expected.duration) < 0.001)
    assert.equal(track.key, expected.key)
    assert.equal(track.keySource, 'tag')
    assert.equal(keySourceLabel(track), 'tag')
    assert.equal(track.hasTbpm, false)
    assert.equal(track.bpm, expected.bpm)
    assert.equal(track.bpmSource, 'comment')
    assert.equal(track.filenameBpm, expected.bpm)
    assert.equal(bpmSourceLabel(track), 'comment, filename')
    assert.equal(track.comment, expected.comment)
    assert.equal(track.energy, 6)
    assert.equal(track.energySource, 'tag')
    assert.equal(track.missing, false)
    assert.equal(track.readError, null)
  }
})
