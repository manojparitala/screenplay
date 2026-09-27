// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { toFdx } from './fdx'
import { createProject, detectFormat, projectFromFile, sanitizeProject, serializeProject } from './project'
import { SAMPLE_FOUNTAIN } from './sample'

describe('project files', () => {
  it('detects formats', () => {
    expect(detectFormat('a.fdx', '')).toBe('fdx')
    expect(detectFormat('a.txt', '<?xml version="1.0"?>\n<FinalDraft>')).toBe('fdx')
    expect(detectFormat('a.json', '{}')).toBe('json')
    expect(detectFormat('a.fountain', 'INT. X - DAY')).toBe('fountain')
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
