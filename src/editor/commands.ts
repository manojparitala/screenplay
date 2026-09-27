import type { Node as PMNode } from 'prosemirror-model'
import { closeHistory } from 'prosemirror-history'
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'
import { nextOnEnter, nextOnTab, prevOnTab } from '../core/elements'
import { uid } from '../core/id'
import type { ElementType, EnterAfterDialogue } from '../core/types'
import { schema } from './schema'

export interface BlockInfo {
  node: PMNode
  /** Position before the block. */
  pos: number
  /** Index among the document's children. */
  index: number
  type: ElementType
}

export function currentBlock(state: EditorState): BlockInfo | null {
  const { $from } = state.selection
  if ($from.depth < 1) return null
  const node = $from.node(1)
  return { node, pos: $from.before(1), index: $from.index(0), type: node.type.name as ElementType }
}

function attrsFor(type: ElementType): Record<string, unknown> | null {
  if (type === 'scene') return { id: uid(), synopsis: '', notes: '', color: null }
  if (type === 'section') return { level: 1 }
  return null
}

/** Put the cursor inside freshly inserted "()" of the block at `blockPos`. */
function fillParens(tr: Transaction, blockPos: number) {
  tr.insertText('()', blockPos + 1)
  tr.setSelection(TextSelection.create(tr.doc, blockPos + 2))
}

