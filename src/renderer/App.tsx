import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { filterTracks, sortTracks, type SortColumn, type SortDirection } from '../shared/browser.js'
import { SAVE_HINT, SAVE_HINT_NEW } from '../shared/copy.js'
import {
  addToSet,
  applyOpenedSet,
  initialWorkingSet,
  isDirty,
  markSaved,
  removeFromSet,
  renameSet,
  reorderSet,
  replaceInSet,
  setReference,
  setTarget,
  type WorkingSet,
} from '../shared/session.js'
import type { LibrarySnapshot, SetFile, SetSummary, Track } from '../shared/types.js'
import { DiscardDialog, SaveDialog } from './components/Dialogs.js'
import { LibraryPane } from './components/LibraryPane.js'
import { Planner } from './components/Planner.js'
import { TrackTable } from './components/TrackTable.js'
import { Transport } from './components/Transport.js'
import { usePreview } from './usePreview.js'

type DialogState =
  | { kind: 'save'; mode: 'save' | 'save-as'; name: string }
  | { kind: 'discard'; fileId: string }
  | null

const EMPTY_LIBRARY: LibrarySnapshot = {
  folder: null,
  tracks: [],
  skippedCount: 0,
  unreadableCount: 0,
  truncated: false,
}

export function App() {
  const preview = usePreview()
  const [library, setLibrary] = useState<LibrarySnapshot>(EMPTY_LIBRARY)
  const [sets, setSets] = useState<SetSummary[]>([])
  const [setsDirectory, setSetsDirectory] = useState('')
  const [scanNote, setScanNote] = useState('')
  const [working, setWorking] = useState<WorkingSet>(initialWorkingSet)
  const [query, setQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('filename')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [plannerIndex, setPlannerIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

  const workingRef = useRef(working)
  const anchorRef = useRef(anchor)
  const dialogRef = useRef(dialog)
  const noticeTimer = useRef<number | null>(null)
  const actionsRef = useRef({
    openFolder: async (): Promise<void> => {},
    requestSave: (): void => {},
    requestSaveAs: (): void => {},
    togglePreview: (): void => {},
  })
  workingRef.current = working
  anchorRef.current = anchor
  dialogRef.current = dialog

  const visible = sortTracks(filterTracks(library.tracks, query), sortColumn, sortDirection)
  const dirty = isDirty(working)

  function showNotice(text: string): void {
    setNotice(text)
    if (noticeTimer.current != null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4500)
  }

  useEffect(() => {
    document.title = `${working.name} — Sonic Match Studio`
  }, [working.name])

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!isDirty(workingRef.current)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  useEffect(() => {
    if (!window.sms) {
      showNotice('Open this window from the Sonic Match Studio app.')
      return
    }
    const sms = window.sms
    let cancel = false
    void sms.loadInitial().then(
      (state) => {
        if (cancel) return
        setLibrary(state.library)
        setSets(state.sets)
        setSetsDirectory(state.setsDirectory)
        setScanNote('')
      },
      (error: unknown) => showNotice(messageOf(error)),
    )
    const stopProgress = sms.onScanProgress((progress) => {
      setScanNote(`Reading ${progress.done} of ${progress.total}`)
    })
    const stopMenu = sms.onMenuCommand((command) => {
      if (command === 'open-folder') void actionsRef.current.openFolder()
      if (command === 'save') actionsRef.current.requestSave()
      if (command === 'save-as') actionsRef.current.requestSaveAs()
    })
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      actionsRef.current.togglePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancel = true
      stopProgress()
      stopMenu()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function requestSave(): void {
    if (dialogRef.current) return
    const current = workingRef.current
    if (current.fileId) {
      void commit('save', current.name)
      return
    }
    setDialog({ kind: 'save', mode: 'save', name: current.name })
  }

  function requestSaveAs(): void {
    if (dialogRef.current) return
    const current = workingRef.current
    const suggestion = current.fileId ? `${current.name} copy`.slice(0, 120) : current.name
    setDialog({ kind: 'save', mode: 'save-as', name: suggestion })
  }

  async function commit(mode: 'save' | 'save-as', name: string): Promise<void> {
    if (!window.sms) return
    const current = renameSet(workingRef.current, name)
    const hadFile = Boolean(current.fileId)
    try {
      const saved = mode === 'save' && current.fileId
        ? await window.sms.save(toFile(current, current.fileId))
        : await window.sms.saveAs({
            name,
            targetSeconds: current.targetSeconds,
            tracks: current.tracks,
          })
      setWorking(markSaved(current, saved))
      setSets(await window.sms.listSets())
      if (mode === 'save' && hadFile) showNotice('Saved. This set file was updated.')
      else if (hadFile) showNotice('Saved as a new file. The earlier file was not changed.')
      else showNotice('Saved a new file.')
    } catch (error) {
      showNotice(messageOf(error))
    }
  }

  async function openFolder(): Promise<void> {
    if (!window.sms) return
    setScanNote('Opening folder…')
    try {
      const snapshot = await window.sms.openFolder()
      if (snapshot) setLibrary(snapshot)
      setScanNote('')
    } catch (error) {
      setScanNote('')
      showNotice(messageOf(error))
    }
  }

  async function rescan(): Promise<void> {
    if (!window.sms) return
    setScanNote('Reading the folder…')
    try {
      setLibrary(await window.sms.rescan())
      setScanNote('')
    } catch (error) {
      setScanNote('')
      showNotice(messageOf(error))
    }
  }

  async function loadSet(fileId: string): Promise<void> {
    if (!window.sms) return
    try {
      const file = await window.sms.openSet(fileId)
      setWorking((current) => applyOpenedSet(current, file))
      setPlannerIndex(null)
      showNotice(`Opened ${file.name}.`)
    } catch (error) {
      showNotice(messageOf(error))
    }
  }

  function requestOpenSet(fileId: string): void {
    if (isDirty(workingRef.current)) {
      setDialog({ kind: 'discard', fileId })
      return
    }
    void loadSet(fileId)
  }

  function chooseReference(track?: Track): void {
    const chosen = track ?? library.tracks.find((item) => item.path === anchorRef.current)
    if (!chosen) {
      showNotice('Choose a track, then set it as the reference.')
      return
    }
    setWorking((current) => setReference(current, chosen))
  }

  function togglePreview(): void {
    if (preview.preview) {
      void preview.toggle()
      return
    }
    const track = library.tracks.find((item) => item.path === anchorRef.current)
    if (track) void preview.load(track)
  }

  function addPaths(paths: string[]): void {
    const incoming = paths
      .map((filePath) => library.tracks.find((track) => track.path === filePath))
      .filter((track): track is Track => Boolean(track))
    const result = addToSet(workingRef.current, incoming)
    setWorking(result.state)
    if (result.added === 0) {
      const names = result.skipped.map((track) => track.title).join(', ')
      showNotice(names ? `Already in the set: ${names}.` : 'Select a track in the list.')
      return
    }
    if (result.skipped.length > 0) {
      showNotice(`Added ${result.added}. Already in the set: ${result.skipped.map((track) => track.title).join(', ')}.`)
    }
  }

  function addSelected(): void {
    const paths = visible.filter((track) => selected.includes(track.path)).map((track) => track.path)
    addPaths(paths)
  }

  function selectTrack(path: string, index: number, event: MouseEvent): void {
    if (event.shiftKey && anchorRef.current) {
      const anchorIndex = visible.findIndex((track) => track.path === anchorRef.current)
      if (anchorIndex >= 0) {
        const [start, end] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex]
        setSelected(visible.slice(start, end + 1).map((track) => track.path))
        return
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelected((current) => (
        current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
      ))
      setAnchor(path)
      return
    }
    setSelected([path])
    setAnchor(path)
  }

  function movePlanner(direction: -1 | 1): void {
    if (plannerIndex == null) return
    const destination = plannerIndex + direction
    const next = reorderSet(workingRef.current, plannerIndex, destination)
    if (next === workingRef.current) return
    setWorking(next)
    setPlannerIndex(destination)
  }

  function removePlanner(): void {
    if (plannerIndex == null) return
    const next = removeFromSet(workingRef.current, plannerIndex)
    setWorking(next)
    if (next.tracks.length === 0) setPlannerIndex(null)
    else setPlannerIndex(Math.min(plannerIndex, next.tracks.length - 1))
  }

  function replacePlanner(): void {
    if (plannerIndex == null) {
      showNotice('Choose a row in the set first.')
      return
    }
    const track = library.tracks.find((item) => item.path === anchorRef.current)
    if (!track) {
      showNotice('Choose a library track to put in that row.')
      return
    }
    const result = replaceInSet(workingRef.current, plannerIndex, track)
    setWorking(result.state)
    if (result.error) showNotice(result.error)
  }

  actionsRef.current = { openFolder, requestSave, requestSaveAs, togglePreview }

  return (
    <div className="app">
      <header className="header">
        <p className="wordmark">Sonic Match <span>Studio</span></p>
        <input
          className="name-input"
          aria-label="Set name"
          data-testid="set-name"
          value={working.name}
          onChange={(event) => {
            const name = event.target.value
            setWorking((current) => renameSet(current, name))
          }}
        />
        <span className={dirty ? 'dirty' : 'dirty clean'} data-testid="dirty-state">
          {dirty ? 'Unsaved' : working.fileId ? 'Saved' : 'Not saved'}
        </span>
        <p className="hint">{working.fileId ? SAVE_HINT : SAVE_HINT_NEW}</p>
        <button type="button" className="button save-as" data-testid="save-as" onClick={requestSaveAs}>
          Save As
        </button>
        <button type="button" className="button primary save" data-testid="save" onClick={requestSave}>
          Save
        </button>
      </header>
      <Transport
        reference={working.reference}
        preview={preview.preview}
        playing={preview.playing}
        time={preview.time}
        duration={preview.duration}
        volume={preview.volume}
        error={preview.error}
        status={preview.status}
        canSetReference={Boolean(anchor && library.tracks.some((track) => track.path === anchor))}
        scrubbing={preview.scrubbing}
        onSetReference={() => chooseReference()}
        onToggle={() => void togglePreview()}
        onSeek={preview.seek}
        onVolume={preview.setVolume}
      />
      <div className="workspace">
        <LibraryPane
          library={library}
          sets={sets}
          currentFileId={working.fileId}
          setsDirectory={setsDirectory}
          scanNote={scanNote}
          onOpenFolder={() => void openFolder()}
          onRescan={() => void rescan()}
          onOpenSet={requestOpenSet}
        />
        <TrackTable
          tracks={visible}
          query={query}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          selected={selected}
          anchor={anchor}
          referencePath={working.reference?.path ?? null}
          previewPath={preview.preview?.path ?? null}
          onQuery={setQuery}
          onSort={(column) => {
            if (column === sortColumn) setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
            else {
              setSortColumn(column)
              setSortDirection('asc')
            }
          }}
          onSelect={selectTrack}
          onAnchor={setAnchor}
          onPreview={(track) => void preview.load(track)}
          onAdd={addSelected}
          onSetReference={chooseReference}
        />
        <Planner
          working={working}
          selectedIndex={plannerIndex}
          onSelect={setPlannerIndex}
          onTarget={(hours, minutes) => {
            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return
            const safeHours = Math.min(99, Math.max(0, Math.floor(hours)))
            const safeMinutes = Math.min(59, Math.max(0, Math.floor(minutes)))
            setWorking((current) => setTarget(current, safeHours * 3600 + safeMinutes * 60))
          }}
          onRemove={removePlanner}
          onMove={movePlanner}
          onReplace={replacePlanner}
          onDropLibrary={addPaths}
          onReorder={(from, to) => {
            const next = reorderSet(workingRef.current, from, to)
            setWorking(next)
            if (next !== workingRef.current) setPlannerIndex(to)
          }}
        />
      </div>
      {notice ? (
        <div className="notice" role="status" data-testid="notice">
          {notice}
        </div>
      ) : null}
      {dialog?.kind === 'save' ? (
        <SaveDialog
          mode={dialog.mode}
          name={dialog.name}
          onName={(name) => setDialog({ kind: 'save', mode: dialog.mode, name })}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const mode = dialog.mode
            const name = dialog.name
            setDialog(null)
            void commit(mode, name)
          }}
        />
      ) : null}
      {dialog?.kind === 'discard' ? (
        <DiscardDialog
          onKeep={() => setDialog(null)}
          onDiscard={() => {
            const fileId = dialog.fileId
            setDialog(null)
            void loadSet(fileId)
          }}
        />
      ) : null}
    </div>
  )
}

function toFile(state: WorkingSet, fileId: string): SetFile {
  return {
    version: 1,
    fileId,
    name: state.name,
    targetSeconds: state.targetSeconds,
    tracks: state.tracks,
    savedAt: new Date().toISOString(),
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
  return 'Something went wrong.'
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || target.isContentEditable
}
