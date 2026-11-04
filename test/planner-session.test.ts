import assert from 'node:assert/strict'
import test from 'node:test'
import { filterTracks, sortTracks } from '../src/shared/browser.ts'
import { ESTIMATE_COPY } from '../src/shared/copy.ts'
import { libraryDragPayload, plannerDragPayload, readDrag } from '../src/shared/drag.ts'
import { metaFromFilename, normalizeKey } from '../src/shared/filename.ts'
import { planTiming } from '../src/shared/planner.ts'
import { bpmProvenance, bpmSourceLabel, keyProvenance, keySourceLabel } from '../src/shared/provenance.ts'
import {
  addToSet,
  applyOpenedSet,
  initialWorkingSet,
  isDirty,
  markSaved,
  removeFromSet,
  reorderSet,
  replaceInSet,
  setReference,
} from '../src/shared/session.ts'
import { formatHms } from '../src/shared/time.ts'
import type { SetFile } from '../src/shared/types.ts'
import { buildTrack } from '../src/main/tags.ts'
import { sampleTrack } from './sample.ts'

test('normalizes Camelot codes and reads both filename shapes', () => {
  assert.equal(normalizeKey('07A'), '7A')
  assert.equal(normalizeKey('11a'), '11A')
  assert.deepEqual(metaFromFilename('5A - 127 - Luis M - Otam (original mix).mp3'), { key: '5A', bpm: 127 })
  assert.deepEqual(metaFromFilename('Applepaw - 7A - 125.wav'), { key: '7A', bpm: 125 })
  assert.deepEqual(metaFromFilename('no-tempo.mp3'), { key: null, bpm: null })
})

test('filename key and BPM stay labelled as filename when no tag exists', () => {
  const track = buildTrack('/music/Applepaw - 7A - 125.wav', {
    title: 'Applepaw',
    artist: 'Boris Brejcha',
    durationSeconds: 562.6,
    tagKey: null,
    tagBpm: null,
    hasTbpm: false,
    energy: null,
    comment: null,
  })
  assert.equal(track.key, '7A')
  assert.equal(track.keySource, 'filename')
  assert.equal(track.bpm, 125)
  assert.equal(track.bpmSource, 'filename')
  assert.equal(track.energy, null)
  assert.match(keyProvenance(track), /filename/i)
})

test('comment BPM is used when TBPM is absent, and a disagreement stays visible', () => {
  const track = buildTrack('/music/5A - 120 - Song.mp3', {
    title: 'Song',
    artist: 'DJ',
    durationSeconds: 200,
    tagKey: '5A',
    tagBpm: null,
    hasTbpm: false,
    energy: 6,
    comment: '5A - 127',
  })
  assert.equal(track.hasTbpm, false)
  assert.equal(track.bpm, 127)
  assert.equal(track.bpmSource, 'comment')
  assert.equal(track.filenameBpm, 120)
  assert.equal(track.keySource, 'tag')
  assert.equal(bpmSourceLabel(track), 'comment')
  assert.match(bpmProvenance(track), /No TBPM tag/)
  assert.match(bpmProvenance(track), /filename says 120/)
  assert.equal(keySourceLabel(track), 'tag')
  assert.match(keyProvenance(track), /TKEY/)
})

test('a real TBPM tag wins over the comment and the filename', () => {
  const track = buildTrack('/music/5A - 120 - Song.mp3', {
    title: 'Song',
    artist: '',
    durationSeconds: 10,
    tagKey: '5A',
    tagBpm: 128,
    hasTbpm: true,
    energy: null,
    comment: '5A - 120',
  })
  assert.equal(track.bpm, 128)
  assert.equal(track.bpmSource, 'tag')
  assert.match(bpmProvenance(track), /TBPM/)
})

test('full-file totals are an estimate and show remaining or overtime', () => {
  assert.match(ESTIMATE_COPY, /estimate/i)
  assert.match(ESTIMATE_COPY, /not the time the set will run live/)
  const empty = planTiming([], 2 * 60 * 60)
  assert.equal(empty.fullFileEstimate, true)
  assert.equal(empty.totalSeconds, 0)
  assert.equal(empty.remainingSeconds, 7200)
  assert.equal(empty.overtimeSeconds, 0)
  assert.equal(empty.last, null)
  assert.equal(formatHms(7200), '2:00:00')

  const under = planTiming(
    [
      { title: 'One', durationSeconds: 100 },
      { title: 'Two', durationSeconds: 50 },
    ],
    7200,
  )
  assert.equal(under.totalSeconds, 150)
  assert.equal(under.remainingSeconds, 7050)
  assert.equal(under.overtimeSeconds, 0)
  assert.deepEqual(under.endSeconds, [100, 150])
  assert.equal(under.last?.title, 'Two')
  assert.equal(under.last?.endSeconds, 150)

  const over = planTiming(
    [
      { title: 'One', durationSeconds: 100 },
      { title: 'Two', durationSeconds: 50 },
    ],
    120,
  )
  assert.equal(over.remainingSeconds, 0)
  assert.equal(over.overtimeSeconds, 30)
  assert.equal(over.count, 2)
})

test('an unknown duration is left out and blocks later end times', () => {
  const timing = planTiming(
    [
      { title: 'Known', durationSeconds: 30 },
      { title: 'Unknown', durationSeconds: null },
      { title: 'Later', durationSeconds: 10 },
    ],
    100,
  )
  assert.equal(timing.totalSeconds, 40)
  assert.equal(timing.unknownDurationCount, 1)
  assert.deepEqual(timing.endSeconds, [30, null, null])
  assert.equal(timing.last?.endSeconds, null)
})

