import { create } from 'zustand'
import { AUTO_SNAPSHOT_EVERY, autoSnapshotsToDrop, hasWords, isBackupScript, sameContent } from '../core/backup'
import { uid } from '../core/id'
import { createProject, parseProjectBackup, projectFromFile, projectFromParsed, projectTitle } from '../core/project'
import { sampleProject } from '../core/sample'
import type { Project, ScriptSettings, Snapshot } from '../core/types'
import { unzipFiles } from '../core/zip'
import { ScriptController } from '../editor/controller'
import * as db from './db'
import * as files from './files'

export type ViewId = 'script' | 'cards' | 'beats' | 'characters' | 'timeline' | 'relationships' | 'locations' | 'reports' | 'title' | 'notes' | 'preview'
export type DialogId = 'settings' | 'snapshots' | 'help' | null
export type Theme = 'system' | 'light' | 'dark'
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

/** The file on the writer's computer the open script is saved to, if any. */
export interface FileState {
  name: string
  status: 'saved' | 'saving' | 'needs-permission' | 'error'
}

export interface Prefs {
  theme: Theme
  zoom: number
  typewriter: boolean
  showNavigator: boolean
  showInspector: boolean
  /** Character tracking: count characters who are only named in action. */
  trackMentions: boolean
  /** Character tracking: merge "HOUSE - KITCHEN" into "HOUSE". */
  groupPlaces: boolean
}

const PREFS_KEY = 'screenplay:prefs'
const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  zoom: 1,
  typewriter: false,
  showNavigator: true,
  showInspector: true,
  trackMentions: true,
  groupPlaces: false,
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* storage disabled */
  }
}

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'error'
  /** A button beside the message; such toasts stay until used or dismissed. */
  action?: ToastAction
}

interface AppState {
  ready: boolean
  projects: Project[]
  project: Project | null
  controller: ScriptController | null
  view: ViewId
  dialog: DialogId
  findOpen: boolean
  focusMode: boolean
  saveState: SaveState
  /** The file on the writer's computer the open script is also saved to. */
  file: FileState | null
  sessionStartWords: number
  prefs: Prefs
  toasts: Toast[]

  init(): Promise<void>
  refreshLibrary(): Promise<void>
  newProject(kind: 'blank' | 'sample'): Promise<void>
  importFile(file: File): Promise<void>
  openProject(id: string): Promise<void>
  closeProject(): Promise<void>
  deleteProject(id: string): Promise<void>
  duplicateProject(id: string): Promise<void>

  setView(view: ViewId): void
  setDialog(dialog: DialogId): void
  setFindOpen(open: boolean): void
  setFocusMode(on: boolean): void
  setPrefs(p: Partial<Prefs>): void

  updateProject(fn: (p: Project) => Partial<Project>): void
  updateSettings(s: Partial<ScriptSettings>): void
  saveNow(): Promise<void>
  currentProjectData(): Project | null

  /** Ctrl/⌘+S: save now, asking where the first time if files can be saved here. */
  saveToFile(): Promise<void>
  /** Choose a file on the computer to keep the open script in. */
  saveFileAs(): Promise<void>
  /** Let the browser write to the linked file again (it forgets between visits); call from a click. */
  reconnectFile(): Promise<void>
  /** Stop saving the open script to its file. */
  unlinkFile(): Promise<void>
  /** Open a script file from the computer and keep saving to it. */
  openFile(): Promise<void>
  /** Bring back the scripts in a backup (a zip of the library, or one script's file). */
  restoreBackup(file: File): Promise<void>

  createSnapshot(name: string): Promise<void>
  restoreSnapshot(snap: Snapshot): Promise<void>

  notify(message: string, kind?: Toast['kind'], action?: ToastAction): string
  dismissToast(id: string): void
}

const SEEDED_KEY = 'screenplay:seeded'

