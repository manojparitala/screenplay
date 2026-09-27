import { sanitizeProject } from '../core/project'
import type { Project, Snapshot } from '../core/types'

/**
 * Tiny IndexedDB wrapper. Everything stays on the writer's machine. If
 * IndexedDB is unavailable (some private browsing modes) we fall back to
 * memory and tell the UI so it can warn the user.
 */

const DB_NAME = 'screenplay-app'
const DB_VERSION = 1
const PROJECTS = 'projects'
const SNAPSHOTS = 'snapshots'

let dbPromise: Promise<IDBDatabase | null> | null = null
const memory = { projects: new Map<string, Project>(), snapshots: new Map<string, Snapshot>() }

export let storageMode: 'indexeddb' | 'memory' = 'indexeddb'

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      storageMode = 'memory'
      resolve(null)
      return
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      storageMode = 'memory'
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        const s = db.createObjectStore(SNAPSHOTS, { keyPath: 'id' })
        s.createIndex('projectId', 'projectId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      storageMode = 'memory'
      resolve(null)
    }
    req.onblocked = () => {
      storageMode = 'memory'
      resolve(null)
    }
  })
  return dbPromise
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  const db = await open()
  return db ? db.transaction(name, mode).objectStore(name) : null
}

export async function listProjects(): Promise<Project[]> {
  const s = await store(PROJECTS, 'readonly')
  const raw = s ? await request(s.getAll()) : [...memory.projects.values()]
  const out: Project[] = []
  for (const r of raw) {
    try {
      out.push(sanitizeProject(r))
    } catch {
      /* skip unreadable records */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string): Promise<Project | null> {
  const s = await store(PROJECTS, 'readonly')
  const raw = s ? await request(s.get(id)) : memory.projects.get(id)
  return raw ? sanitizeProject(raw) : null
}

export async function putProject(p: Project): Promise<void> {
  const s = await store(PROJECTS, 'readwrite')
  if (s) await request(s.put(p))
  else memory.projects.set(p.id, structuredClone(p))
}

export async function deleteProject(id: string): Promise<void> {
  const s = await store(PROJECTS, 'readwrite')
  if (s) await request(s.delete(id))
  else memory.projects.delete(id)
  for (const snap of await listSnapshots(id)) await deleteSnapshot(snap.id)
}

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  const s = await store(SNAPSHOTS, 'readonly')
  const all = s
    ? await request(s.index('projectId').getAll(projectId) as IDBRequest<Snapshot[]>)
    : [...memory.snapshots.values()].filter((x) => x.projectId === projectId)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function putSnapshot(snap: Snapshot): Promise<void> {
  const s = await store(SNAPSHOTS, 'readwrite')
  if (s) await request(s.put(snap))
  else memory.snapshots.set(snap.id, structuredClone(snap))
}

export async function deleteSnapshot(id: string): Promise<void> {
  const s = await store(SNAPSHOTS, 'readwrite')
  if (s) await request(s.delete(id))
  else memory.snapshots.delete(id)
}

/** Ask the browser not to evict our data under storage pressure. */
export function requestPersistence() {
  try {
    void navigator.storage?.persist?.()
  } catch {
    /* not supported */
  }
}
