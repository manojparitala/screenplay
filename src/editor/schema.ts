import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { ELEMENT_ORDER } from '../core/elements'
import type { ElementType } from '../core/types'

function blockSpec(type: ElementType): NodeSpec {
  const attrs: NodeSpec['attrs'] =
    type === 'scene'
      ? { id: { default: null }, synopsis: { default: '' }, notes: { default: '' }, color: { default: null } }
      : type === 'section'
        ? { level: { default: 1 } }
        : undefined
  return {
    group: 'element',
    content: 'inline*',
    defining: true,
    attrs,
    parseDOM: [
      {
        tag: `p.el-${type}`,
        getAttrs: (dom) => {
          const el = dom as HTMLElement
          if (type === 'scene') {
            return {
              id: el.getAttribute('data-scene-id'),
              synopsis: el.getAttribute('data-synopsis') ?? '',
              notes: el.getAttribute('data-notes') ?? '',
              color: el.getAttribute('data-color'),
            }
          }
          if (type === 'section') return { level: Number(el.getAttribute('data-level')) || 1 }
          return {}
        },
      },
    ],
    toDOM: (node) => {
      const a: Record<string, string> = { class: `el el-${type}` }
      if (type === 'scene') {
        if (node.attrs.id) a['data-scene-id'] = node.attrs.id
        if (node.attrs.color) a['data-color'] = node.attrs.color
        if (node.attrs.synopsis) a['data-synopsis'] = node.attrs.synopsis
        if (node.attrs.notes) a['data-notes'] = node.attrs.notes
      }
      if (type === 'section') a['data-level'] = String(node.attrs.level)
      return ['p', a, 0]
    },
  }
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'element+' },
}
for (const type of ELEMENT_ORDER) nodes[type] = blockSpec(type)
// Generic fallbacks for pasted HTML (lower priority than the class-based rules above).
nodes.action = {
  ...nodes.action,
  parseDOM: [
    ...(nodes.action.parseDOM ?? []),
    { tag: 'p', priority: 10 },
    { tag: 'div', priority: 10 },
    { tag: 'li', priority: 10 },
    { tag: 'blockquote', priority: 10 },
  ],
}
nodes.scene = {
  ...nodes.scene,
  parseDOM: [...(nodes.scene.parseDOM ?? []), { tag: 'h1', priority: 10 }, { tag: 'h2', priority: 10 }, { tag: 'h3', priority: 10 }],
}
nodes.text = { group: 'inline' }
nodes.hard_break = {
  inline: true,
  group: 'inline',
  selectable: false,
  parseDOM: [{ tag: 'br' }],
  toDOM: () => ['br'],
  leafText: () => '\n',
}

const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node) => (node as HTMLElement).style.fontWeight !== 'normal' && null },
      { style: 'font-weight=bold' },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[6-9]\d{2,})$/.test(value as string) && null },
    ],
    toDOM: () => ['strong', 0],
  },
  italic: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }, { style: 'text-decoration-line=underline' }],
    toDOM: () => ['u', 0],
  },
}

export const schema = new Schema({ nodes, marks })

export function isElementType(name: string): name is ElementType {
  return (ELEMENT_ORDER as string[]).includes(name)
}
