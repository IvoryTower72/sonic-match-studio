/** Where a displayed value was read from. `tag` is an embedded frame, not a filename. */
export type ValueSource = 'tag' | 'comment' | 'filename' | 'missing'

export interface Track {
  /** Absolute path. This identifies the file. Two different paths stay two tracks. */
  path: string
  filename: string
  title: string
  artist: string
  /** `filename` when no title tag was present. */
  titleSource: 'tag' | 'filename'
  durationSeconds: number | null
  bpm: number | null
  bpmSource: ValueSource
  /** BPM digits found in the filename, kept even when the displayed BPM came from elsewhere. */
  filenameBpm: number | null
  /** True when a TBPM frame is present. These sample MP3s do not have one. */
  hasTbpm: boolean
  key: string | null
  keySource: ValueSource
  filenameKey: string | null
  energy: number | null
  energySource: ValueSource
  comment: string | null
  /** The file was not on disk when the set was opened. */
  missing: boolean
  readError: string | null
}

export interface SetFile {
  version: 1
  fileId: string
  name: string
  targetSeconds: number
  tracks: Track[]
  savedAt: string
}

export interface SetDraft {
  name: string
  targetSeconds: number
  tracks: Track[]
}

export interface SetSummary {
  fileId: string
  name: string
  targetSeconds: number
  trackCount: number
  savedAt: string
}

export interface LibrarySnapshot {
  folder: string | null
  tracks: Track[]
  skippedCount: number
  unreadableCount: number
  truncated: boolean
}

export interface ScanProgress {
  done: number
  total: number
}

export interface InitialState {
  library: LibrarySnapshot
  sets: SetSummary[]
  setsDirectory: string
}

export type MenuCommand = 'open-folder' | 'save' | 'save-as'

export interface PreviewStatus {
  position: number
  duration: number
  playing: boolean
}

export interface SmsApi {
  loadInitial(): Promise<InitialState>
  openFolder(): Promise<LibrarySnapshot | null>
  rescan(): Promise<LibrarySnapshot>
  listSets(): Promise<SetSummary[]>
  save(file: SetFile): Promise<SetFile>
  saveAs(draft: SetDraft): Promise<SetFile>
  openSet(fileId: string): Promise<SetFile>
  previewLoad(filePath: string, durationHint: number): Promise<PreviewStatus>
  previewPlay(): Promise<PreviewStatus>
  previewPause(): Promise<PreviewStatus>
  previewSeek(seconds: number): Promise<PreviewStatus>
  previewVolume(level: number): Promise<PreviewStatus>
  previewStatus(): Promise<PreviewStatus>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onMenuCommand(listener: (command: MenuCommand) => void): () => void
}
