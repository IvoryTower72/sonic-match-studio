import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
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
 * Builds the read-only response for one audio file.
 *
 * The `sms://track/` URL is only the token shape used here. Windows Chromium
 * reads the duration from a custom protocol and then does not decode it: Play
 * shows Pause, the clock stays 0:00, and the speaker meter stays at 0. The
 * window plays the same bytes over `http://127.0.0.1`, which is the pipeline
 * Chromium actually decodes. The file is opened read-only.
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
    'X-Content-Type-Options': 'nosniff',
  })

  if (!rangeHeader) {
    headers.set('Content-Length', String(size))
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
    return new Response(readOnlyBody(real, 0, size - 1), { status: 200, headers })
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
  return new Response(readOnlyBody(real, range.start, range.end), { status: 206, headers })
}

/** Bytes from `start` through `end`, inclusive. The file is never opened for writing. */
function readOnlyBody(filePath: string, start: number, end: number): ReadableStream<Uint8Array> {
  if (end < start) {
    return new ReadableStream({
      start(controller) {
        controller.close()
      },
    })
  }
  const nodeStream = fs.createReadStream(filePath, { start, end, flags: 'r' })
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
}
