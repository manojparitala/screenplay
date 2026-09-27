import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { dropCursor } from 'prosemirror-dropcursor'
import { history, redo, undo, undoDepth, redoDepth } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model'
import { EditorState, TextSelection, type Command, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { analyze, renameCharacterText, renameCue, type ScriptAnalysis } from '../core/analysis'
import { ELEMENT_ORDER, ELEMENTS } from '../core/elements'
import { parseFountain, toFountain } from '../core/fountain'
import { uid } from '../core/id'
import { paginate, type Pagination } from '../core/paginate'
import { parseSceneHeading } from '../core/scene'
import type { ElementType, SceneColor, ScriptElement, ScriptSettings } from '../core/types'
import { autocompletePlugin } from './autocomplete'
import { backspaceParenthetical, currentBlock, enterCommand, handleSmartInput, setElementType, shiftTabCommand, tabCommand } from './commands'
import { docToElements, elementsToDoc, elementsToFragment, nodeToElement } from './convert'
import { layoutKey, layoutPlugin, currentElementPlugin, searchKey, searchPlugin, sceneIdsPlugin, typewriterPlugin, type SearchQuery } from './plugins'
import { schema } from './schema'

export interface SceneRange {
  id: string
  index: number
  from: number
  to: number
}

export interface ControllerOptions {
  getSettings: () => ScriptSettings
}

const insertHardBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
  return true
}

/**
 * Owns the screenplay's editor state. The ProseMirror view attaches and
 * detaches as the user switches views, while undo history and the document
 * live on here — so every view edits the script through the same transactions.
 */
export class ScriptController {
  state: EditorState
  view: EditorView | null = null
  pagination: Pagination
  typewriter = false
  scroller: HTMLElement | null = null

  private listeners = new Set<() => void>()
  private docListeners = new Set<() => void>()
  private layoutTimer: ReturnType<typeof setTimeout> | null = null
  private elementsCache: { doc: PMNode; value: ScriptElement[] } | null = null
  private analysisCache: { doc: PMNode; value: ScriptAnalysis } | null = null
  private pendingReveal: number | null = null
  private opts: ControllerOptions

  constructor(elements: ScriptElement[], opts: ControllerOptions) {
    this.opts = opts
    this.state = this.createState(elementsToDoc(elements))
    this.pagination = this.computeLayout()
    this.state = this.state.apply(this.state.tr.setMeta(layoutKey, this.pagination).setMeta('addToHistory', false))
  }

  private createState(doc: PMNode): EditorState {
    const alt: Record<string, Command> = {}
    for (const type of ELEMENT_ORDER) alt[`Alt-${ELEMENTS[type].shortcut}`] = setElementType(type)
    return EditorState.create({
      doc,
      plugins: [
        sceneIdsPlugin(),
        history({ newGroupDelay: 600 }),
        autocompletePlugin({
          characters: () => this.getAnalysis().characters.map((c) => c.name),
          locations: () => this.getAnalysis().locations.map((l) => l.name),
          times: () => this.getAnalysis().scenes.map((s) => s.parts.time).filter(Boolean),
        }),
        keymap({
          Enter: enterCommand(() => this.opts.getSettings().enterAfterDialogue),
          Tab: tabCommand,
          'Shift-Tab': shiftTabCommand,
          Backspace: backspaceParenthetical,
          'Shift-Enter': insertHardBreak,
          'Mod-z': undo,
          'Shift-Mod-z': redo,
          'Mod-y': redo,
          'Mod-b': toggleMark(schema.marks.bold),
          'Mod-i': toggleMark(schema.marks.italic),
          'Mod-u': toggleMark(schema.marks.underline),
          ...alt,
        }),
        keymap(baseKeymap),
        dropCursor({ color: 'var(--accent)' }),
        layoutPlugin(),
        currentElementPlugin(),
        searchPlugin(),
        typewriterPlugin(
          () => this.typewriter,
          () => this.scroller,
        ),
      ],
    })
  }

  /* ---------------------------------------------------------------- */
  /* Subscriptions                                                     */
  /* ---------------------------------------------------------------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  subscribeDoc = (fn: () => void) => {
    this.docListeners.add(fn)
    return () => {
      this.docListeners.delete(fn)
    }
  }

  private emit(docChanged: boolean) {
    if (docChanged) for (const fn of this.docListeners) fn()
    for (const fn of this.listeners) fn()
  }

  getState = () => this.state
  getDoc = () => this.state.doc
  getPagination = () => this.pagination

  getElements(): ScriptElement[] {
    const doc = this.state.doc
    if (this.elementsCache?.doc !== doc) this.elementsCache = { doc, value: docToElements(doc) }
    return this.elementsCache.value
  }

  getAnalysis(): ScriptAnalysis {
    const doc = this.state.doc
    if (this.analysisCache?.doc !== doc) this.analysisCache = { doc, value: analyze(this.getElements()) }
    return this.analysisCache.value
  }

  /* ---------------------------------------------------------------- */
  /* Transactions                                                      */
  /* ---------------------------------------------------------------- */

