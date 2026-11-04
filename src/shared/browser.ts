import type { Track } from './types.js'

export type SortColumn = 'title' | 'artist' | 'bpm' | 'key' | 'energy' | 'duration' | 'filename'
export type SortDirection = 'asc' | 'desc'

export function filterTracks(tracks: Track[], query: string): Track[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tracks
  return tracks.filter((track) => haystack(track).includes(needle))
}

export function sortTracks(tracks: Track[], column: SortColumn, direction: SortDirection): Track[] {
  const factor = direction === 'asc' ? 1 : -1
  const copy = tracks.slice()
  copy.sort((left, right) => {
    const compared = compareColumn(left, right, column)
    if (compared !== 0) {
      const leftMissing = columnValue(left, column) == null
      const rightMissing = columnValue(right, column) == null
      if (leftMissing || rightMissing) return compared
      return compared * factor
    }
    return left.path.localeCompare(right.path)
  })
  return copy
}

function haystack(track: Track): string {
  return [
    track.title,
    track.artist,
    track.filename,
    track.key ?? '',
    track.bpm?.toString() ?? '',
    track.energy?.toString() ?? '',
    track.comment ?? '',
  ]
    .join('\n')
    .toLowerCase()
}

function compareColumn(left: Track, right: Track, column: SortColumn): number {
  const leftValue = columnValue(left, column)
  const rightValue = columnValue(right, column)
  if (leftValue == null && rightValue == null) return 0
  if (leftValue == null) return 1
  if (rightValue == null) return -1
  if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue
  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function columnValue(track: Track, column: SortColumn): string | number | null {
  switch (column) {
    case 'title':
      return track.title
    case 'artist':
      return track.artist || null
    case 'bpm':
      return track.bpm
    case 'key':
      return track.key
    case 'energy':
      return track.energy
    case 'duration':
      return track.durationSeconds
    case 'filename':
      return track.filename
  }
}
