import { create } from 'zustand'
import { uid } from '../core/id'
import { createProject, projectFromFile, projectFromParsed, projectTitle } from '../core/project'
import { sampleProject } from '../core/sample'
import type { Project, ScriptSettings, Snapshot } from '../core/types'
import { ScriptController } from '../editor/controller'
import * as db from './db'

export type ViewId = 'script' | 'cards' | 'beats' | 'characters' | 'timeline' | 'relationships' | 'locations' | 'reports' | 'title' | 'notes' | 'preview'
export type DialogId = 'settings' | 'snapshots' | 'help' | null
export type Theme = 'system' | 'light' | 'dark'
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

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
    },

    async closeProject() {
      const { controller, saveState } = get()
      if (!controller) return
      if (saveState !== 'saved') await get().saveNow()
      if (saveTimer) clearTimeout(saveTimer)
      unsubscribeDoc?.()
      unsubscribeDoc = null
      controller.destroy()
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
      if ('sceneSpacing' in s || 'autoContd' in s) get().controller?.relayout()
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
      } catch (e) {
        set({ saveState: 'error' })
        get().notify(`Saving failed: ${(e as Error).message}`, 'error')
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
