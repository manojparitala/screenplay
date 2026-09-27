import { characterExtensions, characterName, parseSceneHeading, type SceneHeadingParts } from './scene'
import { countWords, plainText } from './text'
import type { SceneColor, ScriptElement } from './types'

export interface SceneInfo {
  /** Index of the scene heading in the element list. */
  index: number
  /** Index one past the last element belonging to the scene. */
  end: number
  id: string
  number: number
  heading: string
  parts: SceneHeadingParts
  synopsis: string
  notes: string
  color: SceneColor | null
  /** Speaking characters, in order of first line. */
  characters: string[]
  words: number
  /** Title of the act/sequence the scene belongs to, if any. */
  section: string
}

export interface SectionInfo {
  index: number
  title: string
  level: number
}

export interface CharacterStat {
  name: string
  speeches: number
  words: number
  /** Ids of scenes the character speaks in. */
  sceneIds: string[]
  firstScene: number
  extensions: string[]
}

export interface LocationStat {
  name: string
  intExt: string[]
  times: string[]
  sceneIds: string[]
}

export interface ScriptAnalysis {
  scenes: SceneInfo[]
  sections: SectionInfo[]
  characters: CharacterStat[]
  locations: LocationStat[]
  words: number
  dialogueWords: number
  actionWords: number
  notes: { index: number; text: string }[]
}

export function analyze(elements: ScriptElement[]): ScriptAnalysis {
  const scenes: SceneInfo[] = []
  const sections: SectionInfo[] = []
  const chars = new Map<string, CharacterStat>()
  const locs = new Map<string, LocationStat>()
  const notes: { index: number; text: string }[] = []
  let words = 0
  let dialogueWords = 0
  let actionWords = 0
  let scene: SceneInfo | null = null
  let section = ''
  let speaker: CharacterStat | null = null

  const closeScene = (end: number) => {
    if (scene) scene.end = end
  }

  elements.forEach((el, index) => {
    const text = plainText(el)
    const w = countWords(text)
    if (el.type === 'note') {
      notes.push({ index, text })
      return
    }
    if (el.type === 'section') {
      closeScene(index)
      scene = null
      speaker = null
      section = text.trim()
      sections.push({ index, title: section, level: el.level ?? 1 })
      return
    }
    words += w
    switch (el.type) {
      case 'scene': {
        closeScene(index)
        const heading = text.trim().toUpperCase()
        const parts = parseSceneHeading(heading)
        scene = {
          index,
          end: elements.length,
          id: el.id ?? `scene-${index}`,
          number: scenes.length + 1,
          heading,
          parts,
          synopsis: el.synopsis ?? '',
          notes: el.notes ?? '',
          color: el.color ?? null,
          characters: [],
          words: 0,
          section,
        }
        scenes.push(scene)
        speaker = null
        const locName = parts.location || heading
        if (locName) {
          let loc = locs.get(locName)
          if (!loc) {
            loc = { name: locName, intExt: [], times: [], sceneIds: [] }
            locs.set(locName, loc)
          }
          if (parts.intExt !== 'OTHER' && !loc.intExt.includes(parts.intExt)) loc.intExt.push(parts.intExt)
          if (parts.time && !loc.times.includes(parts.time)) loc.times.push(parts.time)
          loc.sceneIds.push(scene.id)
        }
        return
      }
      case 'character': {
        const name = characterName(text)
        speaker = null
        if (!name) break
        let stat = chars.get(name)
        if (!stat) {
          stat = { name, speeches: 0, words: 0, sceneIds: [], firstScene: scene ? scene.number : 0, extensions: [] }
          chars.set(name, stat)
        }
        stat.speeches++
        for (const ext of characterExtensions(text)) if (!stat.extensions.includes(ext)) stat.extensions.push(ext)
        if (scene) {
          if (!stat.sceneIds.includes(scene.id)) stat.sceneIds.push(scene.id)
          if (!scene.characters.includes(name)) scene.characters.push(name)
        }
        speaker = stat
        break
      }
      case 'dialogue':
        dialogueWords += w
        if (speaker) speaker.words += w
        break
      case 'parenthetical':
        break
      default:
        actionWords += w
        speaker = null
    }
    if (scene) scene.words += w
  })
  closeScene(elements.length)

  const characters = [...chars.values()].sort((a, b) => b.speeches - a.speeches || b.words - a.words || a.name.localeCompare(b.name))
  const locations = [...locs.values()].sort((a, b) => b.sceneIds.length - a.sceneIds.length || a.name.localeCompare(b.name))
  return { scenes, sections, characters, locations, words, dialogueWords, actionWords, notes }
}

/** The scene containing the element at `index`, if any. */
export function sceneAt(scenes: SceneInfo[], index: number): SceneInfo | null {
  let lo = 0
  let hi = scenes.length - 1
  let found: SceneInfo | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (scenes[mid].index <= index) {
      found = scenes[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  return found && index < found.end ? found : null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Ids of scenes whose action lines mention `name` (as a whole word, any case). */
export function scenesMentioning(elements: ScriptElement[], scenes: SceneInfo[], name: string): string[] {
  if (!name) return []
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, 'iu')
  const out: string[] = []
  for (const s of scenes) {
    for (let i = s.index + 1; i < s.end; i++) {
      const el = elements[i]
      if ((el.type === 'action' || el.type === 'shot') && re.test(plainText(el))) {
        out.push(s.id)
        break
      }
    }
  }
  return out
}

/**
 * Rename a character throughout the script. Cues keep their extensions; other
 * text keeps the casing style of each occurrence (UPPER, Title or as typed).
 */
export function renameCharacterText(text: string, from: string, to: string): string {
  if (!from) return text
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(from)})(?=$|[^\\p{L}\\p{N}])`, 'giu')
  return text.replace(re, (_m, pre: string, word: string) => {
    let rep = to
    if (word === word.toUpperCase() && word !== word.toLowerCase()) rep = to.toUpperCase()
    else if (word[0] === word[0].toUpperCase()) rep = to.charAt(0).toUpperCase() + to.slice(1).toLowerCase()
    return pre + rep
  })
}

export function renameCue(cue: string, from: string, to: string): string | null {
  if (characterName(cue) !== from.toUpperCase()) return null
  const ext = cue.slice(cue.search(/\s*\(|\s*\^|$/))
  return to.toUpperCase() + ext
}
