import { useEffect, useRef, useState } from 'react'
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

/**
 * Preview state lives here, apart from the set.
 * Loading, seeking, or changing volume cannot reorder the planner or change the reference.
 * The clock is the main-process player's position, not a page audio element.
 */
export function usePreview() {
  const volumeRef = useRef(initialVolume())
  const scrubbing = useRef(false)
  const loadToken = useRef(0)
  const pendingSeek = useRef(0)
  const seekTimer = useRef(0)
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
    const sms = window.sms
    if (!playing || !sms) return
    const id = window.setInterval(() => {
      void sms.previewStatus().then((next) => {
        if (scrubbing.current) return
        setTime(next.position)
        setPlaying(next.playing)
        if (next.duration > 0) setDuration(next.duration)
      }).catch(() => undefined)
    }, 200)
    return () => window.clearInterval(id)
  }, [playing])

  useEffect(() => {
    return () => {
      if (seekTimer.current) window.clearTimeout(seekTimer.current)
    }
  }, [])

  function fail(caught: unknown): void {
    setStatus(null)
    setPlaying(false)
    setError(caught instanceof Error ? caught.message : 'This file could not be played.')
  }

  async function load(track: Track): Promise<void> {
    if (track.missing) {
      setError('That file is missing, so it cannot be previewed.')
      return
    }
    if (!window.sms) return
    const token = ++loadToken.current
    setPreview(track)
    setError(null)
    setStatus('Opening…')
    setPlaying(false)
    setTime(0)
    setDuration(track.durationSeconds ?? 0)
    try {
      const opened = await window.sms.previewLoad(track.path, track.durationSeconds ?? 0)
      if (token !== loadToken.current) return
      await window.sms.previewVolume(volumeRef.current)
      if (token !== loadToken.current) return
      const started = await window.sms.previewPlay()
      if (token !== loadToken.current) return
      setStatus(null)
      setDuration(started.duration || opened.duration || track.durationSeconds || 0)
      setTime(started.position)
      setPlaying(started.playing)
    } catch (caught) {
      if (token !== loadToken.current) return
      fail(caught)
    }
  }

  async function toggle(): Promise<void> {
    if (!window.sms || !preview) return
    try {
      const next = playing ? await window.sms.previewPause() : await window.sms.previewPlay()
      setError(null)
      setTime(next.position)
      setPlaying(next.playing)
      if (next.duration > 0) setDuration(next.duration)
    } catch (caught) {
      fail(caught)
    }
  }

  function seek(next: number): void {
    const sms = window.sms
    if (!sms || !Number.isFinite(next)) return
    pendingSeek.current = next
    setTime(next)
    if (seekTimer.current) window.clearTimeout(seekTimer.current)
    seekTimer.current = window.setTimeout(() => {
      const target = pendingSeek.current
      void sms.previewSeek(target).then((status) => {
        if (!scrubbing.current) setTime(status.position)
        setPlaying(status.playing)
      }).catch((caught: unknown) => fail(caught))
    }, 80)
  }

  function setVolume(next: number): void {
    const clamped = Math.min(1, Math.max(0, next))
    volumeRef.current = clamped
    setVolumeState(clamped)
    if (!window.sms || !preview) return
    void window.sms.previewVolume(clamped).catch((caught: unknown) => fail(caught))
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
