import { parseFdx } from './fdx'
import { parseFountain } from './fountain'
import { looksIndented, parseIndentedText, type LayoutImport } from './pdfimport'
import { uid } from './id'
import { plainText } from './text'
import {
  DEFAULT_SETTINGS,
  ELEMENT_TYPES,
  emptyTitlePage,
  SCENE_COLORS,
  type Project,
  type ScriptElement,
  type TitlePage,
} from './types'

export function createProject(title = 'Untitled Screenplay'): Project {
  const now = Date.now()
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    titlePage: { ...emptyTitlePage(), title },
    script: [{ type: 'scene', id: uid(), runs: [] }],
    characters: {},
    locations: {},
    beats: { templateId: 'save-the-cat', entries: {} },
    notes: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

export function projectTitle(p: Pick<Project, 'titlePage'>): string {
  return p.titlePage.title.trim() || 'Untitled Screenplay'
}

const BACKUP_FORMAT = 'screenplay-project'

export function serializeProject(p: Project): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, project: p }, null, 2)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function sanitizeElements(raw: unknown): ScriptElement[] {
  if (!Array.isArray(raw)) return []
  const out: ScriptElement[] = []
  for (const r of raw) {
    if (!isObject(r) || !ELEMENT_TYPES.includes(r.type as never)) continue
    const runs = Array.isArray(r.runs)
      ? r.runs.filter(isObject).map((run) => {
          const t: ScriptElement['runs'][number] = { text: str(run.text) }
          if (run.bold) t.bold = true
          if (run.italic) t.italic = true
          if (run.underline) t.underline = true
          return t
        })
      : []
    const el: ScriptElement = { type: r.type as ScriptElement['type'], runs }
    if (el.type === 'scene') {
      el.id = str(r.id) || uid()
      if (r.synopsis) el.synopsis = str(r.synopsis)
      if (r.notes) el.notes = str(r.notes)
      if (SCENE_COLORS.includes(r.color as never)) el.color = r.color as ScriptElement['color']
    }
    if (el.type === 'section') el.level = typeof r.level === 'number' ? r.level : 1
    out.push(el)
  }
  return out
}

/** Validate a project loaded from a backup file or storage, filling any missing fields. */
export function sanitizeProject(raw: unknown, keepId = true): Project {
  if (!isObject(raw)) throw new Error('Not a screenplay project.')
  const base = createProject()
  const tp = isObject(raw.titlePage) ? raw.titlePage : {}
  const titlePage = { ...emptyTitlePage() }
  for (const k of Object.keys(titlePage) as (keyof TitlePage)[]) if (typeof tp[k] === 'string') titlePage[k] = tp[k] as string
  const script = sanitizeElements(raw.script)
  return {
    ...base,
    id: keepId && typeof raw.id === 'string' ? raw.id : base.id,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : base.updatedAt,
    titlePage,
    script: script.length ? script : base.script,
    characters: isObject(raw.characters) ? (raw.characters as Project['characters']) : {},
    locations: isObject(raw.locations) ? (raw.locations as Project['locations']) : {},
    beats:
      isObject(raw.beats) && typeof raw.beats.templateId === 'string' && isObject(raw.beats.entries)
        ? (raw.beats as unknown as Project['beats'])
        : base.beats,
    notes: Array.isArray(raw.notes) ? (raw.notes as Project['notes']) : [],
    settings: { ...DEFAULT_SETTINGS, ...(isObject(raw.settings) ? (raw.settings as Partial<Project['settings']>) : {}) },
    stats: isObject(raw.stats) ? (raw.stats as Project['stats']) : undefined,
  }
}

export type ImportFormat = 'fountain' | 'fdx' | 'json' | 'indented'

export function detectFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.fdx') || /^\s*<\?xml[\s\S]{0,200}<FinalDraft/.test(text) || /^\s*<FinalDraft/.test(text)) return 'fdx'
  if (lower.endsWith('.json') || /^\s*\{/.test(text)) return 'json'
  if (!lower.endsWith('.fountain') && !lower.endsWith('.spmd') && looksIndented(text)) return 'indented'
  return 'fountain'
}

/** Build a new project from an imported file. */
export function projectFromFile(fileName: string, text: string): Project {
  const format = detectFormat(fileName, text)
  if (format === 'json') {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('This JSON file could not be read.')
    }
    const raw = isObject(data) && data.format === BACKUP_FORMAT ? data.project : data
    const p = sanitizeProject(raw, false)
    p.createdAt = Date.now()
    p.updatedAt = Date.now()
    return p
  }
  const parsed = format === 'fdx' ? parseFdx(text) : format === 'indented' ? parseIndentedText(text) : parseFountain(text)
  return projectFromParsed(fileName, parsed)
}

/** Build a project from elements recovered from a laid-out script (PDF or indented text). */
export function projectFromParsed(fileName: string, parsed: LayoutImport): Project {
  const p = createProject('')
  const fallbackTitle = fileName.replace(/\.[^.]+$/, '')
  p.titlePage = { ...p.titlePage, ...parsed.titlePage }
  if (!p.titlePage.title.trim()) p.titlePage.title = fallbackTitle
  if (parsed.elements.length) p.script = parsed.elements
  return p
}

export function safeFileName(title: string): string {
  return (title.trim() || 'screenplay').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 80)
}

/** Plain text of every element, for quick previews and word counts. */
export function scriptText(elements: ScriptElement[]): string {
  return elements.map((e) => plainText(e)).join('\n')
}
