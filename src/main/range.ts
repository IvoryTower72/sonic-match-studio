export interface ByteRange {
  start: number
  end: number
}

/** Parses one `bytes=` range. Returns null when the range cannot be served. */
export function parseByteRange(header: string, size: number): ByteRange | null {
  if (size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const startText = match[1] ?? ''
  const endText = match[2] ?? ''
  if (startText === '' && endText === '') return null

  if (startText === '') {
    const suffix = Number(endText)
    if (!Number.isInteger(suffix) || suffix <= 0) return null
    const start = Math.max(0, size - suffix)
    return { start, end: size - 1 }
  }

  const start = Number(startText)
  if (!Number.isInteger(start) || start < 0 || start >= size) return null
  const end = endText === '' ? size - 1 : Math.min(size - 1, Number(endText))
  if (!Number.isInteger(end) || end < start) return null
  return { start, end }
}
