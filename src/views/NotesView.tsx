import { Plus, StickyNote, Trash } from 'lucide-react'
import { useState } from 'react'
import { uid } from '../core/id'
import type { Note } from '../core/types'
import { LazyInput, LazyTextarea, timeAgo } from '../components/ui'
import { useApp } from '../store/app'
import { useAnalysis, useController, useProject } from '../store/hooks'

export function NotesView() {
  const project = useProject()
  const analysis = useAnalysis()
  const c = useController()
  const { updateProject, setView } = useApp.getState()
  const [selected, setSelected] = useState<string | null>(null)
  const notes = [...project.notes].sort((a, b) => b.updatedAt - a.updatedAt)
  const current = notes.find((n) => n.id === selected) ?? notes[0] ?? null

  const add = () => {
    const now = Date.now()
    const note: Note = { id: uid(), title: '', body: '', createdAt: now, updatedAt: now }
    updateProject((p) => ({ notes: [note, ...p.notes] }))
    setSelected(note.id)
  }

  const edit = (id: string, patch: Partial<Note>) =>
    updateProject((p) => ({ notes: p.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)) }))

  const remove = (id: string) => updateProject((p) => ({ notes: p.notes.filter((n) => n.id !== id) }))

  const goTo = (index: number) => {
    setView('script')
    setTimeout(() => c.revealElement(index, true), 0)
  }

  const sceneNotes = analysis.scenes.filter((s) => s.notes.trim())

  return (
    <div className="view-scroll">
      <div className="view-inner">
        <div className="view-header">
          <div>
            <h1>Notes</h1>
            <p>A notebook for research, ideas and feedback — plus every note you left inside the script.</p>
          </div>
          <button className="btn primary" onClick={add}>
            <Plus size={16} /> New note
          </button>
        </div>
        <div className="notes-layout">
          <div className="panel" style={{ padding: 6 }}>
            {notes.length === 0 && <p className="faint" style={{ padding: 10, margin: 0, fontSize: 13 }}>No notes yet.</p>}
            {notes.map((n) => (
              <button key={n.id} className={`list-item${current?.id === n.id ? ' active' : ''}`} onClick={() => setSelected(n.id)}>
                <StickyNote size={16} color="var(--accent)" style={{ flex: 'none' }} />
                <span className="name">
                  {n.title || 'Untitled note'}
                  <span className="sub">
                    {timeAgo(n.updatedAt)}
                    {n.body ? ` · ${n.body.slice(0, 40)}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {current ? (
              <div className="panel note-editor" key={current.id}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <LazyInput className="title-input" style={{ flex: 1 }} placeholder="Title" value={current.title} onCommit={(title) => edit(current.id, { title })} />
                  <button className="icon-btn" onClick={() => remove(current.id)} aria-label="Delete note" title="Delete note">
                    <Trash size={16} />
                  </button>
                </div>
                <LazyTextarea className="body-input" placeholder="Start writing…" value={current.body} onCommit={(body) => edit(current.id, { body })} />
              </div>
            ) : (
              <div className="panel empty-state" style={{ maxWidth: 'none' }}>
                <StickyNote size={32} />
                <h3>Your notebook is empty</h3>
                <p>Keep research, alternative lines, feedback from readers or anything else here.</p>
              </div>
            )}

            <div className="panel" style={{ padding: 16 }}>
              <h2 className="section-title">Notes inside the script</h2>
              {analysis.notes.length === 0 && sceneNotes.length === 0 ? (
                <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                  Add a Note element in the script (Alt+0) or write scene notes in the inspector. They never print.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analysis.notes.map((n) => (
                    <button key={`n${n.index}`} className="script-note" onClick={() => goTo(n.index)}>
                      <span>{n.text || <em className="faint">Empty note</em>}</span>
                    </button>
                  ))}
                  {sceneNotes.map((s) => (
                    <button key={s.id} className="script-note" onClick={() => goTo(s.index)}>
                      <span>
                        <strong style={{ fontFamily: 'var(--font-script)', fontSize: 12.5 }}>
                          {s.number}. {s.heading}
                        </strong>
                        <br />
                        {s.notes}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
