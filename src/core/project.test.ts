// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { toFdx } from './fdx'
import { createProject, detectFormat, projectFromFile, safeFileName, sanitizeProject, serializeProject } from './project'
import { SAMPLE_FOUNTAIN } from './sample'

describe('project files', () => {
  it('detects formats', () => {
    expect(detectFormat('a.fdx', '')).toBe('fdx')
    expect(detectFormat('a.txt', '<?xml version="1.0"?>\n<FinalDraft>')).toBe('fdx')
    expect(detectFormat('a.json', '{}')).toBe('json')
    expect(detectFormat('a.fountain', 'INT. X - DAY')).toBe('fountain')
  })

  it('reads Fountain saved as .fountain.txt', () => {
    const indented = '        INT. HOUSE - DAY\n\n                    ANNA\n          Hello.\n\n'.repeat(7)
    expect(detectFormat('Draft.txt', indented)).toBe('indented')
    expect(detectFormat('Draft.fountain.txt', indented)).toBe('fountain')
    const p = projectFromFile('Draft.fountain.txt', 'INT. HOUSE - DAY\n\nAnna waits.\n')
    expect(p.titlePage.title).toBe('Draft')
    expect(p.script.map((e) => e.type)).toEqual(['scene', 'action'])
  })

  it('imports Fountain with title page', () => {
    const p = projectFromFile('light.fountain', SAMPLE_FOUNTAIN)
    expect(p.titlePage.title).toBe('The Last Lighthouse')
    expect(p.script.length).toBeGreaterThan(20)
  })

  it('falls back to the file name for untitled scripts', () => {
    const p = projectFromFile('My Script.fountain', 'INT. HOUSE - DAY\n\nHello.\n')
    expect(p.titlePage.title).toBe('My Script')
  })

  it('imports FDX', () => {
    const fountain = projectFromFile('x.fountain', SAMPLE_FOUNTAIN)
    const p = projectFromFile('x.fdx', toFdx(fountain.script, fountain.titlePage))
    expect(p.script.filter((e) => e.type === 'scene')).toHaveLength(6)
  })

  it('round-trips a JSON backup as a new project', () => {
    const original = createProject('Backup Test')
    original.notes.push({ id: 'n1', title: 'Idea', body: 'Body', createdAt: 1, updatedAt: 1 })
    const copy = projectFromFile('backup.json', serializeProject(original))
    expect(copy.id).not.toBe(original.id)
    expect(copy.titlePage.title).toBe('Backup Test')
    expect(copy.notes).toHaveLength(1)
  })

  it('sanitizes malformed data', () => {
    const p = sanitizeProject({ script: [{ type: 'bogus' }, { type: 'action', runs: [{ text: 'ok', bold: 1 }] }], settings: { autoContd: false } })
    expect(p.script).toEqual([{ type: 'action', runs: [{ text: 'ok', bold: true }] }])
    expect(p.settings.autoContd).toBe(false)
    expect(p.settings.sceneSpacing).toBe(1)
    expect(() => sanitizeProject('nope')).toThrow()
  })
})

describe('safeFileName', () => {
  it('keeps titles in any language and removes what file systems reject', () => {
    expect(safeFileName('Café “Noir” — Part 1')).toBe('Café “Noir” — Part 1')
    expect(safeFileName('வாலி')).toBe('வாலி')
    expect(safeFileName('Mission: Impossible')).toBe('Mission - Impossible')
    expect(safeFileName('AC/DC <live> | "best" *?')).toBe('AC DC live best')
    expect(safeFileName('  ...Draft 2...  ')).toBe('Draft 2')
    expect(safeFileName('Line one\nLine two\t')).toBe('Line one Line two')
    // Direction overrides could disguise the extension, so invisible characters go.
    expect(safeFileName('photo\u202Egnp.exe\u200B')).toBe('photognp.exe')
    // Joiners are part of how some scripts and emoji are written.
    expect(safeFileName('क्\u200Dष 👩\u200D💻')).toBe('क्\u200Dष 👩\u200D💻')
    expect(safeFileName('Cafe\u0301')).toBe('Café')
    expect(safeFileName('???')).toBe('screenplay')
    expect(safeFileName('')).toBe('screenplay')
  })

  it('keeps long names within file-system limits without splitting characters', () => {
    const tamil = 'வாலி '.repeat(40)
    const name = safeFileName(tamil)
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(150)
    expect(tamil.startsWith(name)).toBe(true)
    // The cut falls between syllables: a vowel sign is never left behind.
    expect(tamil.slice(name.length)).toMatch(/^[^\p{M}]/u)
    const emoji = safeFileName('🎬'.repeat(60))
    expect([...emoji].every((c) => c === '🎬')).toBe(true)
    expect(safeFileName('x'.repeat(300))).toHaveLength(150)
  })
})
