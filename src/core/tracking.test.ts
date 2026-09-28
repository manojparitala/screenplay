import { describe, expect, it } from 'vitest'
import { analyze } from './analysis'
import { parseFountain } from './fountain'
import { SAMPLE_FOUNTAIN } from './sample'
import { buildInteractions, buildTracking, characterPath, circleOrder, orderedPlaces, placeOf, sharedScenes } from './tracking'

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

describe('interactions', () => {
  it('counts exchanges between consecutive speakers within a scene', () => {
    const { elements } = parseFountain(`INT. ROOM - DAY

ANNA
Hi.

BOB
Hello.

Anna waits.

ANNA
Well?

ANNA
Say something.

CARL
I'll say something.

INT. HALL - DAY

BOB
Anyone?

EXT. YARD - DAY

CARL
Bob!

BOB
Carl!
`)
    const { names, pairs, matrix } = buildInteractions(elements, analyze(elements))
    const get = (a: string, b: string) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))
    // ANNA→BOB, BOB→ANNA (action doesn't break it), ANNA→ANNA (no), ANNA→CARL.
    expect(get('ANNA', 'BOB')).toMatchObject({ exchanges: 2, sceneIndexes: [0] })
    expect(get('ANNA', 'CARL')).toMatchObject({ exchanges: 1, sceneIndexes: [0] })
    // A new scene starts a new conversation: BOB alone in the hall talks to no one.
    expect(get('BOB', 'CARL')).toMatchObject({ exchanges: 1, sceneIndexes: [2] })
    expect(pairs[0].exchanges).toBe(2)
    const i = names.indexOf('ANNA')
    const j = names.indexOf('BOB')
    expect(matrix[i][j]).toBe(2)
    expect(matrix[j][i]).toBe(2)
    expect(matrix[i][i]).toBe(0)
  })

  it('finds who talks with whom in the sample', () => {
    const s = parseFountain(SAMPLE_FOUNTAIN).elements
    const { pairs } = buildInteractions(s, analyze(s))
    expect(pairs.map((p) => [p.a, p.b])).toEqual([
      ['MAREN', 'TEO'],
      ['MAREN', 'IDA'],
      ['IDA', 'YOUNG FISHERMAN'],
    ])
    expect(pairs[0].sceneIndexes).toEqual([0, 1, 3, 5])
  })

  it('orders a circle so close characters sit together', () => {
    const w: Record<string, number> = { 'A|B': 1, 'A|C': 9, 'B|D': 9, 'C|D': 1 }
    const weight = (x: string, y: string) => w[[x, y].sort().join('|')] ?? 0
    const order = circleOrder(['A', 'B', 'C', 'D'], weight)
    const adjacent = (x: string, y: string) => {
      const i = order.indexOf(x)
      const j = order.indexOf(y)
      return Math.abs(i - j) === 1 || Math.abs(i - j) === order.length - 1
    }
    expect(adjacent('A', 'C')).toBe(true)
    expect(adjacent('B', 'D')).toBe(true)
  })
})