  dispatch = (tr: Transaction) => {
    this.state = this.state.apply(tr)
    if (this.view) this.view.updateState(this.state)
    if (tr.docChanged) this.scheduleLayout()
    this.emit(tr.docChanged)
  }

  run(cmd: Command): boolean {
    return cmd(this.state, this.dispatch, this.view ?? undefined)
  }

  private computeLayout(): Pagination {
    const s = this.opts.getSettings()
    return paginate(this.getElements(), { sceneSpacing: s.sceneSpacing, autoContd: s.autoContd })
  }

  private scheduleLayout() {
    if (this.layoutTimer) clearTimeout(this.layoutTimer)
    this.layoutTimer = setTimeout(() => this.relayout(), 250)
  }

  /** Recompute page breaks now (e.g. after a settings change). */
  relayout() {
    if (this.layoutTimer) clearTimeout(this.layoutTimer)
    this.layoutTimer = null
    this.pagination = this.computeLayout()
    this.dispatch(this.state.tr.setMeta(layoutKey, this.pagination).setMeta('addToHistory', false))
  }

  destroy() {
    if (this.layoutTimer) clearTimeout(this.layoutTimer)
    this.detach()
    this.listeners.clear()
    this.docListeners.clear()
  }

  /* ---------------------------------------------------------------- */
  /* View lifecycle                                                    */
  /* ---------------------------------------------------------------- */

  attach(mount: HTMLElement): EditorView {
    this.detach()
    const view = new EditorView(mount, {
      state: this.state,
      dispatchTransaction: this.dispatch,
      attributes: {
        class: 'script-editor',
        spellcheck: 'true',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Screenplay',
      },
      handleTextInput: (v, from, to, text) => {
        const tr = handleSmartInput(v.state, from, to, text)
        if (!tr) return false
        v.dispatch(tr.scrollIntoView())
        return true
      },
      handlePaste: (v, event) => this.handlePaste(v, event),
      clipboardTextSerializer: (slice) => {
        const blocks: PMNode[] = []
        let inline = false
        slice.content.forEach((n) => (n.isBlock ? blocks.push(n) : (inline = true)))
        if (inline || blocks.length <= 1) return slice.content.textBetween(0, slice.content.size, '\n\n', '\n')
        return toFountain(blocks.map(nodeToElement)).trimEnd()
      },
    })
    this.view = view
    if (this.pendingReveal !== null) {
      const idx = this.pendingReveal
      this.pendingReveal = null
      requestAnimationFrame(() => this.revealElement(idx))
    }
    return view
  }

  detach() {
    if (this.view) {
      this.view.destroy()
      this.view = null
    }
  }

  focus() {
    this.view?.focus()
  }

