import fs from 'node:fs'
import path from 'node:path'

/** True when `target` is `root` or a path inside it. A different drive is outside. */
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (relative === '') return true
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

/**
 * Files the renderer may hear. A path is allowed when it is inside the opened
 * folder, or when it is one file from an opened set. Nothing is opened for writing.
 */
export class MediaGate {
  /** Folders the DJ opened in this session. Preview keeps working after they open another one. */
  private roots: string[] = []
  private extra = new Set<string>()

  setRoot(root: string | null): void {
    if (!root) return
    const real = fs.realpathSync(root)
    if (!this.roots.includes(real)) this.roots.push(real)
  }

  allow(filePath: string): void {
    try {
      const real = fs.realpathSync(filePath)
      if (fs.statSync(real).isFile()) this.extra.add(real)
    } catch {
      // A missing set file is kept in the planner and is not readable.
    }
  }

  /** Real path when the file may be read, otherwise null. */
  resolve(filePath: string): string | null {
    let real: string
    try {
      real = fs.realpathSync(filePath)
      if (!fs.statSync(real).isFile()) return null
    } catch {
      return null
    }
    if (this.extra.has(real)) return real
    if (this.roots.some((root) => isInside(root, real))) return real
    return null
  }
}
