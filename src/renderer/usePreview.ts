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
 * Loading or seeking a track cannot reorder the planner or change the reference.
 */
export function usePreview() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const loadedPath = useRef<string | null>(null)
  const scrubbing = useRef(false)
  const [preview, setPreview] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(initialVolume)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
    try {
      localStorage.setItem('sms.previewVolume', String(volume))
    } catch {
      // The preview still works if storage is blocked.
    }
  }, [volume])

  function setVolume(next: number): void {
    const clamped = Math.min(1, Math.max(0, next))
    setVolumeState(clamped)
    if (audioRef.current) audioRef.current.volume = clamped
  }

  async function load(track: Track): Promise<void> {
    if (track.missing) {
      setError('That file is missing, so it cannot be previewed.')
      return
    }
    const audio = audioRef.current
    if (!audio || !window.sms) return
    setError(null)
    setPreview(track)
    try {
      if (loadedPath.current !== track.path) {
        audio.src = await window.sms.mediaUrl(track.path)
        loadedPath.current = track.path
      } else {
        audio.currentTime = 0
      }
      await audio.play()
    } catch (caught) {
      setPlaying(false)
      setError(caught instanceof Error ? caught.message : 'This file could not be played.')
    }
  }

  async function toggle(): Promise<void> {
    const audio = audioRef.current
    if (!audio || !loadedPath.current) return
    if (audio.paused) {
      try {
        await audio.play()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'This file could not be played.')
      }
      return
    }
    audio.pause()
  }

  function seek(next: number): void {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(next)) return
    audio.currentTime = next
    setTime(next)
  }

  function onTimeUpdate(): void {
    const audio = audioRef.current
    if (!audio || scrubbing.current) return
    setTime(audio.currentTime)
  }

  function onLoaded(): void {
    const audio = audioRef.current
    setDuration(audio && Number.isFinite(audio.duration) ? audio.duration : 0)
  }

  return {
    audioRef,
    preview,
    playing,
    time,
    duration,
    volume,
    error,
    scrubbing,
    load,
    toggle,
    seek,
    setVolume,
    onTimeUpdate,
    onLoaded,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onError: () => setError('This file could not be played.'),
  }
}
