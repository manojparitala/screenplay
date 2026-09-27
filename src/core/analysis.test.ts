import { describe, expect, it } from 'vitest'
import { analyze, renameCharacterText, renameCue, sceneAt, scenesMentioning } from './analysis'
import { parseFountain } from './fountain'
import { SAMPLE_FOUNTAIN } from './sample'

describe('analyze', () => {
  const { elements } = parseFountain(SAMPLE_FOUNTAIN)
  const a = analyze(elements)

  it('finds scenes with numbers, sections and speaking characters', () => {
    expect(a.scenes.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6])
    expect(a.scenes[0].heading).toBe('EXT. NORTHERN COAST - LIGHTHOUSE - DUSK')
    expect(a.scenes[0].characters).toEqual(['TEO', 'MAREN'])
    expect(a.scenes[0].section).toBe('ACT ONE')
    expect(a.scenes[4].section).toBe('ACT TWO')
    expect(a.sections.map((s) => s.title)).toEqual(['ACT ONE', 'ACT TWO'])
  })

  it('counts characters by speeches', () => {
    expect(a.characters.map((c) => c.name)).toEqual(['MAREN', 'TEO', 'IDA', 'YOUNG FISHERMAN'])
    expect(a.characters[2].extensions).toEqual(['V.O.'])
    expect(a.characters[0].speeches).toBeGreaterThan(5)
    expect(a.characters[0].firstScene).toBe(1)
  })

  it('groups locations', () => {
    const light = a.locations.find((l) => l.name === 'NORTHERN COAST - LIGHTHOUSE')!
    expect(light.sceneIds).toHaveLength(2)
    expect(light.intExt).toEqual(['EXT'])
    expect(light.times).toEqual(['DUSK', 'NIGHT'])
  })

  it('collects notes', () => {
    expect(a.notes.map((n) => n.text)).toEqual(['Consider opening on the logbooks as an insert shot.'])
  })

  it('locates the scene of an element', () => {
    expect(sceneAt(a.scenes, 0)).toBeNull()
    expect(sceneAt(a.scenes, a.scenes[1].index + 2)?.number).toBe(2)
  })

  it('finds scenes mentioning a character in action', () => {
    expect(scenesMentioning(elements, a.scenes, 'Teo').length).toBeGreaterThanOrEqual(3)
  })
})

describe('renaming', () => {
  it('keeps the casing style of each occurrence', () => {
    expect(renameCharacterText('TEO enters. Teo sits. teo? Teodor stays.', 'teo', 'Sam')).toBe(
      'SAM enters. Sam sits. sam? Teodor stays.'.replace('sam?', 'Sam?'),
    )
  })

  it('renames cues keeping extensions', () => {
    expect(renameCue('TEO (V.O.)', 'TEO', 'Sam')).toBe('SAM (V.O.)')
    expect(renameCue('TEODOR', 'TEO', 'Sam')).toBeNull()
  })
})
