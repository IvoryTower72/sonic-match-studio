import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  InitialState,
  LibrarySnapshot,
  MenuCommand,
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
  mediaUrl: (filePath: string): Promise<string> => ipcRenderer.invoke('media:url', filePath),
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
