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
 * Serves one local audio file. The file is opened read-only and streamed.
 *
 * Chromium asks for `Range: bytes=0-` as soon as Play is pressed. The `play`
 * event fires before any samples are decoded, which is what flips the button
 * to Pause. A single ArrayBuffer of the whole file plays on Linux, but Windows
 * does not decode that buffered custom-protocol body, so `currentTime` stays 0.
 * A read-only stream with Content-Length and Content-Range is what the Windows
 * media pipeline will actually advance.
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
