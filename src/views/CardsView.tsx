import { FileText, GripVertical, Palette, Plus, Trash, Users } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import type { SceneInfo } from '../core/analysis'
import { formatEighths, toEighths } from '../core/paginate'
import { SCENE_COLORS, type SceneColor } from '../core/types'
import { colorVar, ColorPicker, LazyTextarea, Menu, Modal } from '../components/ui'
import { useApp } from '../store/app'
import { useAnalysis, useController, usePagination } from '../store/hooks'

type Size = 'small' | 'medium' | 'large'
const SIZES: Record<Size, string> = { small: '190px', medium: '250px', large: '330px' }

export function CardsView() {
  const c = useController()
  const analysis = useAnalysis()
  const pagination = usePagination()
  const setView = useApp((s) => s.setView)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<number | 'end' | null>(null)
  // The card being dragged, read by the drag events themselves: state may not have
  // re-rendered yet when a quick drag's next event arrives. State only draws the highlight.
  const dragging = useRef<string | null>(null)
  const [size, setSize] = useState<Size>('medium')
  const [colorFilter, setColorFilter] = useState<SceneColor | 'all'>('all')
  const [confirm, setConfirm] = useState<SceneInfo | null>(null)

  const scenes = analysis.scenes
  const visible = scenes.filter((s) => colorFilter === 'all' || s.color === colorFilter)
  const filtering = colorFilter !== 'all'

  const lengthOf = (s: SceneInfo) => {
    const l = pagination.scenes.find((x) => x.elementIndex === s.index)
    return l ? formatEighths(toEighths(l.lines, pagination.linesPerPage)) : '–'
  }

  const openInScript = (id: string) => {
    setView('script')
    setTimeout(() => c.revealScene(id), 0)
  }

  const startDrag = (id: string) => {
    dragging.current = id
    setDragId(id)
  }

  const endDrag = () => {
    dragging.current = null
    setDragId(null)
    setDropBefore(null)
  }

  const onDragOver = (e: DragEvent, target: number | 'end') => {
    if (!dragging.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropBefore(target)
  }

  /** Drop the dragged card before the card, divider or end marker it was dropped on. */
  const onDrop = (e: DragEvent, target: number | 'end') => {
    e.preventDefault()
    const id = dragging.current
    endDrag()
    if (id) c.moveScene(id, target === 'end' ? null : target)
  }

  // Interleave act/sequence dividers with the scene cards.
  const items: ({ kind: 'section'; index: number; title: string } | { kind: 'scene'; scene: SceneInfo })[] = []
  let si = 0
  for (const sec of analysis.sections) {
    while (si < visible.length && visible[si].index < sec.index) items.push({ kind: 'scene', scene: visible[si++] })
    if (!filtering) items.push({ kind: 'section', index: sec.index, title: sec.title })
  }
  while (si < visible.length) items.push({ kind: 'scene', scene: visible[si++] })

  return (
    <div className="view-scroll">
      <div className="view-inner" style={{ maxWidth: 1400 }}>
        <div className="view-header">
          <div>
            <h1>Index cards</h1>
            <p>Drag cards to reorder scenes in the script. Edit headings and synopses right on the card.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="segmented" role="radiogroup" aria-label="Filter by colour">
              <button className={colorFilter === 'all' ? 'active' : ''} onClick={() => setColorFilter('all')}>
                All
              </button>
              {SCENE_COLORS.filter((col) => scenes.some((s) => s.color === col)).map((col) => (
                <button key={col} className={colorFilter === col ? 'active' : ''} onClick={() => setColorFilter(col)} aria-label={`Only ${col} cards`} title={col}>
                  <span className="color-dot" style={{ ['--dot' as string]: `var(--c-${col})` }} />
                </button>
              ))}
            </div>
            <div className="segmented" role="radiogroup" aria-label="Card size">
              {(['small', 'medium', 'large'] as Size[]).map((s) => (
                <button key={s} className={size === s ? 'active' : ''} onClick={() => setSize(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn primary" onClick={() => c.insertScene(null, 'INT. ')}>
              <Plus size={16} /> Add scene
            </button>
          </div>
        </div>

        {scenes.length === 0 ? (
          <div className="empty-state">
            <h3>No scenes yet</h3>
            <p>Add a card to start outlining, or write a scene heading in the script.</p>
            <button className="btn primary" onClick={() => c.insertScene(null, 'INT. ')}>
              <Plus size={16} /> Add first scene
            </button>
          </div>
        ) : (
          <div className="cards-grid" style={{ ['--card-min' as string]: SIZES[size] }} onDragEnd={endDrag}>
            {items.map((it) =>
              it.kind === 'section' ? (
                <div key={`sec-${it.index}`} className="cards-section" onDragOver={(e) => onDragOver(e, it.index)} onDrop={(e) => onDrop(e, it.index)}>
                  {it.title || 'Section'}
                </div>
              ) : (
                <article
                  key={it.scene.id}
                  className={`index-card${dragId === it.scene.id ? ' dragging' : ''}${dropBefore === it.scene.index && dragId !== it.scene.id ? ' drop-before' : ''}`}
                  style={{ ['--dot' as string]: colorVar(it.scene.color) }}
                  onDragOver={(e) => onDragOver(e, it.scene.index)}
                  onDrop={(e) => onDrop(e, it.scene.index)}
                  aria-label={`Scene ${it.scene.number}`}
                >
                  <div className="index-card-head">
                    <span
                      className="grip"
                      draggable={!filtering}
                      onDragStart={(e) => {
                        startDrag(it.scene.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', it.scene.heading)
                        const card = (e.currentTarget as HTMLElement).closest('.index-card')
                        if (card) e.dataTransfer.setDragImage(card, 20, 20)
                      }}
                      title={filtering ? 'Show all cards to reorder' : 'Drag to reorder'}
                      aria-hidden="true"
                    >
                      <GripVertical size={16} />
                    </span>
                    <span className="num">{it.scene.number}</span>
                    <LazyTextarea
                      className="heading-input"
                      rows={2}
                      value={it.scene.heading}
                      placeholder="INT. LOCATION - DAY"
                      aria-label={`Scene ${it.scene.number} heading`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          e.currentTarget.blur()
                        }
                      }}
                      onCommit={(v) => c.setSceneHeading(it.scene.id, v.replace(/\s*\n\s*/g, ' ').toUpperCase())}
                    />
                  </div>
                  <LazyTextarea
                    value={it.scene.synopsis}
                    placeholder="What happens in this scene?"
                    aria-label={`Scene ${it.scene.number} synopsis`}
                    onCommit={(v) => c.setSceneAttrs(it.scene.id, { synopsis: v })}
                  />
                  <div className="index-card-foot">
                    <span title="Page">p{pagination.elementPage[it.scene.index] ?? 1}</span>
                    <span>·</span>
                    <span title="Length in eighths of a page">{lengthOf(it.scene)} pg</span>
                    {it.scene.characters.length > 0 && (
                      <span className="pill" title={`Speaking: ${it.scene.characters.join(', ')}`}>
                        <Users size={12} /> {it.scene.characters.length}
                      </span>
                    )}
                    <span className="grow" />
                    <Menu
                      trigger={(_o, toggle) => (
                        <button className="icon-btn small" onClick={toggle} aria-label="Card colour" title="Card colour">
                          <Palette size={15} />
                        </button>
                      )}
                    >
                      {(close) => (
                        <div style={{ padding: 6 }}>
                          <ColorPicker
                            value={it.scene.color}
                            onChange={(color) => {
                              c.setSceneAttrs(it.scene.id, { color })
                              close()
                            }}
                          />
                        </div>
                      )}
                    </Menu>
                    <button className="icon-btn small" onClick={() => openInScript(it.scene.id)} aria-label="Open in script" title="Open in script">
                      <FileText size={15} />
                    </button>
                    <button className="icon-btn small" onClick={() => setConfirm(it.scene)} aria-label="Delete scene" title="Delete scene">
                      <Trash size={15} />
                    </button>
                  </div>
                </article>
              ),
            )}
            {!filtering && (
              <button
                className={`add-card${dropBefore === 'end' ? ' drop-before' : ''}`}
                onClick={() => c.insertScene(null, 'INT. ')}
                onDragOver={(e) => onDragOver(e, 'end')}
                onDrop={(e) => onDrop(e, 'end')}
              >
                <Plus size={18} /> {dragId ? 'Move to end' : 'Add scene'}
              </button>
            )}
          </div>
        )}
      </div>
      {confirm && (
        <Modal
          title={`Delete scene ${confirm.number}?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
                onClick={() => {
                  c.deleteScene(confirm.id)
                  setConfirm(null)
                }}
              >
                Delete scene
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            This removes the heading <strong>{confirm.heading || 'Untitled scene'}</strong> and all of its action and dialogue from the script. You can undo it from the Script view with Ctrl/⌘+Z.
          </p>
        </Modal>
      )}
    </div>
  )
}
