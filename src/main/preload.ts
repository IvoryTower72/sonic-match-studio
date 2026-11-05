import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  InitialState,
  LibrarySnapshot,
  MenuCommand,
  PreviewStatus,
  ScanProgress,
  SetDraft,
  SetFile,
  SetSummary,
} from '../shared/types.js'

const api = {
  loadInitial: (): Promise<InitialState> => ipcRenderer.invoke('app:load'),
  openFolder: (): Promise<LibrarySnapshot | null> => ipcRenderer.invoke('library:open'),
  rescan: (): Promise<LibrarySnapshot> => ipcRenderer.invoke('library:rescan'),
  listSets: (): Promise<SetSummary[]> => ipcRenderer.invoke('sets:list'),
  save: (file: SetFile): Promise<SetFile> => ipcRenderer.invoke('sets:save', file),
  saveAs: (draft: SetDraft): Promise<SetFile> => ipcRenderer.invoke('sets:save-as', draft),
  openSet: (fileId: string): Promise<SetFile> => ipcRenderer.invoke('sets:open', fileId),
  previewLoad: (filePath: string, durationHint: number): Promise<PreviewStatus> =>
    ipcRenderer.invoke('preview:load', filePath, durationHint),
  previewPlay: (): Promise<PreviewStatus> => ipcRenderer.invoke('preview:play'),
  previewPause: (): Promise<PreviewStatus> => ipcRenderer.invoke('preview:pause'),
  previewSeek: (seconds: number): Promise<PreviewStatus> => ipcRenderer.invoke('preview:seek', seconds),
  previewVolume: (level: number): Promise<PreviewStatus> => ipcRenderer.invoke('preview:volume', level),
  previewStatus: (): Promise<PreviewStatus> => ipcRenderer.invoke('preview:status'),
  onScanProgress: (listener: (progress: ScanProgress) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, progress: ScanProgress) => listener(progress)
    ipcRenderer.on('library:progress', wrapped)
    return () => ipcRenderer.removeListener('library:progress', wrapped)
  },
  onMenuCommand: (listener: (command: MenuCommand) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, command: MenuCommand) => listener(command)
    ipcRenderer.on('menu:command', wrapped)
    return () => ipcRenderer.removeListener('menu:command', wrapped)
  },
}

contextBridge.exposeInMainWorld('sms', api)
