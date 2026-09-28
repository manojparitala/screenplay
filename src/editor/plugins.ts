import type { Node as PMNode } from 'prosemirror-model'
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import { ELEMENTS } from '../core/elements'
import { uid } from '../core/id'
import type { Pagination } from '../core/paginate'
import type { ElementType } from '../core/types'
import { schema } from './schema'

/* ------------------------------------------------------------------ */
/* Unique scene ids                                                    */
/* ------------------------------------------------------------------ */

/** Gives every scene heading a unique id (new, split and pasted headings included). */
export function sceneIdsPlugin(): Plugin {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((tr) => tr.docChanged)) return null
      const seen = new Set<string>()
      let tr: Transaction | null = null
      state.doc.forEach((node, offset) => {
        if (node.type !== schema.nodes.scene) return
        let id = node.attrs.id as string | null
        if (!id || seen.has(id)) {
          id = uid()
          tr = tr ?? state.tr
          tr.setNodeMarkup(offset, undefined, { ...node.attrs, id })
        }
        seen.add(id)
      })
      return tr
    },
  })
}

/* ------------------------------------------------------------------ */
/* Page breaks and automatic (CONT'D)                                  */
/* ------------------------------------------------------------------ */

export const layoutKey = new PluginKey<DecorationSet>('layout')

function childOffsets(doc: PMNode): number[] {
  const offsets: number[] = []
  doc.forEach((_n, offset) => offsets.push(offset))
  return offsets
}

function pageBreakWidget(page: number, inline: boolean, more?: string): HTMLElement {
  const el = document.createElement(inline ? 'span' : 'div')
  el.className = 'page-break' + (inline ? ' page-break-inline' : '')
  el.contentEditable = 'false'
  el.setAttribute('aria-hidden', 'true')
  if (more) {
    const m = document.createElement('span')
    m.className = 'page-break-more'
    m.textContent = more
    el.appendChild(m)
  }
  const label = document.createElement('span')
  label.className = 'page-break-label'
  label.textContent = `${page}.`
  el.appendChild(label)
  return el
}

function contdWidget(): HTMLElement {
  const el = document.createElement('span')
  el.className = 'auto-contd'
  el.textContent = " (CONT'D)"
  el.contentEditable = 'false'
  return el
}

export function buildLayoutDecorations(doc: PMNode, layout: Pagination): DecorationSet {
  const offsets = childOffsets(doc)
  const decos: Decoration[] = []
  for (const br of layout.breaks) {
    const start = offsets[br.elementIndex]
    if (start === undefined) continue
    const node = doc.child(br.elementIndex)
    if (br.offset <= 0) {
      decos.push(Decoration.widget(start, () => pageBreakWidget(br.page, false), { side: -1, key: `pb-${br.page}-b`, ignoreSelection: true }))
    } else {
      const pos = Math.min(start + 1 + br.offset, start + 1 + node.content.size)
      decos.push(
        Decoration.widget(pos, () => pageBreakWidget(br.page, true, "(MORE) / (CONT'D)"), {
          side: -1,
          key: `pb-${br.page}-i-${br.offset}`,
          ignoreSelection: true,
          marks: [],
        }),
      )
    }
  }
  for (const idx of layout.contd) {
    const start = offsets[idx]
    if (start === undefined) continue
    const node = doc.child(idx)
    decos.push(Decoration.widget(start + 1 + node.content.size, contdWidget, { side: 1, key: 'contd', marks: [], ignoreSelection: true }))
  }
  return DecorationSet.create(doc, decos)
}

export function layoutPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: layoutKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const layout = tr.getMeta(layoutKey) as Pagination | undefined
        if (layout) return buildLayoutDecorations(tr.doc, layout)
        return tr.docChanged ? set.map(tr.mapping, tr.doc) : set
      },
    },
    props: {
      decorations(state) {
        return layoutKey.getState(state)
      },
    },
  })
}

/* ------------------------------------------------------------------ */
/* Current element: placeholder text when empty, highlight in focus mode */
/* ------------------------------------------------------------------ */

export function currentElementPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { $from } = state.selection
        if ($from.depth < 1) return null
        const node = $from.node(1)
        const pos = $from.before(1)
        const attrs: Record<string, string> = { class: 'is-current' }
        if (node.content.size === 0) {
          attrs.class += ' is-empty'
          attrs['data-placeholder'] = ELEMENTS[node.type.name as ElementType]?.label ?? ''
        }
        return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, attrs)])
      },
    },
  })
}

/* ------------------------------------------------------------------ */
/* Find & replace                                                      */
/* ------------------------------------------------------------------ */

export interface SearchQuery {
  text: string
  caseSensitive: boolean
  wholeWord: boolean
}

export interface SearchState {
  query: SearchQuery
  matches: { from: number; to: number }[]
  current: number
  decorations: DecorationSet
}

export const searchKey = new PluginKey<SearchState>('search')

const EMPTY_QUERY: SearchQuery = { text: '', caseSensitive: false, wholeWord: false }

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findMatches(doc: PMNode, query: SearchQuery): { from: number; to: number }[] {
  if (!query.text) return []
  let source = escapeRegExp(query.text)
  if (query.wholeWord) source = `(?<![\\p{L}\\p{M}\\p{N}_])${source}(?![\\p{L}\\p{M}\\p{N}_])`
  const re = new RegExp(source, query.caseSensitive ? 'gu' : 'giu')
  const out: { from: number; to: number }[] = []
  doc.forEach((node, offset) => {
    const text = node.textBetween(0, node.content.size, undefined, '\n')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (!m[0].length) {
        re.lastIndex++
        continue
      }
      out.push({ from: offset + 1 + m.index, to: offset + 1 + m.index + m[0].length })
    }
  })
  return out
}

function searchDecorations(doc: PMNode, matches: { from: number; to: number }[], current: number): DecorationSet {
  if (!matches.length) return DecorationSet.empty
  return DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'search-match search-current' : 'search-match' })),
  )
}

export function searchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => ({ query: EMPTY_QUERY, matches: [], current: -1, decorations: DecorationSet.empty }),
      apply(tr, prev) {
        const meta = tr.getMeta(searchKey) as { query?: SearchQuery; current?: number } | undefined
        if (!meta && !tr.docChanged) return prev
        const query = meta?.query ?? prev.query
        const matches = meta?.query || tr.docChanged ? findMatches(tr.doc, query) : prev.matches
        let current = meta?.current ?? (meta?.query ? -1 : prev.current)
        if (current >= matches.length) current = matches.length - 1
        return { query, matches, current, decorations: searchDecorations(tr.doc, matches, current) }
      },
    },
    props: {
      decorations(state) {
        return searchKey.getState(state)?.decorations
      },
    },
  })
}

/* ------------------------------------------------------------------ */
/* Typewriter scrolling                                                */
/* ------------------------------------------------------------------ */

export function typewriterPlugin(enabled: () => boolean, scroller: () => HTMLElement | null): Plugin {
  return new Plugin({
    view() {
      return {
        update(view: EditorView, prev: EditorState) {
          if (!enabled() || !view.hasFocus()) return
          if (prev.doc === view.state.doc && prev.selection.eq(view.state.selection)) return
          const container = scroller()
          if (!container) return
          const coords = view.coordsAtPos(view.state.selection.head)
          const box = container.getBoundingClientRect()
          const target = box.top + box.height * 0.42
          const delta = coords.top - target
          if (Math.abs(delta) > 4) container.scrollBy({ top: delta })
        },
      }
    },
  })
}
