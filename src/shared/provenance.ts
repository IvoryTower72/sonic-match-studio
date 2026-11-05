import type { Track } from './types.js'

export function bpmSourceLabel(track: Pick<Track, 'bpm' | 'bpmSource' | 'filenameBpm'>): string {
  if (track.bpm == null) return ''
  if (track.bpmSource === 'tag') return 'tag'
  if (track.bpmSource === 'comment' && track.filenameBpm === track.bpm) return 'comment, filename'
  if (track.bpmSource === 'comment') return 'comment'
  if (track.bpmSource === 'filename') return 'filename'
  return ''
}

export function bpmProvenance(
  track: Pick<Track, 'bpm' | 'bpmSource' | 'filenameBpm' | 'hasTbpm'>,
): string {
  if (track.hasTbpm && track.bpmSource === 'tag') return 'BPM is in the TBPM tag.'
  if (track.hasTbpm && track.bpmSource === 'comment') {
    return `A TBPM tag is present but has no tempo. Showing the comment${filenameNote(track)}.`
  }
  if (track.bpmSource === 'comment' && track.filenameBpm === track.bpm) {
    return 'No TBPM tag. BPM is in the comment and the filename.'
  }
  if (track.bpmSource === 'comment' && track.filenameBpm != null) {
    return `No TBPM tag. BPM is in the comment. The filename says ${track.filenameBpm}.`
  }
  if (track.bpmSource === 'comment') return 'No TBPM tag. BPM is in the comment.'
  if (track.bpmSource === 'filename') {
    return 'No TBPM tag and no BPM in the comment. BPM is taken from the filename.'
  }
  return 'No BPM in a tag, the comment, or the filename.'
}

export function keySourceLabel(track: Pick<Track, 'key' | 'keySource'>): string {
  if (track.key == null) return ''
  if (track.keySource === 'tag') return 'tag'
  if (track.keySource === 'comment') return 'comment'
  if (track.keySource === 'filename') return 'filename'
  return ''
}

export function keyProvenance(track: Pick<Track, 'key' | 'keySource' | 'filenameKey'>): string {
  if (track.keySource === 'tag') {
    if (track.filenameKey && track.filenameKey !== track.key) {
      return `Key is in the TKEY tag. The filename says ${track.filenameKey}.`
    }
    return 'Key is in the TKEY tag.'
  }
  if (track.keySource === 'comment') return 'No TKEY tag. Key is in the comment.'
  if (track.keySource === 'filename') return 'No TKEY tag. Key is taken from the filename.'
  return 'No key in a tag, the comment, or the filename.'
}

export function energySourceLabel(track: Pick<Track, 'energy' | 'energySource'>): string {
  if (track.energy == null || track.energySource !== 'tag') return ''
  return 'tag'
}

export function energyProvenance(track: Pick<Track, 'energy' | 'energySource'>): string {
  if (track.energySource === 'tag' && track.energy != null) return 'Energy is in the EnergyLevel tag.'
  return 'No EnergyLevel tag.'
}

function filenameNote(track: Pick<Track, 'bpm' | 'filenameBpm'>): string {
  if (track.filenameBpm == null) return ''
  if (track.filenameBpm === track.bpm) return ', which matches the filename'
  return `. The filename says ${track.filenameBpm}`
}
