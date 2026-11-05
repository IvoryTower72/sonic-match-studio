import { LIBRARY_COPY } from '../../shared/copy.js'
import { formatHms } from '../../shared/time.js'
import type { LibrarySnapshot, SetSummary } from '../../shared/types.js'

interface LibraryPaneProps {
  library: LibrarySnapshot
  sets: SetSummary[]
  currentFileId: string | null
  setsDirectory: string
  scanNote: string
  onOpenFolder: () => void
  onRescan: () => void
  onOpenSet: (fileId: string) => void
}

export function LibraryPane(props: LibraryPaneProps) {
  const folderName = props.library.folder?.split(/[\\/]/).filter(Boolean).pop()
  return (
    <aside className="library">
      <h2>Library</h2>
      <p className="note">{LIBRARY_COPY}</p>
      <div className="stack">
        <button type="button" className="button" data-testid="open-folder" onClick={props.onOpenFolder}>
          Open folder
        </button>
        <button
          type="button"
          className="button"
          data-testid="rescan"
          disabled={!props.library.folder}
          onClick={props.onRescan}
        >
          Rescan
        </button>
      </div>
      {folderName ? (
        <>
          <p className="folder-path" title={props.library.folder ?? ''} data-testid="library-folder">
            {folderName}
          </p>
          <p className="note" data-testid="library-count">
            {props.library.tracks.length} audio {props.library.tracks.length === 1 ? 'file' : 'files'}
            {props.library.skippedCount > 0 ? ` · ${props.library.skippedCount} other files left out` : ''}
            {props.library.unreadableCount > 0 ? ` · ${props.library.unreadableCount} could not be read` : ''}
            {props.library.truncated ? ' · stopped at 10,000 audio files' : ''}
          </p>
        </>
      ) : (
        <p className="note">No folder open. MP3 and WAV files in the folder you open show up in the list.</p>
      )}
      {props.scanNote ? <p className="note">{props.scanNote}</p> : null}

      <h2 className="section-label">Saved sets</h2>
      <p className="note" title={props.setsDirectory}>
        JSON files on this computer. Opening one does not change the reference.
      </p>
      {props.sets.length === 0 ? <p className="note">No saved sets yet.</p> : null}
      {props.sets.map((set) => (
        <button
          type="button"
          key={set.fileId}
          className={set.fileId === props.currentFileId ? 'set-button current' : 'set-button'}
          data-testid="saved-set"
          onClick={() => props.onOpenSet(set.fileId)}
        >
          <strong>{set.name}</strong>
          <span>
            {set.trackCount} {set.trackCount === 1 ? 'track' : 'tracks'} · {formatHms(set.targetSeconds)} ·{' '}
            {formatWhen(set.savedAt)}
          </span>
        </button>
      ))}
    </aside>
  )
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
