import { safeFileName, serializeProject } from '../core/project'
import type { Project } from '../core/types'

/**
 * Keeping a script in a file on the writer's computer, where the browser
 * allows it (Chrome, Edge and other Chromium browsers, in their own tab).
 * The file stays linked to the script: every save is written to it too, so the
 * work survives even if the browser's storage is cleared.
 */

type Mode = { mode: 'read' | 'readwrite' }

/** The parts of the File System Access API we use, which TypeScript's DOM types leave out. */
export interface FileHandle extends FileSystemFileHandle {
  queryPermission(d: Mode): Promise<PermissionState>
  requestPermission(d: Mode): Promise<PermissionState>
}

interface PickerOptions {
  id?: string
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

interface PickerWindow {
  showSaveFilePicker(o?: PickerOptions): Promise<FileHandle>
  showOpenFilePicker(o?: PickerOptions & { multiple?: boolean }): Promise<FileHandle[]>
}

const TYPES = [{ description: 'Screenplay', accept: { 'application/json': ['.json'] } }]

/** File pickers exist in this browser and can open here (not in a frame on another site, such as claude.ai). */
export function fileAccessSupported(): boolean {
  if (typeof window === 'undefined' || !('showSaveFilePicker' in window) || !('showOpenFilePicker' in window)) return false
  try {
    return window.top === window.self
  } catch {
    return false
  }
}

const pickers = () => window as unknown as PickerWindow

export function fileNameFor(title: string): string {
  return `${safeFileName(title)}.screenplay.json`
}

/** Ask where to save; `null` if the writer cancels. */
export async function pickSaveFile(suggestedName: string): Promise<FileHandle | null> {
  try {
    return await pickers().showSaveFilePicker({ id: 'screenplay', suggestedName, types: TYPES })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null
    throw e
  }
}

/** Ask for a script file to open; `null` if the writer cancels. */
export async function pickOpenFile(): Promise<FileHandle | null> {
  try {
    const [handle] = await pickers().showOpenFilePicker({ id: 'screenplay', types: TYPES })
    return handle ?? null
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null
    throw e
  }
}

export async function writeProjectFile(handle: FileHandle, project: Project): Promise<void> {
  const out = await handle.createWritable()
  await out.write(serializeProject(project))
  await out.close()
}

/** Whether we may write to the file now (the browser forgets permission between visits). */
export async function canWrite(handle: FileHandle): Promise<boolean> {
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

/** Ask the writer for permission again; call only from a click. */
export async function askToWrite(handle: FileHandle): Promise<boolean> {
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Which file each script is linked to                                 */
/* ------------------------------------------------------------------ */

// A database of its own, so the main one never needs upgrading for this.
const DB_NAME = 'screenplay-files'
const LINKS = 'links'

export interface FileLink {
  projectId: string
  handle: FileHandle
}

let db: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(LINKS, { keyPath: 'projectId' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return db
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const d = await open()
  if (!d) return undefined
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(LINKS, mode).objectStore(LINKS))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getLink(projectId: string): Promise<FileLink | null> {
  if (!fileAccessSupported()) return null
  return ((await run('readonly', (s) => s.get(projectId))) as FileLink | undefined) ?? null
}

export async function setLink(projectId: string, handle: FileHandle): Promise<void> {
  await run('readwrite', (s) => s.put({ projectId, handle }))
}

export async function removeLink(projectId: string): Promise<void> {
  await run('readwrite', (s) => s.delete(projectId))
}
