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
 * Chromium's first media request is `Range: bytes=0-`. Answering that with
 * 206 and a Content-Range that covers every byte lets Windows read the MP3
 * duration and then never start the clock. Play shows Pause, audio.error
 * stays empty, and the speaker meter stays at 0. The same 206 plays on Linux.
 * A full-span range is therefore a normal 200. A smaller range is a 206.
 * The file is opened read-only. no-store is omitted so Windows can rewind
 * past the ID3 header from its media cache.
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
  })

  if (!rangeHeader) return wholeFile(real, size, headers, request.method === 'HEAD')

  const range = parseByteRange(rangeHeader, size)
  if (!range) {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }

  if (range.start === 0 && range.end === size - 1) {
    return wholeFile(real, size, headers, request.method === 'HEAD')
  }

  const length = range.end - range.start + 1
  headers.set('Content-Length', String(length))
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  if (request.method === 'HEAD') return new Response(null, { status: 206, headers })
  return new Response(readOnlyBody(real, range.start, range.end), { status: 206, headers })
}

function wholeFile(filePath: string, size: number, headers: Headers, head: boolean): Response {
  headers.set('Content-Length', String(size))
  if (head) return new Response(null, { status: 200, headers })
  return new Response(readOnlyBody(filePath, 0, size - 1), { status: 200, headers })
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
