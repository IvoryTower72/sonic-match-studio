import { useEffect, useRef, useState } from 'react'
import { previewPosition } from '../shared/preview-clock.js'
import type { Track } from '../shared/types.js'

function initialVolume(): number {
  try {
    const raw = localStorage.getItem('sms.previewVolume')
    const value = raw == null ? 0.8 : Number(raw)
    if (!Number.isFinite(value)) return 0.8
    return Math.min(1, Math.max(0, value))
  } catch {
    return 0.8
  }
}

interface Engine {
  ctx: AudioContext
  gain: GainNode
  buffer: AudioBuffer | null
  path: string | null
  source: AudioBufferSourceNode | null
  offset: number
  startedAt: number
  playing: boolean
  generation: number
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  const copy = new ArrayBuffer(data.byteLength)
  new Uint8Array(copy).set(data)
  return copy
}

/**
 * Preview state lives here, apart from the set.
 * Loading or seeking a track cannot reorder the planner or change the reference.
 *
 * Playback does not use an audio element. On Windows that element reaches
 * readyState HAVE_ENOUGH_DATA, stays unpaused, and then currentTime sticks at
 * one 1024-frame buffer (0.023s at 44.1 kHz) with no error. The file is decoded
 * up front and played as PCM, so the clock is the audio context, not that element.
 */
export function usePreview() {
  const engine = useRef<Engine | null>(null)
  const volumeRef = useRef(initialVolume())
  const scrubbing = useRef(false)
  const [preview, setPreview] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(volumeRef.current)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('sms.previewVolume', String(volume))
    } catch {
      // The preview still works if storage is blocked.
    }
  }, [volume])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const current = engine.current
      if (!current?.playing || !current.buffer || scrubbing.current) return
      setTime(previewPosition(current.offset, current.startedAt, current.ctx.currentTime, current.buffer.duration))
    }, 100)
    return () => window.clearInterval(id)
  }, [playing])

  useEffect(() => {
    return () => {
      const current = engine.current
      if (!current) return
      stopSource(current)
      void current.ctx.close()
    }
  }, [])

  function ensureEngine(): Engine {
    if (engine.current) return engine.current
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.value = volumeRef.current
    gain.connect(ctx.destination)
    const created: Engine = {
      ctx,
      gain,
      buffer: null,
      path: null,
      source: null,
      offset: 0,
      startedAt: 0,
      playing: false,
      generation: 0,
    }
    engine.current = created
    return created
  }

  function stopSource(current: Engine): void {
    const source = current.source
    current.source = null
    current.playing = false
    if (!source) return
    try {
      source.stop()
    } catch {
      // The source already ended.
    }
    source.disconnect()
  }

  function begin(current: Engine, offset: number): void {
    if (!current.buffer || current.buffer.duration <= 0) {
      setError('This file has no audio to play.')
      return
    }
    stopSource(current)
    const startAt = Math.min(Math.max(0, offset), Math.max(0, current.buffer.duration - 0.01))
    const source = current.ctx.createBufferSource()
    source.buffer = current.buffer
    source.connect(current.gain)
    source.onended = () => {
      if (current.source !== source || !current.buffer) return
      current.source = null
      current.playing = false
      current.offset = current.buffer.duration
      setPlaying(false)
      setTime(current.buffer.duration)
    }
    current.source = source
    current.offset = startAt
    current.startedAt = current.ctx.currentTime
    current.playing = true
    source.start(0, startAt)
    setPlaying(true)
    setTime(startAt)
  }

  function setVolume(next: number): void {
    const clamped = Math.min(1, Math.max(0, next))
    volumeRef.current = clamped
    setVolumeState(clamped)
    if (engine.current) engine.current.gain.gain.value = clamped
  }

  async function load(track: Track): Promise<void> {
    if (track.missing) {
      setError('That file is missing, so it cannot be previewed.')
      return
    }
    if (!window.sms) return
    const current = ensureEngine()
    void current.ctx.resume()
    const generation = ++current.generation
    stopSource(current)
    setPlaying(false)
    setError(null)
    setStatus('Reading the file…')
    setPreview(track)
    setTime(0)
    try {
      if (current.path !== track.path || !current.buffer) {
        const bytes = await window.sms.mediaBytes(track.path)
        const decoded = await current.ctx.decodeAudioData(toArrayBuffer(bytes))
        if (current.generation !== generation) return
        current.buffer = decoded
        current.path = track.path
        setDuration(decoded.duration)
      } else {
        setDuration(current.buffer.duration)
      }
      if (current.generation !== generation) return
      setStatus(null)
      begin(current, 0)
    } catch (caught) {
      if (current.generation !== generation) return
      setStatus(null)
      setPlaying(false)
      setError(caught instanceof Error ? caught.message : 'This file could not be played.')
    }
  }

  function toggle(): void {
    const current = engine.current
    if (!current?.buffer) return
    void current.ctx.resume()
    if (current.playing) {
      const position = previewPosition(current.offset, current.startedAt, current.ctx.currentTime, current.buffer.duration)
      stopSource(current)
      current.offset = position
      setPlaying(false)
      setTime(position)
      return
    }
    const restart = current.offset >= current.buffer.duration - 0.05 ? 0 : current.offset
    begin(current, restart)
  }

  function seek(next: number): void {
    const current = engine.current
    if (!current?.buffer || !Number.isFinite(next)) return
    const clamped = Math.min(Math.max(0, next), current.buffer.duration)
    if (current.playing) {
      begin(current, clamped)
      return
    }
    current.offset = clamped
    setTime(clamped)
  }

  return {
    preview,
    playing,
    time,
    duration,
    volume,
    error,
    status,
    scrubbing,
    load,
    toggle,
    seek,
    setVolume,
  }
}
