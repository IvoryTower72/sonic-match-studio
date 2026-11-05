import { useEffect, useState, type MouseEvent } from 'react'
import type { SortColumn, SortDirection } from '../../shared/browser.js'
import { MATCH_COPY } from '../../shared/copy.js'
import { libraryDragPayload } from '../../shared/drag.js'
import {
  bpmProvenance,
  bpmSourceLabel,
  energyProvenance,
  energySourceLabel,
  keyProvenance,
  keySourceLabel,
} from '../../shared/provenance.js'
import { formatTrackClock } from '../../shared/time.js'
import type { Track } from '../../shared/types.js'

interface TrackTableProps {
  tracks: Track[]
  query: string
  sortColumn: SortColumn
  sortDirection: SortDirection
  selected: string[]
  anchor: string | null
  referencePath: string | null
  previewPath: string | null
  onQuery: (query: string) => void
  onSort: (column: SortColumn) => void
  onSelect: (path: string, index: number, event: MouseEvent) => void
  onAnchor: (path: string) => void
  onPreview: (track: Track) => void
  onAdd: () => void
  onSetReference: (track?: Track) => void
}

const COLUMNS: Array<{ id: SortColumn; label: string; numeric?: boolean }> = [
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' },
  { id: 'bpm', label: 'BPM', numeric: true },
  { id: 'key', label: 'Key' },
  { id: 'energy', label: 'Energy', numeric: true },
  { id: 'duration', label: 'Time', numeric: true },
]

export function TrackTable(props: TrackTableProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; track: Track } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  return (
    <section className="browser" aria-label="Tracks">
      <div className="toolbar">
        <input
          className="search"
          data-testid="track-search"
          type="search"
          placeholder="Search title, artist, key, BPM, filename"
          aria-label="Search tracks"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
        />
      </div>
      <div className="actions">
        <button type="button" className="button" data-testid="preview-selected" onClick={() => {
          const track = props.tracks.find((item) => item.path === props.anchor)
          if (track) props.onPreview(track)
        }}>
          Preview
        </button>
        <button type="button" className="button" data-testid="add-selected" onClick={props.onAdd}>
          Add to set
        </button>
        <button type="button" className="button" onClick={() => props.onSetReference()}>
          Set reference
        </button>
      </div>
      <div className="table-wrap">
        {props.tracks.length === 0 ? (
          <p className="empty">Open a folder, then preview a track or drag it into the set.</p>
        ) : (
          <table>
            <colgroup>
              <col className="col-title" />
              <col className="col-artist" />
              <col className="col-bpm" />
              <col className="col-key" />
              <col className="col-energy" />
              <col className="col-time" />
              <col className="col-match" />
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.id} className={column.numeric ? 'num' : undefined} aria-sort={ariaSort(props, column.id)}>
                    <button type="button" onClick={() => props.onSort(column.id)}>
                      {column.label}
                      {props.sortColumn === column.id ? (props.sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th className="static" title={MATCH_COPY}>Match</th>
              </tr>
            </thead>
            <tbody>
              {props.tracks.map((track, index) => (
                <tr
                  key={track.path}
                  data-testid="track-row"
                  data-title={track.title}
                  data-path={track.path}
                  draggable
                  className={rowClass(track, props)}
                  onClick={(event) => props.onSelect(track.path, index, event)}
                  onDoubleClick={() => props.onPreview(track)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    if (props.selected.includes(track.path)) props.onAnchor(track.path)
                    else props.onSelect(track.path, index, event)
                    setMenu({
                      x: Math.min(event.clientX, window.innerWidth - 190),
                      y: Math.min(event.clientY, window.innerHeight - 130),
                      track,
                    })
                  }}
                  onDragStart={(event) => {
                    const paths = props.selected.includes(track.path)
                      ? props.tracks.filter((item) => props.selected.includes(item.path)).map((item) => item.path)
                      : [track.path]
                    event.dataTransfer.setData('text/plain', libraryDragPayload(paths))
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <td title={track.filename}>
                    <div>{track.title}</div>
                    <div className="filename">{track.filename}</div>
                    {track.titleSource === 'filename' ? <div className="source">title from filename</div> : null}
                    {track.readError ? <div className="source">Could not read tags</div> : null}
                    {track.missing ? <div className="missing">Missing file</div> : null}
                  </td>
                  <td>{track.artist || '—'}</td>
                  <td className="num" title={bpmProvenance(track)}>
                    {track.bpm ?? '—'}
                    <span className="source">{bpmSourceLabel(track)}</span>
                  </td>
                  <td title={keyProvenance(track)}>
                    {track.key ?? '—'}
                    <span className="source">{keySourceLabel(track)}</span>
                  </td>
                  <td className="num" title={energyProvenance(track)}>
                    {track.energy ?? '—'}
                    <span className="source">{energySourceLabel(track)}</span>
                  </td>
                  <td className="num">{formatTrackClock(track.durationSeconds)}</td>
                  <td title={MATCH_COPY}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu ? (
        <div
          className="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => { props.onPreview(menu.track); setMenu(null) }}>Preview</button>
          <button type="button" onClick={() => { props.onSetReference(menu.track); setMenu(null) }}>Set as reference</button>
          <button type="button" onClick={() => { props.onAdd(); setMenu(null) }}>Add to set</button>
        </div>
      ) : null}
    </section>
  )
}

function rowClass(track: Track, props: TrackTableProps): string {
  const names = []
  if (props.selected.includes(track.path)) names.push('selected')
  if (props.referencePath === track.path) names.push('reference')
  if (props.previewPath === track.path) names.push('previewing')
  return names.join(' ')
}

function ariaSort(props: TrackTableProps, column: SortColumn): 'ascending' | 'descending' | 'none' {
  if (props.sortColumn !== column) return 'none'
  return props.sortDirection === 'asc' ? 'ascending' : 'descending'
}
