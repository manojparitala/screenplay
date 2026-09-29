/** Every kind of paragraph a screenplay can contain. */
export const ELEMENT_TYPES = [
  'scene',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'centered',
  'section',
  'note',
] as const

export type ElementType = (typeof ELEMENT_TYPES)[number]

/** A run of text sharing the same inline styling. `\n` marks a forced line break. */
export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

export const SCENE_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const
export type SceneColor = (typeof SCENE_COLORS)[number]

/** One paragraph of the script. Scene-only and section-only fields are optional. */
export interface ScriptElement {
  type: ElementType
  runs: TextRun[]
  /** Stable id (scene headings only). */
  id?: string
  /** One or two sentence summary of the scene (scene headings only). */
  synopsis?: string
  /** Private notes attached to the scene (scene headings only). */
  notes?: string
  /** Index-card colour (scene headings only). */
  color?: SceneColor | null
  /** Section depth: 1 = act, 2 = sequence, 3 = sub-sequence (sections only). */
  level?: number
}

export interface TitlePage {
  title: string
  credit: string
  author: string
  source: string
  draftDate: string
  contact: string
  copyright: string
  notes: string
}

export interface CharacterProfile {
  name: string
  role: string
  age: string
  description: string
  personality: string
  want: string
  need: string
  flaw: string
  arc: string
  backstory: string
  notes: string
}

export interface LocationProfile {
  name: string
  description: string
  notes: string
}

export interface BeatEntry {
  text: string
  sceneIds: string[]
}

export interface BeatSheetData {
  templateId: string
  /** Entries per template, so switching templates never loses work. */
  entries: Record<string, Record<string, BeatEntry>>
}

export interface Note {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

export type EnterAfterDialogue = 'action' | 'character'

/** Paper the script is laid out and printed on. */
export type PaperSize = 'letter' | 'a4'

export interface ScriptSettings {
  paper: PaperSize
  /** Printed at the top left of every script page after the first. */
  header: string
  /** Printed at the bottom of every script page. */
  footer: string
  showSceneNumbers: boolean
  autoContd: boolean
  /** Blank lines printed before each scene heading (1 or 2). */
  sceneSpacing: 1 | 2
  boldSceneHeadings: boolean
  /** Planned length, used by the beat sheet to place beats. 0 = use actual length. */
  targetPages: number
  enterAfterDialogue: EnterAfterDialogue
  /** Print the title page as the first page of PDFs and previews. */
  includeTitlePage: boolean
}

export interface Project {
  id: string
  createdAt: number
  updatedAt: number
  titlePage: TitlePage
  script: ScriptElement[]
  characters: Record<string, CharacterProfile>
  locations: Record<string, LocationProfile>
  beats: BeatSheetData
  notes: Note[]
  settings: ScriptSettings
  /** Cached for the library listing. */
  stats?: { pages: number; scenes: number; words: number }
}

export interface Snapshot {
  id: string
  projectId: string
  name: string
  /** When the script was as saved here. */
  createdAt: number
  pages: number
  script: ScriptElement[]
  titlePage: TitlePage
  /** Taken by the app as the writer works, and thinned out over time; the writer's own are kept. */
  auto?: boolean
}

export const DEFAULT_SETTINGS: ScriptSettings = {
  paper: 'letter',
  header: '',
  footer: '',
  showSceneNumbers: false,
  autoContd: true,
  sceneSpacing: 1,
  boldSceneHeadings: false,
  targetPages: 110,
  enterAfterDialogue: 'action',
  includeTitlePage: true,
}

export function emptyTitlePage(): TitlePage {
  return {
    title: '',
    credit: 'Written by',
    author: '',
    source: '',
    draftDate: '',
    contact: '',
    copyright: '',
    notes: '',
  }
}

export function emptyCharacterProfile(name: string): CharacterProfile {
  return {
    name,
    role: '',
    age: '',
    description: '',
    personality: '',
    want: '',
    need: '',
    flaw: '',
    arc: '',
    backstory: '',
    notes: '',
  }
}