/** The very first time the app runs, put the sample script in the library so there is something to explore. */
async function seedSampleOnFirstRun(existing: number) {
  try {
    if (existing > 0 || localStorage.getItem(SEEDED_KEY)) return
    localStorage.setItem(SEEDED_KEY, '1')
  } catch {
    return
  }
  await db.putProject(sampleProject(createProject()))
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeDoc: (() => void) | null = null
/** The open script's file, and the queue of writes to it (one at a time, in order). */
let link: files.FileLink | null = null
let fileWrites: Promise<void> = Promise.resolve()
/** When each script last had an automatic snapshot. */
const lastAutoSnapshot = new Map<string, number>()

/**
 * Before a save replaces a script, keep what it replaces as an automatic
 * snapshot, at most every ten minutes, and thin out the older ones. Never
 * gets in the way of saving.
 */
async function autoSnapshot(next: Project) {
  try {
    let last = lastAutoSnapshot.get(next.id)
    if (last === undefined) {
      last = Math.max(0, ...(await db.listSnapshots(next.id)).filter((s) => s.auto).map((s) => s.createdAt))
      lastAutoSnapshot.set(next.id, last)
    }
    const now = Date.now()
    if (now - last < AUTO_SNAPSHOT_EVERY) return
    const prev = await db.getProject(next.id)
    if (!prev || !hasWords(prev.script) || sameContent(prev, next)) return
    lastAutoSnapshot.set(next.id, now)
    await db.putSnapshot({
      id: uid(),
      projectId: prev.id,
      name: 'Automatic backup',
      auto: true,
      createdAt: prev.updatedAt,
      pages: prev.stats?.pages ?? 0,
      script: prev.script,
      titlePage: prev.titlePage,
    })
    const autos = (await db.listSnapshots(next.id)).filter((s) => s.auto)
    for (const id of autoSnapshotsToDrop(autos, now)) await db.deleteSnapshot(id)
  } catch (e) {
    console.warn('Automatic snapshot failed', e)
  }
}

/** Whether a file is a zip archive, by its first bytes, whatever it is called. */
async function isZip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4
}

/** What happened to a script brought in from a file: new here, replacing an older version, older than the one here, or the same. */
type TakeIn = 'added' | 'replaced' | 'kept' | 'same'

/**
 * Bring a script from a file into the library without losing either version:
 * the newer one becomes the script and the older one a snapshot. Ties go to
 * the file. Snapshots carried in the file (backups have them) come along.
 */
async function takeIn(p: Project, snapshots: Snapshot[], source: string, action: 'opening' | 'restoring'): Promise<TakeIn> {
  const keep = (of: Project, name: string) =>
    db.putSnapshot({ id: uid(), projectId: p.id, name, createdAt: of.updatedAt, pages: of.stats?.pages ?? 0, script: of.script, titlePage: of.titlePage })
  const existing = await db.getProject(p.id)
  let result: TakeIn
  if (!existing) {
    await db.putProject(p)
    result = 'added'
  } else if (existing.updatedAt === p.updatedAt && sameContent(existing, p)) {
    result = 'same'
  } else if (existing.updatedAt > p.updatedAt) {
    if (!sameContent(existing, p)) await keep(p, `From “${source}”`)
    result = 'kept'
  } else {
    if (!sameContent(existing, p)) await keep(existing, `Before ${action} “${source}”`)
    await db.putProject(p)
    result = 'replaced'
  }
  for (const s of snapshots) await db.putSnapshot({ ...s, projectId: p.id })
  return result
}

