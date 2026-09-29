import { create } from 'zustand'
import { uid } from '../core/id'
import { createProject, parseProjectFile, projectFromFile, projectFromParsed, projectTitle } from '../core/project'
import { sampleProject } from '../core/sample'
import type { Project, ScriptSettings, Snapshot } from '../core/types'
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

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'error'
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

  createSnapshot(name: string): Promise<void>
  restoreSnapshot(snap: Snapshot): Promise<void>

  notify(message: string, kind?: Toast['kind']): string
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
      let p: Project
      try {
        p = parseProjectFile(await file.text())
      } catch {
        // Not one of ours (Fountain, Final Draft, PDF…): bring it in as a new script, leaving the file alone.
        await get().importFile(file)
        return
      }
      // Ask to write back straight away; if the browser won't ask now, the writer is asked on the next save.
      await files.askToWrite(handle)
      // Save the open script first, in case it is the one in the file.
      await get().closeProject()
      const when = new Date().toLocaleString()
      const snapshot = (of: Pick<Project, 'script' | 'titlePage' | 'stats'>, projectId: string, name: string) =>
        db.putSnapshot({ id: uid(), projectId, name, createdAt: Date.now(), pages: of.stats?.pages ?? 0, script: of.script, titlePage: of.titlePage })
      const existing = await db.getProject(p.id)
      let newerHere = false
      if (existing && existing.updatedAt > p.updatedAt) {
        // This browser has newer work: keep it, keep the file's version as a snapshot, and update the file.
        newerHere = true
        if (JSON.stringify(existing.script) !== JSON.stringify(p.script)) await snapshot(p, p.id, `From “${file.name}” (${when})`)
      } else {
        if (existing && JSON.stringify(existing.script) !== JSON.stringify(p.script)) await snapshot(existing, p.id, `Before opening “${file.name}” (${when})`)
        await db.putProject(p)
      }
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
      await get().createSnapshot(`Before restoring “${snap.name}”`)
      controller.replaceScript(snap.script)
      get().updateProject(() => ({ titlePage: snap.titlePage }))
      get().notify(`Restored “${snap.name}”. You can undo this from the Edit menu or with Ctrl/⌘+Z.`)
    },

    notify(message, kind = 'info') {
      const id = uid()
      set({ toasts: [...get().toasts, { id, message, kind }] })
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 4000)
      return id
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) })
    },
  }
})