  private handlePaste(view: EditorView, event: ClipboardEvent): boolean {
    const data = event.clipboardData
    if (!data) return false
    const html = data.getData('text/html')
    if (html && /class="el el-/.test(html)) return false // copied from this editor: keep element types
    const text = data.getData('text/plain')
    if (!text || !/\n/.test(text.trim())) return false
    const { elements } = parseFountain(text)
    if (!elements.length) return false
    const nodes = elementsToFragment(elements)
    const block = currentBlock(view.state)
    const tr = view.state.tr
    if (block && block.node.content.size === 0 && view.state.selection.empty) {
      tr.replaceWith(block.pos, block.pos + block.node.nodeSize, nodes)
      tr.setSelection(TextSelection.near(tr.doc.resolve(block.pos + nodes.size - 1), -1))
    } else {
      tr.replaceSelection(new Slice(nodes, 0, 0))
    }
    view.dispatch(tr.scrollIntoView())
    return true
  }

  /* ---------------------------------------------------------------- */
  /* Editing commands used by toolbars and other views                  */
  /* ---------------------------------------------------------------- */

  currentType(): ElementType | null {
    return currentBlock(this.state)?.type ?? null
  }

  currentIndex(): number {
    return currentBlock(this.state)?.index ?? 0
  }

  setType(type: ElementType) {
    this.run(setElementType(type))
    this.focus()
  }

  toggleMark(name: 'bold' | 'italic' | 'underline') {
    this.run(toggleMark(schema.marks[name]))
    this.focus()
  }

  isMarkActive(name: 'bold' | 'italic' | 'underline'): boolean {
    const { from, $from, to, empty } = this.state.selection
    const type = schema.marks[name]
    if (empty) return !!type.isInSet(this.state.storedMarks || $from.marks())
    return this.state.doc.rangeHasMark(from, to, type)
  }

  undo() {
    this.run(undo)
    this.focus()
  }

  redo() {
    this.run(redo)
    this.focus()
  }

  canUndo() {
    return undoDepth(this.state) > 0
  }

  canRedo() {
    return redoDepth(this.state) > 0
  }

  childOffset(index: number): number {
    let pos = 0
    const doc = this.state.doc
    for (let i = 0; i < index && i < doc.childCount; i++) pos += doc.child(i).nodeSize
    return pos
  }

  /** Move the cursor to an element and scroll it to the middle of the screen. */
  revealElement(index: number, atEnd = false) {
    const doc = this.state.doc
    if (index < 0 || index >= doc.childCount) return
    if (!this.view) {
      this.pendingReveal = index
      return
    }
    const start = this.childOffset(index)
    const node = doc.child(index)
    const pos = atEnd ? start + 1 + node.content.size : start + 1
    this.dispatch(this.state.tr.setSelection(TextSelection.create(this.state.doc, pos)))
    const dom = this.view.nodeDOM(start)
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center' })
    this.view.focus()
  }

  revealScene(id: string) {
    const scene = this.getAnalysis().scenes.find((s) => s.id === id)
    if (scene) this.revealElement(scene.index, true)
  }

  sceneRanges(): SceneRange[] {
    const ranges: SceneRange[] = []
    let open: SceneRange | null = null
    let index = 0
    this.state.doc.forEach((node, offset) => {
      if (node.type === schema.nodes.scene || node.type === schema.nodes.section) {
        if (open) open.to = offset
        open = null
        if (node.type === schema.nodes.scene) {
          open = { id: node.attrs.id, index, from: offset, to: this.state.doc.content.size }
          ranges.push(open)
        }
      }
      index++
    })
    return ranges
  }

  private findSceneNode(id: string): { node: PMNode; pos: number } | null {
    let found: { node: PMNode; pos: number } | null = null
    this.state.doc.forEach((node, offset) => {
      if (!found && node.type === schema.nodes.scene && node.attrs.id === id) found = { node, pos: offset }
    })
    return found
  }

  /** Update synopsis / notes / colour of a scene (not part of undo history). */
  setSceneAttrs(id: string, attrs: Partial<{ synopsis: string; notes: string; color: SceneColor | null }>) {
    const found = this.findSceneNode(id)
    if (!found) return
    const tr = this.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...attrs })
    tr.setMeta('addToHistory', false)
    this.dispatch(tr)
  }

  setSceneHeading(id: string, heading: string) {
    const found = this.findSceneNode(id)
    if (!found) return
    const { pos, node } = found
    const tr = this.state.tr.replaceWith(pos + 1, pos + 1 + node.content.size, heading ? schema.text(heading) : Fragment.empty)
    this.dispatch(tr)
  }

  /**
   * Move a scene (heading and everything up to the next scene or section)
   * so it starts before the element at `beforeIndex` (or at the end).
   */
  moveScene(id: string, beforeIndex: number | null) {
    const src = this.sceneRanges().find((r) => r.id === id)
    if (!src) return
    const doc = this.state.doc
    const target = beforeIndex === null || beforeIndex >= doc.childCount ? doc.content.size : this.childOffset(beforeIndex)
    if (target >= src.from && target <= src.to) return
    const slice = doc.slice(src.from, src.to)
    const tr = this.state.tr.delete(src.from, src.to)
    const at = tr.mapping.map(target, target === doc.content.size ? 1 : -1)
    tr.insert(at, slice.content)
    this.dispatch(tr)
  }

  /** Insert a new scene after `afterId` (or at the end). Returns its id. */
  insertScene(afterId: string | null, heading = '', synopsis = ''): string {
    const id = uid()
    const ranges = this.sceneRanges()
    const after = afterId ? ranges.find((r) => r.id === afterId) : null
    const at = after ? after.to : this.state.doc.content.size
    const nodes = [
      schema.nodes.scene.create({ id, synopsis, notes: '', color: null }, heading ? schema.text(heading) : null),
      schema.nodes.action.create(),
    ]
    this.dispatch(this.state.tr.insert(at, nodes))
    return id
  }

  deleteScene(id: string) {
    const src = this.sceneRanges().find((r) => r.id === id)
    if (!src) return
    const tr = this.state.tr.delete(src.from, src.to)
    if (tr.doc.childCount === 0) tr.insert(0, schema.nodes.scene.create())
    this.dispatch(tr)
  }

  /** Rename a character in cues (and optionally in all other text). Returns the number of changes. */
  renameCharacter(from: string, to: string, inText: boolean): number {
    const name = from.toUpperCase()
    const tr = this.state.tr
    let changes = 0
    this.state.doc.forEach((node, offset) => {
      const type = node.type.name
      if (type === 'character') {
        const cue = node.textContent
        const next = renameCue(cue, name, to)
        if (next !== null && next !== cue) {
          const s = tr.mapping.map(offset + 1)
          const e = tr.mapping.map(offset + 1 + node.content.size)
          tr.replaceWith(s, e, schema.text(next))
          changes++
        }
        return
      }
      if (!inText || !['action', 'dialogue', 'parenthetical', 'shot', 'centered'].includes(type)) return
      node.forEach((child, childOffset) => {
        if (!child.isText || !child.text) return
        const next = renameCharacterText(child.text, from, to)
        if (next === child.text) return
        const s = tr.mapping.map(offset + 1 + childOffset)
        const e = tr.mapping.map(offset + 1 + childOffset + child.nodeSize)
        tr.replaceWith(s, e, schema.text(next, child.marks))
        changes++
      })
    })
    if (changes) this.dispatch(tr)
    return changes
  }

  /** Rename a location in every scene heading. Returns the number of headings changed. */
  renameLocation(from: string, to: string): number {
    const tr = this.state.tr
    let changes = 0
    this.state.doc.forEach((node, offset) => {
      if (node.type !== schema.nodes.scene) return
      const parts = parseSceneHeading(node.textContent)
      if (parts.location !== from.toUpperCase()) return
      const heading = [parts.prefix, to.toUpperCase()].filter(Boolean).join(' ') + (parts.time ? ` - ${parts.time}` : '')
      const s = tr.mapping.map(offset + 1)
      const e = tr.mapping.map(offset + 1 + node.content.size)
      tr.replaceWith(s, e, schema.text(heading))
      changes++
    })
    if (changes) this.dispatch(tr)
    return changes
  }

  /** Replace the whole script (undoable). */
  replaceScript(elements: ScriptElement[]) {
    const doc = elementsToDoc(elements)
    const tr = this.state.tr.replaceWith(0, this.state.doc.content.size, doc.content)
    tr.setSelection(TextSelection.atStart(tr.doc))
    this.dispatch(tr)
  }

  /* ---------------------------------------------------------------- */
  /* Find & replace                                                    */
  /* ---------------------------------------------------------------- */

  getSearch() {
    return searchKey.getState(this.state)!
  }

  setSearch(query: SearchQuery) {
    this.dispatch(this.state.tr.setMeta(searchKey, { query }).setMeta('addToHistory', false))
  }

  /** Select the next (dir = 1) or previous (dir = -1) match. */
  findNext(dir: 1 | -1 = 1) {
    const { matches, current } = this.getSearch()
    if (!matches.length) return
    let index: number
    if (current >= 0) index = (current + dir + matches.length) % matches.length
    else {
      const head = this.state.selection.from
      index = dir === 1 ? matches.findIndex((m) => m.from >= head) : matches.findLastIndex((m) => m.to <= head)
      if (index === -1) index = dir === 1 ? 0 : matches.length - 1
    }
    this.selectMatch(index)
  }

  private selectMatch(index: number) {
    const m = this.getSearch().matches[index]
    if (!m) return
    const tr = this.state.tr.setSelection(TextSelection.create(this.state.doc, m.from, m.to)).setMeta(searchKey, { current: index })
    this.dispatch(tr.scrollIntoView())
    if (this.view) {
      const { node } = this.view.domAtPos(m.from)
      const el = node instanceof HTMLElement ? node : node.parentElement
      el?.scrollIntoView({ block: 'center' })
    }
  }

  replaceCurrent(replacement: string) {
    const { matches, current } = this.getSearch()
    const m = matches[current]
    if (!m) {
      this.findNext(1)
      return
    }
    this.dispatch(this.state.tr.insertText(replacement, m.from, m.to))
    const next = this.getSearch().matches
    if (next.length) this.selectMatch(Math.min(current, next.length - 1))
  }

  replaceAll(replacement: string): number {
    const { matches } = this.getSearch()
    if (!matches.length) return 0
    const tr = this.state.tr
    for (let i = matches.length - 1; i >= 0; i--) tr.insertText(replacement, matches[i].from, matches[i].to)
    this.dispatch(tr)
    return matches.length
  }
}
