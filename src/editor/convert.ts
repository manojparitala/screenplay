import { Fragment, type Mark, type Node as PMNode } from 'prosemirror-model'
import { normalizeRuns } from '../core/text'
import type { ScriptElement, TextRun } from '../core/types'
import { isElementType, schema } from './schema'

function runFromMarks(text: string, marks: readonly Mark[]): TextRun {
  const r: TextRun = { text }
  for (const m of marks) {
    if (m.type.name === 'bold') r.bold = true
    else if (m.type.name === 'italic') r.italic = true
    else if (m.type.name === 'underline') r.underline = true
  }
  return r
}

export function nodeToElement(node: PMNode): ScriptElement {
  const type = isElementType(node.type.name) ? node.type.name : 'action'
  const runs: TextRun[] = []
  node.forEach((child) => {
    if (child.isText) runs.push(runFromMarks(child.text ?? '', child.marks))
    else if (child.type.name === 'hard_break') runs.push(runFromMarks('\n', child.marks))
  })
  const el: ScriptElement = { type, runs: normalizeRuns(runs) }
  if (type === 'scene') {
    el.id = node.attrs.id ?? undefined
    if (node.attrs.synopsis) el.synopsis = node.attrs.synopsis
    if (node.attrs.notes) el.notes = node.attrs.notes
    if (node.attrs.color) el.color = node.attrs.color
  }
  if (type === 'section') el.level = node.attrs.level ?? 1
  return el
}

export function docToElements(doc: PMNode): ScriptElement[] {
  const out: ScriptElement[] = []
  doc.forEach((node) => out.push(nodeToElement(node)))
  return out
}

function runsToInline(runs: TextRun[]): PMNode[] {
  const out: PMNode[] = []
  for (const r of runs) {
    const marks: Mark[] = []
    if (r.bold) marks.push(schema.marks.bold.create())
    if (r.italic) marks.push(schema.marks.italic.create())
    if (r.underline) marks.push(schema.marks.underline.create())
    const parts = r.text.split('\n')
    parts.forEach((part, k) => {
      if (k > 0) out.push(schema.nodes.hard_break.create(null, null, marks))
      if (part) out.push(schema.text(part, marks))
    })
  }
  return out
}

export function elementToNode(el: ScriptElement): PMNode {
  const type = schema.nodes[el.type] ?? schema.nodes.action
  let attrs: Record<string, unknown> | null = null
  if (el.type === 'scene') attrs = { id: el.id ?? null, synopsis: el.synopsis ?? '', notes: el.notes ?? '', color: el.color ?? null }
  if (el.type === 'section') attrs = { level: el.level ?? 1 }
  return type.create(attrs, runsToInline(el.runs))
}

export function elementsToFragment(elements: ScriptElement[]): Fragment {
  return Fragment.from(elements.map(elementToNode))
}

export function elementsToDoc(elements: ScriptElement[]): PMNode {
  const nodes = elements.map(elementToNode)
  if (!nodes.length) nodes.push(schema.nodes.scene.create())
  return schema.nodes.doc.create(null, nodes)
}
