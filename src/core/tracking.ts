import type { SceneInfo, ScriptAnalysis } from './analysis'
import { characterName } from './scene'
import { countWords, plainText } from './text'
import type { ScriptElement } from './types'

/** How a character figures in one scene. */
export interface Presence {
  speeches: number
  words: number
  /** Named in the scene's action lines. */
  mentioned: boolean
}

export interface TrackingOptions {
  /** Count a character as present when they are only named in action (no dialogue). */
  includeMentions: boolean
  /** Treat "HOUSE - KITCHEN" and "HOUSE - HALL" as one place, "HOUSE". */
  groupLocations: boolean
}

export interface CharacterTrack {
  name: string
  /** One entry per scene, in script order; null when the character is absent. */
  presence: (Presence | null)[]
  /** Indexes (into `scenes`) of the scenes the character is in. */
  sceneIndexes: number[]
}

export interface Tracking {
  scenes: SceneInfo[]
  /** Place of each scene, after optional grouping. */
  places: string[]
  characters: CharacterTrack[]
}

export interface PathStop {
  place: string
  /** Scene indexes of consecutive scenes spent in this place. */
  sceneIndexes: number[]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function placeOf(scene: SceneInfo, group: boolean): string {
  const loc = scene.parts.location || scene.heading || 'UNTITLED SCENE'
  if (!group) return loc
  return loc.split(/\s+[-–—]+\s+/)[0] || loc
}

/** Work out which characters are in which scenes, and where each scene takes place. */
export function buildTracking(elements: ScriptElement[], analysis: ScriptAnalysis, opts: TrackingOptions): Tracking {
  const scenes = analysis.scenes
  const names = analysis.characters.map((c) => c.name)
  const matchers = names.map((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(n)}(?=$|[^\\p{L}\\p{N}])`, 'iu'))
  const presence = new Map<string, (Presence | null)[]>(names.map((n) => [n, scenes.map(() => null)]))

  scenes.forEach((scene, si) => {
    let speaker: Presence | null = null
    const action: string[] = []
    const get = (name: string) => {
      const row = presence.get(name)!
      return (row[si] ??= { speeches: 0, words: 0, mentioned: false })
    }
    for (let i = scene.index + 1; i < scene.end; i++) {
      const el = elements[i]
      const text = plainText(el)
      if (el.type === 'character') {
        const name = characterName(text)
        speaker = presence.has(name) ? get(name) : null
        if (speaker) speaker.speeches++
      } else if (el.type === 'dialogue') {
        if (speaker) speaker.words += countWords(text)
      } else if (el.type === 'parenthetical' || el.type === 'note') {
        // Part of a speech, or a writer's note: neither ends the speech nor counts as action.
      } else {
        speaker = null
        if (el.type === 'action' || el.type === 'shot' || el.type === 'centered') action.push(text)
      }
    }
    const actionText = action.join('\n')
    if (!actionText) return
    names.forEach((name, k) => {
      if (!matchers[k].test(actionText)) return
      const row = presence.get(name)!
      if (row[si]) row[si]!.mentioned = true
      else if (opts.includeMentions) row[si] = { speeches: 0, words: 0, mentioned: true }
    })
  })

  const characters: CharacterTrack[] = names.map((name) => {
    const row = presence.get(name)!
    const sceneIndexes: number[] = []
    row.forEach((p, i) => p && sceneIndexes.push(i))
    return { name, presence: row, sceneIndexes }
  })
  return { scenes, places: scenes.map((s) => placeOf(s, opts.groupLocations)), characters }
}

/** The places a character moves through, merging consecutive appearances in the same place. */
export function characterPath(track: CharacterTrack, places: string[]): PathStop[] {
  const stops: PathStop[] = []
  for (const si of track.sceneIndexes) {
    const place = places[si]
    const last = stops[stops.length - 1]
    if (last && last.place === place) last.sceneIndexes.push(si)
    else stops.push({ place, sceneIndexes: [si] })
  }
  return stops
}

/** Number of scenes each pair of characters share. `matrix[i][i]` is character i's own scene count. */
export function sharedScenes(tracks: CharacterTrack[]): number[][] {
  const sets = tracks.map((t) => new Set(t.sceneIndexes))
  return tracks.map((a, i) =>
    tracks.map((_b, j) => {
      if (i === j) return a.sceneIndexes.length
      let n = 0
      for (const s of sets[i]) if (sets[j].has(s)) n++
      return n
    }),
  )
}

/** Locations in order of first appearance, restricted to the given scenes. */
export function orderedPlaces(places: string[], sceneIndexes: Iterable<number>): string[] {
  const used = new Set<number>(sceneIndexes)
  const out: string[] = []
  places.forEach((p, i) => {
    if (used.has(i) && !out.includes(p)) out.push(p)
  })
  return out
}
