/** Seconds heard so far. `now` and `startedAt` are AudioContext.currentTime. */
export function previewPosition(offset: number, startedAt: number, now: number, duration: number): number {
  const elapsed = offset + (now - startedAt)
  if (!Number.isFinite(elapsed) || !Number.isFinite(duration)) return 0
  return Math.min(Math.max(duration, 0), Math.max(0, elapsed))
}