export const useApp = create<AppState>((set, get) => {
  const scheduleSave = () => {
    set({ saveState: 'unsaved' })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().saveNow(), 800)
  }

  const attachController = (project: Project) => {
    const controller = new ScriptController(project.script, { getSettings: () => get().project?.settings ?? project.settings })
    controller.typewriter = get().prefs.typewriter
    unsubscribeDoc?.()
    unsubscribeDoc = controller.subscribeDoc(scheduleSave)
    return { controller, words: controller.getAnalysis().words }
  }

  /** Write the script to its linked file, after any write already under way. */
  const writeLinkedFile = (project: Project): Promise<void> => {
    const l = link
    if (!l || l.projectId !== project.id) return fileWrites
    fileWrites = fileWrites.then(async () => {
      if (link !== l) return
      const name = l.handle.name
      if (!(await files.canWrite(l.handle))) {
        set({ file: { name, status: 'needs-permission' } })
        return
      }
      set({ file: { name, status: 'saving' } })
      try {
        await files.writeProjectFile(l.handle, project)
        if (link === l) set({ file: { name, status: 'saved' } })
      } catch (e) {
        if (link !== l) return
        const wasOk = get().file?.status !== 'error'
        set({ file: { name, status: 'error' } })
        if (wasOk) get().notify(`Couldn’t save to “${name}”: ${(e as Error).message}. Your work is still saved in this browser.`, 'error')
      }
    })
    return fileWrites
  }

  /** Point the open script at a file (or none) and show whether it can be written. */
  const useLink = async (next: files.FileLink | null) => {
    link = next
    if (!next) {
      set({ file: null })
      return
    }
    set({ file: { name: next.handle.name, status: (await files.canWrite(next.handle)) ? 'saved' : 'needs-permission' } })
  }

  return {
    ready: false,
    projects: [],
    project: null,
    controller: null,
    view: 'script',
    dialog: null,
    findOpen: false,
    focusMode: false,
    saveState: 'saved',
    file: null,
    sessionStartWords: 0,
    prefs: loadPrefs(),
    toasts: [],

    async init() {
      db.requestPersistence()
      await get().refreshLibrary()
      await seedSampleOnFirstRun(get().projects.length)
      if (get().projects.length === 0) await get().refreshLibrary()
      set({ ready: true })
      if (db.storageMode === 'memory') {
        get().notify('Browser storage is unavailable, so your work will not be kept after you close this tab. Export it before leaving.', 'error')
      }
    },

    async refreshLibrary() {
      try {
        set({ projects: await db.listProjects() })
      } catch (e) {
        get().notify(`Could not read your library: ${(e as Error).message}`, 'error')
      }
    },

    async newProject(kind) {
      let p = createProject()
      if (kind === 'sample') p = sampleProject(p)
      await db.putProject(p)
      await get().openProject(p.id)
    },

    async importFile(file) {
      if (await isZip(file)) return get().restoreBackup(file)
      try {
        let p: Project
        if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
          const reading = get().notify(`Reading “${file.name}”…`)
          try {
            const { importPdf } = await import('./pdf')
            p = projectFromParsed(file.name, await importPdf(await file.arrayBuffer()))
          } finally {
            get().dismissToast(reading)
          }
        } else {
          p = projectFromFile(file.name, await file.text())
        }
        await db.putProject(p)
        await get().openProject(p.id)
        get().notify(`Imported “${projectTitle(p)}”.`)
      } catch (e) {
        get().notify(`Import failed: ${(e as Error).message}`, 'error')
      }
    },

    async openProject(id) {
      await get().closeProject()
      const project = await db.getProject(id)
      if (!project) {
        get().notify('That screenplay could not be found.', 'error')
        return
      }
      const { controller, words } = attachController(project)
      set({ project, controller, view: 'script', saveState: 'saved', sessionStartWords: words, findOpen: false, dialog: null })
      try {
        history.replaceState(null, '', `#/project/${project.id}`)
      } catch {
        /* sandboxed */
      }
      await useLink(await files.getLink(project.id).catch(() => null))
      const f = get().file
      if (f?.status === 'needs-permission') {
        get().notify(`To keep saving to “${f.name}”, press Ctrl/⌘+S or click the file name at the top, then allow it.`)
      }
    },

    async closeProject() {
      const { controller, saveState } = get()
      if (!controller) return
      if (saveState !== 'saved') await get().saveNow()
      await fileWrites
      if (saveTimer) clearTimeout(saveTimer)
      unsubscribeDoc?.()
      unsubscribeDoc = null
      controller.destroy()
      await useLink(null)
      set({ project: null, controller: null, findOpen: false, dialog: null, focusMode: false })
      try {
        history.replaceState(null, '', '#/')
      } catch {
        /* sandboxed */
      }
      await get().refreshLibrary()
    },

    async deleteProject(id) {
      await db.deleteProject(id)
      // The file on the computer is left alone; only the link to it goes.
      await files.removeLink(id).catch(() => {})
      await get().refreshLibrary()
    },

    async duplicateProject(id) {
      const p = await db.getProject(id)
      if (!p) return
      const copy: Project = {
        ...structuredClone(p),
        id: uid(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        titlePage: { ...p.titlePage, title: `${projectTitle(p)} (copy)` },
      }
      await db.putProject(copy)
      await get().refreshLibrary()
    },

    setView(view) {
      set({ view })
    },
    setDialog(dialog) {
      set({ dialog })
    },
    setFindOpen(findOpen) {
      set({ findOpen })
      if (!findOpen) get().controller?.setSearch({ text: '', caseSensitive: false, wholeWord: false })
    },
    setFocusMode(focusMode) {
      set({ focusMode })
    },
    setPrefs(p) {
      const prefs = { ...get().prefs, ...p }
      savePrefs(prefs)
      const c = get().controller
      if (c) c.typewriter = prefs.typewriter
      set({ prefs })
    },

    updateProject(fn) {
      const p = get().project
      if (!p) return
      set({ project: { ...p, ...fn(p) } })
      scheduleSave()
    },

    updateSettings(s) {
      const p = get().project
      if (!p) return
      const settings = { ...p.settings, ...s }
      set({ project: { ...p, settings } })
      scheduleSave()
      if ('sceneSpacing' in s || 'autoContd' in s || 'paper' in s) get().controller?.relayout()
    },

    currentProjectData() {
      const { project, controller } = get()
      if (!project || !controller) return null
      const pagination = controller.getPagination()
      const analysis = controller.getAnalysis()
      return {
        ...project,
        script: controller.getElements(),
        stats: { pages: pagination.pages.length, scenes: analysis.scenes.length, words: analysis.words },
      }
    },

    async saveNow() {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = null
      const data = get().currentProjectData()
      if (!data) return
      set({ saveState: 'saving' })
      try {
        const updated = { ...data, updatedAt: Date.now() }
        await autoSnapshot(updated)
        await db.putProject(updated)
        // Only mark saved if nothing changed while we were writing.
        if (get().saveState === 'saving') set({ saveState: 'saved' })
        const current = get().project
        if (current && current.id === updated.id) set({ project: { ...current, updatedAt: updated.updatedAt, stats: updated.stats } })
        await writeLinkedFile(updated)
      } catch (e) {
        set({ saveState: 'error' })
        get().notify(`Saving failed: ${(e as Error).message}`, 'error')
      }
    },

    async saveToFile() {
      if (!files.fileAccessSupported()) {
        await get().saveNow()
        get().notify('Saved.')
        return
      }
      if (!link) return get().saveFileAs()
      if (get().file?.status === 'needs-permission') return get().reconnectFile()
      await get().saveNow()
      if (get().file?.status === 'saved') get().notify(`Saved to “${link.handle.name}”.`)
    },

    async saveFileAs() {
      const data = get().currentProjectData()
      if (!data) return
      let handle: files.FileHandle | null
      try {
        handle = await files.pickSaveFile(files.fileNameFor(projectTitle(data)))
      } catch (e) {
        get().notify(`Couldn’t save the file: ${(e as Error).message}`, 'error')
        return
      }
      if (!handle) return
      await files.setLink(data.id, handle)
      await useLink({ projectId: data.id, handle })
      await get().saveNow()
      if (get().file?.status === 'saved') get().notify(`Saving to “${handle.name}” on your computer. Every change is saved there as you write.`)
    },

    async reconnectFile() {
      if (!link) return
      if (await files.askToWrite(link.handle)) {
        set({ file: { name: link.handle.name, status: 'saved' } })
        await get().saveNow()
      } else {
        get().notify(`Without permission, changes stay in this browser and aren’t saved to “${link.handle.name}”.`, 'error')
      }
    },

    async unlinkFile() {
      const { project } = get()
      if (!project || !link) return
      const name = link.handle.name
      await fileWrites
      await files.removeLink(project.id)
      await useLink(null)
      get().notify(`No longer saving to “${name}”. The script stays in this browser.`)
    },

    async openFile() {
      let handle: files.FileHandle | null
      try {
        handle = await files.pickOpenFile()
      } catch (e) {
        get().notify(`Couldn’t open the file: ${(e as Error).message}`, 'error')
        return
      }
      if (!handle) return
      const file = await handle.getFile()
      let opened: { project: Project; snapshots: Snapshot[] }
      try {
        opened = parseProjectBackup(await file.text())
      } catch {
        // Not one of ours (Fountain, Final Draft, PDF…): bring it in as a new script, leaving the file alone.
        await get().importFile(file)
        return
      }
      const p = opened.project
      // Ask to write back straight away; if the browser won't ask now, the writer is asked on the next save.
      await files.askToWrite(handle)
      // Save the open script first, in case it is the one in the file.
      await get().closeProject()
      // If this browser has newer work, it is kept (and written to the file below), and the file's version kept as a snapshot.
      const newerHere = (await takeIn(p, opened.snapshots, file.name, 'opening')) === 'kept'
      await files.setLink(p.id, handle)
      await get().openProject(p.id)
      const saving = get().file?.status === 'saved'
      if (newerHere) {
        if (saving) await get().saveNow()
        get().notify(
          `This browser had newer changes than “${file.name}”, so they were kept${get().file?.status === 'saved' ? ' and saved to the file' : ''}. ` +
            'The file’s version is in Snapshots.',
        )
      } else if (saving) {
        get().notify(`Opened “${file.name}”. Changes are saved to it as you write.`)
      }
    },

    async restoreBackup(file) {
      const found: { project: Project; snapshots: Snapshot[] }[] = []
      let unreadable = 0
      try {
        if (await isZip(file)) {
          const importable = (name: string) => /\.(fdx|fountain|spmd)$/i.test(name) && !/(^|\/)(__MACOSX\/|\._)/.test(name)
          const entries = await unzipFiles(new Uint8Array(await file.arrayBuffer()), (name) => isBackupScript(name) || importable(name))
          for (const entry of entries.filter((e) => isBackupScript(e.name))) {
            try {
              found.push(parseProjectBackup(new TextDecoder().decode(entry.data)))
            } catch {
              unreadable++
            }
          }
          // A single script zipped up, as the claude.ai viewer hands over Final Draft files: import it.
          if (!found.length && !unreadable && entries.length === 1) {
            const [only] = entries
            return get().importFile(new File([only.data as Uint8Array<ArrayBuffer>], only.name.split('/').pop()!))
          }
          if (!found.length) throw new Error('There are no scripts in this zip file. Pick a backup made with “Back up all scripts”.')
        } else {
          found.push(parseProjectBackup(await file.text()))
        }
      } catch (e) {
        get().notify(`Restore failed: ${(e as Error).message}`, 'error')
        return
      }
      await get().closeProject()
      const results: TakeIn[] = []
      for (const { project, snapshots } of found) results.push(await takeIn(project, snapshots, file.name, 'restoring'))
      await get().refreshLibrary()
      const count = (r: TakeIn) => results.filter((x) => x === r).length
      const scripts = (n: number) => `${n} script${n === 1 ? '' : 's'}`
      const restored = count('added') + count('replaced')
      const parts = [restored ? `Restored ${scripts(restored)} from “${file.name}”.` : `Nothing to restore from “${file.name}”.`]
      if (count('same')) parts.push(`${scripts(count('same'))} already up to date.`)
      if (count('kept')) {
        const one = count('kept') === 1
        parts.push(`${scripts(count('kept'))} had newer changes in this browser, which were kept; the backup’s ${one ? 'version is' : 'versions are'} in Snapshots.`)
      }
      if (unreadable) parts.push(`${unreadable} file${unreadable === 1 ? '' : 's'} in the backup couldn’t be read.`)
      get().notify(parts.join(' '), unreadable ? 'error' : 'info')
    },

    async createSnapshot(name) {
      const data = get().currentProjectData()
      if (!data) return
      await db.putSnapshot({
        id: uid(),
        projectId: data.id,
        name: name.trim() || new Date().toLocaleString(),
        createdAt: Date.now(),
        pages: data.stats?.pages ?? 0,
        script: data.script,
        titlePage: data.titlePage,
      })
      get().notify('Snapshot saved.')
    },

    async restoreSnapshot(snap) {
      const { controller } = get()
      if (!controller) return
      const what = snap.auto ? `the automatic backup from ${new Date(snap.createdAt).toLocaleString()}` : `“${snap.name}”`
      await get().createSnapshot(`Before restoring ${what}`)
      controller.replaceScript(snap.script)
      get().updateProject(() => ({ titlePage: snap.titlePage }))
      get().notify(`Restored ${what}. You can undo this from the Edit menu or with Ctrl/⌘+Z.`)
    },

    notify(message, kind = 'info', action) {
      // Problems also go to the console, where they outlast the message on screen.
      if (kind === 'error') console.warn(message)
      const id = uid()
      set({ toasts: [...get().toasts, { id, message, kind, action }] })
      if (!action) setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 4000)
      return id
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) })
    },
  }
})
