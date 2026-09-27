// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseFdx, toFdx } from './fdx'
import { parseFountain } from './fountain'
import { SAMPLE_FOUNTAIN } from './sample'
import { plainText } from './text'

describe('fdx', () => {
  it('round-trips printable elements, styles and synopses', () => {
    const { elements, titlePage } = parseFountain(SAMPLE_FOUNTAIN)
    const xml = toFdx(elements, titlePage)
    expect(xml).toContain('<Paragraph Type="Scene Heading">')
    const back = parseFdx(xml)
    const printable = elements.filter((e) => e.type !== 'note' && e.type !== 'section')
    expect(back.elements.map((e) => [e.type, plainText(e)])).toEqual(
      printable.map((e) => [e.type, ['scene', 'character', 'transition', 'shot'].includes(e.type) ? plainText(e).toUpperCase() : plainText(e)]),
    )
    expect(back.elements.find((e) => e.type === 'scene')?.synopsis).toBe(elements.find((e) => e.type === 'scene')?.synopsis)
    const italic = back.elements.flatMap((e) => e.runs).find((r) => r.italic)
    expect(italic?.text).toBe('Aurora')
    expect(back.titlePage.title).toBe('THE LAST LIGHTHOUSE')
    expect(back.titlePage.author).toBe('A. Screenwriter')
  })

  it('escapes XML special characters', () => {
    const xml = toFdx([{ type: 'action', runs: [{ text: 'Tom & Jerry <3 "quotes"' }] }])
    expect(parseFdx(xml).elements[0].runs[0].text).toBe('Tom & Jerry <3 "quotes"')
  })

  it('reads dual dialogue and centered action', () => {
    const xml = `<?xml version="1.0"?><FinalDraft><Content>
      <Paragraph Type="Action" Alignment="Center"><Text>THE END</Text></Paragraph>
      <Paragraph><DualDialogue>
        <Paragraph Type="Character"><Text>A</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>Hi.</Text></Paragraph>
      </DualDialogue></Paragraph>
    </Content></FinalDraft>`
    const els = parseFdx(xml).elements
    expect(els[0].type).toBe('centered')
    expect(els.some((e) => e.type === 'character')).toBe(true)
  })

  it('rejects non-FDX files', () => {
    expect(() => parseFdx('<html></html>')).toThrow()
  })
})
