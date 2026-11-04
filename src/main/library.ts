import fs from 'node:fs'
import path from 'node:path'
import type { LibrarySnapshot, ScanProgress, Track } from '../shared/types.js'
import { isInside } from './access.js'
import { readTrack } from './tags.js'

const AUDIO = new Set(['.mp3', '.wav', '.wave'])
const MAX_AUDIO_FILES = 10000

export async function scanLibrary(
  folder: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<LibrarySnapshot> {
  const root = await fs.promises.realpath(folder)
  const rootStat = await fs.promises.stat(root)
  if (!rootStat.isDirectory()) {
    throw new Error('Choose a folder.')
  }

  const files: string[] = []
  const seenDirectories = new Set<string>()
  let skippedCount = 0
  let truncated = false
  await walk(root, root, files, seenDirectories, (skipped) => {
    skippedCount += skipped
  }, () => {
    truncated = files.length >= MAX_AUDIO_FILES
    return truncated
  })

  files.sort((left, right) => path.basename(left).localeCompare(path.basename(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  }))

  const tracks: Track[] = []
  let unreadableCount = 0
  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index]!
    const track = await readTrack(filePath)
    if (track.readError) unreadableCount += 1
    tracks.push(track)
    if (onProgress && (index % 10 === 0 || index === files.length - 1)) {
      onProgress({ done: index + 1, total: files.length })
    }
  }

  return {
    folder: root,
    tracks,
    skippedCount,
    unreadableCount,
    truncated,
  }
}

export async function refreshSavedTracks(tracks: Track[]): Promise<Track[]> {
  const next: Track[] = []
  for (const track of tracks) {
    try {
      await fs.promises.access(track.path, fs.constants.R_OK)
    } catch {
      next.push({ ...track, missing: true })
      continue
    }
    const fresh = await readTrack(track.path)
    if (fresh.readError) {
      next.push({ ...track, missing: false, readError: fresh.readError })
    } else {
      next.push(fresh)
    }
  }
  return next
}

async function walk(
  directory: string,
  root: string,
  files: string[],
  seenDirectories: Set<string>,
  countSkipped: (count: number) => void,
  isFull: () => boolean,
): Promise<void> {
  if (isFull()) return
  let realDirectory: string
  try {
    realDirectory = await fs.promises.realpath(directory)
  } catch {
    return
  }
  if (seenDirectories.has(realDirectory)) return
  seenDirectories.add(realDirectory)
  const entries = await fs.promises.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (isFull()) return
    if (entry.name.startsWith('.')) continue
    const full = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      await considerLink(full, root, files, seenDirectories, countSkipped, isFull)
      continue
    }
    if (entry.isDirectory()) {
      await walk(full, root, files, seenDirectories, countSkipped, isFull)
      continue
    }
    if (!entry.isFile()) continue
    if (AUDIO.has(path.extname(entry.name).toLowerCase())) {
      files.push(full)
    } else {
      countSkipped(1)
    }
  }
}

async function considerLink(
  full: string,
  root: string,
  files: string[],
  seenDirectories: Set<string>,
  countSkipped: (count: number) => void,
  isFull: () => boolean,
): Promise<void> {
  let real: string
  try {
    real = await fs.promises.realpath(full)
  } catch {
    countSkipped(1)
    return
  }
  if (!isInside(root, real)) {
    countSkipped(1)
    return
  }
  const stat = await fs.promises.stat(real)
  if (stat.isDirectory()) {
    await walk(real, root, files, seenDirectories, countSkipped, isFull)
    return
  }
  if (stat.isFile() && AUDIO.has(path.extname(full).toLowerCase())) {
    files.push(full)
    return
  }
  countSkipped(1)
}