/** Change the element type of every block touched by the selection. */
export function setElementType(type: ElementType): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    const target = schema.nodes[type]
    if (!target) return false
    const blocks: { node: PMNode; pos: number }[] = []
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) blocks.push({ node, pos })
      return false
    })
    if (!blocks.some((b) => b.node.type !== target)) return false
    if (dispatch) {
      // A type change is its own undo step, separate from the typing around it.
      const tr = closeHistory(state.tr)
      // Work backwards so earlier positions stay valid.
      for (const { node, pos } of blocks.reverse()) {
        if (node.type === target) continue
        tr.setNodeMarkup(pos, target, attrsFor(type), node.marks)
        if (node.type.name === 'parenthetical' && node.textContent === '()') tr.delete(pos + 1, pos + 3)
        else if (type === 'parenthetical' && node.content.size === 0 && empty) fillParens(tr, pos)
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Enter: create the next logical element (Final Draft style). */
export function enterCommand(getEnterAfterDialogue: () => EnterAfterDialogue): Command {
  return (state, dispatch) => {
    // Each new element starts a new undo step.
    let tr = closeHistory(state.tr)
    if (!state.selection.empty) tr = tr.deleteSelection()
    const $from = tr.selection.$from
    if ($from.depth < 1) return false
    const node = $from.node(1)
    const blockPos = $from.before(1)
    const type = node.type.name as ElementType
    const text = node.textContent
    let offset = $from.parentOffset

    if (node.content.size === 0) {
      // Enter on an empty element changes its type instead of adding blank lines.
      const next: ElementType = type === 'action' ? 'scene' : 'action'
      tr.setNodeMarkup(blockPos, schema.nodes[next], attrsFor(next))
      dispatch?.(tr.scrollIntoView())
      return true
    }

    if (type === 'parenthetical' && text.slice(offset) === ')') offset = node.content.size
    if (type === 'parenthetical' && text === '()') {
      tr.delete(blockPos + 1, blockPos + 3)
      tr.setNodeMarkup(blockPos, schema.nodes.dialogue)
      dispatch?.(tr.scrollIntoView())
      return true
    }

    if (offset === node.content.size) {
      const next = nextOnEnter(type, getEnterAfterDialogue())
      const splitPos = blockPos + 1 + offset
      tr.split(splitPos, 1, [{ type: schema.nodes[next], attrs: attrsFor(next) }])
      // Marks shouldn't leak into the new element.
      tr.setStoredMarks([])
      const newBlockPos = tr.mapping.map(splitPos) - 1
      // The cursor may have been before an automatic ")" — always move into the new element.
      tr.setSelection(TextSelection.create(tr.doc, newBlockPos + 1))
      if (next === 'parenthetical') fillParens(tr, newBlockPos)
    } else if (offset === 0) {
      // Push the element down, leaving an empty one above.
      const aboveType: ElementType = type === 'scene' ? 'action' : type
      tr.insert(blockPos, schema.nodes[aboveType].create(attrsFor(aboveType)))
    } else {
      const attrs = type === 'scene' ? attrsFor('scene') : node.attrs
      tr.split(blockPos + 1 + offset, 1, [{ type: node.type, attrs }])
    }
    dispatch?.(tr.scrollIntoView())
    return true
  }
}

/** Tab: convert the element, or add a parenthetical/dialogue after it. */
export const tabCommand: Command = (state, dispatch) => {
  const block = currentBlock(state)
  if (!block) return false
  const { node, pos, type } = block
  const { $from, empty } = state.selection
  const atEnd = empty && ($from.parentOffset === node.content.size || (type === 'parenthetical' && node.textContent.slice($from.parentOffset) === ')'))
  const hasText = node.content.size > 0

  if (hasText && atEnd && (type === 'dialogue' || type === 'character')) {
    if (dispatch) {
      const tr = closeHistory(state.tr)
      tr.split(pos + 1 + node.content.size, 1, [{ type: schema.nodes.parenthetical }])
      fillParens(tr, pos + node.nodeSize)
      dispatch(tr.scrollIntoView())
    }
    return true
  }
  if (hasText && atEnd && type === 'parenthetical' && node.textContent !== '()') {
    if (dispatch) {
      const tr = closeHistory(state.tr)
      tr.split(pos + 1 + node.content.size, 1, [{ type: schema.nodes.dialogue }])
      tr.setSelection(TextSelection.create(tr.doc, pos + node.nodeSize + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
  return setElementType(nextOnTab(type))(state, dispatch)
}

export const shiftTabCommand: Command = (state, dispatch) => {
  const block = currentBlock(state)
  if (!block) return false
  return setElementType(prevOnTab(block.type))(state, dispatch)
}

/** Backspace inside an empty "()" parenthetical turns it back into dialogue. */
export const backspaceParenthetical: Command = (state, dispatch) => {
  const block = currentBlock(state)
  if (!block || block.type !== 'parenthetical' || block.node.textContent !== '()' || !state.selection.empty) return false
  if (dispatch) {
    const tr = state.tr.delete(block.pos + 1, block.pos + 3)
    tr.setNodeMarkup(block.pos, schema.nodes.dialogue)
    dispatch(tr)
  }
  return true
}

const SCENE_START = /^(int|ext|est|i\/e|int\.?\/ext|ext\.?\/int)\.?$/i

/**
 * Smart typing: "int." + space in an action line becomes a scene heading, and
 * "(" in an empty dialogue line becomes a parenthetical.
 */
export function handleSmartInput(state: EditorState, from: number, to: number, text: string): Transaction | null {
  if (from !== to) return null
  const $from = state.doc.resolve(from)
  if ($from.depth < 1) return null
  const node = $from.node(1)
  const blockPos = $from.before(1)
  if (node.type.name === 'action' && text === ' ' && $from.parentOffset === node.content.size && SCENE_START.test(node.textContent)) {
    const tr = state.tr.insertText(' ', from)
    tr.setNodeMarkup(blockPos, schema.nodes.scene, attrsFor('scene'))
    return tr
  }
  if (node.type.name === 'dialogue' && text === '(' && node.content.size === 0) {
    const tr = state.tr.setNodeMarkup(blockPos, schema.nodes.parenthetical)
    fillParens(tr, blockPos)
    return tr
  }
  if (node.type.name === 'parenthetical' && text === ')' && node.textContent.slice($from.parentOffset) === ')') {
    // Typing the closing paren just steps over the automatic one.
    return state.tr.setSelection(TextSelection.create(state.doc, from + 1))
  }
  return null
}