test('changing the reference does not reorder or copy the planner array', () => {
  const first = sampleTrack({ path: '/a.mp3', title: 'First', durationSeconds: 10 })
  const second = sampleTrack({ path: '/b.mp3', title: 'Second', durationSeconds: 20 })
  const added = addToSet(addToSet(initialWorkingSet(), [first]).state, [second]).state
  const order = added.tracks.map((track) => track.path)
  const next = setReference(added, second)
  assert.equal(next.tracks, added.tracks)
  assert.deepEqual(next.tracks.map((track) => track.path), order)
  assert.equal(next.reference?.path, '/b.mp3')
  assert.notEqual(next.reference, second)
})

test('a duplicate drag does not add or reorder', () => {
  const track = sampleTrack({ path: '/a.mp3', title: 'Otam' })
  const state = addToSet(initialWorkingSet(), [track]).state
  const again = addToSet(state, [track])
  assert.equal(again.state, state)
  assert.equal(again.added, 0)
  assert.equal(again.skipped.length, 1)
  assert.deepEqual(again.state.tracks.map((item) => item.path), ['/a.mp3'])
})

test('reorder and remove update the order and leave the reference in place', () => {
  const tracks = [
    sampleTrack({ path: '/a.mp3', title: 'A', durationSeconds: 10 }),
    sampleTrack({ path: '/b.mp3', title: 'B', durationSeconds: 30 }),
    sampleTrack({ path: '/c.mp3', title: 'C', durationSeconds: 5 }),
  ]
  let state = addToSet(initialWorkingSet(), tracks).state
  state = setReference(state, tracks[0]!)
  const reference = state.reference
  const moved = reorderSet(state, 0, 2)
  assert.deepEqual(moved.tracks.map((track) => track.path), ['/b.mp3', '/c.mp3', '/a.mp3'])
  assert.equal(moved.reference, reference)
  const before = planTiming(state.tracks, 7200).endSeconds
  const after = planTiming(moved.tracks, 7200).endSeconds
  assert.notDeepEqual(before, after)
  assert.equal(planTiming(state.tracks, 7200).totalSeconds, planTiming(moved.tracks, 7200).totalSeconds)

  const removed = removeFromSet(moved, 1)
  assert.deepEqual(removed.tracks.map((track) => track.path), ['/b.mp3', '/a.mp3'])
  assert.equal(removed.reference, reference)
})

test('replace refuses a duplicate and does not change the row', () => {
  const tracks = [
    sampleTrack({ path: '/a.mp3', title: 'A' }),
    sampleTrack({ path: '/b.mp3', title: 'B' }),
  ]
  const state = addToSet(initialWorkingSet(), tracks).state
  const blocked = replaceInSet(state, 1, tracks[0]!)
  assert.equal(blocked.state, state)
  assert.match(blocked.error ?? '', /already in the set/)
  const replaced = replaceInSet(state, 1, sampleTrack({ path: '/c.mp3', title: 'C' }))
  assert.equal(replaced.error, null)
  assert.deepEqual(replaced.state.tracks.map((track) => track.path), ['/a.mp3', '/c.mp3'])
})

test('opening a saved set keeps the current reference', () => {
  const reference = sampleTrack({ path: '/ref.mp3', title: 'Reference' })
  const state = setReference(initialWorkingSet(), reference)
  const file: SetFile = {
    version: 1,
    fileId: '11111111-1111-1111-1111-111111111111',
    name: 'Friday',
    targetSeconds: 3600,
    tracks: [
      sampleTrack({ path: '/b.mp3', title: 'B' }),
      sampleTrack({ path: '/a.mp3', title: 'A' }),
    ],
    savedAt: '2026-11-04T00:00:00.000Z',
  }
  const opened = applyOpenedSet(state, file)
  assert.equal(opened.reference, state.reference)
  assert.deepEqual(opened.tracks.map((track) => track.title), ['B', 'A'])
  assert.equal(isDirty(opened), false)
  const edited = addToSet(opened, [sampleTrack({ path: '/c.mp3', title: 'C' })]).state
  assert.equal(isDirty(edited), true)
  const saved = markSaved(edited, { ...file, fileId: '22222222-2222-2222-2222-222222222222', name: 'Friday copy' })
  assert.equal(saved.fileId, '22222222-2222-2222-2222-222222222222')
  assert.equal(saved.reference, state.reference)
  assert.equal(isDirty(saved), false)
})

test('search and sort do not mutate the library list', () => {
  const tracks = [
    sampleTrack({ path: '/b.mp3', title: 'Mothership', artist: 'Luis M', key: '9A', bpm: 127, filename: '9.mp3' }),
    sampleTrack({ path: '/a.mp3', title: 'Otam', artist: 'Luis M', key: '5A', bpm: 127, filename: '5.mp3' }),
    sampleTrack({ path: '/c.mp3', title: 'Other', artist: 'Nobody', bpm: null, filename: 'c.mp3' }),
  ]
  const found = filterTracks(tracks, 'luis')
  assert.deepEqual(found.map((track) => track.title), ['Mothership', 'Otam'])
  assert.equal(tracks.length, 3)
  const byTitle = sortTracks(tracks, 'title', 'asc')
  assert.deepEqual(byTitle.map((track) => track.title), ['Mothership', 'Otam', 'Other'])
  assert.equal(sortTracks(tracks, 'bpm', 'asc').at(-1)?.title, 'Other')
})

test('drag payloads round-trip', () => {
  assert.deepEqual(readDrag(libraryDragPayload(['/a.mp3', '/b.mp3'])), {
    kind: 'library',
    paths: ['/a.mp3', '/b.mp3'],
  })
  assert.deepEqual(readDrag(plannerDragPayload(2)), { kind: 'planner', index: 2 })
  assert.equal(readDrag('nope'), null)
})
