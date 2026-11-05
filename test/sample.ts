import type { Track } from '../src/shared/types.ts'

export function sampleTrack(overrides: Partial<Track> & { path: string }): Track {
  return {
    filename: 'track.mp3',
    title: 'Track',
    artist: 'Artist',
    titleSource: 'tag',
    durationSeconds: 180,
    bpm: null,
    bpmSource: 'missing',
    filenameBpm: null,
    hasTbpm: false,
    key: null,
    keySource: 'missing',
    filenameKey: null,
    energy: null,
    energySource: 'missing',
    comment: null,
    missing: false,
    readError: null,
    ...overrides,
  }
}
