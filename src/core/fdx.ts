import { uid } from './id'
import { normalizeRuns, plainText } from './text'
import type { ElementType, ScriptElement, TextRun, TitlePage } from './types'

const TO_FDX: Partial<Record<ElementType, string>> = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  centered: 'Action',
}

const FROM_FDX: Record<string, ElementType> = {
  'scene heading': 'scene',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  shot: 'shot',
  general: 'action',
  'cast list': 'action',
  'new act': 'section',
  'end of act': 'section',
  'outline 1': 'section',
  'outline 2': 'section',
  'outline 3': 'section',
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Strip characters that are illegal in XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function runsToFdx(runs: TextRun[]): string {
  if (!runs.length) return '<Text></Text>'
  return runs
    .map((r) => {
      const style = [r.bold && 'Bold', r.italic && 'Italic', r.underline && 'Underline'].filter(Boolean).join('+')
      return `<Text${style ? ` Style="${style}"` : ''}>${xmlEscape(r.text)}</Text>`
    })
    .join('')
}

function paragraph(type: string, body: string, extra = '', inner = ''): string {
  return `    <Paragraph Type="${type}"${extra}>${inner}${body}</Paragraph>`
}

/** Serialize to Final Draft's XML format (.fdx). Writer-only notes and sections are omitted. */
export function toFdx(elements: ScriptElement[], titlePage?: Partial<TitlePage>): string {
  const out: string[] = []
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>')
  out.push('<FinalDraft DocumentType="Script" Template="No" Version="5">')
  out.push('  <Content>')
  for (const el of elements) {
    const type = TO_FDX[el.type]
    if (!type) continue
    const runs = el.type === 'scene' || el.type === 'character' || el.type === 'transition' || el.type === 'shot'
      ? el.runs.map((r) => ({ ...r, text: r.text.toUpperCase() }))
      : el.runs
    const extra = el.type === 'centered' ? ' Alignment="Center"' : ''
    let inner = ''
    if (el.type === 'scene' && el.synopsis?.trim()) {
      inner = `<SceneProperties Title=""><Summary><Paragraph Type="General"><Text>${xmlEscape(el.synopsis.trim())}</Text></Paragraph></Summary></SceneProperties>`
    }
    out.push(paragraph(type, runsToFdx(runs), extra, inner))
  }
  out.push('  </Content>')
  if (titlePage && (titlePage.title || titlePage.author)) {
    const tp: string[] = []
    const center = (text: string) => tp.push(paragraph('Title Page', `<Text>${xmlEscape(text)}</Text>`, ' Alignment="Center"'))
    const left = (text: string) => tp.push(paragraph('Title Page', `<Text>${xmlEscape(text)}</Text>`, ' Alignment="Left"'))
    for (let k = 0; k < 16; k++) center('')
    if (titlePage.title) for (const l of titlePage.title.split('\n')) center(l.toUpperCase())
    center('')
    if (titlePage.credit) center(titlePage.credit)
    center('')
    if (titlePage.author) for (const l of titlePage.author.split('\n')) center(l)
    if (titlePage.source) {
      center('')
      for (const l of titlePage.source.split('\n')) center(l)
    }
    for (let k = 0; k < 12; k++) left('')
    if (titlePage.draftDate) left(titlePage.draftDate)
    if (titlePage.contact) for (const l of titlePage.contact.split('\n')) left(l)
    if (titlePage.copyright) left(titlePage.copyright)
    out.push('  <TitlePage>')
    out.push('    <Content>')
    out.push(...tp.map((l) => '  ' + l))
    out.push('    </Content>')
    out.push('  </TitlePage>')
  }
  out.push('</FinalDraft>')
  return out.join('\n') + '\n'
}

function textRuns(p: Element): TextRun[] {
  const runs: TextRun[] = []
  for (const t of Array.from(p.children)) {
    if (t.tagName !== 'Text') continue
    const style = (t.getAttribute('Style') || '').toLowerCase()
    const r: TextRun = { text: t.textContent ?? '' }
    if (style.includes('bold')) r.bold = true
    if (style.includes('italic')) r.italic = true
    if (style.includes('underline')) r.underline = true
    runs.push(r)
  }
  return normalizeRuns(runs.map((r) => ({ ...r, text: r.text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ') })))
}

export interface FdxDocument {
  titlePage: Partial<TitlePage>
  elements: ScriptElement[]
}

/** Parse a Final Draft (.fdx) file. Requires a DOMParser (browser or jsdom). */
export function parseFdx(xml: string, parser: DOMParser = new DOMParser()): FdxDocument {
  const doc = parser.parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not valid Final Draft XML.')
  const root = doc.documentElement
  if (!root || root.tagName !== 'FinalDraft') throw new Error('This file is not a Final Draft document.')
  const content = Array.from(root.children).find((c) => c.tagName === 'Content')
  const elements: ScriptElement[] = []

  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child.tagName === 'DualDialogue') {
        visit(child)
        continue
      }
      if (child.tagName !== 'Paragraph') continue
      const dual = Array.from(child.children).find((c) => c.tagName === 'DualDialogue')
      if (dual) {
        visit(dual)
        continue
      }
      const rawType = (child.getAttribute('Type') || 'Action').toLowerCase()
      let type: ElementType = FROM_FDX[rawType] ?? 'action'
      const runs = textRuns(child)
      if (type === 'action' && (child.getAttribute('Alignment') || '').toLowerCase() === 'center') type = 'centered'
      const el: ScriptElement = { type, runs }
      if (type === 'scene') {
        el.id = uid()
        const summary = child.querySelector('SceneProperties Summary')
        if (summary) {
          const text = Array.from(summary.getElementsByTagName('Text'))
            .map((t) => t.textContent ?? '')
            .join('')
            .trim()
          if (text) el.synopsis = text
        }
      }
      if (type === 'section') {
        const m = /outline (\d)/.exec(rawType)
        el.level = m ? Number(m[1]) : 1
        if (!plainText(el).trim()) continue
      }
      elements.push(el)
    }
  }
  if (content) visit(content)

  const titlePage: Partial<TitlePage> = {}
  const tpContent = Array.from(root.children)
    .find((c) => c.tagName === 'TitlePage')
    ?.getElementsByTagName('Paragraph')
  if (tpContent) {
    const centered: string[] = []
    const left: string[] = []
    for (const p of Array.from(tpContent)) {
      const text = plainText({ runs: textRuns(p) }).trim()
      if (!text) continue
      if ((p.getAttribute('Alignment') || '').toLowerCase() === 'center') centered.push(text)
      else left.push(text)
    }
    if (centered.length) {
      titlePage.title = centered[0]
      const byIdx = centered.findIndex((t, k) => k > 0 && /\bby\b/i.test(t))
      if (byIdx > 0) {
        titlePage.credit = centered[byIdx]
        titlePage.author = centered.slice(byIdx + 1, byIdx + 2).join('\n')
        const rest = centered.slice(byIdx + 2)
        if (rest.length) titlePage.source = rest.join('\n')
      } else if (centered.length > 1) {
        titlePage.author = centered.slice(1).join('\n')
      }
    }
    if (left.length) titlePage.contact = left.join('\n')
  }
  return { titlePage, elements }
}
