import path from 'node:path'
import { parseFile, type IAudioMetadata, type ITag } from 'music-metadata'
import { metaFromComment, metaFromFilename, normalizeKey } from '../shared/filename.js'
import type { Track, ValueSource } from '../shared/types.js'

export interface TagReading {
  title: string | null
  artist: string | null
  durationSeconds: number | null
  tagKey: string | null
  tagBpm: number | null
  hasTbpm: boolean
  energy: number | null
  comment: string | null
}

/** Turns a tag reading plus the filename into the track the window shows. */
export function buildTrack(filePath: string, reading: TagReading, readError: string | null = null): Track {
  const filename = path.basename(filePath)
  const fromName = metaFromFilename(filename)
  const fromComment = metaFromComment(reading.comment)

  let bpm: number | null = null
  let bpmSource: ValueSource = 'missing'
  if (reading.hasTbpm && reading.tagBpm != null) {
    bpm = reading.tagBpm
    bpmSource = 'tag'
  } else if (fromComment.bpm != null) {
    bpm = fromComment.bpm
    bpmSource = 'comment'
  } else if (fromName.bpm != null) {
    bpm = fromName.bpm
    bpmSource = 'filename'
  }

  let key: string | null = null
  let keySource: ValueSource = 'missing'
  if (reading.tagKey) {
    key = reading.tagKey
    keySource = 'tag'
  } else if (fromComment.key) {
    key = fromComment.key
    keySource = 'comment'
  } else if (fromName.key) {
    key = fromName.key
    keySource = 'filename'
  }

  const title = reading.title?.trim() || stem(filename)
  return {
    path: filePath,
    filename,
    title,
    artist: reading.artist?.trim() ?? '',
    titleSource: reading.title?.trim() ? 'tag' : 'filename',
    durationSeconds: reading.durationSeconds,
    bpm,
    bpmSource,
    filenameBpm: fromName.bpm,
    hasTbpm: reading.hasTbpm,
    key,
    keySource,
    filenameKey: fromName.key,
    energy: reading.energy,
    energySource: reading.energy == null ? 'missing' : 'tag',
    comment: reading.comment,
    missing: false,
    readError,
  }
}

/**
 * Reads tags and duration. music-metadata opens the file to parse it.
 * This function never writes, renames, or retags.
 */
export async function readTrack(filePath: string): Promise<Track> {
  try {
    const metadata = await parseFile(filePath, { duration: true, skipCovers: true })
    return buildTrack(filePath, readingFrom(metadata))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The tags could not be read.'
    return buildTrack(
      filePath,
      {
        title: null,
        artist: null,
        durationSeconds: null,
        tagKey: null,
        tagBpm: null,
        hasTbpm: false,
        energy: null,
        comment: null,
      },
      message,
    )
  }
}

function readingFrom(metadata: IAudioMetadata): TagReading {
  const frames = id3Frames(metadata)
  const comment = commentText(frames)
  const bpmFrame = frames.find((frame) => frame.id === 'TBPM' || frame.id === 'TBP')
  return {
    title: metadata.common.title?.trim() || null,
    artist: metadata.common.artist?.trim() || null,
    durationSeconds: finiteDuration(metadata.format.duration),
    tagKey: keyFromFrames(frames),
    tagBpm: bpmFrame ? bpmFromFrame(bpmFrame) : null,
    hasTbpm: Boolean(bpmFrame),
    energy: energyFromFrames(frames),
    comment,
  }
}

function id3Frames(metadata: IAudioMetadata): ITag[] {
  const groups = Object.entries(metadata.native)
  const id3 = groups.filter(([name]) => name.startsWith('ID3v2')).flatMap(([, frames]) => frames)
  if (id3.length > 0) return id3
  return groups.flatMap(([, frames]) => frames)
}

function commentText(frames: ITag[]): string | null {
  for (const frame of frames) {
    if (frame.id !== 'COMM' && frame.id !== 'COM') continue
    const text = textOf(frame.value)
    if (text) return text
  }
  return null
}

function keyFromFrames(frames: ITag[]): string | null {
  const frame = frames.find((item) => item.id === 'TKEY' || item.id === 'TKE')
  if (!frame) return null
  const text = textOf(frame.value)
  if (!text) return null
  return normalizeKey(text) || null
}

function bpmFromFrame(frame: ITag): number | null {
  const text = textOf(frame.value)
  if (!text) return null
  const bpm = Number(text)
  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 400) return null
  return bpm
}

function energyFromFrames(frames: ITag[]): number | null {
  for (const frame of frames) {
    const id = frame.id.toLowerCase()
    if (id === 'txxx:energylevel' || id.startsWith('txxx:energylevel')) {
      return parseEnergy(textOf(frame.value))
    }
    if (frame.id === 'TXXX' && frame.value && typeof frame.value === 'object' && 'description' in frame.value) {
      const record = frame.value as { description?: unknown; text?: unknown }
      const description = textOf(record.description).replace(/^\uFEFF/g, '')
      if (description === 'EnergyLevel') return parseEnergy(textOf(record.text))
    }
  }
  return null
}

function parseEnergy(value: string): number | null {
  const cleaned = value.replace(/^\uFEFF/g, '').trim()
  if (!/^\d{1,2}$/.test(cleaned)) return null
  return Number(cleaned)
}

function textOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).replace(/\u0000/g, '').trim()
  if (value && typeof value === 'object' && 'text' in value) {
    const text = (value as { text?: unknown }).text
    return textOf(text)
  }
  return ''
}

function finiteDuration(duration: number | undefined): number | null {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return null
  return duration
}

function stem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}
