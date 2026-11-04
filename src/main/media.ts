import fs from 'node:fs'
import path from 'node:path'
import type { MediaGate } from './access.js'
import { parseByteRange } from './range.js'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
}

export function mediaUrlFor(filePath: string): string {
  const token = Buffer.from(filePath, 'utf8').toString('base64url')
  return `sms://track/${token}`
}

export function pathFromMediaUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'sms:' || parsed.hostname !== 'track') return null
  const token = parsed.pathname.replace(/^\//, '')
  if (!token) return null
  try {
    const filePath = Buffer.from(token, 'base64url').toString('utf8')
    return filePath || null
  } catch {
    return null
  }
}

/**
 * Serves one local audio file. The handle is opened read-only.
 * Range requests let the preview seek without loading a second copy of the file into the page.
 */
export async function serveMedia(request: Request, gate: MediaGate): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  const filePath = pathFromMediaUrl(request.url)
  if (!filePath) return new Response('Not found', { status: 404 })

  const mime = MIME[path.extname(filePath).toLowerCase()]
  if (!mime) return new Response('Not found', { status: 404 })

  const real = gate.resolve(filePath)
  if (!real) return new Response('Not found', { status: 404 })

  const stat = await fs.promises.stat(real)
  const size = stat.size
  const rangeHeader = request.headers.get('range')
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': mime,
    'Cache-Control': 'no-store',
  })

  if (!rangeHeader) {
    headers.set('Content-Length', String(size))
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
    const body = await readRange(real, 0, size - 1)
    return new Response(body, { status: 200, headers })
  }

  const range = parseByteRange(rangeHeader, size)
  if (!range) {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }

  const length = range.end - range.start + 1
  headers.set('Content-Length', String(length))
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  if (request.method === 'HEAD') return new Response(null, { status: 206, headers })
  const body = await readRange(real, range.start, range.end)
  return new Response(body, { status: 206, headers })
}

async function readRange(filePath: string, start: number, end: number): Promise<ArrayBuffer> {
  if (end < start) return new ArrayBuffer(0)
  const length = end - start + 1
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, start)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  } finally {
    await handle.close()
  }
}
