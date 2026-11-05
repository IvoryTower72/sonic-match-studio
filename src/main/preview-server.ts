import http from 'node:http'
import type { MediaGate } from './access.js'
import { mediaUrlFor, serveMedia } from './media.js'

export interface PreviewServer {
  origin: string
  urlFor(filePath: string): string
  close(): Promise<void>
}

/**
 * Loopback HTTP for preview. Windows Chromium decodes this stack.
 * It does not decode the same bytes when they arrive on a custom protocol.
 * The server binds 127.0.0.1 only and still refuses any other client address.
 */
export function startPreviewServer(gate: MediaGate): Promise<PreviewServer> {
  const server = http.createServer((request, response) => {
    void writePreview(request, response, gate).catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })

  return new Promise((resolve, reject) => {
    const fail = (error: Error) => reject(error)
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', fail)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Preview server did not bind.'))
        return
      }
      const origin = `http://127.0.0.1:${address.port}`
      resolve({
        origin,
        urlFor(filePath: string) {
          const token = new URL(mediaUrlFor(filePath)).pathname.replace(/^\//, '')
          return `${origin}/track/${token}`
        },
        close() {
          return new Promise((done, stop) => {
            server.close((error) => (error ? stop(error) : done()))
          })
        },
      })
    })
  })
}

async function writePreview(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  gate: MediaGate,
): Promise<void> {
  const remote = request.socket.remoteAddress
  if (remote !== '127.0.0.1' && remote !== '::ffff:127.0.0.1' && remote !== '::1') {
    response.writeHead(403)
    response.end()
    return
  }

  const method = request.method ?? 'GET'
  const token = trackToken(request.url ?? '/')
  if (!token) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const headers = new Headers()
  if (typeof request.headers.range === 'string') headers.set('range', request.headers.range)
  const served = await serveMedia(new Request(`sms://track/${token}`, { method, headers }), gate)
  const body = method === 'HEAD' || !served.body ? null : Buffer.from(await served.arrayBuffer())
  const outgoing: Record<string, string> = {}
  served.headers.forEach((value, key) => {
    outgoing[key] = value
  })
  if (body) outgoing['content-length'] = String(body.length)
  response.writeHead(served.status, outgoing)
  response.end(body ?? undefined)
}

function trackToken(rawUrl: string): string | null {
  let pathname: string
  try {
    pathname = new URL(rawUrl, 'http://127.0.0.1').pathname
  } catch {
    return null
  }
  const prefix = '/track/'
  if (!pathname.startsWith(prefix)) return null
  const token = pathname.slice(prefix.length)
  if (!token || token.includes('/')) return null
  return token
}
