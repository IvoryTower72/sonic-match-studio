import fs from 'node:fs'
import path from 'node:path'
import type { SetDraft, SetFile, SetSummary, Track, ValueSource } from '../shared/types.js'
import { isInside } from './access.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCES = new Set<ValueSource>(['tag', 'comment', 'filename', 'missing'])
const MAX_TRACKS = 5000
const MAX_NAME = 120

/** Overwrites `sets/<fileId>.json`. A different id is a different file. */
export function overwriteSet(directory: string, file: SetFile): SetFile {
  const next = normalizeFile({ ...file, savedAt: new Date().toISOString() })
  writeJson(setPath(directory, next.fileId), next)
  return next
}

/** Always creates a new id and a new file. The caller's previous file is not opened for writing. */
export function createSet(directory: string, draft: SetDraft): SetFile {
  const file = normalizeFile({
    version: 1,
    fileId: crypto.randomUUID(),
    name: draft.name,
    targetSeconds: draft.targetSeconds,
    tracks: draft.tracks,
    savedAt: new Date().toISOString(),
  })
  writeJson(setPath(directory, file.fileId), file)
  return file
}

export function readSet(directory: string, fileId: string): SetFile {
  const filePath = setPath(directory, fileId)
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
  const file = parseSetFile(raw)
  if (!file || file.fileId !== fileId) throw new Error('That saved set could not be read.')
  return file
}

export function listSets(directory: string): SetSummary[] {
  if (!fs.existsSync(directory)) return []
  const summaries: SetSummary[] = []
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith('.json')) continue
    const fileId = name.slice(0, -'.json'.length)
    if (!UUID.test(fileId)) continue
    try {
      const file = readSet(directory, fileId)
      summaries.push({
        fileId: file.fileId,
        name: file.name,
        targetSeconds: file.targetSeconds,
        trackCount: file.tracks.length,
        savedAt: file.savedAt,
      })
    } catch {
      // A damaged JSON file stays on disk and is left out of the list.
    }
  }
  summaries.sort((left, right) => right.savedAt.localeCompare(left.savedAt))
  return summaries
}

export function parseSetFile(raw: unknown): SetFile | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (record.version !== 1 || typeof record.fileId !== 'string' || !UUID.test(record.fileId)) return null
  if (typeof record.name !== 'string' || typeof record.savedAt !== 'string') return null
  if (typeof record.targetSeconds !== 'number' || !Array.isArray(record.tracks)) return null
  try {
    return normalizeFile({
      version: 1,
      fileId: record.fileId,
      name: record.name,
      targetSeconds: record.targetSeconds,
      tracks: record.tracks as Track[],
      savedAt: record.savedAt,
    })
  } catch {
    return null
  }
}

function normalizeFile(file: SetFile): SetFile {
  if (!UUID.test(file.fileId)) throw new Error('The set file id is not valid.')
  if (!Array.isArray(file.tracks) || file.tracks.length > MAX_TRACKS) {
    throw new Error('This set has too many tracks to save.')
  }
  return {
    version: 1,
    fileId: file.fileId,
    name: cleanName(file.name),
    targetSeconds: cleanTarget(file.targetSeconds),
    tracks: file.tracks.map(cleanTrack),
    savedAt: file.savedAt,
  }
}

function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  const used = trimmed || 'Untitled set'
  return used.slice(0, MAX_NAME)
}

function cleanTarget(targetSeconds: number): number {
  if (!Number.isFinite(targetSeconds) || targetSeconds < 0) {
    throw new Error('The target time is not valid.')
  }
  return Math.min(targetSeconds, 99 * 60 * 60)
}

function cleanTrack(track: Track): Track {
  if (!track || typeof track.path !== 'string' || !track.path.trim()) {
    throw new Error('A track in this set has no file path.')
  }
  return {
    path: track.path,
    filename: text(track.filename, path.basename(track.path)),
    title: text(track.title, path.basename(track.path)),
    artist: text(track.artist, ''),
    titleSource: track.titleSource === 'tag' ? 'tag' : 'filename',
    durationSeconds: cleanDuration(track.durationSeconds),
    bpm: cleanOptionalNumber(track.bpm),
    bpmSource: source(track.bpmSource),
    filenameBpm: cleanOptionalNumber(track.filenameBpm),
    hasTbpm: Boolean(track.hasTbpm),
    key: track.key == null ? null : text(track.key, ''),
    keySource: source(track.keySource),
    filenameKey: track.filenameKey == null ? null : text(track.filenameKey, ''),
    energy: cleanOptionalNumber(track.energy),
    energySource: source(track.energySource),
    comment: track.comment == null ? null : text(track.comment, ''),
    missing: Boolean(track.missing),
    readError: track.readError == null ? null : text(track.readError, ''),
  }
}

function source(value: ValueSource | undefined): ValueSource {
  return value && SOURCES.has(value) ? value : 'missing'
}

function text(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.slice(0, 2000)
}

function cleanDuration(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

function cleanOptionalNumber(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function setPath(directory: string, fileId: string): string {
  if (!UUID.test(fileId)) throw new Error('The set file id is not valid.')
  const root = path.resolve(directory)
  const filePath = path.resolve(root, `${fileId}.json`)
  if (!isInside(root, filePath)) throw new Error('The set file id is not valid.')
  return filePath
}

function writeJson(filePath: string, data: unknown): void {
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true })
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.tmp`)
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, filePath)
}
