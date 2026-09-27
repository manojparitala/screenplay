import { describe, expect, it } from 'vitest'
import { parseFountain } from '../core/fountain'
import { SAMPLE_FOUNTAIN } from '../core/sample'
import { docToElements, elementsToDoc } from './convert'

describe('document conversion', () => {
  it('round-trips elements through a ProseMirror document', () => {
    const { elements } = parseFountain(SAMPLE_FOUNTAIN + '\nLine one\nline *two*\n')
    const doc = elementsToDoc(elements)
    expect(doc.childCount).toBe(elements.length)
    expect(docToElements(doc)).toEqual(elements)
  })

  it('creates an empty scene heading for an empty script', () => {
    const doc = elementsToDoc([])
    expect(doc.firstChild?.type.name).toBe('scene')
  })
})
