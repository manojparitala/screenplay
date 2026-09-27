import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { CHARACTER_EXTENSIONS, SCENE_PREFIXES, TIMES_OF_DAY, TRANSITIONS } from '../core/elements'

export interface Suggestion {
  label: string
  /** Text inserted in place of [from, to). */
  insert: string
  from: number
  to: number
  hint?: string
}

export interface AutocompleteSources {
  characters: () => string[]
  locations: () => string[]
  times: () => string[]
}

interface ACState {
  items: Suggestion[]
  index: number
  dismissed: boolean
}

export const autocompleteKey = new PluginKey<ACState>('autocomplete')

const MAX_ITEMS = 8
const PREFIX_RE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|EST\.|I\/E\.?)\s+/

function startsWithCI(candidate: string, typed: string): boolean {
  return candidate.toUpperCase().startsWith(typed.toUpperCase()) && candidate.toUpperCase() !== typed.toUpperCase()
}

function unique(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of list) {
    const k = s.toUpperCase()
    if (!s || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

export function computeSuggestions(state: EditorState, sources: AutocompleteSources): Suggestion[] {
  const { selection } = state
  if (!selection.empty) return []
  const $from = selection.$from
  if ($from.depth < 1) return []
  const node = $from.node(1)
  if ($from.parentOffset !== node.content.size) return []
  const start = $from.start(1)
  const end = start + node.content.size
  const text = node.textContent
  const upper = text.toUpperCase()

  switch (node.type.name) {
    case 'scene': {
      const m = upper.match(PREFIX_RE)
      if (!m) {
        if (/\s/.test(upper)) return []
        return SCENE_PREFIXES.filter((p) => startsWithCI(p, upper)).map((p) => ({ label: p, insert: p + ' ', from: start, to: end }))
      }
      const rest = upper.slice(m[0].length)
      const restStart = start + m[0].length
      const out: Suggestion[] = []
      for (const loc of unique(sources.locations())) {
        if (startsWithCI(loc, rest)) out.push({ label: loc, insert: loc + ' - ', from: restStart, to: end, hint: 'location' })
      }
      const dash = rest.lastIndexOf(' - ')
      if (dash !== -1) {
        const tail = rest.slice(dash + 3)
        const tailStart = restStart + dash + 3
        for (const t of unique([...TIMES_OF_DAY, ...sources.times()])) {
          if (startsWithCI(t, tail)) out.push({ label: t, insert: t, from: tailStart, to: end, hint: 'time' })
        }
      }
      return out.slice(0, MAX_ITEMS)
    }
    case 'character': {
      const paren = upper.lastIndexOf('(')
      if (paren !== -1 && !upper.slice(paren).includes(')')) {
        const typed = upper.slice(paren + 1)
        return CHARACTER_EXTENSIONS.filter((e) => startsWithCI(e, typed)).map((e) => ({
          label: `(${e})`,
          insert: e + ')',
          from: start + paren + 1,
          to: end,
        }))
      }
      return unique(sources.characters())
        .filter((c) => startsWithCI(c, upper))
        .slice(0, MAX_ITEMS)
        .map((c) => ({ label: c, insert: c, from: start, to: end }))
    }
    case 'transition':
      return TRANSITIONS.filter((t) => startsWithCI(t, upper)).map((t) => ({ label: t, insert: t, from: start, to: end }))
    default:
      return []
  }
}

export function acceptSuggestion(view: EditorView, s: Suggestion) {
  const tr = view.state.tr.insertText(s.insert, s.from, s.to)
  tr.setSelection(TextSelection.create(tr.doc, s.from + s.insert.length))
  view.dispatch(tr.scrollIntoView())
}

function setIndex(view: EditorView, index: number) {
  view.dispatch(view.state.tr.setMeta(autocompleteKey, { index }))
}

function emptyBlock(state: EditorState): boolean {
  const $from = state.selection.$from
  return $from.depth >= 1 && $from.node(1).content.size === 0
}

export function autocompletePlugin(sources: AutocompleteSources): Plugin<ACState> {
  // In an empty element the list is only a hint: nothing is selected, so Enter
  // and Tab keep their usual meaning until the writer types or presses ↓.
  const fresh = (state: EditorState): ACState => ({
    items: computeSuggestions(state, sources),
    index: emptyBlock(state) ? -1 : 0,
    dismissed: false,
  })
  return new Plugin<ACState>({
    key: autocompleteKey,
    state: {
      init: () => ({ items: [], index: 0, dismissed: false }),
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(autocompleteKey) as { index?: number; dismiss?: boolean; open?: boolean } | undefined
        if (meta?.dismiss) return { items: [], index: 0, dismissed: true }
        if (meta?.index !== undefined) return { ...prev, index: meta.index }
        if (meta?.open) return fresh(state)
        if (tr.docChanged && tr.getMeta('addToHistory') !== false) return fresh(state)
        if (tr.selectionSet && !prev.items.length && !prev.dismissed && emptyBlock(state)) {
          // Moving into an empty heading or cue offers suggestions straight away.
          return fresh(state)
        }
        if (tr.selectionSet && prev.items.length) {
          // Keep the list only while the cursor stays at the end of the same element.
          const items = computeSuggestions(state, sources)
          return { items, index: Math.min(prev.index, items.length - 1), dismissed: prev.dismissed }
        }
        return prev
      },
    },
    props: {
      handleKeyDown(view, event) {
        const st = autocompleteKey.getState(view.state)
        if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
          view.dispatch(view.state.tr.setMeta(autocompleteKey, { open: true }))
          return true
        }
        if (!st || !st.items.length || st.dismissed) return false
        if (event.key === 'ArrowDown') {
          setIndex(view, (st.index + 1) % st.items.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setIndex(view, st.index <= 0 ? st.items.length - 1 : st.index - 1)
          return true
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && st.index >= 0 && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          acceptSuggestion(view, st.items[st.index])
          return true
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          view.dispatch(view.state.tr.setMeta(autocompleteKey, { dismiss: true }))
          return true
        }
        return false
      },
    },
    view(view) {
      const menu = document.createElement('div')
      menu.className = 'ac-menu'
      menu.setAttribute('role', 'listbox')
      menu.style.display = 'none'
      document.body.appendChild(menu)
      let lastItems: Suggestion[] | null = null
      let lastIndex = -1

      const render = (v: EditorView) => {
        const st = autocompleteKey.getState(v.state)
        if (!st || !st.items.length || st.dismissed || !v.hasFocus()) {
          if (menu.style.display !== 'none') {
            menu.style.display = 'none'
            menu.replaceChildren()
          }
          lastItems = null
          return
        }
        if (st.items !== lastItems || st.index !== lastIndex) {
          menu.replaceChildren(
            ...st.items.map((item, i) => {
              const row = document.createElement('div')
              row.className = 'ac-item' + (i === st.index ? ' active' : '')
              row.setAttribute('role', 'option')
              row.setAttribute('aria-selected', String(i === st.index))
              const label = document.createElement('span')
              label.textContent = item.label
              row.appendChild(label)
              if (item.hint) {
                const hint = document.createElement('small')
                hint.textContent = item.hint
                row.appendChild(hint)
              }
              row.addEventListener('mousedown', (e) => {
                e.preventDefault()
                acceptSuggestion(v, item)
              })
              return row
            }),
          )
          lastItems = st.items
          lastIndex = st.index
        }
        const coords = v.coordsAtPos(st.items[0].from)
        menu.style.display = 'block'
        const top = coords.bottom + 4
        const maxLeft = window.innerWidth - menu.offsetWidth - 8
        menu.style.left = `${Math.max(8, Math.min(coords.left, maxLeft))}px`
        const below = top + menu.offsetHeight < window.innerHeight
        menu.style.top = below ? `${top}px` : `${Math.max(8, coords.top - menu.offsetHeight - 4)}px`
      }

      const onBlur = () => (menu.style.display = 'none')
      const onFocus = () => {
        const st = autocompleteKey.getState(view.state)
        const $from = view.state.selection.$from
        if (st && !st.items.length && !st.dismissed && $from.depth >= 1 && $from.node(1).content.size === 0) {
          view.dispatch(view.state.tr.setMeta(autocompleteKey, { open: true }))
        } else render(view)
      }
      view.dom.addEventListener('focus', onFocus)
      const onScroll = () => {
        if (menu.style.display !== 'none') render(view)
      }
      view.dom.addEventListener('blur', onBlur)
      window.addEventListener('scroll', onScroll, true)
      return {
        update: render,
        destroy() {
          view.dom.removeEventListener('blur', onBlur)
          view.dom.removeEventListener('focus', onFocus)
          window.removeEventListener('scroll', onScroll, true)
          menu.remove()
        },
      }
    },
  })
}
