const KEY_TOKEN = String.raw`0?\d{1,2}[ABab]`
const BPM_TOKEN = String.raw`\d{2,3}`
const LEADING = new RegExp(`^(${KEY_TOKEN})\\s*-\\s*(${BPM_TOKEN})\\b`)
const TRAILING = new RegExp(`(${KEY_TOKEN})\\s*-\\s*(${BPM_TOKEN})\\s*$`)

export interface FilenameMeta {
  key: string | null
  bpm: number | null
}

/** Leading-zero Camelot codes such as 07A are the same code as 7A. Other text is kept. */
export function normalizeKey(value: string): string {
  const trimmed = value.replace(/^\uFEFF/g, '').trim()
  const match = trimmed.match(/^0*(\d{1,2})\s*([ABab])$/)
  if (!match) return trimmed
  const number = Number(match[1])
  if (!Number.isInteger(number) || number < 1 || number > 12) return trimmed
  return `${number}${match[2]!.toUpperCase()}`
}

export function metaFromFilename(filename: string): FilenameMeta {
  const stem = filename.replace(/\.[^.]+$/, '')
  return readKeyBpm(stem, LEADING) ?? readKeyBpm(stem, TRAILING) ?? { key: null, bpm: null }
}

export function metaFromComment(comment: string | null): FilenameMeta {
  if (!comment) return { key: null, bpm: null }
  return readKeyBpm(comment.trim(), LEADING) ?? { key: null, bpm: null }
}

function readKeyBpm(value: string, pattern: RegExp): FilenameMeta | null {
  const match = value.match(pattern)
  if (!match) return null
  const key = normalizeKey(match[1] ?? '')
  const bpm = Number(match[2])
  if (!key || !Number.isInteger(bpm)) return null
  return { key, bpm }
}
