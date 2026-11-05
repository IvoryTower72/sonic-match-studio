export interface TimedTrack {
  title: string
  durationSeconds: number | null
}

export interface PlanTiming {
  totalSeconds: number
  targetSeconds: number
  remainingSeconds: number
  overtimeSeconds: number
  /** This slice always totals full files. It is not live-set time. */
  fullFileEstimate: true
  unknownDurationCount: number
  /** Cumulative end, or null once an unknown duration makes the end unknowable. */
  endSeconds: Array<number | null>
  count: number
  last: {
    title: string
    durationSeconds: number | null
    endSeconds: number | null
  } | null
}

export function planTiming(tracks: TimedTrack[], targetSeconds: number): PlanTiming {
  const target = Number.isFinite(targetSeconds) ? Math.max(0, targetSeconds) : 0
  let totalSeconds = 0
  let unknownDurationCount = 0
  let blocked = false
  const endSeconds: Array<number | null> = []

  for (const track of tracks) {
    if (track.durationSeconds == null || !Number.isFinite(track.durationSeconds)) {
      unknownDurationCount += 1
      blocked = true
      endSeconds.push(null)
      continue
    }
    totalSeconds += Math.max(0, track.durationSeconds)
    endSeconds.push(blocked ? null : totalSeconds)
  }

  const overtimeSeconds = Math.max(0, totalSeconds - target)
  const remainingSeconds = Math.max(0, target - totalSeconds)
  const lastTrack = tracks.length > 0 ? tracks[tracks.length - 1] : undefined

  return {
    totalSeconds,
    targetSeconds: target,
    remainingSeconds,
    overtimeSeconds,
    fullFileEstimate: true,
    unknownDurationCount,
    endSeconds,
    count: tracks.length,
    last: lastTrack
      ? {
          title: lastTrack.title,
          durationSeconds: lastTrack.durationSeconds,
          endSeconds: endSeconds[endSeconds.length - 1] ?? null,
        }
      : null,
  }
}
