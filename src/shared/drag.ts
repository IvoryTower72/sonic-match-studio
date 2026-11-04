export type DragPayload =
  | { kind: 'library'; paths: string[] }
  | { kind: 'planner'; index: number }

export function libraryDragPayload(paths: string[]): string {
  return JSON.stringify({ kind: 'library', paths } satisfies DragPayload)
}

export function plannerDragPayload(index: number): string {
  return JSON.stringify({ kind: 'planner', index } satisfies DragPayload)
}

export function readDrag(raw: string): DragPayload | null {
  try {
    const value = JSON.parse(raw) as { kind?: unknown; paths?: unknown; index?: unknown }
    if (value.kind === 'library' && Array.isArray(value.paths) && value.paths.every((item) => typeof item === 'string')) {
      return { kind: 'library', paths: value.paths }
    }
    if (value.kind === 'planner' && typeof value.index === 'number' && Number.isInteger(value.index)) {
      return { kind: 'planner', index: value.index }
    }
  } catch {
    return null
  }
  return null
}
