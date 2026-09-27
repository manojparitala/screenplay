import { describe, expect, it } from 'vitest'
import { characterExtensions, characterName, parseSceneHeading } from './scene'

describe('parseSceneHeading', () => {
  it('splits prefix, location and time', () => {
    expect(parseSceneHeading('int. john’s house - kitchen - night')).toEqual({
      prefix: 'INT.',
      intExt: 'INT',
      location: 'JOHN’S HOUSE - KITCHEN',
      time: 'NIGHT',
    })
  })

  it('understands combined prefixes', () => {
    expect(parseSceneHeading('INT./EXT. CAR - MOVING - DAY').intExt).toBe('INT/EXT')
    expect(parseSceneHeading('I/E CAR - DAY').prefix).toBe('I/E.')
    expect(parseSceneHeading('EXT. MOTEL-6 - DUSK')).toMatchObject({ location: 'MOTEL-6', time: 'DUSK' })
  })

  it('copes with headings missing parts', () => {
    expect(parseSceneHeading('FLASHBACK')).toEqual({ prefix: '', intExt: 'OTHER', location: 'FLASHBACK', time: '' })
    expect(parseSceneHeading('INT. ')).toMatchObject({ prefix: 'INT.', location: '' })
    expect(parseSceneHeading('INT. OFFICE -')).toMatchObject({ location: 'OFFICE', time: '' })
  })
})

describe('character cues', () => {
  it('strips extensions', () => {
    expect(characterName("Maren (V.O.) (CONT'D)")).toBe('MAREN')
    expect(characterName('BRICK ^')).toBe('BRICK')
    expect(characterExtensions("MAREN (V.O.) (CONT'D)")).toEqual(['V.O.'])
  })
})
