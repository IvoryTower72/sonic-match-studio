import type { SetFile, Track } from './types.js'

export interface WorkingSet {
  fileId: string | null
  name: string
  targetSeconds: number
  tracks: Track[]
  reference: Track | null
  savedSignature: string
}

export function initialWorkingSet(): WorkingSet {
  const state: WorkingSet = {
    fileId: null,
    name: 'Untitled set',
    targetSeconds: 2 * 60 * 60,
    tracks: [],
    reference: null,
    savedSignature: '',
  }
  state.savedSignature = signature(state)
  return state
}

/** Identity of a saved set: name, target, and path order. Preview is not part of it. */
export function signature(state: Pick<WorkingSet, 'name' | 'targetSeconds' | 'tracks'>): string {
  return JSON.stringify({
    name: state.name,
    targetSeconds: state.targetSeconds,
    tracks: state.tracks.map((track) => track.path),
  })
}

export function isDirty(state: WorkingSet): boolean {
  return signature(state) !== state.savedSignature
}

export function renameSet(state: WorkingSet, name: string): WorkingSet {
  return { ...state, name }
}

export function setTarget(state: WorkingSet, targetSeconds: number): WorkingSet {
  if (!Number.isFinite(targetSeconds)) return state
  return { ...state, targetSeconds: Math.max(0, targetSeconds) }
}

/**
 * Copies the chosen track into the reference slot.
 * The planner array is the same array, so the order cannot change here.
 */
export function setReference(state: WorkingSet, track: Track | null): WorkingSet {
  return {
    ...state,
    reference: track ? { ...track } : null,
    tracks: state.tracks,
  }
}

export function addToSet(
  state: WorkingSet,
  incoming: Track[],
): { state: WorkingSet; added: number; skipped: Track[] } {
  const seen = new Set(state.tracks.map((track) => track.path))
  const added: Track[] = []
  const skipped: Track[] = []
  for (const track of incoming) {
    if (seen.has(track.path)) {
      skipped.push(track)
      continue
    }
    seen.add(track.path)
    added.push({ ...track })
  }
  if (added.length === 0) return { state, added: 0, skipped }
  return {
    state: { ...state, tracks: [...state.tracks, ...added] },
    added: added.length,
    skipped,
  }
}

/** Drops a row from the set. It does not know about the audio file. */
export function removeFromSet(state: WorkingSet, index: number): WorkingSet {
  if (index < 0 || index >= state.tracks.length) return state
  return {
    ...state,
    tracks: state.tracks.filter((_, trackIndex) => trackIndex !== index),
  }
}

/** `to` is the index the moved row should have after the move. */
export function reorderSet(state: WorkingSet, from: number, to: number): WorkingSet {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= state.tracks.length ||
    to >= state.tracks.length
  ) {
    return state
  }
  const tracks = state.tracks.slice()
  const [moved] = tracks.splice(from, 1)
  if (!moved) return state
  tracks.splice(to, 0, moved)
  return { ...state, tracks }
}

export function replaceInSet(
  state: WorkingSet,
  index: number,
  track: Track,
): { state: WorkingSet; error: string | null } {
  if (index < 0 || index >= state.tracks.length) {
    return { state, error: 'Choose a row in the set first.' }
  }
  const duplicateAt = state.tracks.findIndex((item, itemIndex) => itemIndex !== index && item.path === track.path)
  if (duplicateAt >= 0) {
    return { state, error: `${displayName(track)} is already in the set.` }
  }
  const tracks = state.tracks.slice()
  tracks[index] = { ...track }
  return { state: { ...state, tracks }, error: null }
}

export function applyOpenedSet(state: WorkingSet, file: SetFile): WorkingSet {
  const next: WorkingSet = {
    ...state,
    fileId: file.fileId,
    name: file.name,
    targetSeconds: file.targetSeconds,
    tracks: file.tracks.map((track) => ({ ...track })),
    reference: state.reference,
  }
  next.savedSignature = signature(next)
  return next
}

export function markSaved(state: WorkingSet, file: SetFile): WorkingSet {
  const next: WorkingSet = {
    ...state,
    fileId: file.fileId,
    name: file.name,
    targetSeconds: file.targetSeconds,
    tracks: state.tracks,
    reference: state.reference,
  }
  next.savedSignature = signature(next)
  return next
}

export function displayName(track: Pick<Track, 'title' | 'artist'>): string {
  if (track.artist) return `${track.title} — ${track.artist}`
  return track.title
}
