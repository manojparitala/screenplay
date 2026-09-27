import { describe, expect, it } from 'vitest'
import { analyze } from './analysis'
import { parseFountain } from './fountain'
import { SAMPLE_FOUNTAIN } from './sample'
import { buildTracking, characterPath, orderedPlaces, placeOf, sharedScenes } from './tracking'

const script = `INT. HOUSE - KITCHEN - DAY

ANNA makes tea. Bob is out.

ANNA
Where is he?

EXT. GARDEN - DAY

BOB
Here!

INT. HOUSE - HALL - NIGHT

Anna and Bob pass each other.

INT. HOUSE - KITCHEN - NIGHT

BOB
Tea?

ANNA
(tired)
Please. Two sugars.
`

describe('character tracking', () => {
  const { elements } = parseFountain(script)
  const analysis = analyze(elements)

  it('records speeches, words and mentions per scene', () => {
    const t = buildTracking(elements, analysis, { includeMentions: true, groupLocations: false })
    const anna = t.characters.find((c) => c.name === 'ANNA')!
    expect(anna.presence[0]).toEqual({ speeches: 1, words: 3, mentioned: true })
    expect(anna.presence[1]).toBeNull()
    expect(anna.presence[2]).toEqual({ speeches: 0, words: 0, mentioned: true })
    expect(anna.presence[3]).toEqual({ speeches: 1, words: 3, mentioned: false })
    expect(anna.sceneIndexes).toEqual([0, 2, 3])
    const bob = t.characters.find((c) => c.name === 'BOB')!
    // "Bob is out." still names him in scene 1.
    expect(bob.sceneIndexes).toEqual([0, 1, 2, 3])
  })

  it('can ignore characters who are only named in action', () => {
    const t = buildTracking(elements, analysis, { includeMentions: false, groupLocations: false })
    expect(t.characters.find((c) => c.name === 'ANNA')!.sceneIndexes).toEqual([0, 3])
  })

  it('groups sub-locations on request', () => {
    const t = buildTracking(elements, analysis, { includeMentions: true, groupLocations: true })
    expect(t.places).toEqual(['HOUSE', 'GARDEN', 'HOUSE', 'HOUSE'])
    const plain = buildTracking(elements, analysis, { includeMentions: true, groupLocations: false })
    expect(plain.places).toEqual(['HOUSE - KITCHEN', 'GARDEN', 'HOUSE - HALL', 'HOUSE - KITCHEN'])
  })

  it('builds each character’s path through places', () => {
    const t = buildTracking(elements, analysis, { includeMentions: true, groupLocations: true })
    const bob = t.characters.find((c) => c.name === 'BOB')!
    expect(characterPath(bob, t.places)).toEqual([
      { place: 'HOUSE', sceneIndexes: [0] },
      { place: 'GARDEN', sceneIndexes: [1] },
      { place: 'HOUSE', sceneIndexes: [2, 3] },
    ])
    expect(orderedPlaces(t.places, bob.sceneIndexes)).toEqual(['HOUSE', 'GARDEN'])
  })

  it('counts shared scenes', () => {
    const t = buildTracking(elements, analysis, { includeMentions: false, groupLocations: false })
    const m = sharedScenes(t.characters)
    const a = t.characters.findIndex((c) => c.name === 'ANNA')
    const b = t.characters.findIndex((c) => c.name === 'BOB')
    expect(m[a][a]).toBe(2)
    expect(m[a][b]).toBe(1)
    expect(m[b][a]).toBe(1)
  })

  it('tracks the sample script', () => {
    const s = parseFountain(SAMPLE_FOUNTAIN).elements
    const t = buildTracking(s, analyze(s), { includeMentions: true, groupLocations: true })
    expect(t.characters.map((c) => c.name)).toEqual(['MAREN', 'TEO', 'IDA', 'YOUNG FISHERMAN'])
    // Ida speaks over the radio in the lamp room, then waits at the harbor.
    const ida = t.characters[2]
    expect(characterPath(ida, t.places).map((s) => s.place)).toEqual(['LIGHTHOUSE', 'HARBOR'])
    expect(t.characters[0].sceneIndexes.length).toBeGreaterThanOrEqual(4)
    expect(placeOf(t.scenes[1], true)).toBe('LIGHTHOUSE')
  })
})
