/** Planner clocks always include hours so a 2:00:00 target lines up with the total. */
export function formatHms(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const sign = seconds < 0 ? '-' : ''
  const total = Math.round(Math.abs(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remain = total % 60
  return `${sign}${hours}:${pad(minutes)}:${pad(remain)}`
}

/** Track clocks drop the hour until the file itself is an hour or longer. */
export function formatTrackClock(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remain = total % 60
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(remain)}`
  return `${minutes}:${pad(remain)}`
}

export function formatMediaClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  return formatTrackClock(seconds)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
